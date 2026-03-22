-- 011_embed_instances_view.sql
-- DROPPED: embed_instances_by_user view was removed because:
--   1. It ran with Security Definer (postgres permissions), bypassing RLS.
--   2. Any authenticated user could query it via the public API and see all
--      other users' embed data — a security leak.
--   3. The application never reads from this view; it uses the embed_instances
--      table directly via /api/embed-instances which enforces RLS correctly.
--
-- The embed_instances table itself is the single source of truth.

DROP VIEW IF EXISTS embed_instances_by_user;
