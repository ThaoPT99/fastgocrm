DROP INDEX `records_daily_log_idx`;--> statement-breakpoint
ALTER TABLE `records` ADD `performed_by` text;