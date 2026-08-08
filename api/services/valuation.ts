import type { Listing } from "@db/schema";

type DealAction = "pursue" | "inspect" | "negotiate" | "pass";

export type ListingCohort = {
  key: string;
  specificity: number;
  prices: number[];
  mileages: number[];
};

export type CohortSummary = {
  key: string;
  specificity: number;
  sampleSize: number;
  medianPrice: number;
  medianMileage?: number;
};

export type ValuationResult = {
  fairValueLow: number;
  fairValuePoint: number;
  fairValueHigh: number;
  rawDiscountPct: string;
  acquisitionCost: number;
  sellingCost: number;
  netEdge: number;
  netEdgePct: string;
  confidence: number;
  liquidity: number;
  riskScore: number;
  sampleSize: number;
  action: DealAction;
  rationale: string;
};

/**
 * Whole-car listings for supported highline marques never trade below this
 * floor; anything cheaper is a lease ad, parts car, or malformed feed row and
 * must not poison cohort medians or surface as a deal.
 */
export const MIN_HIGHLINE_PRICE = 15_000;

/** Raw discounts beyond this are almost never clean-title real listings. */
const IMPLAUSIBLE_DISCOUNT_PCT = 40;

function median(values: number[]) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return undefined;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function yearBand(year: number) {
  return Math.floor(year / 3) * 3;
}

export function summarizeCohorts(listings: Listing[]) {
  const cohorts = new Map<string, ListingCohort>();

  const add = (listing: Listing, key: string | undefined, specificity: number) => {
    if (!key || !listing.price || listing.price < MIN_HIGHLINE_PRICE) return;
    const current = cohorts.get(key) ?? { key, specificity, prices: [], mileages: [] };
    current.prices.push(listing.price);
    if (listing.mileage) current.mileages.push(listing.mileage);
    cohorts.set(key, current);
  };

  for (const listing of listings) {
    const year = listing.year ? String(listing.year) : undefined;
    add(listing, listing.modelId && year ? `model:${listing.modelId}:year:${year}` : undefined, 40);
    add(listing, listing.modelId && listing.year ? `model:${listing.modelId}:band:${yearBand(listing.year)}` : undefined, 35);
    add(listing, listing.modelId ? `model:${listing.modelId}` : undefined, 30);
    add(listing, year ? `make:${listing.make}:year:${year}` : undefined, 20);
    add(listing, `make:${listing.make}`, 10);
  }

  const summaries: CohortSummary[] = [];
  for (const cohort of cohorts.values()) {
    const medianPrice = median(cohort.prices);
    if (!medianPrice) continue;
    summaries.push({
      key: cohort.key,
      specificity: cohort.specificity,
      sampleSize: cohort.prices.length,
      medianPrice,
      medianMileage: median(cohort.mileages),
    });
  }
  return summaries.sort((a, b) => b.specificity - a.specificity || b.sampleSize - a.sampleSize);
}

