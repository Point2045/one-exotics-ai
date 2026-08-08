import { relations } from "drizzle-orm";
import { listingPriceHistory, listings, modelMarketStats, supportedModels, valuationRuns } from "./schema";

export const supportedModelsRelations = relations(supportedModels, ({ many }) => ({
  listings: many(listings),
  marketStats: many(modelMarketStats),
}));

export const listingsRelations = relations(listings, ({ one, many }) => ({
  supportedModel: one(supportedModels, {
    fields: [listings.modelId],
    references: [supportedModels.id],
  }),
  priceHistory: many(listingPriceHistory),
  valuations: many(valuationRuns),
}));

export const listingPriceHistoryRelations = relations(listingPriceHistory, ({ one }) => ({
  listing: one(listings, {
    fields: [listingPriceHistory.listingId],
    references: [listings.id],
  }),
}));

export const modelMarketStatsRelations = relations(modelMarketStats, ({ one }) => ({
  supportedModel: one(supportedModels, {
    fields: [modelMarketStats.modelId],
    references: [supportedModels.id],
  }),
}));

export const valuationRunsRelations = relations(valuationRuns, ({ one }) => ({
  listing: one(listings, {
    fields: [valuationRuns.listingId],
    references: [listings.id],
  }),
}));
