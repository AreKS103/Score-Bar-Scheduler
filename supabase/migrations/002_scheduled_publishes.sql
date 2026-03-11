-- Scheduled publishes table
CREATE TABLE IF NOT EXISTS scheduled_publishes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  html_content TEXT NOT NULL,
  week_label TEXT DEFAULT '',
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'failed', 'cancelled')),
  published_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for efficient cron queries
CREATE INDEX IF NOT EXISTS idx_scheduled_publishes_pending
  ON scheduled_publishes (status, scheduled_at)
  WHERE status = 'pending';

-- Index for user lookups
CREATE INDEX IF NOT EXISTS idx_scheduled_publishes_user
  ON scheduled_publishes (user_id, scheduled_at DESC);

-- RLS
ALTER TABLE scheduled_publishes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own scheduled publishes"
  ON scheduled_publishes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own scheduled publishes"
  ON scheduled_publishes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own scheduled publishes"
  ON scheduled_publishes FOR UPDATE
  USING (auth.uid() = user_id);
