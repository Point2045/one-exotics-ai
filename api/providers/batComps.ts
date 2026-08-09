/**
 * Bring a Trailer sold comps via parse.bot's managed BaT API
 * (https://parse.bot — free plan: 200 credits/month, BaT calls cost ~5 credits).
 *
 * This is sold-price ground truth: what enthusiast/exotic cars actually transacted
 * for at auction, versus the asking prices everywhere else. Calls are cached for
 * 24h and daily-capped so a free key survives the month.
 *
 * Verified payload shapes (2026-08):
 *   get_makes_and_models_directory → { data: { makes: [{ make, models: [{ name, slug, url }] }] } }
 *   get_price_trends?make&model&years → { data: { count, min, max, avg, median } } (422 on unknown slug)
 *   get_model_auction_results?make&model&page → { data: { items: [{ title, url, current_bid,
 *     current_bid_label, sold_text, timestamp_end, active, ... }] } }
 */

type JsonObject = Record<string, unknown>;

const API_BASE = "https://api.parse.bot/scraper/0ea2dbf8-cbae-4a6b-90d3-149278f4a294";
const TIMEOUT_MS = 15_000;
const CACHE_TTL_MS = 24 * 86_400_000;
/** ~40 BaT calls/month on the free plan; keep headroom under the cap. */
const DAILY_CALL_CAP = 20;

export function parseBotConfigured(): boolean {
  return Boolean(process.env.PARSEBOT_API_KEY?.trim());
}

function apiKey(): string {
  const key = process.env.PARSEBOT_API_KEY?.trim();
  if (!key) throw new Error("PARSEBOT_API_KEY is not configured on the server.");
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

function firstArrayDeep(value: unknown, depth = 0): unknown[] | undefined {
  if (depth > 4 || value == null) return undefined;
  if (Array.isArray(value)) return value.length ? value : undefined;
  const object = asObject(value);
  if (!object) return undefined;
  for (const key of ["items", "results", "auctions", "listings", "data", "models", "makes", "sales", "points"]) {
    const found = firstArrayDeep(object[key], depth + 1);
    if (found) return found;
  }
  for (const item of Object.values(object)) {
    const found = firstArrayDeep(item, depth + 1);
    if (found) return found;
  }
  return undefined;
}

// --- Budget + cache ---------------------------------------------------------

const callLog = new Map<string, number>();
const cache = new Map<string, { at: number; value: unknown }>();

function callBudgetRemaining(): number {
  const today = new Date().toISOString().slice(0, 10);
  return DAILY_CALL_CAP - (callLog.get(today) ?? 0);
}

async function callEndpoint<T>(endpoint: string, params: Record<string, string>): Promise<T> {
  const cacheKey = `${endpoint}?${new URLSearchParams(params).toString()}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value as T;
  if (callBudgetRemaining() <= 0) throw new Error("BaT comps daily call budget reached — cached results only until tomorrow.");

  const url = `${API_BASE}/${endpoint}?${new URLSearchParams(params).toString()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { "X-API-Key": apiKey(), Accept: "application/json" } });
    if (!response.ok) throw new Error(`parse.bot HTTP ${response.status}`);
    const payload = (await response.json()) as unknown;
    const today = new Date().toISOString().slice(0, 10);
    callLog.set(today, (callLog.get(today) ?? 0) + 1);
    cache.set(cacheKey, { at: Date.now(), value: payload });
    return payload as T;
  } finally {
    clearTimeout(timer);
  }
}

// --- Slug resolution --------------------------------------------------------

