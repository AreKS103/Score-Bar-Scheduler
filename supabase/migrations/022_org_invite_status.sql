-- ============================================================================
-- Migration 022: Organization member invite status + role audit columns
--
-- Adds:
--   organization_members.status        ('active' | 'invited') — pending invites
--   organization_members.invited_by    uuid — who sent the invite (audit)
--   organization_members.invited_email text — email used when inviting (before
--                                             the user accepts and email is in auth)
--
-- Also adds a friendly display name to embed_instances so teams can label
-- their widgets (e.g. "Homepage sidebar", "Footer widget").
-- ============================================================================

-- ─── 1. Organization members — invite tracking columns ──────────────────────

ALTER TABLE public.organization_members
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'invited'));

ALTER TABLE public.organization_members
  ADD COLUMN IF NOT EXISTS invited_by uuid
    REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.organization_members
  ADD COLUMN IF NOT EXISTS invited_email text;

-- Index: quickly find all pending invites for an org
CREATE INDEX IF NOT EXISTS idx_org_members_status
  ON public.organization_members(organization_id, status);

-- ─── 2. Embed instances — friendly display name ──────────────────────────────

ALTER TABLE public.embed_instances
  ADD COLUMN IF NOT EXISTS display_name text;

-- ─── 3. User selections — per-member created_by column ─────────────────────
-- Tracks which org member last saved selections for each embed target.
-- Useful for "last edited by" attribution in multi-user orgs.

ALTER TABLE public.user_selections
  ADD COLUMN IF NOT EXISTS last_updated_by uuid
    REFERENCES auth.users(id) ON DELETE SET NULL;

-- ─── 4. Scheduled publishes — created_by for org audit ──────────────────────

ALTER TABLE public.scheduled_publishes
  ADD COLUMN IF NOT EXISTS created_by uuid
    REFERENCES auth.users(id) ON DELETE SET NULL;