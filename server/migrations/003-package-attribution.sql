-- Analysis-derived attribution vendor (adjust, appsflyer, ...); NULL = not analyzed.
-- Kept on competitor_packages only: daily sync must not overwrite it, so it is
-- not part of upsertPackage or competitor_snapshots.
ALTER TABLE competitor_packages ADD COLUMN attribution TEXT;
