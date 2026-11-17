ALTER TABLE `refunds` ADD `watched_hours_at_request` real NOT NULL;--> statement-breakpoint
ALTER TABLE `refunds` ADD `days_since_purchase_at_request` integer NOT NULL;--> statement-breakpoint
ALTER TABLE `refunds` ADD `seats_claimed_at_request` integer NOT NULL;