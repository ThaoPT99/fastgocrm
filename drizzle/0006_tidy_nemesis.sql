CREATE TABLE `access_codes` (
	`email` text PRIMARY KEY NOT NULL,
	`digest` text NOT NULL,
	FOREIGN KEY (`email`) REFERENCES `members`(`email`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `access_codes_digest_unique` ON `access_codes` (`digest`);--> statement-breakpoint
CREATE TABLE `access_sessions` (
	`digest` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`code_digest` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`email`) REFERENCES `access_codes`(`email`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `access_sessions_email_idx` ON `access_sessions` (`email`);--> statement-breakpoint
CREATE INDEX `access_sessions_expiry_idx` ON `access_sessions` (`expires_at`);