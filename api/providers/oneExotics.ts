import type { NormalizedListing } from "./types";

/**
 * One Exotics Tampa — the dealer's own website feed.
 * Their WordPress theme exposes a public JSON inventory endpoint at /api/cars/
 * covering BOTH active units and sold history (sold rows carry no dates, so
 * historical velocity comes from our own snapshots going forward — exits get
 * dated the moment persistence lands).
 */

const DEALER_API = "https://www.oneexoticstampa.com/api/cars/";
const DEALER_SITE = "https://www.oneexoticstampa.com";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1h — their site, be polite

export type DealerCar = {
  id: string;
  stockno?: string;
  vin?: string;
  year?: number;
  make: string;
  model: string;
  trim?: string;
  mileage?: number;
  price?: number;
  exteriorColor?: string;
  interiorColor?: string;
  bodyStyle?: string;
  sold: boolean;
  pendingSale: boolean;
  url?: string;
  imageUrl?: string;
  carfaxUrl?: string;
};

let cache: { at: number; cars: DealerCar[] } | undefined;

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.]/g, ""));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }
  return undefined;
}

function normalizeCar(item: unknown): DealerCar | undefined {
  if (typeof item !== "object" || item === null) return undefined;
  const record = item as Record<string, unknown>;
  const id = asString(record.id);
  const make = asString(record.make);
  const model = asString(record.model);
  if (!id || !make || !model) return undefined;
  const urlPath = asString(record.url_link);
  return {
    id,
    stockno: asString(record.stockno),
    vin: asString(record.vin),
    year: asNumber(record.year),
    make,
    model,
    trim: asString(record.trim),
    mileage: asNumber(record.mileage),
    price: asNumber(record.price),
    exteriorColor: asString(record.ext_color),
    interiorColor: asString(record.int_color),
    bodyStyle: asString(record.body),
    sold: asString(record.sold) === "Sold",
    pendingSale: asString(record.pending_sale) === "1",
    url: urlPath ? `${DEALER_SITE}${urlPath}` : undefined,
    imageUrl: asString(record.image_link),
    carfaxUrl: asString(record.cfx),
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Full dealer feed (active + sold), cached 1h. Falls back to stale cache on
 * WAF/rate-limit errors — their host intermittently 403s datacenter IPs. The
 * block is flaky per-request, so 403s get a few jittered retries before we
 * give up (observed: same instance, 3× 403 then success seconds later). */
export async function fetchDealerInventory(): Promise<DealerCar[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.cars;
  const headers = {
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: "https://www.oneexoticstampa.com/inventory/",
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  };
  let lastStatus = 0;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (attempt > 0) await sleep(800 * attempt + Math.floor(Math.random() * 400));
    const response = await fetch(DEALER_API, { headers });
    if (response.status === 403) {
      lastStatus = 403;
      continue;
    }
    if (!response.ok) {
      if (cache) return cache.cars; // stale is better than empty
      throw new Error(`One Exotics feed HTTP ${response.status}`);
    }
    const data = (await response.json()) as unknown;
    if (!Array.isArray(data)) {
      if (cache) return cache.cars;
      throw new Error("One Exotics feed returned a non-array payload");
    }
    const cars = data.map(normalizeCar).filter((car): car is DealerCar => Boolean(car));
    cache = { at: Date.now(), cars };
    return cars;
  }
  if (cache) return cache.cars;
  throw new Error(`One Exotics feed HTTP ${lastStatus}`);
}

/** Dealer units as NormalizedListings so they flow through the store/velocity pipeline like any other source. */
export async function fetchDealerListings(): Promise<NormalizedListing[]> {
  const cars = await fetchDealerInventory();
  return cars.map((car) => ({
    source: "oneexotics",
    externalId: `oet-${car.id}`,
    vin: car.vin,
    year: car.year,
    make: car.make,
    model: car.model,
    trim: car.trim,
    title: [car.year, car.make, car.model, car.trim].filter(Boolean).join(" "),
    price: car.sold ? undefined : car.price,
    mileage: car.mileage,
    exteriorColor: car.exteriorColor,
    interiorColor: car.interiorColor,
    bodyStyle: car.bodyStyle,
    sellerName: "One Exotics Luxury Vehicles LLC",
    sellerType: "dealer",
    city: "Tampa",
    state: "FL",
    url: car.url,
    imageUrl: car.imageUrl,
    carfaxUrl: car.carfaxUrl,
    status: car.sold ? "sold" : "active",
  }));
}
