import { createRouter, publicQuery } from "./middleware";
import { highlineRouter } from "./highlineRouter";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  highline: highlineRouter,
});

export type AppRouter = typeof appRouter;
