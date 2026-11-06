ALTER TABLE `records` ADD `partner_id` text REFERENCES records(id);--> statement-breakpoint
CREATE INDEX `records_partner_idx` ON `records` (`partner_id`);--> statement-breakpoint
CREATE TRIGGER records_partner_insert_guard
BEFORE INSERT ON records
WHEN NEW.partner_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM records AS center
  WHERE center.id = NEW.partner_id AND center.kind = 'partner' AND center.owner = NEW.owner
)
BEGIN
  SELECT RAISE(ABORT, 'invalid center link');
END;
--> statement-breakpoint
CREATE TRIGGER records_partner_update_guard
BEFORE UPDATE OF partner_id, owner ON records
WHEN NEW.partner_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM records AS center
  WHERE center.id = NEW.partner_id AND center.kind = 'partner' AND center.owner = NEW.owner
)
BEGIN
  SELECT RAISE(ABORT, 'invalid center link');
END;
--> statement-breakpoint
CREATE TRIGGER records_partner_owner_guard
BEFORE UPDATE OF owner ON records
WHEN OLD.kind = 'partner' AND NEW.owner <> OLD.owner AND EXISTS (
  SELECT 1 FROM records AS child WHERE child.partner_id = OLD.id
)
BEGIN
  SELECT RAISE(ABORT, 'center still has linked records');
END;
