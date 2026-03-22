-- 010_embed_target.sql
-- Adds embed_target to published_schedules so a publish can be directed to
-- a specific WordPress embed instance (matched by its Element ID), or to all
-- instances when NULL (the default / backward-compatible behaviour).
--
-- Logic in the embed iframe:
--   1. If the iframe has a custom embedId, look for a published row where
--      embed_target = embedId  (most-recent wins).
--   2. If none found, fall back to the most-recent row with embed_target IS NULL
--      (the "show everywhere" global schedule).
--   3. Embeds with no custom ID skip step 1 and only load global schedules.

ALTER TABLE published_schedules
  ADD COLUMN IF NOT EXISTS embed_target text DEFAULT NULL;

-- Index speeds up both the targeted and the global fall-back queries.
CREATE INDEX IF NOT EXISTS published_schedules_embed_target_idx
  ON published_schedules (user_id, embed_target, published_at DESC);
