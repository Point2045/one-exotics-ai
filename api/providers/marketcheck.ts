import type { NormalizedListing } from "./types";

/**
 * MarketCheck (https://developers.marketcheck.com) — optional second data source.
 * Free plan: 500 calls/month, radius capped at 100 miles, so we use it for what
 * Auto.dev doesn't give us: recent (incl. delisted) inventory near exotic-car hub
 * cities — instant sell-through observations — and per-VIN listing histories.
 */

type JsonObject = Record<string, unknown>;

const API_BASE = "https://api.marketcheck.com/v2";
const TIMEOUT_MS = 12_000;

/** Major exotic-car markets — free tier caps search radius at 100 miles per call. */
export const HUB_ZIPS = ["90210", "33139", "75201", "10022", "85251", "60611", "30309", "77024"] as const;

export function marketCheckConfigured(): boolean {
  return Boolean(process.env.MARKETCHECK_API_KEY?.trim());
}

function apiKey(): string {
  const key = process.env.MARKETCHECK_API_KEY?.trim();
  if (!key) throw new Error("MARKETCHECK_API_KEY is not configured on the server.");
  return key;
}

function asObject(value: unknown): JsonObject | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : undefined;
}

function path(source: unknown, dottedPath: string): unknown {
  return dottedPath.split(".").reduce<unknown>((current, key) => asObject(current)?.[key], source);
}

function stringAt(source: unknown, paths: string[]): string | undefined {
  for (const candidate of paths) {
    const value = path(source, candidate);
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function numberAt(source: unknown, paths: string[]): number | undefined {
  for (const candidate of paths) {
    const value = path(source, candidate);
    if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value.replace(/[$,]/g, ""));
      if (Number.isFinite(parsed)) return Math.round(parsed);
    }
  }
  return undefined;
}

