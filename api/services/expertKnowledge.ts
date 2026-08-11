/**
 * Expert knowledge base — where the GM's tribal knowledge gets codified.
 *
 * Design intent: the quantitative forecast (forecast.ts) stays pure math on
 * dated transactions. Human judgment enters ONLY through this file, as
 * explicit, attributed, reviewable rules. Every rule carries the reasoning in
 * the author's own words, so the desk accumulates an auditable record of *why*
 * the numbers were nudged — the thing that separates a trader's read from an
 * average dealer's.
 *
 * Storage seam: rules live in version control today (reviewable diffs, no DB
 * migration risk while production DB mode flaps). When the GM gets an entry
 * UI, this array becomes a Drizzle table and the matcher below is unchanged.
 *
 * Rule lifecycle: draft → active → retired. Draft rules are inert (shown
 * nowhere, affect nothing) — they exist so the format is self-documenting and
 * new knowledge can be staged before it goes live. reviewAfter dates force
 * re-validation, because tribal knowledge decays as markets move.
 */

export type ExpertSignal =
  /** Gated/manual cars command a premium the aggregate data understates. */
  | "manual_premium"
  /** Production numbers low enough that supply shocks move the market. */
  | "limited_production"
  /** Successor announced/released — current gen typically softens first, then bifurcates. */
  | "replacement_cycle"
  /** Market thin enough that a few buyers (or one collector) can paint the tape. */
  | "thin_tape"
  /** Cars frequently modified — auction comps understate clean, stock examples. */
  | "modified_heavy_pool"
  /** Mileage sensitivity extreme for this variant (delivery-mile premium). */
  | "mileage_sensitive"
  /** Registry/collector base organized enough to set floors (e.g. PCA-grade cars). */
  | "collector_floor";

export type ExpertRuleEffect =
  /** Shift the estimated drift rate. annualizedBps: +200 = +2.0%/yr. Capped at ±1000 by the overlay. */
  | { kind: "drift_adjust"; annualizedBps: number }
  /** Distrust the data for this variant — cap the confidence score (0–98). */
  | { kind: "confidence_cap"; maxScore: number }
  /** Structured flag shown in the UI; no numeric effect. */
  | { kind: "signal"; signal: ExpertSignal }
  /** Free-text desk note shown with the forecast. */
  | { kind: "note" };

export type ExpertRule = {
  id: string;
  author: string;
  createdAt: string; // ISO date
  status: "draft" | "active" | "retired";
  /** Scope — all provided fields must match (case-insensitive). Empty match = applies to everything (use sparingly). */
  match: {
    make?: string;
    modelFamily?: string;
    /** Substring match against the variant name, e.g. "GT3" catches "911 GT3" and "GT3 Touring". */
    variantIncludes?: string;
    generation?: string;
  };
  effect: ExpertRuleEffect;
  /** The knowledge itself, in the author's words. This is the asset. */
  rationale: string;
  /** ISO date — rule should be re-validated against fresh data after this. */
  reviewAfter?: string;
};

/**
 * THE KNOWLEDGE BASE.
 *
 * Worked example of the format (draft — inert). When the GM says something
 * like "don't trust BaT medians on mod-heavy cars, clean stock examples bring
 * 10% more", it becomes two rules: a confidence_cap (or drift_adjust) with
 * that rationale, plus a modified_heavy_pool signal.
 */
export const EXPERT_RULES: ExpertRule[] = [
  {
    id: "ex-0001",
    author: "GM (example)",
    createdAt: "2026-08-09",
    status: "draft",
    match: { make: "Porsche", variantIncludes: "GT3" },
    effect: { kind: "signal", signal: "manual_premium" },
    rationale:
      "Example rule: Touring/manual GT cars pull a premium over PDK that blended auction medians hide. Price them off the manual comps only.",
    reviewAfter: "2026-11-09",
  },
];

function matches(rule: ExpertRule, model: { make: string; modelFamily: string; variant: string; generation: string | null }): boolean {
  const norm = (value: string | null | undefined) => (value ?? "").toLowerCase();
  const { match } = rule;
  if (match.make && norm(match.make) !== norm(model.make)) return false;
  if (match.modelFamily && norm(match.modelFamily) !== norm(model.modelFamily)) return false;
  if (match.generation && norm(match.generation) !== norm(model.generation)) return false;
  if (match.variantIncludes && !norm(model.variant).includes(norm(match.variantIncludes))) return false;
  return true;
}

export type AppliedExpertRule = {
  id: string;
  author: string;
  effectLabel: string;
  rationale: string;
};

export type ExpertOverlay = {
  /** Log-space annual rate shift to apply to both short- and long-term drift (e.g. +0.02 ≈ +2%/yr). */
  driftLogAdjust: number;
  /** Lowest confidence cap across active rules, if any. */
  confidenceCap: number | null;
  signals: ExpertSignal[];
  notes: { author: string; createdAt: string; text: string }[];
  applied: AppliedExpertRule[];
};

const MAX_DRIFT_ADJUST_LOG = Math.log(1.1); // ±1000 bps ≈ ±10%/yr, hard cap per overlay pass

/** Collect the active rules for a variant and fold them into one overlay. Pure function — no I/O. */
export function resolveExpertOverlay(model: {
  make: string;
  modelFamily: string;
  variant: string;
  generation: string | null;
}): ExpertOverlay | null {
  const active = EXPERT_RULES.filter((rule) => rule.status === "active" && matches(rule, model));
  if (!active.length) return null;

  const overlay: ExpertOverlay = { driftLogAdjust: 0, confidenceCap: null, signals: [], notes: [], applied: [] };
  for (const rule of active) {
    switch (rule.effect.kind) {
      case "drift_adjust": {
        const logDelta = rule.effect.annualizedBps / 10_000; // small-rate log approximation, fine at these magnitudes
        overlay.driftLogAdjust += logDelta;
        overlay.applied.push({
          id: rule.id,
          author: rule.author,
          effectLabel: `drift ${rule.effect.annualizedBps >= 0 ? "+" : ""}${(rule.effect.annualizedBps / 100).toFixed(1)}%/yr`,
          rationale: rule.rationale,
        });
        break;
      }
      case "confidence_cap": {
        overlay.confidenceCap = Math.min(overlay.confidenceCap ?? 98, rule.effect.maxScore);
        overlay.applied.push({
          id: rule.id,
          author: rule.author,
          effectLabel: `confidence capped at ${rule.effect.maxScore}`,
          rationale: rule.rationale,
        });
        break;
      }
      case "signal": {
        if (!overlay.signals.includes(rule.effect.signal)) overlay.signals.push(rule.effect.signal);
        overlay.applied.push({ id: rule.id, author: rule.author, effectLabel: rule.effect.signal.replace(/_/g, " "), rationale: rule.rationale });
        break;
      }
      case "note": {
        overlay.notes.push({ author: rule.author, createdAt: rule.createdAt, text: rule.rationale });
        break;
      }
    }
  }
  overlay.driftLogAdjust = Math.max(-MAX_DRIFT_ADJUST_LOG, Math.min(MAX_DRIFT_ADJUST_LOG, overlay.driftLogAdjust));
  return overlay;
}
