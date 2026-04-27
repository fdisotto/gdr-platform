ALTER TABLE `messages` ADD `thread_id` text;--> statement-breakpoint
CREATE INDEX `messages_thread_time_idx` ON `messages` (`party_seed`,`thread_id`,`created_at`);