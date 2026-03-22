-- Fix missing UPDATE policy on custom_events
-- The POST /api/custom-events handler calls .update() with the user auth client
-- (anon key + JWT, subject to RLS). Without this policy, editing a custom event
-- silently fails.

CREATE POLICY "Users can update their own custom events"
  ON custom_events
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Drop the three redundant per-operation policies on user_selections.
-- The existing "sel_owner" ALL policy already covers SELECT + INSERT + UPDATE + DELETE.
DROP POLICY IF EXISTS "Users can view their own selections" ON user_selections;
DROP POLICY IF EXISTS "Users can insert their own selections" ON user_selections;
DROP POLICY IF EXISTS "Users can update their own selections" ON user_selections;
