import { desc, eq, and, sql, notInArray } from "drizzle-orm";
import {
  ingestionRuns,
  listingPriceHistory,
  listings,
  modelMarketStats,
  supportedModels,
  valuationRuns,
  type IngestionRun,
  type InsertListing,
  type InsertSupportedModel,
  type Listing,
  type ListingPriceHistory,
  type ModelMarketStat,
  type SupportedModel,
  type ValuationRun,
} from "@db/schema";
import { getDb } from "../queries/connection";
import type { ValuationResult } from "./valuation";

export type StoreMode = "database" | "memory";

export type ModelStatsInsert = {
  modelId: number;
  medianPrice?: number;
  p25Price?: number;
  p75Price?: number;
  medianMileage?: number;
  sampleSize: number;
};

export type PriceHistoryInsert = {
  listingId: number;
  price?: number;
  mileage?: number;
  observedAt: Date;
};

export type IngestionRunUpdate = Partial<
  Pick<IngestionRun, "status" | "listingsFound" | "listingsUpserted" | "valuationsCreated" | "error" | "finishedAt">
>;

export interface HighlineStore {
  mode: StoreMode;
  ping(): Promise<boolean>;

  allSupportedModels(): Promise<SupportedModel[]>;
  insertSupportedModels(rows: InsertSupportedModel[]): Promise<void>;
  findSupportedModelById(id: number): Promise<SupportedModel | undefined>;

  findListing(source: string, externalId: string): Promise<Listing | undefined>;
  findListingById(id: number): Promise<Listing | undefined>;
  insertListing(values: InsertListing): Promise<number>;
  updateListing(id: number, values: Partial<InsertListing>): Promise<void>;
  activeListings(limit?: number): Promise<Listing[]>;
  totalListingsCount(): Promise<number>;
  expireListingsBySource(source: string): Promise<void>;
  /** Mark active listings absent from the provider's latest full result as unknown (likely sold). */
  expireUnseenListings(source: string, make: string, model: string | undefined, seenExternalIds: string[]): Promise<number>;
  hasListingsBySource(source: string): Promise<boolean>;

  insertPriceHistory(values: PriceHistoryInsert): Promise<void>;
  priceHistoryFor(listingId: number, limit: number): Promise<ListingPriceHistory[]>;

  insertModelStats(values: ModelStatsInsert): Promise<void>;

  insertValuation(values: { listingId: number } & ValuationResult): Promise<void>;
  recentValuations(limit: number): Promise<ValuationRun[]>;
  valuationsFor(listingId: number, limit: number): Promise<ValuationRun[]>;

  insertIngestionRun(values: { provider: string; status: IngestionRun["status"] }): Promise<number>;
  updateIngestionRun(id: number, values: IngestionRunUpdate): Promise<void>;
  latestIngestionRun(provider: string): Promise<IngestionRun | undefined>;
}

const PROBE_TIMEOUT_MS = 4_000;

function createDrizzleStore(): HighlineStore {
  return {
    mode: "database",

    async ping() {
      const probe = getDb()
        .execute(sql`select 1`)
        .then(() => true)
        .catch(() => false);
      const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), PROBE_TIMEOUT_MS));
      return Promise.race([probe, timeout]);
    },

    async allSupportedModels() {
      return getDb().select().from(supportedModels).orderBy(supportedModels.sortOrder, supportedModels.variant);
    },

    async insertSupportedModels(rows) {
      await getDb().insert(supportedModels).values(rows);
    },

    async findSupportedModelById(id) {
      return getDb().query.supportedModels.findFirst({ where: eq(supportedModels.id, id) });
    },

    async findListing(source, externalId) {
      return getDb().query.listings.findFirst({
        where: and(eq(listings.source, source), eq(listings.externalId, externalId)),
      });
    },

    async findListingById(id) {
      return getDb().query.listings.findFirst({ where: eq(listings.id, id) });
    },

    async insertListing(values) {
      const [{ id }] = await getDb().insert(listings).values(values).$returningId();
      return id;
    },

    async updateListing(id, values) {
      await getDb().update(listings).set(values).where(eq(listings.id, id));
    },

    async activeListings(limit = 5000) {
      return getDb()
        .select()
        .from(listings)
        .where(eq(listings.status, "active"))
        .orderBy(desc(listings.lastSeenAt), desc(listings.id))
        .limit(limit);
    },

    async totalListingsCount() {
      const rows = await getDb().select({ id: listings.id }).from(listings).limit(1000);
      return rows.length;
    },

    async expireListingsBySource(source) {
      await getDb()
        .update(listings)
        .set({ status: "expired", removedAt: new Date(), updatedAt: new Date() })
        .where(eq(listings.source, source));
    },

    async expireUnseenListings(source, make, model, seenExternalIds) {
      if (!seenExternalIds.length) return 0;
      const conditions = [eq(listings.source, source), eq(listings.status, "active"), eq(listings.make, make)];
      if (model) conditions.push(eq(listings.model, model));
      conditions.push(notInArray(listings.externalId, seenExternalIds));
      const [result] = await getDb()
        .update(listings)
        .set({ status: "unknown", removedAt: new Date(), updatedAt: new Date() })
        .where(and(...conditions));
      return Number((result as { affectedRows?: number }).affectedRows ?? 0);
    },

    async hasListingsBySource(source) {
      const rows = await getDb().select({ id: listings.id }).from(listings).where(eq(listings.source, source)).limit(1);
      return rows.length > 0;
    },

    async insertPriceHistory(values) {
      await getDb().insert(listingPriceHistory).values(values);
    },

    async priceHistoryFor(listingId, limit) {
      return getDb()
        .select()
        .from(listingPriceHistory)
        .where(eq(listingPriceHistory.listingId, listingId))
        .orderBy(desc(listingPriceHistory.observedAt), desc(listingPriceHistory.id))
        .limit(limit);
    },

    async insertModelStats(values) {
      await getDb().insert(modelMarketStats).values(values);
    },

    async insertValuation(values) {
      await getDb().insert(valuationRuns).values(values);
    },

    async recentValuations(limit) {
      return getDb()
        .select()
        .from(valuationRuns)
        .orderBy(desc(valuationRuns.createdAt), desc(valuationRuns.id))
        .limit(limit);
    },

    async valuationsFor(listingId, limit) {
      return getDb()
        .select()
        .from(valuationRuns)
        .where(eq(valuationRuns.listingId, listingId))
        .orderBy(desc(valuationRuns.createdAt), desc(valuationRuns.id))
        .limit(limit);
    },

    async insertIngestionRun(values) {
      const [{ id }] = await getDb().insert(ingestionRuns).values(values).$returningId();
      return id;
    },

    async updateIngestionRun(id, values) {
      await getDb().update(ingestionRuns).set(values).where(eq(ingestionRuns.id, id));
    },

    async latestIngestionRun(provider) {
      return getDb().query.ingestionRuns.findFirst({
        where: eq(ingestionRuns.provider, provider),
        orderBy: [desc(ingestionRuns.startedAt), desc(ingestionRuns.id)],
      });
    },
  };
}

