CREATE TABLE support_requests (
  id TEXT PRIMARY KEY NOT NULL,
  center_id TEXT NOT NULL REFERENCES records(id),
  requested_by TEXT NOT NULL REFERENCES members(email),
  assigned_to TEXT NOT NULL REFERENCES members(email),
  problem TEXT NOT NULL,
  status TEXT NOT NULL,
  messages TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX support_center_idx ON support_requests(center_id);
--> statement-breakpoint
CREATE TABLE playbooks (
  team TEXT NOT NULL,
  key TEXT NOT NULL,
  draft TEXT NOT NULL,
  published TEXT,
  approved_at TEXT,
  approved_by TEXT REFERENCES members(email),
  version INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY(team, key)
);
