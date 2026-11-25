ALTER TABLE records ADD COLUMN partner_type TEXT CHECK (partner_type IS NULL OR partner_type IN ('student', 'collaborator', 'organization', 'teacher'));
--> statement-breakpoint
UPDATE records SET partner_type = 'organization' WHERE kind = 'partner';
