ALTER TABLE `listings` ADD `listedAt` timestamp;--> statement-breakpoint
ALTER TABLE `listings` ADD `cpo` boolean;--> statement-breakpoint
ALTER TABLE `listings` ADD `photoCount` int;--> statement-breakpoint
ALTER TABLE `listings` ADD `carfaxUrl` text;--> statement-breakpoint
ALTER TABLE `listings` ADD `accidentCount` int;--> statement-breakpoint
ALTER TABLE `listings` ADD `ownerCount` int;--> statement-breakpoint
ALTER TABLE `listings` ADD `usageType` varchar(60);