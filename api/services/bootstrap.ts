import path from "node:path";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { getDb } from "../queries/connection";
import { seedDemoData } from "./demoData";
import { ensureSupportedModelsSeeded } from "./ingestion";
import { forceMemoryMode, getStore, type HighlineStore, type StoreMode } from "./store";

const REPROBE_INTERVAL_MS = 60_000;

async function prepare(): Promise<HighlineStore> {
  let store = await getStore();

  if (store.mode === "database") {
    try {
      await migrate(getDb(), { migrationsFolder: path.resolve(process.cwd(), "db/migrations") });
      await store.allSupportedModels();
    } catch (error) {
      forceMemoryMode(error instanceof Error ? error.message : "database initialization failed");
      store = await getStore();
    }
  }

  await ensureSupportedModelsSeeded();
  if ((await store.totalListingsCount()) === 0) {
    await seedDemoData();
  }

  return store;
}

let prepareInflight: Promise<HighlineStore> | undefined;
let ready: { mode: StoreMode; at: number } | undefined;

/**
 * Ensures the data layer is migrated and seeded before serving requests.
 * Database mode is sticky once healthy; memory mode re-attempts the
 * database every minute so a recovering database is picked up.
 */
export function ensureHighlineReady(): Promise<HighlineStore> {
  if (ready && (ready.mode === "database" || Date.now() - ready.at < REPROBE_INTERVAL_MS)) {
    return getStore();
  }

  if (!prepareInflight) {
    prepareInflight = prepare()
      .then((store) => {
        ready = { mode: store.mode, at: Date.now() };
        prepareInflight = undefined;
        return store;
      })
      .catch((error) => {
        prepareInflight = undefined;
        throw error;
      });
  }

  return prepareInflight;
}
