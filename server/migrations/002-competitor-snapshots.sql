CREATE TABLE competitor_snapshots (
  package_code TEXT NOT NULL,
  target_date DATE NOT NULL,
  team TEXT NOT NULL,
  lookup_status TEXT NOT NULL,
  enrich_status TEXT NOT NULL,
  asset_status TEXT NOT NULL,
  category TEXT,
  minimum_os_version TEXT,
  app_version TEXT,
  app_store_json JSONB,
  fetched_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (package_code, target_date)
);
