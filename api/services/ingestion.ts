import { HIGHLINE_MODEL_DEFINITIONS } from "@contracts/highline";
import { autoDevConfigured, fetchAutoDevListings } from "../providers/autoDev";
import { fetchSellThroughRecents, HUB_ZIPS, marketCheckConfigured } from "../providers/marketcheck";
import type { NormalizedListing } from "../providers/types";
import { matchSupportedModel } from "./matching";
import { getStore } from "./store";
import { summarizeCohorts, valueListing } from "./valuation";

function percentile(values: number[], fraction: number) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return undefined;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * fraction)));
  return sorted[index];
}

function truncate(value: string | undefined, length: number) {
  if (!value) return undefined;
  return value.length > length ? value.slice(0, length) : value;
}

export async function ensureSupportedModelsSeeded() {
  const store = await getStore();
  const existing = await store.allSupportedModels();
  if (existing.length) return;

  await store.insertSupportedModels(
    HIGHLINE_MODEL_DEFINITIONS.map((model) => ({
      make: model.make,
      modelFamily: model.modelFamily,
      variant: model.variant,
      generation: model.generation,
      yearStart: model.yearStart,
      yearEnd: model.yearEnd,
      bodyStyle: model.bodyStyle,
      transmission: model.transmission,
      searchMake: model.searchMake,
      searchModel: model.searchModel,
      matchTerms: model.matchTerms.join(","),
      sortOrder: model.sortOrder,
    })),
  );
}

export async function upsertListing(listing: NormalizedListing, modelId?: number) {
  const store = await getStore();
  const externalId = truncate(listing.externalId, 160) ?? truncate(listing.vin, 160) ?? truncate(listing.title, 160)!;
  const now = new Date();
  const existing = await store.findListing(listing.source, externalId);

  const values = {
    modelId,
    vin: truncate(listing.vin?.toUpperCase(), 17),
    year: listing.year,
    make: truncate(listing.make, 80)!,
    model: truncate(listing.model, 140)!,
    trim: truncate(listing.trim, 180),
    title: truncate(listing.title, 255)!,
    price: listing.price,
    mileage: listing.mileage,
    exteriorColor: truncate(listing.exteriorColor, 80),
    interiorColor: truncate(listing.interiorColor, 80),
    transmission: truncate(listing.transmission, 100),
    drivetrain: truncate(listing.drivetrain, 80),
    bodyStyle: truncate(listing.bodyStyle, 80),
    sellerName: truncate(listing.sellerName, 180),
    sellerType: truncate(listing.sellerType, 60),
    city: truncate(listing.city, 100),
    state: truncate(listing.state, 40),
    postalCode: truncate(listing.postalCode, 20),
    url: listing.url,
    imageUrl: listing.imageUrl,
    description: listing.description,
    listedAt: listing.listedAt,
    cpo: listing.cpo,
    photoCount: listing.photoCount,
    carfaxUrl: listing.carfaxUrl,
    accidentCount: listing.accidentCount,
    ownerCount: listing.ownerCount,
    usageType: truncate(listing.usageType, 60),
    status: listing.status,
    lastSeenAt: now,
    updatedAt: now,
    raw: listing.raw as never,
  };

  if (existing) {
    await store.updateListing(existing.id, values);
    if (existing.price !== listing.price || existing.mileage !== listing.mileage) {
      await store.insertPriceHistory({ listingId: existing.id, price: listing.price, mileage: listing.mileage, observedAt: now });
    }
    return existing.id;
  }

  const id = await store.insertListing({ ...values, source: listing.source, externalId, firstSeenAt: now, createdAt: now });
  await store.insertPriceHistory({ listingId: id, price: listing.price, mileage: listing.mileage, observedAt: now });
  return id;
}

