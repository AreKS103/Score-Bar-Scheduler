-- ============================================================================
-- Migration 024: Fix organization_members RLS policies
--
-- - Allow owners to DELETE any member (not just self-delete)
-- - Allow owners to UPDATE member roles
-- ============================================================================

-- Fix DELETE: owners OR self can delete membership
DROP POLICY IF EXISTS "Members can delete own membership" ON public.organization_members;
DROP POLICY IF EXISTS "Owners or self can delete membership" ON public.organization_members;

CREATE POLICY "Owners or self can delete membership"
  ON public.organization_members FOR DELETE
  USING (
    auth.uid() = user_id
    OR
    organization_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid() AND om.role = 'owner'
    )
  );

-- Add UPDATE: owners can change member roles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Owners can update member roles'
      AND tablename = 'organization_members'
  ) THEN
    EXECUTE $sql$
      CREATE POLICY "Owners can update member roles"
        ON public.organization_members FOR UPDATE
        USING (
          organization_id IN (
            SELECT om.organization_id FROM organization_members om
            WHERE om.user_id = auth.uid() AND om.role = 'owner'
          )
        )
        WITH CHECK (
          organization_id IN (
            SELECT om.organization_id FROM organization_members om
            WHERE om.user_id = auth.uid() AND om.role = 'owner'
          )
        )
    $sql$;
  END IF;
END $$;
