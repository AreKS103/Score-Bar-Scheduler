-- User selections table
-- Stores selection state (highlights, featured, tags, league order) for cross-device persistence
CREATE TABLE IF NOT EXISTS user_selections (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  selections JSONB NOT NULL DEFAULT '{}',
  league_order TEXT[] NOT NULL DEFAULT '{}',
  featured_leagues JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE user_selections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own selections"
  ON user_selections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own selections"
  ON user_selections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own selections"
  ON user_selections FOR UPDATE
  USING (auth.uid() = user_id);