import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { refreshListingsFromAutoDev } from "./services/ingestion";
import { env } from "./lib/env";

const app = new Hono<{ Bindings: HttpBindings }>();

app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));
app.use("/api/trpc/*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  });
});
// Vercel Cron entry — daily refresh so listings, price history, and sell-through
// exits accumulate in the database instead of depending on manual refreshes.
app.get("/api/cron/refresh", async (c) => {
  const secret = process.env.CRON_SECRET;
  if (secret && c.req.header("authorization") !== `Bearer ${secret}`) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  try {
    const result = await refreshListingsFromAutoDev();
    return c.json({ ok: true, result });
  } catch (error) {
    return c.json({ ok: false, error: error instanceof Error ? error.message : "refresh failed" }, 500);
  }
});

app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

export default app;

// On Vercel there is no listener and no static middleware: real asset files
// are served by the CDN, and any other non-API GET needs the SPA shell.
if (process.env.VERCEL) {
  const { readFileSync } = await import("node:fs");
  const { resolve } = await import("node:path");
  let cachedShell: string | undefined;
  app.get("*", (c) => {
    cachedShell ??= readFileSync(resolve(process.cwd(), "dist/public/index.html"), "utf-8");
    return c.html(cachedShell);
  });
}

if (env.isProduction && !process.env.VERCEL) {
  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles } = await import("./lib/vite");
  serveStaticFiles(app);

  const port = parseInt(process.env.PORT || "3000");
  serve({ fetch: app.fetch, port }, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}