export async function rebuildModelStats() {
  const store = await getStore();
  const active = await store.activeListings();
  const groups = new Map<number, typeof active>();

  for (const listing of active) {
    if (!listing.modelId || !listing.price) continue;
    const group = groups.get(listing.modelId) ?? [];
    group.push(listing);
    groups.set(listing.modelId, group);
  }

  let created = 0;
  for (const [modelId, group] of groups) {
    const prices = group.map((listing) => listing.price).filter((price): price is number => Boolean(price));
    const mileages = group.map((listing) => listing.mileage).filter((mileage): mileage is number => Boolean(mileage));
    await store.insertModelStats({
      modelId,
      medianPrice: percentile(prices, 0.5),
      p25Price: percentile(prices, 0.25),
      p75Price: percentile(prices, 0.75),
      medianMileage: percentile(mileages, 0.5),
      sampleSize: prices.length,
    });
    created += 1;
  }
  return created;
}

export async function rebuildValuations() {
  const store = await getStore();
  const active = await store.activeListings();
  const cohorts = summarizeCohorts(active);
  let created = 0;

  for (const listing of active) {
    const valuation = valueListing(listing, cohorts);
    if (!valuation) continue;
    await store.insertValuation({
      listingId: listing.id,
      ...valuation,
    });
    created += 1;
  }

  return created;
}

