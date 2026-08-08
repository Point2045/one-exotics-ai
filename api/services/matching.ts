import type { SupportedModel } from "@db/schema";
import type { NormalizedListing } from "../providers/types";

function normalize(value: string | undefined | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/²/g, "2")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function sameMake(listingMake: string, supportedMake: string) {
  const listing = normalize(listingMake);
  const supported = normalize(supportedMake);
  if (listing === supported) return true;
  if (supported === "mercedes benz") return listing.includes("mercedes");
  return listing.includes(supported) || supported.includes(listing);
}

function inYearRange(year: number | undefined, model: SupportedModel) {
  if (!year) return true;
  if (year < model.yearStart) return false;
  if (model.yearEnd && year > model.yearEnd) return false;
  return true;
}

function modelScope(listing: NormalizedListing, model: SupportedModel) {
  if (!sameMake(listing.make, model.make)) return false;
  if (model.modelFamily === "911") {
    return normalize(`${listing.model} ${listing.trim} ${listing.title}`).includes("911");
  }
  if (model.modelFamily === "G-Class") {
    const text = normalize(`${listing.model} ${listing.trim} ${listing.title}`);
    return text.includes("g class") || text.includes("g wagon") || /\bg (500|550|63|65)\b/.test(text);
  }
  return true;
}

export function matchSupportedModel(listing: NormalizedListing, models: SupportedModel[]) {
  const text = normalize(`${listing.title} ${listing.model} ${listing.trim}`);
  let best: { model: SupportedModel; score: number } | undefined;

  for (const model of models) {
    if (!modelScope(listing, model) || !inYearRange(listing.year, model)) continue;

    const variant = normalize(model.variant);
    let score = 0;
    if (variant && text.includes(variant)) score += 120 + variant.length;

    const terms = model.matchTerms
      .split(",")
      .map((term) => normalize(term))
      .filter(Boolean);
    for (const term of terms) {
      if (term.length >= 2 && text.includes(term)) score += Math.min(term.length, 18);
    }

    if (listing.year) score += 12;
    if (model.generation && text.includes(normalize(model.generation))) score += 12;

    if (!best || score > best.score) best = { model, score };
  }

  return best && best.score >= 18 ? best.model : undefined;
}

export function normalizedText(value: string | undefined | null) {
  return normalize(value);
}
