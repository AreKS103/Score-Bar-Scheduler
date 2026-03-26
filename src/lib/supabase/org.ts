import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/** Kebab-case + 6-char random suffix for slug uniqueness */
export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 48);
  const suffix = Math.random().toString(36).substring(2, 8);
  return `${base}-${suffix}`;
}

/** Get the user's primary (first) organization (active memberships only) */
export async function getUserOrg(userId: string) {
  const { data } = await supabase
    .from('organization_members')
    .select('organization_id, role, organizations(id, name, slug, created_by, created_at, updated_at)')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  return data?.organizations ?? null;
}

/** Get all organizations a user belongs to (active memberships only) */
export async function getUserOrgs(userId: string) {
  const { data } = await supabase
    .from('organization_members')
    .select('organization_id, role, organizations(id, name, slug, created_by, created_at, updated_at)')
    .eq('user_id', userId)
    .eq('status', 'active')
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

/** Get the user's primary org ID (active memberships only) */
export async function getUserOrgId(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId)
    .eq('status', 'active')
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
