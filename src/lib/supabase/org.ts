import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/** Kebab-case + 6-char random suffix for slug uniqueness */
function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 48);
  const suffix = Math.random().toString(36).substring(2, 8);
  return `${base}-${suffix}`;
}

/** Get the user's primary (first) organization */
export async function getUserOrg(userId: string) {
  const { data } = await supabase
    .from('organization_members')
    .select('organization_id, role, organizations(id, name, slug, created_by, created_at, updated_at)')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  return data?.organizations ?? null;
}

/** Get all organizations a user belongs to */
export async function getUserOrgs(userId: string) {
  const { data } = await supabase
    .from('organization_members')
    .select('organization_id, role, organizations(id, name, slug, created_by, created_at, updated_at)')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  return (data ?? []).map(m => ({ ...m.organizations, role: m.role }));
}

/** Create a new organization and make the user the owner */
export async function createOrg(userId: string, name: string) {
  const slug = slugify(name);

  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .insert({ name, slug, created_by: userId })
    .select('id, name, slug, created_by, created_at, updated_at')
    .single();

  if (orgErr || !org) throw new Error(orgErr?.message ?? 'Failed to create organization');

  const { error: memErr } = await supabase
    .from('organization_members')
    .insert({ organization_id: org.id, user_id: userId, role: 'owner' });

  if (memErr) throw new Error(memErr.message);

  return org;
}

/**
 * Activate any pending invites for a user (status: 'invited' → 'active').
 * Called on bootstrap to auto-activate invites once the user has confirmed.
 */
export async function activateUserInvites(userId: string): Promise<void> {
  await supabase
    .from('organization_members')
    .update({ status: 'active' })
    .eq('user_id', userId)
    .eq('status', 'invited');
}

/**
 * Lazy bootstrap: ensure the user has at least one org.
 * If not, create a default org named from their email prefix, then backfill
 * organization_id on all their existing data.
 * Also activates any pending invites (status: 'invited' → 'active').
 */
export async function ensureUserHasOrg(userId: string, email?: string): Promise<string> {
  await activateUserInvites(userId);

  const existing = await getUserOrg(userId);
  if (existing) return (existing as any).id;

  // Derive a default org name from the email prefix
  const prefix = (email ?? 'my').split('@')[0];
  const orgName = prefix.charAt(0).toUpperCase() + prefix.slice(1) + "'s Organization";

  const org = await createOrg(userId, orgName);
  await backfillOrgId(userId, org.id);
  return org.id;
}

/**
 * Backfill organization_id on all rows owned by this user that don't have one yet.
 */
export async function backfillOrgId(userId: string, orgId: string) {
  const tables = [
    'user_api_keys',
    'embed_instances',
    'published_schedules',
    'user_selections',
    'scheduled_publishes',
    'custom_events',
    'business_info',
  ] as const;

  await Promise.allSettled(
    tables.map(table =>
      supabase
        .from(table)
        .update({ organization_id: orgId })
        .eq('user_id', userId)
        .is('organization_id', null)
    )
  );
}

/** Check if a user is a member of a given organization */
export async function isOrgMember(userId: string, orgId: string): Promise<boolean> {
  const { data } = await supabase
    .from('organization_members')
    .select('id')
    .eq('user_id', userId)
    .eq('organization_id', orgId)
    .maybeSingle();
  return !!data;
}

/** Get the user's primary org ID (simple helper for route handlers) */
export async function getUserOrgId(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  return data?.organization_id ?? null;
}

/**
 * Get all active member user_ids across ALL orgs the user belongs to.
 * Returns `[userId]` if the user has no org. Used for org-scoped queries across
 * published_schedules, scheduled_publishes, custom_events, etc.
 *
 * Important: a user may belong to multiple orgs (e.g. their auto-created
 * personal org + an org they were invited to). We aggregate members from
 * every org so cross-org history, schedules, and other data are visible.
 */
export async function getOrgMemberIds(userId: string): Promise<string[]> {
  // 1. Find every org this user is an active member of
  const { data: userOrgs } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId)
    .eq('status', 'active');

  if (!userOrgs?.length) return [userId];

  const orgIds = userOrgs.map(o => o.organization_id);

  // 2. Collect all active members across those orgs
  const { data: members } = await supabase
    .from('organization_members')
    .select('user_id')
    .in('organization_id', orgIds)
    .eq('status', 'active');

  if (!members?.length) return [userId];
  return [...new Set([userId, ...members.map(m => m.user_id)])];
}