type MemoryTables = {
  supportedModels: SupportedModel[];
  listings: Listing[];
  priceHistory: ListingPriceHistory[];
  modelStats: ModelMarketStat[];
  valuations: ValuationRun[];
  ingestionRuns: IngestionRun[];
  nextIds: Record<keyof Omit<MemoryTables, "nextIds">, number>;
};

function createMemoryTables(): MemoryTables {
  return {
    supportedModels: [],
    listings: [],
    priceHistory: [],
    modelStats: [],
    valuations: [],
    ingestionRuns: [],
    nextIds: { supportedModels: 1, listings: 1, priceHistory: 1, modelStats: 1, valuations: 1, ingestionRuns: 1 },
  };
}

function byIdDescThen<T>(rows: T[], idOf: (row: T) => number, dateOf: (row: T) => Date) {
  return [...rows].sort((a, b) => dateOf(b).getTime() - dateOf(a).getTime() || idOf(b) - idOf(a));
}

function createMemoryStore(tables: MemoryTables): HighlineStore {
  return {
    mode: "memory",

    async ping() {
      return true;
    },

    async allSupportedModels() {
      return [...tables.supportedModels].sort((a, b) => a.sortOrder - b.sortOrder || a.variant.localeCompare(b.variant));
    },

    async insertSupportedModels(rows) {
      for (const row of rows) {
        tables.supportedModels.push({
          id: tables.nextIds.supportedModels++,
          generation: null,
          yearEnd: null,
          bodyStyle: null,
          transmission: null,
          searchModel: null,
          sortOrder: 0,
          ...row,
          createdAt: new Date(),
        });
      }
    },

    async findSupportedModelById(id) {
      return tables.supportedModels.find((model) => model.id === id);
    },

    async findListing(source, externalId) {
      return tables.listings.find((listing) => listing.source === source && listing.externalId === externalId);
    },

    async findListingById(id) {
      return tables.listings.find((listing) => listing.id === id);
    },

    async insertListing(values) {
      const now = new Date();
      const row: Listing = {
        id: tables.nextIds.listings++,
        modelId: null,
        vin: null,
        year: null,
        trim: null,
        price: null,
        mileage: null,
        exteriorColor: null,
        interiorColor: null,
        transmission: null,
        drivetrain: null,
        bodyStyle: null,
        sellerName: null,
        sellerType: null,
        city: null,
        state: null,
        postalCode: null,
        url: null,
        imageUrl: null,
        description: null,
        listedAt: null,
        cpo: null,
        photoCount: null,
        carfaxUrl: null,
        accidentCount: null,
        ownerCount: null,
        usageType: null,
        removedAt: null,
        raw: null,
        ...values,
        status: values.status ?? "active",
        firstSeenAt: values.firstSeenAt ?? now,
        lastSeenAt: values.lastSeenAt ?? now,
        createdAt: values.createdAt ?? now,
        updatedAt: values.updatedAt ?? now,
      };
      tables.listings.push(row);
      return row.id;
    },

    async updateListing(id, values) {
      const index = tables.listings.findIndex((listing) => listing.id === id);
      if (index >= 0) tables.listings[index] = { ...tables.listings[index], ...values };
    },

    async activeListings(limit = 5000) {
      return byIdDescThen(
        tables.listings.filter((listing) => listing.status === "active"),
        (listing) => listing.id,
        (listing) => listing.lastSeenAt,
      ).slice(0, limit);
    },

    async totalListingsCount() {
      return tables.listings.length;
    },

    async expireListingsBySource(source) {
      const now = new Date();
      for (const [index, listing] of tables.listings.entries()) {
        if (listing.source === source && listing.status === "active") {
          tables.listings[index] = { ...listing, status: "expired", removedAt: now, updatedAt: now };
        }
      }
    },

    async expireUnseenListings(source, make, model, seenExternalIds) {
      if (!seenExternalIds.length) return 0;
      const seen = new Set(seenExternalIds);
      const now = new Date();
      let expired = 0;
      for (const [index, listing] of tables.listings.entries()) {
        if (listing.source !== source || listing.status !== "active") continue;
        if (listing.make !== make) continue;
        if (model && listing.model !== model) continue;
        if (seen.has(listing.externalId)) continue;
        tables.listings[index] = { ...listing, status: "unknown", removedAt: now, updatedAt: now };
        expired += 1;
      }
      return expired;
    },

    async hasListingsBySource(source) {
      return tables.listings.some((listing) => listing.source === source);
    },

    async insertPriceHistory(values) {
      tables.priceHistory.push({
        id: tables.nextIds.priceHistory++,
        price: null,
        mileage: null,
        ...values,
      });
    },

    async priceHistoryFor(listingId, limit) {
      return byIdDescThen(
        tables.priceHistory.filter((row) => row.listingId === listingId),
        (row) => row.id,
        (row) => row.observedAt,
      ).slice(0, limit);
    },

    async insertModelStats(values) {
      tables.modelStats.push({
        id: tables.nextIds.modelStats++,
        medianPrice: null,
        p25Price: null,
        p75Price: null,
        medianMileage: null,
        ...values,
        computedAt: new Date(),
      });
    },

    async insertValuation(values) {
      tables.valuations.push({
        id: tables.nextIds.valuations++,
        ...values,
        sampleSize: values.sampleSize ?? 0,
        createdAt: new Date(),
      });
    },

    async recentValuations(limit) {
      return byIdDescThen(
        tables.valuations,
        (row) => row.id,
        (row) => row.createdAt,
      ).slice(0, limit);
    },

    async valuationsFor(listingId, limit) {
      return byIdDescThen(
        tables.valuations.filter((row) => row.listingId === listingId),
        (row) => row.id,
        (row) => row.createdAt,
      ).slice(0, limit);
    },

    async insertIngestionRun(values) {
      const row: IngestionRun = {
        id: tables.nextIds.ingestionRuns++,
        ...values,
        listingsFound: 0,
        listingsUpserted: 0,
        valuationsCreated: 0,
        error: null,
        startedAt: new Date(),
        finishedAt: null,
      };
      tables.ingestionRuns.push(row);
      return row.id;
    },

    async updateIngestionRun(id, values) {
      const index = tables.ingestionRuns.findIndex((row) => row.id === id);
      if (index >= 0) tables.ingestionRuns[index] = { ...tables.ingestionRuns[index], ...values };
    },

    async latestIngestionRun(provider) {
      return byIdDescThen(
        tables.ingestionRuns.filter((row) => row.provider === provider),
        (row) => row.id,
        (row) => row.startedAt,
      )[0];
    },
  };
}

