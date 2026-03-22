-- Migration 014: Keep only 1 published_schedule per user per embed_target,
--               and purge all stale custom_events rows.

-- ── 1. Prune published_schedules — keep only the most-recent row per (user_id, embed_target) ──
DELETE FROM published_schedules
WHERE id NOT IN (
  SELECT DISTINCT ON (user_id, embed_target) id
  FROM published_schedules
  ORDER BY user_id, embed_target, published_at DESC NULLS LAST
);

-- ── 2. Purge ALL custom_events rows so stale/deleted events are gone.
--       Users will re-create custom events if needed; the table self-repopulates on next save.
DELETE FROM custom_events;
