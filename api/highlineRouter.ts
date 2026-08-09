import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { fetchBatComps } from "./providers/batComps";
import { fetchVinHistory } from "./providers/marketcheck";
import { dashboardSummary, dealRadar, listingDetail, listSupportedModels, marketStats } from "./queries/highline";
import { ensureHighlineReady } from "./services/bootstrap";
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
});