const REPROBE_INTERVAL_MS = 60_000;

let memoryStore: HighlineStore | undefined;
let cached: { store: HighlineStore; checkedAt: number } | undefined;
let memoryForced = false;

export function forceMemoryMode(reason: string) {
  if (!memoryForced) console.warn(`[highline] Falling back to in-memory demo store: ${reason}`);
  memoryForced = true;
  cached = undefined;
}

export function getMemoryStore(): HighlineStore {
  if (!memoryStore) memoryStore = createMemoryStore(createMemoryTables());
  return memoryStore;
}

export async function getStore(): Promise<HighlineStore> {
  if (cached) {
    const fresh = cached.store.mode === "database" || Date.now() - cached.checkedAt < REPROBE_INTERVAL_MS;
    if (fresh) return cached.store;
  }

  if (memoryForced) {
    const store = getMemoryStore();
    cached = { store, checkedAt: Date.now() };
    return store;
  }

  const drizzleStore = createDrizzleStore();
  if (await drizzleStore.ping()) {
    cached = { store: drizzleStore, checkedAt: Date.now() };
    return drizzleStore;
  }

  console.warn("[highline] Database unreachable — serving the in-memory demo store until it recovers.");
  const store = getMemoryStore();
  cached = { store, checkedAt: Date.now() };
  return store;
}
