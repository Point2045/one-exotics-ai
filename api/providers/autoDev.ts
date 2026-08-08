import { HIGHLINE_SEARCHES } from "@contracts/highline";
import type { NormalizedListing, ProviderFetchResult } from "./types";

type JsonObject = Record<string, unknown>;

const API_BASE = "https://api.auto.dev/listings";
const STARTER_PAGE_LIMIT = 20;

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
    // Auto.dev serializes purely numeric model names (e.g. Porsche 911) as JSON numbers.
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

function firstStringDeep(value: unknown, depth = 0): string | undefined {
  if (depth > 4 || value == null) return undefined;
  if (typeof value === "string" && /^https?:\/\//.test(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstStringDeep(item, depth + 1);
      if (found) return found;
    }
    return undefined;
  }
  const object = asObject(value);
  if (!object) return undefined;
  for (const key of ["url", "href", "src", "image", "photo", "original", "large"]) {
    const found = firstStringDeep(object[key], depth + 1);
    if (found) return found;
  }
  for (const item of Object.values(object)) {
    const found = firstStringDeep(item, depth + 1);
    if (found) return found;
  }
  return undefined;
}

function stableId(input: string) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function dateAt(source: unknown, paths: string[]): Date | undefined {
  for (const candidate of paths) {
    const value = path(source, candidate);
    if (typeof value === "string" && value.trim()) {
      const parsed = new Date(value.trim().replace(" ", "T"));
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
  }
  return undefined;
}

function booleanAt(source: unknown, paths: string[]): boolean | undefined {
  for (const candidate of paths) {
    const value = path(source, candidate);
    if (typeof value === "boolean") return value;
  }
  return undefined;
}

function normalizeAutoDevListing(item: unknown): NormalizedListing | undefined {
  const vin = stringAt(item, ["vehicle.vin", "vin"]);
  const year = numberAt(item, ["vehicle.year", "year"]);
  const make = stringAt(item, ["vehicle.make", "make"]);
  const model = stringAt(item, ["vehicle.model", "model"]);
  const trim = stringAt(item, ["vehicle.trim", "vehicle.series", "trim", "series"]);
  const price = numberAt(item, ["retailListing.price", "price", "listing.price", "marketplace.price"]);
  const mileage = numberAt(item, ["retailListing.miles", "retailListing.mileage", "vehicle.mileage", "miles", "mileage"]);

  if (!make || !model || !price) return undefined;

  const titleParts = [year, make, model, trim].filter(Boolean);
  const title = stringAt(item, ["title", "listing.title", "retailListing.title"]) ?? titleParts.join(" ");
  const externalId = stringAt(item, ["id", "_id", "listingId", "retailListing.id"]) ?? vin ?? stableId(`${title}-${price}-${mileage ?? ""}`);

  return {
    source: "auto.dev",
    externalId,
    vin,
    year,
    make,
    model,
    trim,
    title,
    price,
    mileage,
    exteriorColor: stringAt(item, ["vehicle.exteriorColor", "vehicle.exterior_color", "exteriorColor", "retailListing.exteriorColor"]),
    interiorColor: stringAt(item, ["vehicle.interiorColor", "vehicle.interior_color", "interiorColor", "retailListing.interiorColor"]),
    transmission: stringAt(item, ["vehicle.transmission", "vehicle.transmissionType", "transmission"]),
    drivetrain: stringAt(item, ["vehicle.drivetrain", "vehicle.driveType", "drivetrain"]),
    bodyStyle: stringAt(item, ["vehicle.bodyStyle", "vehicle.bodyType", "bodyStyle"]),
    sellerName: stringAt(item, ["retailListing.dealerName", "retailListing.dealer.name", "retailListing.dealer", "dealer.name", "seller.name"]),
    sellerType: stringAt(item, ["retailListing.sellerType", "retailListing.dealerType", "seller.type"]) ?? "dealer",
    city: stringAt(item, ["retailListing.city", "location.city", "dealer.city"]),
    state: stringAt(item, ["retailListing.state", "location.state", "dealer.state"]),
    postalCode: stringAt(item, ["retailListing.zip", "retailListing.postalCode", "location.zip", "dealer.zip"]),
    url: stringAt(item, ["retailListing.vdp", "retailListing.url", "url", "listing.url", "links.self"]),
    imageUrl:
      stringAt(item, ["retailListing.primaryImage"]) ??
      firstStringDeep(path(item, "photos")) ??
      firstStringDeep(path(item, "media")) ??
      firstStringDeep(path(item, "images")),
    description: stringAt(item, ["description", "retailListing.description", "vehicle.description"]),
    listedAt: dateAt(item, ["createdAt", "retailListing.createdAt", "listedAt"]),
    cpo: booleanAt(item, ["retailListing.cpo", "cpo"]),
    photoCount: numberAt(item, ["retailListing.photoCount", "photoCount"]),
    carfaxUrl: stringAt(item, ["retailListing.carfaxUrl", "carfaxUrl", "history.carfaxUrl"]),
    accidentCount: numberAt(item, ["history.accidentCount", "accidentCount"]),
    ownerCount: numberAt(item, ["history.ownerCount", "ownerCount"]),
    usageType: stringAt(item, ["history.usageType", "usageType"]),
    status: "active",
    raw: item,
  };
}

const MAX_PAGES_PER_SEARCH = 6;

async function fetchSearchPage(apiKey: string, search: (typeof HIGHLINE_SEARCHES)[number], page: number) {
  const params = new URLSearchParams({
    limit: String(STARTER_PAGE_LIMIT),
    page: String(page),
    sort: "updatedAt.desc",
    "vehicle.make": search.make,
  });
  if (search.model) params.set("vehicle.model", search.model);

  const response = await fetch(`${API_BASE}?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Auto.dev ${search.label} failed (${response.status}): ${body.slice(0, 240)}`);
  }

  const payload = (await response.json()) as JsonObject;
  const data = Array.isArray(payload.data) ? payload.data : [];
  return data.map(normalizeAutoDevListing).filter((listing): listing is NormalizedListing => Boolean(listing));
}

export function autoDevConfigured() {
  return Boolean(process.env.AUTO_DEV_API_KEY?.trim());
}

export async function fetchAutoDevListings(): Promise<ProviderFetchResult> {
  const apiKey = process.env.AUTO_DEV_API_KEY?.trim();
  if (!apiKey) {
    return {
      provider: "auto.dev",
      listings: [],
      warnings: ["AUTO_DEV_API_KEY is not configured on the server."],
      searches: [],
    };
  }

  const listings: NormalizedListing[] = [];
  const warnings: string[] = [];
  const searches: ProviderFetchResult["searches"] = [];
  const seen = new Set<string>();

  for (const search of HIGHLINE_SEARCHES) {
    const completion: ProviderFetchResult["searches"][number] = {
      key: search.key,
      make: search.make,
      model: search.model,
      exhausted: false,
      externalIds: [],
    };
    try {
      for (let page = 1; page <= MAX_PAGES_PER_SEARCH; page += 1) {
        const rows = await fetchSearchPage(apiKey, search, page);
        for (const listing of rows) {
          const key = listing.vin ?? listing.externalId;
          completion.externalIds.push(listing.externalId);
          if (seen.has(key)) continue;
          seen.add(key);
          listings.push(listing);
        }
        if (rows.length < STARTER_PAGE_LIMIT) {
          completion.exhausted = true;
          break;
        }
      }
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : `Auto.dev ${search.label} failed`);
    }
    searches.push(completion);
  }

  return { provider: "auto.dev", listings, warnings, searches };
}
