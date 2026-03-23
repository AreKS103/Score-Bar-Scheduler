-- Add embed_target column to scheduled_publishes so that scheduled/cron
-- publishes land in the correct per-embed slot instead of always NULL.
ALTER TABLE scheduled_publishes
  ADD COLUMN IF NOT EXISTS embed_target TEXT DEFAULT NULL;