function foldAccents(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function slugify(value: string): string {
  return foldAccents(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Accent-folded lowercase alphanumeric — "Huracán EVO" → "huracanevo". */
function normalize(value: string): string {
  return foldAccents(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Strip a leading make from a model name: "Ferrari 488" with make "Ferrari" → "488". */
function stripMake(modelName: string, makeName: string): string {
  const modelKey = normalize(modelName);
  const makeKey = normalize(makeName);
  return makeKey && modelKey.startsWith(makeKey) ? modelKey.slice(makeKey.length) : modelKey;
}

/**
 * Resolve our model to BaT's make/model slugs via the directory.
 * Our taxonomy folds the model into `variant` for Ferrari/Lamborghini/Aston Martin
 * (modelFamily == make there), so candidates are tried in order:
 * modelFamily (when distinct) → variant's first word → searchModel → full variant.
 */
async function resolveSlugs(make: string, candidates: string[]): Promise<{ makeSlug: string; modelSlug: string }> {
  const usable = [...new Set(candidates.map((c) => c?.trim()).filter((c): c is string => Boolean(c)))];
  try {
    const directory = await callEndpoint<unknown>("get_makes_and_models_directory", {});
    const makes = firstArrayDeep(path(directory, "data")) ?? firstArrayDeep(directory) ?? [];
    const makeKey = normalize(make);
    for (const makeEntry of makes) {
      const makeObject = asObject(makeEntry);
      if (!makeObject) continue;
      const entryMake = stringAt(makeObject, ["make", "make_name", "brand", "name"]);
      if (!entryMake) continue;
      const entryMakeKey = normalize(entryMake);
      if (entryMakeKey !== makeKey && !entryMakeKey.includes(makeKey) && !makeKey.includes(entryMakeKey)) continue;

      const models = Array.isArray(makeObject.models) ? makeObject.models : [];
      for (const candidate of usable) {
        const candidateKey = normalize(candidate);
        for (const modelEntry of models) {
          const modelObject = asObject(modelEntry);
          if (!modelObject) continue;
          const modelName = stringAt(modelObject, ["name", "model", "model_name"]);
          if (!modelName) continue;
          const modelKey = stripMake(modelName, entryMake);
          if (modelKey === candidateKey || modelKey.includes(candidateKey) || candidateKey.includes(modelKey)) {
            return {
              makeSlug: slugify(entryMake),
              modelSlug: stringAt(modelObject, ["slug"]) ?? slugify(modelName),
            };
          }
        }
      }
    }
  } catch {
    // Directory is an optimization — plain slugs cover most mainstream exotic models.
  }
  const fallback = usable[0] ?? make;
  return { makeSlug: slugify(make), modelSlug: slugify(fallback) };
}

// --- Public API -------------------------------------------------------------

export type BatRecentSale = { title: string; soldPrice?: number; date?: string; url?: string; result?: "sold" | "bid to" };

export type BatComps =
  | {
      configured: true;
      matched: boolean;
      make: string;
      model: string;
      baTModel?: string;
      windowYears: number;
      sampleCount?: number;
      medianSold?: number;
      averageSold?: number;
      minSold?: number;
      maxSold?: number;
      recentSales: BatRecentSale[];
      source: string;
      error?: string;
    }
  | { configured: false };

/**
 * Sold-price stats + recent auction results for one tracked model.
 * Costs 2 parse.bot calls per uncached lookup (trends + results); cached 24h after that.
 */
export async function fetchBatComps(
  make: string,
  modelFamily: string,
  opts: { searchModel?: string | null; variant?: string; windowYears?: number } = {},
): Promise<BatComps> {
  if (!parseBotConfigured()) return { configured: false };

  const windowYears = opts.windowYears ?? 1;
  const variantFirstWord = opts.variant?.split(/\s+/)[0];
  const candidates = [
    modelFamily.toLowerCase() !== make.toLowerCase() ? modelFamily : undefined,
    variantFirstWord,
    opts.searchModel ?? undefined,
    opts.variant,
  ].filter((candidate): candidate is string => Boolean(candidate));

  const { makeSlug, modelSlug } = await resolveSlugs(make, candidates);
  const base = {
    configured: true as const,
    make,
    model: modelFamily.toLowerCase() !== make.toLowerCase() ? modelFamily : (opts.variant ?? modelFamily),
    baTModel: modelSlug,
    windowYears,
    source: "Bring a Trailer via parse.bot",
  };

  let trendsPayload: unknown;
  let resultsPayload: unknown;
  try {
    trendsPayload = await callEndpoint<unknown>("get_price_trends", {
      make: makeSlug,
      model: modelSlug,
      years: String(windowYears),
    });
  } catch (error) {
    return { ...base, matched: false, recentSales: [], error: error instanceof Error ? error.message : "price trends unavailable" };
  }
  try {
    resultsPayload = await callEndpoint<unknown>("get_model_auction_results", { make: makeSlug, model: modelSlug, page: "1" });
  } catch {
    resultsPayload = undefined; // Trends alone are still useful.
  }

  const stats = asObject(path(trendsPayload, "data")) ?? asObject(trendsPayload);
  const sampleCount = numberAt(stats ?? {}, ["count", "sample_size", "num_results", "total"]);
  const medianSold = numberAt(stats ?? {}, ["median", "median_price", "median_sold_price"]);
  const averageSold = numberAt(stats ?? {}, ["avg", "average", "average_price", "mean"]);
  const minSold = numberAt(stats ?? {}, ["min", "min_price", "low"]);
  const maxSold = numberAt(stats ?? {}, ["max", "max_price", "high"]);

  const recentSales: BatRecentSale[] = [];
  for (const row of firstArrayDeep(resultsPayload) ?? []) {
    const object = asObject(row);
    if (!object) continue;
    const title = stringAt(object, ["title", "heading", "name"]);
    if (!title) continue;
    const endTs = numberAt(object, ["timestamp_end"]);
    const soldText = stringAt(object, ["sold_text"]);
    recentSales.push({
      title,
      soldPrice: numberAt(object, ["current_bid", "sold_price", "sale_price", "final_bid"]),
      date: endTs ? new Date(endTs * 1000).toISOString().slice(0, 10) : stringAt(object, ["sold_date", "end_date", "date"]),
      url: stringAt(object, ["url", "link", "listing_url"]),
      result: soldText?.toLowerCase().startsWith("sold") ? "sold" : "bid to",
    });
    if (recentSales.length >= 6) break;
  }

  const matched = sampleCount != null || medianSold != null || recentSales.length > 0;
  return {
    ...base,
    matched,
    sampleCount,
    medianSold,
    averageSold,
    minSold,
    maxSold,
    recentSales,
    error: matched ? undefined : "No BaT results matched this model slug.",
  };
}
