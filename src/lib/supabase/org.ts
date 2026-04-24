import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/** Kebab-case + 8-char random suffix for slug uniqueness.
 *  Uses crypto.randomUUID for collision resistance. */
export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 48) || 'org';
  const suffix = (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`)
    .replace(/-/g, '')
    .slice(0, 8);
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
    .maybeSingle();
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

/** Create a new organization and make the user the owner.
 *  Retries slug generation on rare uniqueness collisions, and rolls back
 *  the organization row if the owner-membership insert fails so we never
 *  leave an orphaned org behind. */
export async function createOrg(userId: string, name: string) {
  let org: { id: string; name: string; slug: string; created_by: string; created_at: string; updated_at: string } | null = null;
  let lastErr: string | undefined;

  // Retry slug generation up to 3 times if we hit the unique constraint
  for (let attempt = 0; attempt < 3 && !org; attempt++) {
    const slug = slugify(name);
    const { data, error } = await supabase
      .from('organizations')
      .insert({ name, slug, created_by: userId })
      .select('id, name, slug, created_by, created_at, updated_at')
      .single();

    if (data) { org = data; break; }
    lastErr = error?.message;
    // Postgres unique_violation is 23505 — retry; otherwise bail
    if (error?.code !== '23505') break;
  }

  if (!org) throw new Error(lastErr ?? 'Failed to create organization');

  const { error: memErr } = await supabase
    .from('organization_members')
    .insert({ organization_id: org.id, user_id: userId, role: 'owner' });

  if (memErr) {
    // Roll back the org so we don't leave a dangling row with no owner
    await supabase.from('organizations').delete().eq('id', org.id);
    throw new Error(memErr.message);
  }

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
    .maybeSingle();
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
