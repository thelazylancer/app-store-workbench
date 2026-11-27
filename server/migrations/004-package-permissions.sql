-- Analysis-derived iOS privacy permission keys (NS*UsageDescription) from the IPA.
-- JSONB array of uppercase plist keys; NULL = not analyzed, [] = analyzed with no permissions.
-- Kept on competitor_packages only: daily sync must not overwrite it, so it is
-- not part of upsertPackage or competitor_snapshots.
ALTER TABLE competitor_packages ADD COLUMN permissions JSONB;
