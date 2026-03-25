-- ============================================================================
-- Migration 023: User lookup helper functions
--
-- Creates SECURITY DEFINER functions to safely look up auth.users data
-- without exposing the auth schema directly. Used by the org members API.
-- ============================================================================

-- 1. Find a single user ID by email
CREATE OR REPLACE FUNCTION public.find_user_by_email(target_email text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(target_email) LIMIT 1;
$$;

-- 2. Batch-resolve emails for an array of user IDs
CREATE OR REPLACE FUNCTION public.resolve_user_emails(user_ids uuid[])
RETURNS TABLE(user_id uuid, email text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id AS user_id, email FROM auth.users WHERE id = ANY(user_ids);
$$;

-- Restrict access
REVOKE ALL ON FUNCTION public.find_user_by_email(text) FROM public;
GRANT EXECUTE ON FUNCTION public.find_user_by_email(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_user_by_email(text) TO service_role;

REVOKE ALL ON FUNCTION public.resolve_user_emails(uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.resolve_user_emails(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_user_emails(uuid[]) TO service_role;