function mileageAdjustmentRate(make: string) {
  const normalized = make.toLowerCase();
  if (normalized.includes("ferrari") || normalized.includes("lamborghini")) return 0.005;
  if (normalized.includes("aston")) return 0.004;
  return 0.0035;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function chooseCohort(listing: Listing, cohorts: CohortSummary[]) {
  const exact = listing.modelId && listing.year ? `model:${listing.modelId}:year:${listing.year}` : undefined;
  const band = listing.modelId && listing.year ? `model:${listing.modelId}:band:${yearBand(listing.year)}` : undefined;
  const model = listing.modelId ? `model:${listing.modelId}` : undefined;
  const makeYear = listing.year ? `make:${listing.make}:year:${listing.year}` : undefined;
  const make = `make:${listing.make}`;
  const modelLevel = [exact, band, model].filter(Boolean) as string[];
  const makeLevel = [makeYear, make].filter(Boolean) as string[];

  // Two same-variant comps beat twenty cross-model comps: accept thin
  // model-level cohorts before ever mixing models at the make level.
  for (const key of modelLevel) {
    const found = cohorts.find((cohort) => cohort.key === key && cohort.sampleSize >= 2);
    if (found) return found;
  }
  for (const key of makeLevel) {
    const found = cohorts.find((cohort) => cohort.key === key && cohort.sampleSize >= 3);
    if (found) return found;
  }

  return [...modelLevel, ...makeLevel]
    .map((key) => cohorts.find((cohort) => cohort.key === key))
    .find((cohort): cohort is CohortSummary => Boolean(cohort));
}

function usageRisk(usageType: string | null) {
  const normalized = usageType?.toLowerCase() ?? "";
  if (normalized.includes("rental") || normalized.includes("fleet") || normalized.includes("commercial")) return "rental" as const;
  if (normalized.includes("lease")) return "lease" as const;
  return "personal" as const;
}

export function valueListing(listing: Listing, cohorts: CohortSummary[]): ValuationResult | undefined {
  if (!listing.price || listing.price < MIN_HIGHLINE_PRICE) return undefined;
  const cohort = chooseCohort(listing, cohorts);
  if (!cohort) return undefined;

  const accidents = listing.accidentCount ?? 0;
  const usage = usageRisk(listing.usageType);

  let adjustedMedian = cohort.medianPrice;
  let mileageNote = "no mileage adjustment";
  if (listing.mileage && cohort.medianMileage) {
    const mileageDelta = cohort.medianMileage - listing.mileage;
    const adjustment = clamp((mileageDelta / 1000) * mileageAdjustmentRate(listing.make), -0.15, 0.15);
    adjustedMedian = Math.round(cohort.medianPrice * (1 + adjustment));
    mileageNote = `${mileageDelta >= 0 ? "below" : "above"} cohort mileage by ${Math.abs(mileageDelta).toLocaleString()} mi`;
  }
  // Accident history hits highline resale hard; rental/fleet use carries a smaller penalty.
  if (accidents > 0) adjustedMedian = Math.round(adjustedMedian * (1 - Math.min(0.1 * accidents, 0.25)));
  if (usage === "rental") adjustedMedian = Math.round(adjustedMedian * 0.95);

  const coarseCohort = cohort.key.startsWith("make:");
  const thinCohort = cohort.sampleSize < 3;
  const spread = coarseCohort || thinCohort ? 0.15 : cohort.sampleSize >= 10 ? 0.06 : cohort.sampleSize >= 5 ? 0.09 : 0.13;
  const fairValuePoint = adjustedMedian;
  const fairValueLow = Math.round(fairValuePoint * (1 - spread));
  const fairValueHigh = Math.round(fairValuePoint * (1 + spread));
  const rawDiscount = ((fairValuePoint - listing.price) / fairValuePoint) * 100;
  const acquisitionCost = Math.round(listing.price * 0.075 + 2800);
  const sellingCost = Math.round(fairValuePoint * 0.03 + 1200);
  const netEdge = fairValuePoint - listing.price - acquisitionCost - sellingCost;
  const netEdgePct = (netEdge / fairValuePoint) * 100;

  const implausibleDiscount = rawDiscount > IMPLAUSIBLE_DISCOUNT_PCT;

  let riskScore = 18;
  if (!listing.vin) riskScore += 18;
  if (!listing.mileage) riskScore += 12;
  if (!listing.sellerName) riskScore += 8;
  if (!listing.url) riskScore += 6;
  if (listing.source === "demo") riskScore += 12;
  if (rawDiscount > 15) riskScore += 8;
  if (implausibleDiscount) riskScore += 30;
  if (accidents > 0) riskScore += 22;
  if (usage === "rental") riskScore += 10;
  if (usage === "lease") riskScore += 3;
  if ((listing.ownerCount ?? 1) >= 4) riskScore += 5;
  if (listing.photoCount != null && listing.photoCount < 8) riskScore += 4;
  if (listing.cpo) riskScore -= 3;
  riskScore = clamp(riskScore, 0, 100);

  let confidence = 38 + Math.min(cohort.sampleSize * 5, 25);
  if (listing.vin) confidence += 9;
  if (listing.mileage) confidence += 6;
  if (listing.sellerName) confidence += 5;
  if (listing.imageUrl) confidence += 3;
  if (cohort.specificity < 30) confidence -= 10;
  if (coarseCohort) confidence -= 15;
  if (listing.cpo) confidence += 3;
  if (listing.ownerCount === 1) confidence += 3;
  if (accidents > 0) confidence -= 10;
  confidence = clamp(confidence, 20, 95);

  const liquidity = clamp(28 + cohort.sampleSize * 5 - Math.max(0, fairValuePoint - 250000) / 25000, 20, 92);

  let action: DealAction = "pass";
  if (!implausibleDiscount) {
    if (netEdgePct >= 10 && confidence >= 70 && riskScore <= 48) action = "pursue";
    else if (netEdgePct >= 6 && confidence >= 58) action = "inspect";
    else if (netEdgePct >= 2) action = "negotiate";
  }
  // Cross-model make cohorts are too coarse to justify a pursue call.
  if (coarseCohort && action === "pursue") action = "inspect";
  // Reported accident history: the apparent discount may be compensation, not edge.
  if (accidents > 0 && action === "pursue") action = "inspect";
  // Ex-rental exotics: hard miles and title stigma cap conviction.
  if (usage === "rental" && action === "pursue") action = "inspect";

  const cohortLabel = !cohort.key.startsWith("model:")
    ? cohort.key.includes(":year:")
      ? "make-year"
      : "make"
    : cohort.key.includes(":year:")
      ? "model-year"
      : cohort.key.includes(":band:")
        ? "model year-band"
        : "model";

  const rationaleNotes = [
    `${cohort.sampleSize} comparable active listings in the ${cohortLabel} cohort`,
    mileageNote,
    `all-in acquisition estimate ${Math.round((acquisitionCost / listing.price) * 1000) / 10}% of ask`,
    implausibleDiscount
      ? "advertised price is implausibly far below the cohort — likely a lease ad, salvage, or mislisted row; verify before any action"
      : coarseCohort
        ? "cross-model make cohort — directional only, verify against same-variant comps"
        : thinCohort
          ? "thin comp set — treat as directional"
          : riskScore > 45
            ? "elevated data-quality risk"
            : "acceptable data-quality profile",
  ];
  if (listing.listedAt) {
    const dom = Math.max(0, Math.round((Date.now() - listing.listedAt.getTime()) / 86_400_000));
    if (dom >= 60) rationaleNotes.push(`listed ${dom} days — stale, seller likely flexible`);
    else if (dom >= 21) rationaleNotes.push(`listed ${dom} days — approaching typical price-drop window`);
    else rationaleNotes.push(`fresh listing (${dom} days) — little negotiating leverage yet`);
  }
  if (accidents > 0) rationaleNotes.push(`${accidents} reported accident${accidents > 1 ? "s" : ""} — discount may be compensation, not edge`);
  if ((listing.ownerCount ?? 0) >= 4) rationaleNotes.push(`${listing.ownerCount} prior owners — churn history weighs on resale`);
  else if (listing.ownerCount === 1) rationaleNotes.push("one-owner car — cleaner story for resale");
  if (usage === "rental") rationaleNotes.push("fleet/rental history — verify condition and title branding");
  if (listing.cpo) rationaleNotes.push("factory CPO — warranty support lowers ownership risk");
  if (listing.photoCount != null && listing.photoCount < 8) rationaleNotes.push(`only ${listing.photoCount} photos — thin presentation, inspect carefully`);
  const rationale = rationaleNotes.join("; ");

  return {
    fairValueLow,
    fairValuePoint,
    fairValueHigh,
    rawDiscountPct: rawDiscount.toFixed(2),
    acquisitionCost,
    sellingCost,
    netEdge,
    netEdgePct: netEdgePct.toFixed(2),
    confidence,
    liquidity: Math.round(liquidity),
    riskScore: Math.round(riskScore),
    sampleSize: cohort.sampleSize,
    action,
    rationale,
  };
}
