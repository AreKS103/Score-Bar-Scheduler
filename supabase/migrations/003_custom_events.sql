-- Custom events table
-- Stores manually-added events, auto-expires after 2 weeks
CREATE TABLE IF NOT EXISTS custom_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '14 days')
);

-- Index for fetching a user's active (non-expired) events
CREATE INDEX IF NOT EXISTS idx_custom_events_user_active
  ON custom_events (user_id, expires_at)
  WHERE expires_at > now();

-- RLS
ALTER TABLE custom_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own custom events"
  ON custom_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own custom events"
  ON custom_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own custom events"
  ON custom_events FOR DELETE
  USING (auth.uid() = user_id);

-- Auto-delete expired rows nightly (requires pg_cron extension)
-- Run this separately if pg_cron is available in your Supabase project:
-- SELECT cron.schedule('delete-expired-custom-events', '0 3 * * *',
--   $$DELETE FROM custom_events WHERE expires_at < now()$$);