function dateAt(source: unknown, paths: string[]): Date | undefined {
  for (const candidate of paths) {
    const value = path(source, candidate);
    if (typeof value === "string" && value.trim()) {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      // MarketCheck emits some timestamps as unix seconds, others as milliseconds.
      const ms = value > 10_000_000_000 ? value : value * 1000;
      const parsed = new Date(ms);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
  }
  return undefined;
}

function firstArrayDeep(value: unknown, depth = 0): unknown[] | undefined {
  if (depth > 3 || value == null) return undefined;
  if (Array.isArray(value)) return value.length ? value : undefined;
  const object = asObject(value);
  if (!object) return undefined;
  for (const key of ["listings", "points", "history", "results", "data"]) {
    const found = firstArrayDeep(object[key], depth + 1);
    if (found) return found;
  }
  return undefined;
}

async function getJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`MarketCheck HTTP ${response.status}`);
    return (await response.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

export type SellThroughObservation = {
  listing: NormalizedListing;
  /** When the listing was last seen — treated as the day it left the market. */
  removedAt?: Date;
  /** MarketCheck's own days-on-market counter for the listing. */
  daysOnMarket?: number;
};

/**
 * Recent inventory (active + delisted in the last ~90 days) for one model near one hub.
 * Delisted rows arrive with status "unknown" and a last-seen date — direct feed for
 * the sell-through velocity stats.
 */
export async function fetchSellThroughRecents(params: {
  make: string;
  model?: string;
  yearMin?: number;
  zip: string;
  radiusMiles?: number;
  rows?: number;
}): Promise<{ observations: SellThroughObservation[]; warning?: string }> {
  const search = new URLSearchParams({
    api_key: apiKey(),
    make: params.make,
    zip: params.zip,
    radius: String(Math.min(params.radiusMiles ?? 100, 100)),
    rows: String(params.rows ?? 50),
    start: "0",
  });
  if (params.model) search.set("model", params.model);
  if (params.yearMin) search.set("year", `${params.yearMin}-${new Date().getFullYear() + 1}`);

  let payload: unknown;
  try {
    payload = await getJson(`${API_BASE}/search/car/recents?${search.toString()}`);
  } catch (error) {
    return { observations: [], warning: error instanceof Error ? error.message : "MarketCheck recents request failed" };
  }

  const rows = firstArrayDeep(payload) ?? [];
  const observations: SellThroughObservation[] = [];
  for (const row of rows) {
    const object = asObject(row);
    if (!object) continue;
    // Recents mix still-active and delisted inventory. MarketCheck crawls dealer feeds
    // roughly daily, so a listing unseen for 3+ days has effectively left the market;
    // anything fresher is still for sale and must not become a false sell-through row.
    const removedAt = dateAt(object, ["last_seen_at_date", "last_seen_at", "expired_at_date", "delisted_date"]);
    if (!removedAt || Date.now() - removedAt.getTime() < 3 * 86_400_000) continue;
    const make = stringAt(object, ["build.make", "make"]);
    const model = stringAt(object, ["build.model", "model"]);
    const title = stringAt(object, ["heading", "title", "name"]);
    const externalId = stringAt(object, ["id", "listing_id", "vin"]);
    if (!make || !model || !title || !externalId) continue;

    const vin = stringAt(object, ["vin"])?.toUpperCase();
    const listedAt = dateAt(object, ["first_seen_at_date", "first_seen_at", "scraped_at_date", "listed_date"]);
    const daysOnMarket = numberAt(object, ["dom", "days_on_market", "dom_active"]);
    const photos = path(object, "media.photo_links");
    const photoList = Array.isArray(photos) ? photos.filter((item): item is string => typeof item === "string") : [];

    observations.push({
      removedAt,
      daysOnMarket,
      listing: {
        source: "marketcheck",
        externalId: String(externalId),
        vin,
        year: numberAt(object, ["build.year", "year"]),
        make,
        model,
        trim: stringAt(object, ["build.trim", "trim"]),
        title,
        price: numberAt(object, ["price", "price_value", "msrp"]),
        mileage: numberAt(object, ["miles", "miles_value", "mileage"]),
        exteriorColor: stringAt(object, ["exterior_color", "exterior_color_display"]),
        interiorColor: stringAt(object, ["interior_color"]),
        transmission: stringAt(object, ["build.transmission", "transmission"]),
        drivetrain: stringAt(object, ["build.drivetrain", "drivetrain"]),
        bodyStyle: stringAt(object, ["build.body_type", "body_type", "body_style"]),
        sellerName: stringAt(object, ["seller_name", "dealer.name", "mc_dealership.name"]),
        sellerType: stringAt(object, ["dealer_type", "seller_type", "inventory_type"]),
        city: stringAt(object, ["city", "dealer.city"]),
        state: stringAt(object, ["state", "dealer.state"]),
        postalCode: stringAt(object, ["zip", "dealer.zip"]),
        url: stringAt(object, ["vdp_url", "url", "listing_url"]),
        imageUrl: photoList[0],
        photoCount: photoList.length || undefined,
        listedAt,
        status: "unknown",
        raw: { marketcheck: true, recent: true },
      },
    });
  }
  return { observations };
}

export type VinHistoryPoint = { date: string; price?: number; miles?: number; event?: string };
export type VinHistory = { configured: true; vin: string; points: VinHistoryPoint[]; source: string } | { configured: false };

const HISTORY_CACHE_TTL_MS = 7 * 86_400_000;
const historyCache = new Map<string, { at: number; value: VinHistory }>();

/** Six-year per-VIN listing history: price/mileage points across every observed listing. */
export async function fetchVinHistory(vin: string): Promise<VinHistory> {
  if (!marketCheckConfigured()) return { configured: false };
  const normalized = vin.trim().toUpperCase();
  const cached = historyCache.get(normalized);
  if (cached && Date.now() - cached.at < HISTORY_CACHE_TTL_MS) return cached.value;

  let payload: unknown;
  try {
    payload = await getJson(`${API_BASE}/history/car/${encodeURIComponent(normalized)}?api_key=${apiKey()}`);
  } catch {
    // History is a nice-to-have overlay — degrade silently rather than break the detail panel.
    const fallback: VinHistory = { configured: true, vin: normalized, points: [], source: "MarketCheck" };
    historyCache.set(normalized, { at: Date.now(), value: fallback });
    return fallback;
  }

  // History entries are listing episodes (one per dealer feed), often syndicated
  // duplicates of the same car — collapse by mileage + month before returning.
  const rows = firstArrayDeep(payload) ?? (Array.isArray(payload) ? payload : []);
  const seenEpisodes = new Set<string>();
  const points: VinHistoryPoint[] = [];
  for (const row of rows) {
    const object = asObject(row);
    if (!object) continue;
    const date = dateAt(object, ["first_seen_at_date", "first_seen_at", "scraped_at_date", "scraped_at"]);
    if (!date) continue;
    const miles = numberAt(object, ["miles", "miles_value", "odometer"]);
    const dedupeKey = `${miles ?? "?"}-${date.toISOString().slice(0, 7)}`;
    if (seenEpisodes.has(dedupeKey)) continue;
    seenEpisodes.add(dedupeKey);
    const seller = stringAt(object, ["seller_name"]);
    const where = [stringAt(object, ["city"]), stringAt(object, ["state"])].filter(Boolean).join(", ");
    points.push({
      date: date.toISOString().slice(0, 10),
      price: numberAt(object, ["price", "price_value", "ref_price"]),
      miles,
      event: [seller, where].filter(Boolean).join(" · ") || undefined,
    });
  }
  points.sort((a, b) => a.date.localeCompare(b.date));

  const value: VinHistory = { configured: true, vin: normalized, points: points.slice(-40), source: "MarketCheck" };
  historyCache.set(normalized, { at: Date.now(), value });
  return value;
}
