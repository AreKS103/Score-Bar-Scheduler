import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  applySelectionSyncDiff,
  countActiveSelections,
  emptySelectionSyncState,
  isSelectionSyncStateEmpty,
  normalizeSelectionSyncState,
  type SelectionEntry,
  type SelectionSyncDiff,
  type SelectionSyncState,
} from '@/lib/selectionSync';

export const dynamic = 'force-dynamic';

interface SelectionRow {
  user_id: string;
  organization_id: string | null;
  embed_target: string;
  selections: Record<string, SelectionEntry> | null;
  league_order: string[] | null;
  featured_leagues: Record<string, string> | null;
  updated_at: string | null;
  client_id: string | null;
}

interface SelectionScope {
  orgId: string | null;
  memberIds: string[];
  canonicalUserId: string;
  topic: string;
}

type SelectionRouteSupabaseClient = SupabaseClient;

let adminClient: SelectionRouteSupabaseClient | null = null;

function getAdminClient(): SelectionRouteSupabaseClient {
  if (adminClient) return adminClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase service role is not configured');
  adminClient = createServiceClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return adminClient;
}

function sanitizeEmbedTarget(value: string | null): string {
  return typeof value === 'string' ? value.slice(0, 200) : '';
}

function rowToState(row: SelectionRow | null): SelectionSyncState {
  if (!row) return emptySelectionSyncState();
  return normalizeSelectionSyncState({
    selections: row.selections ?? {},
    leagueOrder: row.league_order ?? [],
    featuredLeagues: row.featured_leagues ?? {},
    savedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now(),
  });
}

function asObject<T>(value: unknown): Record<string, T> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, T> : {};
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function parseDiff(value: unknown): SelectionSyncDiff {
  const body = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    selectionsSet: asObject<SelectionEntry>(body.selectionsSet),
    selectionsRemove: asStringArray(body.selectionsRemove),
    featuredLeaguesSet: asObject<string>(body.featuredLeaguesSet),
    featuredLeaguesRemove: asStringArray(body.featuredLeaguesRemove),
    leagueOrder: Array.isArray(body.leagueOrder) ? asStringArray(body.leagueOrder) : null,
  };
}

async function resolveSelectionScope(userId: string): Promise<SelectionScope> {
  const admin = getAdminClient();
  const { data: memberships, error: membershipError } = await admin
    .from('organization_members')
    .select('organization_id, created_at')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: true });

  if (membershipError) throw membershipError;

  const orgId = memberships?.[0]?.organization_id ?? null;
  if (!orgId) {
    return {
      orgId: null,
      memberIds: [userId],
      canonicalUserId: userId,
      topic: `selection-sync:user:${userId}`,
    };
  }

  const { data: members, error: membersError } = await admin
    .from('organization_members')
    .select('user_id, created_at')
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .order('created_at', { ascending: true });

  if (membersError) throw membersError;

  const memberIds = [...new Set((members ?? []).map((member) => member.user_id).filter(Boolean))];
  if (!memberIds.includes(userId)) throw new Error('User is not an active organization member');

  const { data: org } = await admin
    .from('organizations')
    .select('created_by')
    .eq('id', orgId)
    .maybeSingle();

  const canonicalUserId = org?.created_by && memberIds.includes(org.created_by)
    ? org.created_by
    : memberIds[0] ?? userId;

  return {
    orgId,
    memberIds,
    canonicalUserId,
    topic: `selection-sync:org:${orgId}`,
  };
}

async function loadSelectionRow(scope: SelectionScope, embedTarget: string): Promise<SelectionRow | null> {
  const admin = getAdminClient();
  const query = admin
    .from('user_selections')
    .select('user_id, organization_id, embed_target, selections, league_order, featured_leagues, updated_at, client_id')
    .eq('embed_target', embedTarget)
    .order('updated_at', { ascending: false })
    .limit(1);

  const { data, error } = scope.orgId
    ? await query.in('user_id', scope.memberIds)
    : await query.eq('user_id', scope.canonicalUserId);

  if (error) throw error;
  return (data?.[0] as SelectionRow | undefined) ?? null;
}

async function broadcastSelectionChange(scope: SelectionScope, payload: Record<string, unknown>): Promise<void> {
  const admin = getAdminClient();
  const channel = admin.channel(scope.topic, { config: { broadcast: { ack: true } } });
  try {
    const result = await channel.send({ type: 'broadcast', event: 'selection-updated', payload });
    if (result !== 'ok') console.warn('[SelectionSync] broadcast returned:', result);
  } catch (error) {
    console.warn('[SelectionSync] broadcast failed:', error);
  } finally {
    await admin.removeChannel(channel).catch(() => undefined);
  }
}

async function getAuthenticatedUserId() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function GET(req: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const scope = await resolveSelectionScope(userId);

    if (req.nextUrl.searchParams.get('scope') === '1') {
      return NextResponse.json({
        scope: {
          orgId: scope.orgId,
          topic: scope.topic,
          canonicalUserId: scope.canonicalUserId,
        },
      });
    }

    const embedTarget = sanitizeEmbedTarget(req.nextUrl.searchParams.get('target'));
    const row = await loadSelectionRow(scope, embedTarget);
    return NextResponse.json({
      state: rowToState(row),
      deleted: !row,
      scope: {
        orgId: scope.orgId,
        topic: scope.topic,
      },
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('[SelectionSync] GET failed:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load selections' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const embedTarget = sanitizeEmbedTarget(typeof body?.embedTarget === 'string' ? body.embedTarget : '');
    const clientId = typeof body?.clientId === 'string' ? body.clientId : null;
    const diff = parseDiff(body);

    const scope = await resolveSelectionScope(userId);
    const row = await loadSelectionRow(scope, embedTarget);
    const nextSavedAt = Date.now();
    const nextState = applySelectionSyncDiff(rowToState(row), diff, nextSavedAt);
    const rowOwnerUserId = scope.orgId ? row?.user_id ?? scope.canonicalUserId : userId;

    if (isSelectionSyncStateEmpty(nextState)) {
      if (row) {
        const { error } = await getAdminClient()
          .from('user_selections')
          .delete()
          .eq('user_id', row.user_id)
          .eq('embed_target', embedTarget);
        if (error) throw error;
      }

      const emptyState = emptySelectionSyncState(nextSavedAt);
      await broadcastSelectionChange(scope, {
        embedTarget,
        clientId,
        deleted: true,
        savedAt: nextSavedAt,
      });
      return NextResponse.json({ state: emptyState, deleted: true });
    }

    const { data, error } = await getAdminClient()
      .from('user_selections')
      .upsert({
        user_id: rowOwnerUserId,
        organization_id: scope.orgId,
        embed_target: embedTarget,
        selections: nextState.selections,
        league_order: nextState.leagueOrder,
        featured_leagues: nextState.featuredLeagues,
        selected_count: countActiveSelections(nextState.selections),
        last_updated_by: userId,
        client_id: clientId,
        updated_at: new Date(nextSavedAt).toISOString(),
      }, { onConflict: 'user_id,embed_target' })
      .select('user_id, organization_id, embed_target, selections, league_order, featured_leagues, updated_at, client_id')
      .single();

    if (error) throw error;

    const savedState = rowToState(data as SelectionRow);
    await broadcastSelectionChange(scope, {
      embedTarget,
      clientId,
      deleted: false,
      savedAt: savedState.savedAt,
    });

    return NextResponse.json({ state: savedState, deleted: false });
  } catch (error) {
    console.error('[SelectionSync] POST failed:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to save selections' }, { status: 500 });
  }
}