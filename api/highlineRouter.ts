import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { fetchBatComps } from "./providers/batComps";
import { fetchVinHistory } from "./providers/marketcheck";
import { dashboardSummary, dealRadar, listingDetail, listSupportedModels, marketStats, soldMarket } from "./queries/highline";
import { ensureHighlineReady } from "./services/bootstrap";
import { buildVariantForecast } from "./services/forecast";
import { latestIngestionRun, refreshListingsFromAutoDev } from "./services/ingestion";
import { getStore } from "./services/store";
import { buildVinReport } from "./services/vinIntel";

const actionSchema = z.enum(["pursue", "inspect", "negotiate", "pass"]);

export const highlineRouter = createRouter({
  summary: publicQuery.query(async () => {
    await ensureHighlineReady();
    return dashboardSummary();
  }),

  models: publicQuery.query(async () => {
    await ensureHighlineReady();
    return listSupportedModels();
  }),

  deals: publicQuery
    .input(
      z
        .object({
          make: z.string().max(80).optional(),
          action: actionSchema.optional(),
          query: z.string().max(120).optional(),
          limit: z.number().int().min(1).max(100).optional(),
          minDaysOnMarket: z.number().min(0).max(2000).optional(),
          maxDaysOnMarket: z.number().min(0).max(2000).optional(),
          minPrice: z.number().int().min(0).optional(),
          maxPrice: z.number().int().min(0).optional(),
          maxMileage: z.number().int().min(0).optional(),
          minYear: z.number().int().min(1950).max(2100).optional(),
          maxYear: z.number().int().min(1950).max(2100).optional(),
          cpoOnly: z.boolean().optional(),
          accidentFreeOnly: z.boolean().optional(),
          singleOwnerOnly: z.boolean().optional(),
          excludeRentalFleet: z.boolean().optional(),
          state: z.string().max(40).optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      await ensureHighlineReady();
      return dealRadar(input ?? {});
    }),

  markets: publicQuery.query(async () => {
    await ensureHighlineReady();
    return marketStats();
  }),

  listing: publicQuery.input(z.object({ id: z.number().int().positive() })).query(async ({ input }) => {
    await ensureHighlineReady();
    const listing = await listingDetail(input.id);
    if (!listing) throw new Error("Listing not found");
    return listing;
  }),

  refresh: publicQuery.mutation(async () => {
    await ensureHighlineReady();
    const latest = await latestIngestionRun();
    if (latest && Date.now() - latest.startedAt.getTime() < 60_000) {
      return {
        runId: latest.id,
        status: "rate_limited" as const,
        providerConfigured: true,
        listingsFound: latest.listingsFound,
        listingsUpserted: latest.listingsUpserted,
        valuationsCreated: latest.valuationsCreated,
        warnings: ["Refresh is limited to once per minute from the public dashboard."],
      };
    }
    return refreshListingsFromAutoDev();
  }),

  decodeVin: publicQuery.input(z.object({ vin: z.string().min(17).max(17) })).query(({ input }) => buildVinReport(input.vin)),

  /** Bring a Trailer sold-price comps for a tracked model (parse.bot, cached 24h). */
  batComps: publicQuery.input(z.object({ modelId: z.number().int().positive() })).query(async ({ input }) => {
    await ensureHighlineReady();
    const store = await getStore();
    const model = await store.findSupportedModelById(input.modelId);
    if (!model) throw new Error("Unknown model");
    return fetchBatComps(model.make, model.modelFamily, { searchModel: model.searchModel, variant: model.variant, windowYears: 1 });
  }),

  /** MarketCheck six-year per-VIN listing history (price/mileage points). */
  vinHistory: publicQuery.input(z.object({ vin: z.string().min(17).max(17) })).query(async ({ input }) => {
    await ensureHighlineReady();
    return fetchVinHistory(input.vin);
  }),

  /** Cars that left the market in a trailing window — exit feed + per-variant drift. */
  sold: publicQuery
    .input(
      z
        .object({
          days: z.union([z.literal(30), z.literal(90), z.literal(180)]).optional(),
          make: z.string().max(80).optional(),
          limit: z.number().int().min(1).max(500).optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      await ensureHighlineReady();
      return soldMarket(input?.days ?? 90, input?.make, input?.limit ?? 200);
    }),

  /**
   * Appreciation signal: median of the most recent ~24 BaT auctions vs the model's
   * all-time BaT median. parse.bot's price-trends endpoint ignores its years param
   * (verified 2026-08 — always returns all-time stats), so the momentum window is
   * computed from dated auction results instead. Costs 2 parse.bot calls per
   * uncached lookup — loaded on demand from the UI.
   */
  batTrendCompare: publicQuery.input(z.object({ modelId: z.number().int().positive() })).query(async ({ input }) => {
    await ensureHighlineReady();
    const store = await getStore();
    const model = await store.findSupportedModelById(input.modelId);
    if (!model) throw new Error("Unknown model");
    const comps = await fetchBatComps(model.make, model.modelFamily, {
      searchModel: model.searchModel,
      variant: model.variant,
      includeResults: true,
    });
    if (!comps.configured) return { configured: false as const };
    if (!comps.matched) {
      return { configured: true as const, matched: false as const, baTModel: comps.baTModel ?? null, error: comps.error ?? "No BaT coverage" };
    }

    // Memorabilia/parts show up in BaT model catalogs — drop implausible prices.
    const recentPrices = comps.recentSales
      .map((sale) => sale.soldPrice)
      .filter((price): price is number => price != null && price > 10_000)
      .sort((a, b) => a - b);
    const recentMedian = recentPrices.length ? recentPrices[Math.floor((recentPrices.length - 1) * 0.5)] : null;
    const allTimeMedian = comps.medianSold ?? null;
    const driftPct =
      recentMedian != null && allTimeMedian != null && allTimeMedian > 0
        ? Math.round((recentMedian / allTimeMedian - 1) * 1000) / 10
        : null;
    const dates = comps.recentSales.map((sale) => sale.date).filter((date): date is string => Boolean(date)).sort();

    return {
      configured: true as const,
      matched: true as const,
      baTModel: comps.baTModel ?? null,
      recentMedian,
      recentCount: recentPrices.length,
      recentSpanStart: dates[0] ?? null,
      recentSpanEnd: dates[dates.length - 1] ?? null,
      allTimeMedian,
      allTimeCount: comps.sampleCount ?? null,
      driftPct,
      error: null,
      source: "Bring a Trailer via parse.bot",
    };
  }),

  /** Dated BaT sold history + log-linear drift projection for one variant (on demand, cached 7d). */
  batHistory: publicQuery.input(z.object({ modelId: z.number().int().positive() })).query(async ({ input }) => {
    await ensureHighlineReady();
    return buildVariantForecast(input.modelId);
  }),
});
