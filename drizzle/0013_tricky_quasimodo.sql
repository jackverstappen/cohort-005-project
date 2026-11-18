ALTER TABLE `coupons` ADD `granted_to_user_id` integer REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `coupons` ADD `granted_at` text;