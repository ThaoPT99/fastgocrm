ALTER TABLE records ADD COLUMN next_owner TEXT;
--> statement-breakpoint
ALTER TABLE records ADD COLUMN next_party TEXT;
--> statement-breakpoint
UPDATE records SET next_owner = 'self' WHERE followup_date IS NOT NULL;
