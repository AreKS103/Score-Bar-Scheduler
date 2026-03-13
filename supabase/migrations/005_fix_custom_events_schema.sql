-- Repair custom_events schema for reliable persistence.
-- Migration 003 used a partial index with now(), which can fail on Postgres
-- because index predicates must be immutable.

CREATE TABLE IF NOT EXISTS custom_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '14 days')
);

-- Drop potentially invalid old index definition and recreate safe index.
DROP INDEX IF EXISTS idx_custom_events_user_active;
CREATE INDEX IF NOT EXISTS idx_custom_events_user_expires
  ON custom_events (user_id, expires_at);

-- Prevent duplicate custom events per user by MatchEvent.id inside JSON payload.
CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_events_user_eventid
  ON custom_events (user_id, ((event_data->>'id')));

ALTER TABLE custom_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own custom events" ON custom_events;
CREATE POLICY "Users can view their own custom events"
  ON custom_events FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own custom events" ON custom_events;
CREATE POLICY "Users can insert their own custom events"
  ON custom_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own custom events" ON custom_events;
CREATE POLICY "Users can delete their own custom events"
  ON custom_events FOR DELETE
  USING (auth.uid() = user_id);