export async function refreshListingsFromAutoDev() {
  await ensureSupportedModelsSeeded();
  const store = await getStore();
  const providerConfigured = autoDevConfigured();
  const runId = await store.insertIngestionRun({ provider: "auto.dev", status: providerConfigured ? "running" : "skipped" });

  if (!providerConfigured) {
    const message = "AUTO_DEV_API_KEY is not configured on the server. Add it to the server environment, then run refresh again.";
    await store.updateIngestionRun(runId, { status: "skipped", error: message, finishedAt: new Date() });
    return { runId, status: "skipped" as const, providerConfigured, listingsFound: 0, listingsUpserted: 0, valuationsCreated: 0, warnings: [message] };
  }

  try {
    const result = await fetchAutoDevListings();
    const models = await store.allSupportedModels();
    let upserted = 0;
    let expiredUnseen = 0;

    if (result.listings.length) {
      await store.expireListingsBySource("demo");
    }

    for (const listing of result.listings) {
      const model = matchSupportedModel(listing, models);
      await upsertListing(listing, model?.id);
      upserted += 1;
    }

    // Listings absent from a fully-paginated search have left the market —
    // almost always a sale. Preserve them as unknown instead of deleting so
    // their price history survives as future comps.
    for (const search of result.searches) {
      if (!search.exhausted) continue;
      expiredUnseen += await store.expireUnseenListings("auto.dev", search.make, search.model, search.externalIds);
    }

    // MarketCheck (optional): rotating recents pull injects real sell-through observations.
    const sellThrough = await ingestMarketCheckSellThrough();
    if (sellThrough.warnings.length) result.warnings.push(...sellThrough.warnings);

    await rebuildModelStats();
    const valuationsCreated = await rebuildValuations();
    const status = result.listings.length ? "completed" : result.warnings.length ? "failed" : "completed";
    const error = result.warnings.length ? result.warnings.join("\n") : null;
    await store.updateIngestionRun(runId, {
      status,
      listingsFound: result.listings.length,
      listingsUpserted: upserted,
      valuationsCreated,
      error,
      finishedAt: new Date(),
    });

    return {
      runId,
      status,
      providerConfigured,
      listingsFound: result.listings.length,
      listingsUpserted: upserted,
      listingsExpired: expiredUnseen,
      valuationsCreated,
      sellThrough: sellThrough.configured
        ? { calls: sellThrough.calls, inserted: sellThrough.inserted, skippedStillActive: sellThrough.skippedStillActive }
        : null,
      warnings: result.warnings,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Auto.dev refresh failed";
    await store.updateIngestionRun(runId, { status: "failed", error: message, finishedAt: new Date() });
    throw error;
  }
}

export async function latestIngestionRun(provider = "auto.dev") {
  const store = await getStore();
  return store.latestIngestionRun(provider);
}

/**
 * Pull MarketCheck "recents" (active + delisted last ~90 days) for a rotating slice of
 * tracked models near exotic-car hub cities. Delisted rows are stored as status "unknown"
 * with a removedAt date, so they feed the sell-through velocity stats immediately instead
 * of waiting months for our own delisting observations to accumulate.
 *
 * Free plan is 500 calls/month with a 100-mile radius cap, so refreshes rotate through
 * (model × hub zip) pairs under a per-refresh call budget.
 */
export async function ingestMarketCheckSellThrough(): Promise<{
  configured: boolean;
  calls: number;
  inserted: number;
  skippedExisting: number;
  skippedStillActive: number;
  warnings: string[];
}> {
  if (!marketCheckConfigured()) {
    return { configured: false, calls: 0, inserted: 0, skippedExisting: 0, skippedStillActive: 0, warnings: [] };
  }

  const store = await getStore();
  const models = await store.allSupportedModels();
  const callsPerRefresh = Math.max(1, Math.min(Number(process.env.MARKETCHECK_REFRESH_CALLS) || 12, 40));

  // Deterministic rotation: same slice per day, full coverage every (pairs / budget) days.
  const pairs = models.flatMap((model) => HUB_ZIPS.map((zip) => ({ model, zip })));
  const dayOfYear = Math.floor(Date.now() / 86_400_000);
  const offset = (dayOfYear * callsPerRefresh) % pairs.length;
  const slice = Array.from({ length: Math.min(callsPerRefresh, pairs.length) }, (_, index) => pairs[(offset + index) % pairs.length]);

  const result = { configured: true, calls: 0, inserted: 0, skippedExisting: 0, skippedStillActive: 0, warnings: [] as string[] };
  const now = new Date();

  for (const { model, zip } of slice) {
    const { observations, warning } = await fetchSellThroughRecents({
      make: model.searchMake,
      model: model.searchModel ?? undefined,
      yearMin: model.yearStart,
      zip,
    });
    result.calls += 1;
    if (warning) {
      result.warnings.push(`MarketCheck ${model.searchMake} @${zip}: ${warning}`);
      continue;
    }

    for (const observation of observations) {
      const listing = observation.listing;
      const externalId = truncate(listing.externalId, 160)!;
      const existing = await store.findListing("marketcheck", externalId);
      if (existing) {
        result.skippedExisting += 1;
        continue;
      }
      // A VIN still active anywhere means this "recent" hasn't actually left the market.
      if (listing.vin && (await store.findActiveListingByVin(listing.vin))) {
        result.skippedStillActive += 1;
        continue;
      }

      const matched = matchSupportedModel(listing, models);
      if (!matched) continue; // Only track sell-through for variants we actually cover.

      const removedAt = observation.removedAt ?? now;
      const listedAt =
        listing.listedAt ??
        (observation.daysOnMarket != null ? new Date(removedAt.getTime() - observation.daysOnMarket * 86_400_000) : undefined);

      await store.insertListing({
        source: "marketcheck",
        externalId,
        modelId: matched.id,
        vin: truncate(listing.vin, 17),
        year: listing.year,
        make: truncate(listing.make, 80)!,
        model: truncate(listing.model, 140)!,
        trim: truncate(listing.trim, 180),
        title: truncate(listing.title, 255)!,
        price: listing.price,
        mileage: listing.mileage,
        exteriorColor: truncate(listing.exteriorColor, 80),
        interiorColor: truncate(listing.interiorColor, 80),
        transmission: truncate(listing.transmission, 100),
        drivetrain: truncate(listing.drivetrain, 80),
        bodyStyle: truncate(listing.bodyStyle, 80),
        sellerName: truncate(listing.sellerName, 180),
        sellerType: truncate(listing.sellerType, 60),
        city: truncate(listing.city, 100),
        state: truncate(listing.state, 40),
        postalCode: truncate(listing.postalCode, 20),
        url: listing.url,
        imageUrl: listing.imageUrl,
        photoCount: listing.photoCount,
        listedAt,
        status: "unknown",
        firstSeenAt: listedAt ?? removedAt,
        lastSeenAt: removedAt,
        removedAt,
        createdAt: now,
        updatedAt: now,
        raw: listing.raw as never,
      });
      result.inserted += 1;
    }
  }

  return result;
}
