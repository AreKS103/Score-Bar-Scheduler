-- Add selected_count column to user_selections
ALTER TABLE user_selections ADD COLUMN IF NOT EXISTS selected_count integer DEFAULT 0;

-- Backfill existing rows: count entries where isSelected = 'true'
UPDATE user_selections
SET selected_count = (
  SELECT count(*)
  FROM jsonb_each(selections) AS kv
  WHERE kv.value->>'isSelected' = 'true'
)
WHERE selections IS NOT NULL;
