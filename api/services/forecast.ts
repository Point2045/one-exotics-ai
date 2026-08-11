import { fetchBatSalesHistory } from "../providers/batComps";
import { resolveExpertOverlay, type AppliedExpertRule, type ExpertSignal } from "./expertKnowledge";
import { getStore } from "./store";

/**
 * Variant price history + projection from dated Bring a Trailer transactions.
 *
 * Method (deliberately transparent, no black box):
 *  - Quarterly medians of sold prices smooth single-auction noise.
 *  - Multi-window log-linear regression: we fit ln(price) on time over trailing
 *    6mo / 1yr / 3yr / all-time windows. Exotic values compound multiplicatively,
 *    so slopes are instantaneous compounding rates. A trend call requires the
 *    windows to AGREE in sign — one hot quarter can't fake appreciation.
 *  - Mean-reversion damping: projections blend the short-term rate toward the
 *    long-term rate with horizon (rate(h) = long + (short − long)·e^(−h/τ),
 *    τ ≈ 18 months). Momentum matters near-term; over 3–5 years the car reverts
 *    to its long-run compounding rate. Closed form:
 *      P(h) = P₀ · exp(long·h + (short − long)·τ·(1 − e^(−h/τ)))
 *  - Scenarios at 6/12/36/60 months: base = damped path; bear/bull = ±σ(h) in
 *    log space, where σ(h) widens with the square root of the horizon.
 *  - Confidence score 0–98 from six evidence factors (sample, span, window
 *    agreement, residual tightness, recency, sold-share). Tiers: solid ≥ 70,
 *    indicative ≥ 40, thin below — thin shows history only, no projection.
 *  - Expert overlay (expertKnowledge.ts): codified GM knowledge can shift the
 *    drift rate (capped ±10%/yr), cap confidence, and attach signals/notes.
 *    Every adjustment is listed with author and rationale — auditable, never
 *    silent.
 */

const DAY_MS = 86_400_000;
/** Mean-reversion time constant: ~18 months. */
const TAU_DAYS = 540;
/** Clamp annual log-drift to ±0.28 (≈ +32% / −24%/yr) — thin markets produce wild slopes. */
const MAX_ANNUAL_LOG_RATE = 0.28;

const WINDOWS = [
  { label: "6mo", days: 182 },
  { label: "1yr", days: 365 },
  { label: "3yr", days: 1095 },
  { label: "all", days: Number.POSITIVE_INFINITY },
] as const;

function medianOf(values: number[]): number | null {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted[Math.floor((sorted.length - 1) * 0.5)];
}

function clamp(value: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, value));
}

type Fit = { slope: number; intercept: number; residualStd: number; count: number };

/** Log-linear OLS on dated sales. t is measured in days from the window's first sale. */
function fitLogLinear(points: { ts: number; price: number }[]): Fit | null {
  const n = points.length;
  if (n < 4) return null;
  const t0 = points[0].ts;
  const xs = points.map((point) => (point.ts - t0) / DAY_MS);
  const ys = points.map((point) => Math.log(point.price));
  const xBar = xs.reduce((sum, x) => sum + x, 0) / n;
  const yBar = ys.reduce((sum, y) => sum + y, 0) / n;
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < n; index += 1) {
    numerator += (xs[index] - xBar) * (ys[index] - yBar);
    denominator += (xs[index] - xBar) ** 2;
  }
  if (denominator <= 0) return null;
  const slope = numerator / denominator;
  const intercept = yBar - slope * xBar;
  const residualStd = Math.sqrt(ys.reduce((sum, y, index) => sum + (y - (intercept + slope * xs[index])) ** 2, 0) / n);
  return { slope, intercept, residualStd, count: n };
}

const annualizedPctOf = (slope: number) => Math.round((Math.exp(clamp(slope * 365, -MAX_ANNUAL_LOG_RATE, MAX_ANNUAL_LOG_RATE)) - 1) * 1000) / 10;

