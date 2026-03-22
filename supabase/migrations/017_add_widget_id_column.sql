-- 017_add_widget_id_column.sql
--
-- Ensures the widget_id column exists on embed_instances.
-- Originally defined in 009_embed_widget_stable_id.sql but may not have been
-- applied to all environments. Using IF NOT EXISTS makes this idempotent.

ALTER TABLE embed_instances ADD COLUMN IF NOT EXISTS widget_id TEXT;

CREATE INDEX IF NOT EXISTS embed_instances_widget_id_idx
  ON embed_instances (user_id, widget_id)
  WHERE widget_id IS NOT NULL;
