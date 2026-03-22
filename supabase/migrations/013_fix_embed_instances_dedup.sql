-- 013_fix_embed_instances_dedup.sql
--
-- ROOT CAUSE: Postgres UNIQUE (user_id, embed_id) does not treat two NULL
-- values as equal. Before this fix every beacon call from an unnamed embed
-- (embed_id IS NULL) caused a brand-new INSERT instead of an UPDATE, causing
-- rows to accumulate ("stacking") indefinitely.
--
-- This migration:
--   1. Removes stale rows not seen in 7+ days (anything forgotten to clean up).
--   2. Deduplicates existing NULL-embed_id rows — keeps only the most-recently
--      seen row per user (that row's last_seen is updated to now() for safety).
--   3. Adds a partial unique index that enforces "one null-embed_id row per user"
--      at the database level, preventing a recurrence even if the app code is
--      ever bypassed.
--
-- The application code (POST /api/embed-instances) has been updated to do an
-- explicit UPDATE-or-INSERT for the null case so the index is never violated.

-- Step 1: purge anything older than 7 days
DELETE FROM embed_instances
WHERE last_seen < now() - INTERVAL '7 days';

-- Step 2: deduplicate null-embed_id rows — keep only the freshest row per user
DELETE FROM embed_instances
WHERE embed_id IS NULL
  AND id NOT IN (
    SELECT DISTINCT ON (user_id) id
    FROM embed_instances
    WHERE embed_id IS NULL
    ORDER BY user_id, last_seen DESC NULLS LAST
  );

-- Step 3: enforce uniqueness for future null-embed_id inserts
CREATE UNIQUE INDEX IF NOT EXISTS embed_instances_user_null_embed_idx
  ON embed_instances (user_id)
  WHERE embed_id IS NULL;
