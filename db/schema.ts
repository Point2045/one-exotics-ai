import {
  bigint,
  boolean,
  decimal,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const supportedModels = mysqlTable(
  "supported_models",
  {
    id: serial("id").primaryKey(),
    make: varchar("make", { length: 80 }).notNull(),
    modelFamily: varchar("modelFamily", { length: 120 }).notNull(),
    variant: varchar("variant", { length: 180 }).notNull(),
    generation: varchar("generation", { length: 80 }),
    yearStart: int("yearStart").notNull(),
    yearEnd: int("yearEnd"),
    bodyStyle: varchar("bodyStyle", { length: 80 }),
    transmission: varchar("transmission", { length: 80 }),
    searchMake: varchar("searchMake", { length: 80 }).notNull(),
    searchModel: varchar("searchModel", { length: 160 }),
    matchTerms: text("matchTerms").notNull(),
    sortOrder: int("sortOrder").notNull().default(0),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    makeIdx: index("supported_models_make_idx").on(table.make),
    familyIdx: index("supported_models_family_idx").on(table.modelFamily),
    variantIdx: index("supported_models_variant_idx").on(table.variant),
  }),
);

export const listings = mysqlTable(
  "listings",
  {
    id: serial("id").primaryKey(),
    source: varchar("source", { length: 40 }).notNull(),
    externalId: varchar("externalId", { length: 160 }).notNull(),
    modelId: bigint("modelId", { mode: "number", unsigned: true }).references(() => supportedModels.id, { onDelete: "set null" }),
    vin: varchar("vin", { length: 17 }),
    year: int("year"),
    make: varchar("make", { length: 80 }).notNull(),
    model: varchar("model", { length: 140 }).notNull(),
    trim: varchar("trim", { length: 180 }),
    title: varchar("title", { length: 255 }).notNull(),
    price: int("price"),
    mileage: int("mileage"),
    exteriorColor: varchar("exteriorColor", { length: 80 }),
    interiorColor: varchar("interiorColor", { length: 80 }),
    transmission: varchar("transmission", { length: 100 }),
    drivetrain: varchar("drivetrain", { length: 80 }),
    bodyStyle: varchar("bodyStyle", { length: 80 }),
    sellerName: varchar("sellerName", { length: 180 }),
    sellerType: varchar("sellerType", { length: 60 }),
    city: varchar("city", { length: 100 }),
    state: varchar("state", { length: 40 }),
    postalCode: varchar("postalCode", { length: 20 }),
    url: text("url"),
    imageUrl: text("imageUrl"),
    description: text("description"),
    listedAt: timestamp("listedAt"),
    cpo: boolean("cpo"),
    photoCount: int("photoCount"),
    carfaxUrl: text("carfaxUrl"),
    accidentCount: int("accidentCount"),
    ownerCount: int("ownerCount"),
    usageType: varchar("usageType", { length: 60 }),
    status: mysqlEnum("status", ["active", "expired", "sold", "unknown"]).notNull().default("active"),
    firstSeenAt: timestamp("firstSeenAt").notNull().defaultNow(),
    lastSeenAt: timestamp("lastSeenAt").notNull().defaultNow(),
    removedAt: timestamp("removedAt"),
    raw: json("raw"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    sourceExternalUnique: uniqueIndex("listings_source_external_unique").on(table.source, table.externalId),
    vinIdx: index("listings_vin_idx").on(table.vin),
    makeModelIdx: index("listings_make_model_idx").on(table.make, table.model),
    statusIdx: index("listings_status_idx").on(table.status),
    modelIdx: index("listings_model_idx").on(table.modelId),
  }),
);

export const listingPriceHistory = mysqlTable(
  "listing_price_history",
  {
    id: serial("id").primaryKey(),
    listingId: bigint("listingId", { mode: "number", unsigned: true }).notNull().references(() => listings.id, { onDelete: "cascade" }),
    price: int("price"),
    mileage: int("mileage"),
    observedAt: timestamp("observedAt").notNull().defaultNow(),
  },
  (table) => ({
    listingObservedIdx: index("price_history_listing_observed_idx").on(table.listingId, table.observedAt),
  }),
);

export const modelMarketStats = mysqlTable(
  "model_market_stats",
  {
    id: serial("id").primaryKey(),
    modelId: bigint("modelId", { mode: "number", unsigned: true }).notNull().references(() => supportedModels.id, { onDelete: "cascade" }),
    medianPrice: int("medianPrice"),
    p25Price: int("p25Price"),
    p75Price: int("p75Price"),
    medianMileage: int("medianMileage"),
    sampleSize: int("sampleSize").notNull().default(0),
    computedAt: timestamp("computedAt").notNull().defaultNow(),
  },
  (table) => ({
    modelComputedIdx: index("model_stats_model_computed_idx").on(table.modelId, table.computedAt),
  }),
);

export const valuationRuns = mysqlTable(
  "valuation_runs",
  {
    id: serial("id").primaryKey(),
    listingId: bigint("listingId", { mode: "number", unsigned: true }).notNull().references(() => listings.id, { onDelete: "cascade" }),
    fairValueLow: int("fairValueLow"),
    fairValuePoint: int("fairValuePoint"),
    fairValueHigh: int("fairValueHigh"),
    rawDiscountPct: decimal("rawDiscountPct", { precision: 7, scale: 2 }),
    acquisitionCost: int("acquisitionCost"),
    sellingCost: int("sellingCost"),
    netEdge: int("netEdge"),
    netEdgePct: decimal("netEdgePct", { precision: 7, scale: 2 }),
    confidence: int("confidence"),
    liquidity: int("liquidity"),
    riskScore: int("riskScore"),
    sampleSize: int("sampleSize").notNull().default(0),
    action: mysqlEnum("action", ["pursue", "inspect", "negotiate", "pass"]).notNull(),
    rationale: text("rationale").notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    listingCreatedIdx: index("valuation_runs_listing_created_idx").on(table.listingId, table.createdAt),
    actionIdx: index("valuation_runs_action_idx").on(table.action),
  }),
);

export const ingestionRuns = mysqlTable(
  "ingestion_runs",
  {
    id: serial("id").primaryKey(),
    provider: varchar("provider", { length: 40 }).notNull(),
    status: mysqlEnum("status", ["running", "completed", "skipped", "failed"]).notNull(),
    listingsFound: int("listingsFound").notNull().default(0),
    listingsUpserted: int("listingsUpserted").notNull().default(0),
    valuationsCreated: int("valuationsCreated").notNull().default(0),
    error: text("error"),
    startedAt: timestamp("startedAt").notNull().defaultNow(),
    finishedAt: timestamp("finishedAt"),
  },
  (table) => ({
    providerStartedIdx: index("ingestion_runs_provider_started_idx").on(table.provider, table.startedAt),
  }),
);

export type SupportedModel = typeof supportedModels.$inferSelect;
export type InsertSupportedModel = typeof supportedModels.$inferInsert;
export type Listing = typeof listings.$inferSelect;
export type InsertListing = typeof listings.$inferInsert;
export type ListingPriceHistory = typeof listingPriceHistory.$inferSelect;
export type ModelMarketStat = typeof modelMarketStats.$inferSelect;
export type ValuationRun = typeof valuationRuns.$inferSelect;
export type IngestionRun = typeof ingestionRuns.$inferSelect;
