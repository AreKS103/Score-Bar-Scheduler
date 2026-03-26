-- ============================================================================
-- Migration 031: Add 'removed' to organization_members status check constraint
--
-- The Realtime workaround for member removal sets status = 'removed' before
-- deleting the row, so clients get the UPDATE event (DELETE events are not
-- filterable by column value in Supabase Realtime).
-- The original constraint only allowed ('active', 'invited') — expand it.
-- ============================================================================

ALTER TABLE public.organization_members
  DROP CONSTRAINT IF EXISTS organization_members_status_check;

ALTER TABLE public.organization_members
  ADD CONSTRAINT organization_members_status_check
    CHECK (status IN ('active', 'invited', 'removed'));
