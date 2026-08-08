import { HIGHLINE_MODEL_DEFINITIONS } from "@contracts/highline";
import { autoDevConfigured, fetchAutoDevListings } from "../providers/autoDev";
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
