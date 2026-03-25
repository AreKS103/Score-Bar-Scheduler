-- ============================================================================
-- Migration 021: Organizations & Organization Members
-- Adds organization-based ownership layer. All existing tables gain a nullable
-- organization_id column for gradual backfill via lazy bootstrap.
-- ============================================================================

-- ─── 1. Organizations table ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.organizations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text NOT NULL UNIQUE,
  created_by  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Reuse the set_updated_at trigger function from migration 006
CREATE TRIGGER set_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 2. Organization Members table ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.organization_members (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            text NOT NULL DEFAULT 'owner',
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- ─── 3. Add organization_id to existing tables (nullable for backcompat) ────

ALTER TABLE public.user_api_keys
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

ALTER TABLE public.embed_instances
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

ALTER TABLE public.published_schedules
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

ALTER TABLE public.user_selections
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

ALTER TABLE public.scheduled_publishes
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

ALTER TABLE public.custom_events
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

ALTER TABLE public.business_info
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

-- ─── 4. Indexes on organization_id columns ─────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_user_api_keys_org ON public.user_api_keys(organization_id);
CREATE INDEX IF NOT EXISTS idx_embed_instances_org ON public.embed_instances(organization_id);
CREATE INDEX IF NOT EXISTS idx_published_schedules_org ON public.published_schedules(organization_id);
CREATE INDEX IF NOT EXISTS idx_user_selections_org ON public.user_selections(organization_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_publishes_org ON public.scheduled_publishes(organization_id);
CREATE INDEX IF NOT EXISTS idx_custom_events_org ON public.custom_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_business_info_org ON public.business_info(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON public.organization_members(user_id);

-- ─── 5. Helper function: get all org IDs for a user ────────────────────────

CREATE OR REPLACE FUNCTION public.user_org_ids(uid uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT organization_id FROM public.organization_members WHERE user_id = uid;
$$;

-- ─── 6. RLS policies for organizations ─────────────────────────────────────

-- Members can view their own orgs
CREATE POLICY "Members can view their organizations"
  ON public.organizations FOR SELECT
  USING (id IN (SELECT public.user_org_ids(auth.uid())));

-- Authenticated users can create organizations
CREATE POLICY "Authenticated users can create organizations"
  ON public.organizations FOR INSERT
  WITH CHECK (auth.uid() = created_by);

-- Members can update their orgs
CREATE POLICY "Members can update their organizations"
  ON public.organizations FOR UPDATE
  USING (id IN (SELECT public.user_org_ids(auth.uid())))
  WITH CHECK (id IN (SELECT public.user_org_ids(auth.uid())));

-- Only the creator can delete the org (for now)
CREATE POLICY "Creator can delete organization"
  ON public.organizations FOR DELETE
  USING (auth.uid() = created_by);

-- ─── 7. RLS policies for organization_members ──────────────────────────────

-- Members can view memberships for their orgs
CREATE POLICY "Members can view org memberships"
  ON public.organization_members FOR SELECT
  USING (organization_id IN (SELECT public.user_org_ids(auth.uid())));

-- Org creators can add members (for future invite flow)
CREATE POLICY "Org owners can insert members"
  ON public.organization_members FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT om.organization_id FROM public.organization_members om
      WHERE om.user_id = auth.uid() AND om.role = 'owner'
    )
    OR
    -- Allow self-insert during org creation (no members exist yet)
    auth.uid() = user_id
  );

-- Members can remove themselves
CREATE POLICY "Members can delete own membership"
  ON public.organization_members FOR DELETE
  USING (auth.uid() = user_id);
