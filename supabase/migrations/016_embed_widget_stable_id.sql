-- Add a stable widget_id column to embed_instances.
-- This allows Elementor (and other widget-based embeds) to be tracked by
-- the platform's own permanent widget ID rather than the user-assigned label,
-- so renaming the label updates the row in-place instead of creating a new one.
ALTER TABLE embed_instances ADD COLUMN IF NOT EXISTS widget_id TEXT;

CREATE INDEX IF NOT EXISTS embed_instances_widget_id_idx
  ON embed_instances (user_id, widget_id)
  WHERE widget_id IS NOT NULL;
