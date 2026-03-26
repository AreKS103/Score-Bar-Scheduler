-- ============================================================================
-- Migration 027: Org-aware RLS for published_schedules
--
-- The existing SELECT policy only allows auth.uid() = user_id, which prevents
-- org members from seeing each other's published schedules (history sharing).
-- Add a policy that allows org members to read schedules from all users in
-- their shared organization(s).
-- ============================================================================

-- Allow org members to SELECT each other's published schedules
CREATE POLICY "Org members can read shared schedules"
  ON public.published_schedules FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_members om1
      JOIN public.organization_members om2
        ON om1.organization_id = om2.organization_id
      WHERE om1.user_id = auth.uid()
        AND om2.user_id = published_schedules.user_id
        AND om1.status = 'active'
        AND om2.status = 'active'
    )
  );
