import { autoDevConfigured } from "../providers/autoDev";
import { latestIngestionRun } from "../services/ingestion";
import { getStore } from "../services/store";

const actionPriority = { pursue: 0, inspect: 1, negotiate: 2, pass: 3 } as const;

type DealFilters = {
  make?: string;
  action?: "pursue" | "inspect" | "negotiate" | "pass";
  query?: string;
  limit?: number;
};

function numeric(value: string | null) {
  return value ? Number(value) : undefined;
}

export async function listSupportedModels() {
  const store = await getStore();
  return store.allSupportedModels();
}

export async function dashboardSummary() {
  const store = await getStore();
  const [modelRows, activeRows, latestRun, valuations] = await Promise.all([
    store.allSupportedModels(),
    store.activeListings(),
    latestIngestionRun(),
    store.recentValuations(2000),
  ]);

  const activeIds = new Set(activeRows.map((listing) => listing.id));
  const latestByListing = new Map<number, (typeof valuations)[number]>();
  for (const valuation of valuations) {
    if (!activeIds.has(valuation.listingId)) continue;
    if (!latestByListing.has(valuation.listingId)) latestByListing.set(valuation.listingId, valuation);
  }
  const latestValuations = [...latestByListing.values()];
  const configured = autoDevConfigured();

  return {
    provider: {
      key: "auto.dev",
      configured,
      geography: "United States",
      mode: configured ? "live-ready" : "demo / awaiting API key",
    },
    persistence: {
      mode: store.mode,
      label: store.mode === "database" ? "Cloud database" : "In-memory store · resets on restart",
    },
    supportedModels: modelRows.length,
    activeListings: activeRows.length,
    valuations: latestValuations.length,
    actionCounts: latestValuations.reduce(
      (counts, valuation) => {
        counts[valuation.action] += 1;
        return counts;
      },
      { pursue: 0, inspect: 0, negotiate: 0, pass: 0 },
    ),
    lastRun: latestRun ?? null,
  };
}

export async function dealRadar(filters: DealFilters) {
  const store = await getStore();
  const [activeRows, valuationRows, modelRows] = await Promise.all([
    store.activeListings(5000),
    store.recentValuations(2000),
    store.allSupportedModels(),
  ]);

  const latestValuationByListing = new Map<number, (typeof valuationRows)[number]>();
  for (const valuation of valuationRows) {
    if (!latestValuationByListing.has(valuation.listingId)) latestValuationByListing.set(valuation.listingId, valuation);
  }
  const modelsById = new Map(modelRows.map((model) => [model.id, model]));
  const query = filters.query?.trim().toLowerCase();

  return activeRows
    .map((listing) => ({
      listing,
      valuation: latestValuationByListing.get(listing.id) ?? null,
      supportedModel: listing.modelId ? modelsById.get(listing.modelId) ?? null : null,
    }))
    .filter((row) => row.valuation)
    .filter((row) => !filters.make || row.listing.make.toLowerCase() === filters.make.toLowerCase())
    .filter((row) => !filters.action || row.valuation?.action === filters.action)
    .filter((row) => {
      if (!query) return true;
      const haystack = `${row.listing.title} ${row.listing.make} ${row.listing.model} ${row.listing.trim ?? ""} ${row.supportedModel?.variant ?? ""}`.toLowerCase();
      return haystack.includes(query);
    })
    .sort((a, b) => {
      const actionDiff = actionPriority[a.valuation!.action] - actionPriority[b.valuation!.action];
      if (actionDiff) return actionDiff;
      return (numeric(b.valuation!.netEdgePct) ?? -999) - (numeric(a.valuation!.netEdgePct) ?? -999);
    })
    .slice(0, filters.limit ?? 60)
    .map((row) => ({
      ...row.listing,
      valuation: row.valuation,
      supportedModel: row.supportedModel,
    }));
}

function percentileOf(values: number[], fraction: number) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * fraction)));
  return sorted[index];
}

export async function marketStats() {
  const store = await getStore();
  const [modelRows, activeRows, valuationRows] = await Promise.all([
    store.allSupportedModels(),
    store.activeListings(5000),
    store.recentValuations(2000),
  ]);

  const activeIds = new Set(activeRows.map((listing) => listing.id));
  const latestValuationByListing = new Map<number, (typeof valuationRows)[number]>();
  for (const valuation of valuationRows) {
    if (!activeIds.has(valuation.listingId)) continue;
    if (!latestValuationByListing.has(valuation.listingId)) latestValuationByListing.set(valuation.listingId, valuation);
  }

  const now = Date.now();
  const markets = modelRows
    .map((model) => {
      const rows = activeRows.filter((listing) => listing.modelId === model.id && listing.price);
      if (!rows.length) return null;

      const prices = rows.map((listing) => listing.price!).sort((a, b) => a - b);
      const mileages = rows.map((listing) => listing.mileage).filter((mileage): mileage is number => Boolean(mileage));
      const daysOnMarket = rows
        .filter((listing) => listing.listedAt)
        .map((listing) => Math.max(0, Math.round((now - listing.listedAt!.getTime()) / 86_400_000)));

      const actionCounts = { pursue: 0, inspect: 0, negotiate: 0, pass: 0 };
      let bestEdgePct: number | null = null;
      let bestListingId: number | null = null;
      for (const listing of rows) {
        const valuation = latestValuationByListing.get(listing.id);
        if (!valuation) continue;
        actionCounts[valuation.action] += 1;
        // "Best edge" means best actionable edge — a passed 40% discount is a junk row, not an opportunity.
        if (valuation.action === "pass") continue;
        const edge = numeric(valuation.netEdgePct);
        if (edge != null && (bestEdgePct == null || edge > bestEdgePct)) {
          bestEdgePct = edge;
          bestListingId = listing.id;
        }
      }

      return {
        modelId: model.id,
        make: model.make,
        modelFamily: model.modelFamily,
        variant: model.variant,
        generation: model.generation,
        activeCount: rows.length,
        minAsk: prices[0],
        maxAsk: prices[prices.length - 1],
        medianAsk: percentileOf(prices, 0.5),
        p25Ask: percentileOf(prices, 0.25),
        p75Ask: percentileOf(prices, 0.75),
        medianMileage: percentileOf(mileages, 0.5),
        avgDaysOnMarket: daysOnMarket.length ? Math.round(daysOnMarket.reduce((sum, d) => sum + d, 0) / daysOnMarket.length) : null,
        cpoCount: rows.filter((listing) => listing.cpo).length,
        actionCounts,
        bestEdgePct: bestEdgePct != null ? Math.round(bestEdgePct * 100) / 100 : null,
        bestListingId,
      };
    })
    .filter((market): market is NonNullable<typeof market> => Boolean(market));

  return {
    computedAt: new Date().toISOString(),
    trackedModels: modelRows.length,
    modelsWithInventory: markets.length,
    totalActiveListings: activeRows.length,
    markets,
  };
}

export async function listingDetail(id: number) {
  const store = await getStore();
  const listing = await store.findListingById(id);
  if (!listing) return null;

  const [history, valuations, supportedModel] = await Promise.all([
    store.priceHistoryFor(id, 30),
    store.valuationsFor(id, 10),
    listing.modelId ? store.findSupportedModelById(listing.modelId) : Promise.resolve(undefined),
  ]);

  return { ...listing, supportedModel: supportedModel ?? null, priceHistory: history, valuations };
}
