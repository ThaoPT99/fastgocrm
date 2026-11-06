CREATE TABLE admin_sessions (
  digest TEXT PRIMARY KEY NOT NULL,
  expires_at INTEGER NOT NULL,
  key_digest TEXT NOT NULL
);
