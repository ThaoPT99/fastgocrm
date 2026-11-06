CREATE TABLE IF NOT EXISTS kpi_plans (
  owner TEXT NOT NULL REFERENCES members(email),
  quarter TEXT NOT NULL,
  version INTEGER NOT NULL,
  actual TEXT NOT NULL,
  sources TEXT NOT NULL,
  PRIMARY KEY (owner, quarter)
);
