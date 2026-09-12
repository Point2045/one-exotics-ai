import { autoDevConfigured } from "../providers/autoDev";
import { parseBotConfigured } from "../providers/batComps";
import { marketCheckConfigured } from "../providers/marketcheck";
import { fetchDealerInventory } from "../providers/oneExotics";
import { latestIngestionRun, refreshListingsFromAutoDev } from "../services/ingestion";
import { matchSupportedModel } from "../services/matching";
import { getStore } from "../services/store";

const actionPriority = { pursue: 0, inspect: 1, negotiate: 2, pass: 3 } as const;

type DealFilters = {
  make?: string;
  action?: "pursue" | "inspect" | "negotiate" | "pass";
  query?: string;
  limit?: number;
  minDaysOnMarket?: number;
  maxDaysOnMarket?: number;
  minPrice?: number;
  maxPrice?: number;
  maxMileage?: number;
  minYear?: number;
  maxYear?: number;
  cpoOnly?: boolean;
  accidentFreeOnly?: boolean;
  singleOwnerOnly?: boolean;
  excludeRentalFleet?: boolean;
  state?: string;
};

/** Rental/fleet/commercial usage histories cap resale and warranty options. */
const COMMERCIAL_USAGE = new Set(["rental", "fleet", "commercial", "lease", "taxi", "government", "police"]);

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
    integrations: {
      autoDev: configured,
      marketCheck: marketCheckConfigured(),
      parseBotBat: parseBotConfigured(),
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
  const now = Date.now();

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
      if (filters.minDaysOnMarket == null && filters.maxDaysOnMarket == null) return true;
      // DOM needs a listed date — rows without one can't satisfy a DOM filter.
      if (!row.listing.listedAt) return false;
      const days = (now - row.listing.listedAt.getTime()) / 86_400_000;
      if (filters.minDaysOnMarket != null && days < filters.minDaysOnMarket) return false;
      if (filters.maxDaysOnMarket != null && days > filters.maxDaysOnMarket) return false;
      return true;
    })
    .filter((row) => filters.minPrice == null || (row.listing.price ?? 0) >= filters.minPrice)
    .filter((row) => filters.maxPrice == null || (row.listing.price ?? Infinity) <= filters.maxPrice)
    .filter((row) => filters.maxMileage == null || (row.listing.mileage ?? Infinity) <= filters.maxMileage)
    .filter((row) => filters.minYear == null || (row.listing.year ?? 0) >= filters.minYear)
    .filter((row) => filters.maxYear == null || (row.listing.year ?? Infinity) <= filters.maxYear)
    .filter((row) => !filters.cpoOnly || row.listing.cpo === true)
    .filter((row) => !filters.accidentFreeOnly || row.listing.accidentCount === 0)
    .filter((row) => !filters.singleOwnerOnly || row.listing.ownerCount === 1)
    .filter((row) => !filters.excludeRentalFleet || !row.listing.usageType || !COMMERCIAL_USAGE.has(row.listing.usageType.toLowerCase()))
    .filter((row) => !filters.state || row.listing.state?.toLowerCase() === filters.state.toLowerCase())
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

/**
 * Standard linear-interpolation percentile (same convention as numpy /
 * statistics.median): for even-sized sets the median is the average of the
 * two middle values. This convention is what a human reproduces by hand
 * from the comp table — nearest-rank would silently disagree.
 */
function percentileOf(values: number[], fraction: number) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

