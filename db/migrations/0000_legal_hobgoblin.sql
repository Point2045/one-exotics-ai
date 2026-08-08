CREATE TABLE `ingestion_runs` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`provider` varchar(40) NOT NULL,
	`status` enum('running','completed','skipped','failed') NOT NULL,
	`listingsFound` int NOT NULL DEFAULT 0,
	`listingsUpserted` int NOT NULL DEFAULT 0,
	`valuationsCreated` int NOT NULL DEFAULT 0,
	`error` text,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`finishedAt` timestamp,
	CONSTRAINT `ingestion_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `listing_price_history` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`listingId` bigint unsigned NOT NULL,
	`price` int,
	`mileage` int,
	`observedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `listing_price_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `listings` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`source` varchar(40) NOT NULL,
	`externalId` varchar(160) NOT NULL,
	`modelId` bigint unsigned,
	`vin` varchar(17),
	`year` int,
	`make` varchar(80) NOT NULL,
	`model` varchar(140) NOT NULL,
	`trim` varchar(180),
	`title` varchar(255) NOT NULL,
	`price` int,
	`mileage` int,
	`exteriorColor` varchar(80),
	`interiorColor` varchar(80),
	`transmission` varchar(100),
	`drivetrain` varchar(80),
	`bodyStyle` varchar(80),
	`sellerName` varchar(180),
	`sellerType` varchar(60),
	`city` varchar(100),
	`state` varchar(40),
	`postalCode` varchar(20),
	`url` text,
	`imageUrl` text,
	`description` text,
	`status` enum('active','expired','sold','unknown') NOT NULL DEFAULT 'active',
	`firstSeenAt` timestamp NOT NULL DEFAULT (now()),
	`lastSeenAt` timestamp NOT NULL DEFAULT (now()),
	`removedAt` timestamp,
	`raw` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `listings_id` PRIMARY KEY(`id`),
	CONSTRAINT `listings_source_external_unique` UNIQUE(`source`,`externalId`)
);
--> statement-breakpoint
CREATE TABLE `model_market_stats` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`modelId` bigint unsigned NOT NULL,
	`medianPrice` int,
	`p25Price` int,
	`p75Price` int,
	`medianMileage` int,
	`sampleSize` int NOT NULL DEFAULT 0,
	`computedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `model_market_stats_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `supported_models` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`make` varchar(80) NOT NULL,
	`modelFamily` varchar(120) NOT NULL,
	`variant` varchar(180) NOT NULL,
	`generation` varchar(80),
	`yearStart` int NOT NULL,
	`yearEnd` int,
	`bodyStyle` varchar(80),
	`transmission` varchar(80),
	`searchMake` varchar(80) NOT NULL,
	`searchModel` varchar(160),
	`matchTerms` text NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `supported_models_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `valuation_runs` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`listingId` bigint unsigned NOT NULL,
	`fairValueLow` int,
	`fairValuePoint` int,
	`fairValueHigh` int,
	`rawDiscountPct` decimal(7,2),
	`acquisitionCost` int,
	`sellingCost` int,
	`netEdge` int,
	`netEdgePct` decimal(7,2),
	`confidence` int,
	`liquidity` int,
	`riskScore` int,
	`sampleSize` int NOT NULL DEFAULT 0,
	`action` enum('pursue','inspect','negotiate','pass') NOT NULL,
	`rationale` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `valuation_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `listing_price_history` ADD CONSTRAINT `listing_price_history_listingId_listings_id_fk` FOREIGN KEY (`listingId`) REFERENCES `listings`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `listings` ADD CONSTRAINT `listings_modelId_supported_models_id_fk` FOREIGN KEY (`modelId`) REFERENCES `supported_models`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `model_market_stats` ADD CONSTRAINT `model_market_stats_modelId_supported_models_id_fk` FOREIGN KEY (`modelId`) REFERENCES `supported_models`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `valuation_runs` ADD CONSTRAINT `valuation_runs_listingId_listings_id_fk` FOREIGN KEY (`listingId`) REFERENCES `listings`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `ingestion_runs_provider_started_idx` ON `ingestion_runs` (`provider`,`startedAt`);--> statement-breakpoint
CREATE INDEX `price_history_listing_observed_idx` ON `listing_price_history` (`listingId`,`observedAt`);--> statement-breakpoint
CREATE INDEX `listings_vin_idx` ON `listings` (`vin`);--> statement-breakpoint
CREATE INDEX `listings_make_model_idx` ON `listings` (`make`,`model`);--> statement-breakpoint
CREATE INDEX `listings_status_idx` ON `listings` (`status`);--> statement-breakpoint
CREATE INDEX `listings_model_idx` ON `listings` (`modelId`);--> statement-breakpoint
CREATE INDEX `model_stats_model_computed_idx` ON `model_market_stats` (`modelId`,`computedAt`);--> statement-breakpoint
CREATE INDEX `supported_models_make_idx` ON `supported_models` (`make`);--> statement-breakpoint
CREATE INDEX `supported_models_family_idx` ON `supported_models` (`modelFamily`);--> statement-breakpoint
CREATE INDEX `supported_models_variant_idx` ON `supported_models` (`variant`);--> statement-breakpoint
CREATE INDEX `valuation_runs_listing_created_idx` ON `valuation_runs` (`listingId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `valuation_runs_action_idx` ON `valuation_runs` (`action`);