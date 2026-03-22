-- 012_fix_rls_policies.sql
-- 1. Add missing UPDATE policy on custom_events.
--    The POST /api/custom-events calls .update() with the user auth client
--    (anon key + JWT, subject to RLS). Without this policy editing a custom
--    event silently failed.
--
-- 2. Remove the three redundant per-operation SELECT/INSERT/UPDATE policies
--    on user_selections. The "sel_owner" FOR ALL policy that already exists
--    in the DB covers all four operations, so the individual ones are no-ops.

CREATE POLICY "Users can update their own custom events"
  ON custom_events
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own selections"    ON user_selections;
DROP POLICY IF EXISTS "Users can insert their own selections"  ON user_selections;
DROP POLICY IF EXISTS "Users can update their own selections"  ON user_selections;