export async function buildVariantForecast(modelId: number) {
  const store = await getStore();
  const model = await store.findSupportedModelById(modelId);
  if (!model) throw new Error("Unknown model");

  const history = await fetchBatSalesHistory(model.make, model.modelFamily, {
    searchModel: model.searchModel,
    variant: model.variant,
    maxPages: 4,
  });
  if (!history.configured) return { configured: false as const };
  if (!history.matched) {
    return { configured: true as const, matched: false as const, baTModel: history.baTModel ?? null, error: history.error ?? "No dated sales" };
  }

  const usable = history.sales.filter((sale) => sale.price > 10_000);
  const sold = usable.filter((sale) => sale.result === "sold");
  const n = sold.length;
  const spanDays = n >= 2 ? (sold[n - 1].ts - sold[0].ts) / DAY_MS : 0;
  const lastSaleTs = sold[n - 1]?.ts ?? 0;

  // Quarterly medians (chart line)
  const buckets = new Map<string, { prices: number[]; tsSum: number }>();
  for (const sale of sold) {
    const date = new Date(sale.ts);
    const key = `${date.getUTCFullYear()}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
    const bucket = buckets.get(key) ?? { prices: [], tsSum: 0 };
    bucket.prices.push(sale.price);
    bucket.tsSum += sale.ts;
    buckets.set(key, bucket);
  }
  const quarterly = [...buckets.entries()]
    .map(([quarter, bucket]) => ({
      quarter,
      median: medianOf(bucket.prices)!,
      count: bucket.prices.length,
      ts: Math.round(bucket.tsSum / bucket.prices.length),
    }))
    .sort((a, b) => a.quarter.localeCompare(b.quarter));

  // ---- Multi-window fits -------------------------------------------------
  const windowFits = WINDOWS.map((window) => {
    const points = window.days === Number.POSITIVE_INFINITY ? sold : sold.filter((sale) => sale.ts >= lastSaleTs - window.days * DAY_MS);
    const fit = fitLogLinear(points);
    return {
      label: window.label,
      days: window.days === Number.POSITIVE_INFINITY ? null : window.days,
      count: points.length,
      annualizedPct: fit ? annualizedPctOf(fit.slope) : null,
      fit,
    };
  });
  const fitted = windowFits.filter((window) => window.fit !== null);
  const allTime = windowFits[windowFits.length - 1];

  // Window agreement: of the windows that could be fitted, how many share the
  // all-time slope's sign? Requires ≥2 fitted windows to mean anything.
  let agreement: { agreeing: number; total: number } | null = null;
  if (allTime.fit && fitted.length >= 2) {
    const referenceSign = Math.sign(allTime.fit.slope);
    const agreeing = fitted.filter((window) => Math.abs(window.fit!.slope) < 1e-6 || Math.sign(window.fit!.slope) === referenceSign).length;
    agreement = { agreeing, total: fitted.length };
  }

  // ---- Confidence score (0–98) from six evidence factors -----------------
  const residualStdAll = allTime.fit?.residualStd ?? 0.6;
  const daysSinceLastSale = lastSaleTs ? (Date.now() - lastSaleTs) / DAY_MS : Number.POSITIVE_INFINITY;
  const soldShare = usable.length ? n / usable.length : 0;
  let confidenceScore = 0;
  confidenceScore += Math.min(30, Math.round(30 * Math.min(1, n / 60))); // sample size
  confidenceScore += Math.min(20, Math.round(20 * Math.min(1, spanDays / 1825))); // span (5yr = max)
  if (agreement) confidenceScore += Math.round((20 * agreement.agreeing) / agreement.total); // window agreement
  confidenceScore += Math.round(15 * clamp((0.6 - residualStdAll) / 0.45, 0, 1)); // residual tightness
  confidenceScore += daysSinceLastSale <= 45 ? 8 : daysSinceLastSale <= 120 ? 5 : daysSinceLastSale <= 240 ? 2 : 0; // recency
  confidenceScore += Math.round(5 * clamp((soldShare - 0.4) / 0.4, 0, 1)); // sold-share vs bid-to

  // ---- Expert overlay: codified GM knowledge ------------------------------
  const overlay = resolveExpertOverlay(model);
  if (overlay?.confidenceCap != null) confidenceScore = Math.min(confidenceScore, overlay.confidenceCap);
  confidenceScore = Math.min(98, confidenceScore);

  const confidence: "solid" | "indicative" | "thin" = confidenceScore >= 70 ? "solid" : confidenceScore >= 40 ? "indicative" : "thin";

  // ---- Mean-reversion damped projection -----------------------------------
  let regression: {
    annualizedPct: number; // effective compounding rate over the next 12 months (damped)
    shortTermPct: number;
    longTermPct: number;
    trendLine: { ts: number; price: number }[];
    projectionCurve: { ts: number; price: number }[];
    projection: { monthsAhead: number; ts: number; base: number; bear: number; bull: number }[];
  } | null = null;

  if (confidence !== "thin" && allTime.fit && n >= 12 && spanDays >= 270) {
    // Short-term rate: count-weighted blend of the 6mo and 1yr windows (recent
    // momentum only), falling back to 3yr, then all-time. Every slope is clamped
    // to the same annual log-rate cap BEFORE blending, so the blend can never
    // exceed what we display per window. Long-term rate: all-time slope.
    const annualLogRateOf = (fit: NonNullable<Fit>) => clamp(fit.slope * 365, -MAX_ANNUAL_LOG_RATE, MAX_ANNUAL_LOG_RATE);
    const longRaw = annualLogRateOf(allTime.fit);
    const nearWindows = [windowFits[0], windowFits[1]].filter((window) => window.fit !== null);
    const shortRaw =
      nearWindows.length > 0
        ? nearWindows.reduce((sum, window) => sum + annualLogRateOf(window.fit!) * window.fit!.count, 0) /
          nearWindows.reduce((sum, window) => sum + window.fit!.count, 0)
        : windowFits[2].fit
          ? annualLogRateOf(windowFits[2].fit)
          : longRaw;
    const driftAdjust = overlay?.driftLogAdjust ?? 0; // expert nudge applies to both rates, in annual log space
    const shortRate = clamp(shortRaw + driftAdjust, -MAX_ANNUAL_LOG_RATE, MAX_ANNUAL_LOG_RATE);
    const longRate = clamp(longRaw + driftAdjust, -MAX_ANNUAL_LOG_RATE, MAX_ANNUAL_LOG_RATE);

    const t0 = sold[0].ts;
    const tNowDays = (Date.now() - t0) / DAY_MS;
    const anchor = Math.exp(allTime.fit.intercept + allTime.fit.slope * tNowDays); // trendline value today

    // Cumulative log-growth over h days under the damped rate.
    const cumLog = (hDays: number) => longRate * (hDays / 365) + (shortRate - longRate) * (TAU_DAYS / 365) * (1 - Math.exp(-hDays / TAU_DAYS));
    const project = (hDays: number) => anchor * Math.exp(cumLog(hDays));
    const sigma = (hDays: number) => allTime.fit!.residualStd * Math.sqrt(hDays / 365);

    const projectionCurve = Array.from({ length: 37 }, (_, month) => {
      const hDays = month * 30.4;
      return { ts: Math.round(Date.now() + hDays * DAY_MS), price: Math.round(project(hDays)) };
    });

    regression = {
      annualizedPct: Math.round((Math.exp(cumLog(365)) - 1) * 1000) / 10,
      shortTermPct: Math.round((Math.exp(shortRate) - 1) * 1000) / 10,
      longTermPct: Math.round((Math.exp(longRate) - 1) * 1000) / 10,
      trendLine: [
        { ts: t0, price: Math.round(Math.exp(allTime.fit.intercept)) },
        { ts: Math.round(Date.now()), price: Math.round(anchor) },
      ],
      projectionCurve,
      projection: [182, 365, 1095, 1825].map((daysAhead) => {
        const base = project(daysAhead);
        const band = sigma(daysAhead);
        return {
          monthsAhead: Math.round(daysAhead / 30.4),
          ts: Math.round(Date.now() + daysAhead * DAY_MS),
          base: Math.round(base),
          bear: Math.round(base * Math.exp(-band)),
          bull: Math.round(base * Math.exp(+band)),
        };
      }),
    };
  }

  return {
    configured: true as const,
    matched: true as const,
    baTModel: history.baTModel ?? null,
    saleCount: n,
    bidToCount: usable.length - n,
    spanStart: sold[0]?.date ?? null,
    spanEnd: sold[n - 1]?.date ?? null,
    allTimeMedian: medianOf(sold.map((sale) => sale.price)),
    quarterly,
    windows: windowFits.map((window) => ({ label: window.label, count: window.count, annualizedPct: window.annualizedPct })),
    windowAgreement: agreement,
    regression,
    confidence,
    confidenceScore,
    expert: overlay
      ? {
          applied: overlay.applied as AppliedExpertRule[],
          signals: overlay.signals as ExpertSignal[],
          notes: overlay.notes,
        }
      : null,
    pagesFetched: history.pagesFetched,
    source: "Bring a Trailer via parse.bot",
    points: usable.map((sale) => ({ ts: sale.ts, price: sale.price, result: sale.result })),
  };
}
