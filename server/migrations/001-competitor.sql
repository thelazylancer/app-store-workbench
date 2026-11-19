CREATE TABLE competitor_batches (
  target_date DATE PRIMARY KEY,
  sync_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  data_updated_at TIMESTAMPTZ NOT NULL,
  published_at TIMESTAMPTZ NOT NULL,
  range_complete BOOLEAN NOT NULL,
  stale BOOLEAN NOT NULL,
  status TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE competitor_packages (
  package_code TEXT PRIMARY KEY,

  target_date DATE NOT NULL,
  display_name TEXT NOT NULL,
  team TEXT NOT NULL,

  first_ad_date DATE NOT NULL,
  listing_date DATE,
  first_100_date DATE,
  offline_date DATE,

  category TEXT,
  minimum_os_version TEXT,
  app_version TEXT,

  lookup_status TEXT NOT NULL,
  enrich_status TEXT NOT NULL,
  asset_status TEXT NOT NULL,

  app_store_json JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_competitor_packages_first_ad_date
  ON competitor_packages (first_ad_date);

CREATE INDEX idx_competitor_packages_listing_date
  ON competitor_packages (listing_date);

CREATE INDEX idx_competitor_packages_target_date
  ON competitor_packages (target_date);

CREATE INDEX idx_competitor_packages_team
  ON competitor_packages (team);

CREATE TABLE competitor_country_hits (
  package_code TEXT NOT NULL
    REFERENCES competitor_packages (package_code),
  country TEXT NOT NULL,
  status TEXT NOT NULL,
  apple_id BIGINT,
  fetched_at TIMESTAMPTZ NOT NULL,

  PRIMARY KEY (package_code, country)
);

CREATE TABLE competitor_assets (
  package_code TEXT NOT NULL
    REFERENCES competitor_packages (package_code),
  type TEXT NOT NULL,
  source_url TEXT NOT NULL,
  local_path TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL,

  PRIMARY KEY (package_code, type, source_url)
);

CREATE TABLE competitor_versions (
  package_code TEXT NOT NULL
    REFERENCES competitor_packages (package_code),
  version TEXT NOT NULL,
  released_at TIMESTAMPTZ NOT NULL,
  notes TEXT,
  captured_at TIMESTAMPTZ NOT NULL,

  PRIMARY KEY (package_code, version, released_at)
);
