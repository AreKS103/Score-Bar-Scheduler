-- ============================================================================
-- Migration 028: Enable Supabase Realtime for organization_members
-- Allows clients to subscribe to INSERT/UPDATE/DELETE changes on the
-- organization_members table in real-time via WebSocket.
-- ============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.organization_members;
