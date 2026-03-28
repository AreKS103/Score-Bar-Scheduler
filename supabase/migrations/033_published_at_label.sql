-- Migration 033: Add published_at_label column to store a pre-formatted
-- local-time snapshot of when the publisher pressed Publish, so history
-- always shows the publisher's own clock time regardless of which timezone
-- the viewer is in.
ALTER TABLE public.published_schedules
  ADD COLUMN IF NOT EXISTS published_at_label text;