export async function marketStats() {
  const store = await getStore();
  const [modelRows, activeRows, valuationRows, delistedRows] = await Promise.all([
    store.allSupportedModels(),
    store.activeListings(5000),
    store.recentValuations(2000),
    // 180-day window of "left the market" observations powers the sell-through stats.
    store.recentlyDelisted(180, 5000),
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

      // Sell-through: how long this cohort's listings actually sat before leaving the market.
      // Delisted usually means sold, occasionally withdrawn — durations outside 1..365 days are discarded as noise.
      const gone = delistedRows.filter((listing) => listing.modelId === model.id);
      const sellDurations = gone
        .map((listing) => {
          const start = (listing.listedAt ?? listing.firstSeenAt)?.getTime();
          const end = listing.removedAt?.getTime();
          if (start == null || end == null) return null;
          const days = Math.round((end - start) / 86_400_000);
          return days >= 1 && days <= 365 ? days : null;
        })
        .filter((days): days is number => days != null)
        .sort((a, b) => a - b);
      const goneLast30d = gone.filter((listing) => now - listing.removedAt!.getTime() <= 30 * 86_400_000).length;
      const medianDaysToSell = sellDurations.length >= 2 ? percentileOf(sellDurations, 0.5) : null;
      const demandSignal =
        medianDaysToSell == null ? null : medianDaysToSell <= 35 ? "fast" : medianDaysToSell <= 75 ? "balanced" : "slow";
      // Active listings sitting well past the typical sell time are stale — prime negotiation targets.
      const staleCount =
        medianDaysToSell == null
          ? null
          : rows.filter(
              (listing) => listing.listedAt && (now - listing.listedAt.getTime()) / 86_400_000 > medianDaysToSell * 1.5,
            ).length;

      return {
        modelId: model.id,
        make: model.make,
        modelFamily: model.modelFamily,
        variant: model.variant,
        generation: model.generation,
        activeCount: rows.length,
        medianDaysToSell,
        delistedObserved: sellDurations.length,
        goneLast30d,
        demandSignal,
        staleCount,
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

/**
 * Cars that left the market in a trailing window (30/90/180 days): per-variant exit
 * aggregates (count, median exit ask, days-to-sell, drift vs current ask) plus the
 * individual exit feed. Prices are last advertised asks, not transaction prices —
 * BaT sold comps (batTrendCompare) carry the true sold-side signal.
 */
export async function soldMarket(windowDays: number, make: string | undefined, limit: number) {
  const store = await getStore();
  const [modelRows, delistedRows, activeRows] = await Promise.all([
    store.allSupportedModels(),
    store.recentlyDelisted(windowDays, 5000),
    store.activeListings(5000),
  ]);
  const modelsById = new Map(modelRows.map((model) => [model.id, model]));

  const trends = modelRows
    .map((model) => {
      const exits = delistedRows.filter((listing) => listing.modelId === model.id);
      const actives = activeRows.filter((listing) => listing.modelId === model.id && listing.price);
      if (!exits.length && !actives.length) return null;

      const exitAsks = exits.map((listing) => listing.price).filter((price): price is number => Boolean(price)).sort((a, b) => a - b);
      const activeAsks = actives.map((listing) => listing.price!).sort((a, b) => a - b);
      const durations = exits
        .map((listing) => {
          const start = (listing.listedAt ?? listing.firstSeenAt)?.getTime();
          const end = listing.removedAt?.getTime();
          if (start == null || end == null) return null;
          const days = Math.round((end - start) / 86_400_000);
          return days >= 1 && days <= 365 ? days : null;
        })
        .filter((days): days is number => days != null)
        .sort((a, b) => a - b);

      const medianExitAsk = percentileOf(exitAsks, 0.5);
      const medianActiveAsk = percentileOf(activeAsks, 0.5);
      const askDriftPct =
        medianExitAsk != null && medianActiveAsk != null && medianExitAsk > 0
          ? Math.round(((medianActiveAsk - medianExitAsk) / medianExitAsk) * 1000) / 10
          : null;

      return {
        modelId: model.id,
        make: model.make,
        modelFamily: model.modelFamily,
        variant: model.variant,
        generation: model.generation,
        exitCount: exits.length,
        activeCount: actives.length,
        medianExitAsk,
        medianActiveAsk,
        askDriftPct,
        medianDaysToSell: durations.length >= 2 ? percentileOf(durations, 0.5) : null,
      };
    })
    .filter((trend): trend is NonNullable<typeof trend> => Boolean(trend))
    .sort((a, b) => b.exitCount - a.exitCount);

  const makeFilter = make?.toLowerCase();
  const listings = delistedRows
    .filter((listing) => !makeFilter || listing.make.toLowerCase() === makeFilter)
    .map((listing) => {
      const start = (listing.listedAt ?? listing.firstSeenAt)?.getTime();
      const end = listing.removedAt?.getTime();
      const daysToSell = start != null && end != null ? Math.round((end - start) / 86_400_000) : null;
      const model = listing.modelId ? modelsById.get(listing.modelId) : undefined;
      return {
        id: listing.id,
        vin: listing.vin,
        title: listing.title,
        year: listing.year,
        make: listing.make,
        model: listing.model,
        trim: listing.trim,
        modelId: listing.modelId ?? null,
        variant: model?.variant ?? null,
        price: listing.price,
        mileage: listing.mileage,
        city: listing.city,
        state: listing.state,
        url: listing.url,
        imageUrl: listing.imageUrl,
        source: listing.source,
        listedAt: listing.listedAt?.toISOString() ?? null,
        leftMarketAt: listing.removedAt?.toISOString() ?? null,
        daysToSell: daysToSell != null && daysToSell >= 0 && daysToSell <= 1095 ? daysToSell : null,
      };
    })
    .sort((a, b) => (b.leftMarketAt ?? "").localeCompare(a.leftMarketAt ?? ""))
    .slice(0, limit);

  return {
    computedAt: new Date().toISOString(),
    windowDays,
    totalExits: delistedRows.length,
    variantsWithExits: trends.filter((trend) => trend.exitCount > 0).length,
    trends,
    listings,
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

/**
 * Dealer desk: One Exotics' own live inventory scored against the market.
 * Active units get a per-unit verdict (rich / at market / opportunity) vs the
 * tracked-market median for their variant, plus the demand signal from
 * observed sell-through. Sold records carry no dates in their feed, so the
 * sold side is analyzed as mix/volume; dated dealer velocity accrues from our
 * own snapshots once persistence is live.
 */
// Coalesced self-heal: concurrent desk hits share one refresh promise.
let deskMarketDataInflight: Promise<unknown> | null = null;
function ensureDeskMarketData() {
  deskMarketDataInflight ??= refreshListingsFromAutoDev()
    .catch(() => null) // best effort — desk renders with whatever the store holds
    .finally(() => {
      deskMarketDataInflight = null;
    });
  return deskMarketDataInflight;
}

export async function dealerDesk() {
  const store = await getStore();

  // Self-healing (interim until the persistent DB is live): production runs
  // on the in-memory store seeded with only the ~36-row demo set, which has
  // no comps for the dealer's variants — every unit rendered "No market data
  // yet". When the store looks that thin, run a real refresh first so
  // benchmarks, demand and verdicts populate even in memory mode. Once the
  // DB-backed store is warm (or the nightly cron has accumulated), the
  // threshold is exceeded and this is a no-op.
  let activeRows = await store.activeListings(5000);
  if (activeRows.length < 200) {
    await ensureDeskMarketData();
    activeRows = await store.activeListings(5000);
  }

  const [modelRows, delistedRows] = await Promise.all([
    store.allSupportedModels(),
    store.recentlyDelisted(180, 5000),
  ]);

  // Primary source: the dealer's own site feed. Their WAF intermittently 403s
  // datacenter IPs (Vercel), so when the feed fails we reconstruct the floor
  // from our own tracked listings carrying the dealer's name — partial
  // coverage (only what they list on the aggregators) but the desk never dies.
  let cars: Awaited<ReturnType<typeof fetchDealerInventory>>;
  let feedSource: "dealer feed" | "tracked listings";
  let feedError: string | null = null;
  try {
    cars = await fetchDealerInventory();
    feedSource = "dealer feed";
  } catch (error) {
    feedError = error instanceof Error ? error.message : "dealer feed unavailable";
    feedSource = "tracked listings";
    cars = activeRows
      .filter((listing) => listing.sellerName?.toLowerCase().includes("one exotics"))
      .map((listing) => ({
        id: listing.externalId,
        stockno: undefined,
        vin: listing.vin ?? undefined,
        year: listing.year ?? undefined,
        make: listing.make,
        model: listing.model,
        trim: listing.trim ?? undefined,
        mileage: listing.mileage ?? undefined,
        price: listing.price ?? undefined,
        exteriorColor: listing.exteriorColor ?? undefined,
        interiorColor: listing.interiorColor ?? undefined,
        bodyStyle: listing.bodyStyle ?? undefined,
        sold: false,
        pendingSale: false,
        url: listing.url ?? undefined,
        imageUrl: listing.imageUrl ?? undefined,
        carfaxUrl: listing.carfaxUrl ?? undefined,
      }));
  }

  // Market context per supported variant, excluding the dealer's own rows so
  // the desk benchmarks against the rest of the market. Comps are bucketed by
  // model year too: a variant-wide median spanning 15 model years produces
  // garbage verdicts (a 2024 GT-R is not "+148% rich" vs a median of R35s from
  // 2009), so per-unit we prefer a ±1 model-year cohort and fall back to the
  // variant-wide median only when the cohort is too thin.
  // Market context per supported variant, excluding the dealer's own rows so
  // the desk benchmarks against the rest of the market. Full comp rows are
  // kept (not just prices) so every benchmark can be drilled down to the
  // exact listings behind it — trust requires inspectability. Comps are
  // bucketed by model year too: a variant-wide median spanning 15 model
  // years produces garbage verdicts (a 2024 GT-R is not "+148% rich" vs a
  // median of R35s from 2009), so per-unit we prefer a ±1 model-year cohort
  // and fall back to wider sets only when the cohort is too thin.
  type CompRow = (typeof activeRows)[number];
  const marketByModel = new Map<
    number,
    { rows: CompRow[]; demandSignal: "fast" | "balanced" | "slow" | null }
  >();
  // Family-level fallback (e.g. all 488s, all Huracáns): in memory-mode the
  // store is a single refresh snapshot, so thinner variants (488 Spider,
  // 720S Spider, Ghost…) can have zero comps. Benchmarking against sibling
  // variants is directionally useful and beats "No market data yet"; the
  // "family" basis label keeps the weaker benchmark visible in the UI.
  // Several makes set modelFamily = make (Ferrari, Lamborghini, McLaren,
  // Rolls-Royce, Aston Martin) — grouping by that raw family would lump a
  // 488 in with 812s — so for those we key on the variant's leading token
  // ("488 GTB" → "488", "Huracán Performante" → "Huracán").
  const familyKeyOf = (model: (typeof modelRows)[number]) =>
    model.modelFamily !== model.make ? `${model.make}|${model.modelFamily}` : `${model.make}|${model.variant.split(/\s+/)[0]}`;
  const marketByFamily = new Map<string, CompRow[]>();
  const now = Date.now();
  for (const model of modelRows) {
    const rows = activeRows.filter(
      (listing) =>
        listing.modelId === model.id &&
        listing.price &&
        listing.source !== "oneexotics" &&
        !listing.sellerName?.toLowerCase().includes("one exotics"),
    );
    if (!rows.length) continue;
    const family = marketByFamily.get(familyKeyOf(model)) ?? [];
    marketByFamily.set(familyKeyOf(model), family);
    family.push(...rows);
    const gone = delistedRows.filter((listing) => listing.modelId === model.id);
    const durations = gone
      .map((listing) => {
        const start = (listing.listedAt ?? listing.firstSeenAt)?.getTime();
        const end = listing.removedAt?.getTime();
        if (start == null || end == null) return null;
        const days = Math.round((end - start) / 86_400_000);
        return days >= 1 && days <= 365 ? days : null;
      })
      .filter((days): days is number => days != null)
      .sort((a, b) => a - b);
    const medianDays = durations.length >= 2 ? percentileOf(durations, 0.5) : null;
    marketByModel.set(model.id, {
      rows,
      demandSignal: medianDays == null ? null : medianDays <= 35 ? "fast" : medianDays <= 75 ? "balanced" : "slow",
    });
  }


  const activeCars = cars.filter((car) => !car.sold);
  const soldCars = cars.filter((car) => car.sold);

  const units = activeCars
    .map((car) => {
      const asListing = {
        source: "oneexotics",
        externalId: `oet-${car.id}`,
        vin: car.vin,
        year: car.year,
        make: car.make,
        model: car.model,
        trim: car.trim,
        title: [car.year, car.make, car.model, car.trim].filter(Boolean).join(" "),
        price: car.price,
        mileage: car.mileage,
        status: "active" as const,
      };
      const model = matchSupportedModel(asListing, modelRows);
      const market = model ? marketByModel.get(model.id) : undefined;
      // Benchmark ladder: ±1 model-year cohort within the variant (min 3) →
      // variant-wide set → same ladder one level up within the model family
      // (sibling variants, e.g. 488 GTB comps for a 488 Spider). compRows is
      // the exact listing set behind the number — it ships with the payload
      // so anyone can inspect and verify every comp.
      let compRows: CompRow[] = [];
      let benchmarkBasis: "year cohort" | "variant" | "family" | null = null;
      if (market) {
        if (car.year) {
          const cohort = market.rows.filter((listing) => listing.year && Math.abs(listing.year - car.year!) <= 1);
          if (cohort.length >= 3) {
            compRows = cohort;
            benchmarkBasis = "year cohort";
          }
        }
        if (!compRows.length) {
          compRows = market.rows;
          benchmarkBasis = "variant";
        }
      }
      if (!compRows.length && model) {
        const familyRows = marketByFamily.get(familyKeyOf(model)) ?? [];
        if (familyRows.length) {
          if (car.year) {
            const cohort = familyRows.filter((listing) => listing.year && Math.abs(listing.year - car.year!) <= 1);
            if (cohort.length >= 3) {
              compRows = cohort;
              benchmarkBasis = "family";
            }
          }
          if (!compRows.length) {
            compRows = familyRows;
            benchmarkBasis = "family";
          }
        }
      }
      const compPrices = compRows.map((listing) => listing.price!).sort((a, b) => a - b);
      const rawMedian = compPrices.length ? percentileOf(compPrices, 0.5) : null;
      const benchmarkMedian = rawMedian != null ? Math.round(rawMedian) : null;
      const benchmarkSample = compPrices.length;
      const vsMarketPct =
        // `|| 0` normalizes -0, which superjson would otherwise serialize as the string "-0".
        benchmarkMedian && car.price ? Math.round(((car.price - benchmarkMedian) / benchmarkMedian) * 1000) / 10 || 0 : null;
      const verdict: "rich" | "market" | "opportunity" | "untracked" =
        vsMarketPct == null ? "untracked" : vsMarketPct >= 5 ? "rich" : vsMarketPct <= -5 ? "opportunity" : "market";
      // Data-quality warnings surface the limits of each benchmark honestly.
      const warnings: string[] = [];
      if (benchmarkMedian != null) {
        if (benchmarkSample < 3) warnings.push("thin tape — fewer than 3 comps, directional only");
        if (benchmarkBasis === "family") warnings.push("family benchmark — sibling variants, not exact model");
        if (compPrices.length >= 2 && compPrices[compPrices.length - 1] / compPrices[0] > 1.6) {
          warnings.push("wide comp spread — min/max differ by more than 60%");
        }
      }
      return {
        id: car.id,
        stockno: car.stockno ?? null,
        vin: car.vin ?? null,
        year: car.year ?? null,
        make: car.make,
        model: car.model,
        trim: car.trim ?? null,
        price: car.price ?? null,
        mileage: car.mileage ?? null,
        url: car.url ?? null,
        imageUrl: car.imageUrl ?? null,
        pendingSale: car.pendingSale,
        matchedVariant: model ? model.variant : null,
        modelId: model ? model.id : null,
        marketMedian: benchmarkMedian,
        marketSample: benchmarkMedian != null ? benchmarkSample : null,
        marketBasis: benchmarkMedian != null ? benchmarkBasis : null,
        marketStats:
          compPrices.length >= 2
            ? {
                min: compPrices[0],
                p25: Math.round(percentileOf(compPrices, 0.25)!), // compPrices non-empty here (length >= 2 guard)
                p75: Math.round(percentileOf(compPrices, 0.75)!),
                max: compPrices[compPrices.length - 1],
              }
            : null,
        warnings,
        comps: compRows
          .map((listing) => ({
            id: listing.id,
            year: listing.year ?? null,
            title: listing.title,
            price: listing.price ?? null,
            mileage: listing.mileage ?? null,
            url: listing.url ?? null,
            source: listing.source,
            sellerName: listing.sellerName ?? null,
          }))
          .sort((a, b) => (a.price ?? 0) - (b.price ?? 0)),
        vsMarketPct,
        demandSignal: market?.demandSignal ?? null,
        verdict,
      };
    })
    .sort((a, b) => (b.price ?? 0) - (a.price ?? 0));

  // Sold side: what the desk actually moves, by model line.
  const soldGroups = new Map<string, { make: string; model: string; count: number; prices: number[] }>();
  for (const car of soldCars) {
    const key = `${car.make} ${car.model}`;
    const group = soldGroups.get(key) ?? { make: car.make, model: car.model, count: 0, prices: [] };
    group.count += 1;
    if (car.price) group.prices.push(car.price);
    soldGroups.set(key, group);
  }
  const soldMix = [...soldGroups.values()]
    .map((group) => ({
      make: group.make,
      model: group.model,
      count: group.count,
      medianPrice: group.prices.length ? percentileOf(group.prices.sort((a, b) => a - b), 0.5) : null,
    }))
    .sort((a, b) => b.count - a.count);

  const priced = activeCars.filter((car) => car.price);
  const makeCounts = new Map<string, number>();
  for (const car of activeCars) makeCounts.set(car.make, (makeCounts.get(car.make) ?? 0) + 1);

  // Provenance: how big the market snapshot behind these benchmarks is.
  const trackedMarketListings = activeRows.filter(
    (listing) => listing.source !== "oneexotics" && !listing.sellerName?.toLowerCase().includes("one exotics"),
  ).length;

  return {
    computedAt: new Date(now).toISOString(),
    dealer: "One Exotics Luxury Vehicles LLC · Tampa, FL",
    feedSource,
    feedError,
    market: {
      trackedListings: trackedMarketListings,
      storeMode: store.mode,
      asOf: new Date(now).toISOString(),
    },
    summary: {
      activeUnits: activeCars.length,
      pendingSales: activeCars.filter((car) => car.pendingSale).length,
      soldRecords: soldCars.length,
      totalAsk: priced.reduce((sum, car) => sum + car.price!, 0),
      medianAsk: priced.length ? percentileOf(priced.map((car) => car.price!).sort((a, b) => a - b), 0.5) : null,
      makes: [...makeCounts.entries()]
        .map(([make, unitsCount]) => ({ make, units: unitsCount, sharePct: Math.round((unitsCount / activeCars.length) * 1000) / 10 }))
        .sort((a, b) => b.units - a.units),
    },
    units,
    soldMix,
  };
}
