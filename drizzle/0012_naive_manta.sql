CREATE TABLE `notifications_sent` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`subscriber_id` text NOT NULL,
	`category` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`sent_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_sent_subscriber_category_key_unique` ON `notifications_sent` (`subscriber_id`,`category`,`idempotency_key`);