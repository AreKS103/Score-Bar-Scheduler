-- 009_embed_instances.sql
-- Tracks WordPress embed widget instances that have loaded the schedule.
-- Each row represents one unique (user, embed_id) pair. embed_id is null
-- when the WordPress widget had no custom ID set (auto-numbered in the API).

CREATE TABLE IF NOT EXISTS embed_instances (
  id          uuid            DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid            NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  embed_id    text,                          -- custom ID set in Elementor/shortcode, or NULL
  page_url    text,                          -- last referrer URL the embed was seen on
  last_seen   timestamptz     DEFAULT now(),
  created_at  timestamptz     DEFAULT now(),
  UNIQUE (user_id, embed_id)
);

CREATE INDEX IF NOT EXISTS embed_instances_user_idx ON embed_instances (user_id);

ALTER TABLE embed_instances ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (API routes use service role)
-- Authenticated users can only read their own rows
CREATE POLICY "Users can view own instances"
  ON embed_instances FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages instances"
  ON embed_instances FOR ALL
  USING (true)
  WITH CHECK (true);
