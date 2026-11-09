CREATE TABLE team_directory (
  name TEXT PRIMARY KEY NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);
--> statement-breakpoint
INSERT INTO team_directory (name)
SELECT team FROM members WHERE trim(team) <> ''
UNION
SELECT team FROM playbooks WHERE trim(team) <> '';
--> statement-breakpoint
CREATE TRIGGER members_require_active_team_on_insert
BEFORE INSERT ON members
WHEN NEW.team <> '' AND NOT EXISTS (
  SELECT 1 FROM team_directory WHERE name = NEW.team AND active = 1
)
BEGIN
  SELECT RAISE(ABORT, 'active_team_required');
END;
--> statement-breakpoint
CREATE TRIGGER members_require_active_team_on_update
BEFORE UPDATE OF team ON members
WHEN NEW.team <> OLD.team AND NEW.team <> '' AND NOT EXISTS (
  SELECT 1 FROM team_directory WHERE name = NEW.team AND active = 1
)
BEGIN
  SELECT RAISE(ABORT, 'active_team_required');
END;
--> statement-breakpoint
CREATE TRIGGER rename_team_references
AFTER UPDATE OF name ON team_directory
WHEN NEW.name <> OLD.name
BEGIN
  UPDATE members SET team = NEW.name WHERE team = OLD.name;
  UPDATE playbooks SET team = NEW.name WHERE team = OLD.name;
END;
--> statement-breakpoint
CREATE TRIGGER playbooks_require_known_team
BEFORE INSERT ON playbooks
WHEN NEW.team <> '' AND NOT EXISTS (
  SELECT 1 FROM team_directory WHERE name = NEW.team
)
BEGIN
  SELECT RAISE(ABORT, 'known_team_required');
END;
