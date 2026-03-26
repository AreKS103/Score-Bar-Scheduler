-- ============================================================================
-- Migration 032: Set REPLICA IDENTITY FULL on organization_members
--
-- Without REPLICA IDENTITY FULL, Supabase Realtime cannot reliably evaluate
-- row-level filters on non-primary-key columns (like user_id) for UPDATE and
-- DELETE events. This means the client-side subscription:
--   filter: user_id=eq.${userId}  (from useOrgRealtime)
-- silently receives no UPDATE events when a member's status changes to
-- 'removed', so the org name badge never clears in real-time.
--
-- Setting REPLICA IDENTITY FULL makes the full old row available in the WAL
-- log, enabling reliable filtering and delivery for all event types.
-- ============================================================================

ALTER TABLE public.organization_members REPLICA IDENTITY FULL;
