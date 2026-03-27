import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { getUserOrgId, getOrgMemberIds } from '@/lib/supabase/org';
import crypto from 'crypto';

// CORS for public endpoints (POST beacon + GET by apiKey) — must allow any origin for WordPress embeds
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Restricted CORS for session-authenticated endpoints (DELETE)
function getSessionCorsHeaders(req: NextRequest): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: {
    ...corsHeaders,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  } });
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function hashKey(raw: string) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/**
 * Resolve an incoming apiKey to the key_hash stored in the DB.
 *  - Starts with "sb_" → raw API key → hash it
 *  - 64 lowercase hex chars → already a hashed embed token → use as-is
 *  - Anything else → legacy raw key (pre-prefix era) → hash it
 */
function resolveKeyHash(apiKey: string): string {
  if (apiKey.startsWith('sb_')) return hashKey(apiKey);
  if (/^[0-9a-f]{64}$/.test(apiKey)) return apiKey;
  return hashKey(apiKey);
}

/** POST /api/embed-instances — called by beacon in embed HTML to register/refresh an instance */
export async function POST(req: NextRequest) {
  try {
    const { apiKey, embedId, widgetId, pageUrl } = await req.json();
    if (!apiKey) return NextResponse.json({ error: 'Missing apiKey' }, { status: 400, headers: corsHeaders });

    const hash = resolveKeyHash(apiKey);
    const { data: keyData } = await supabase
      .from('user_api_keys')
      .select('user_id')
      .eq('key_hash', hash)
      .single();

    if (!keyData) return NextResponse.json({ error: 'Invalid key' }, { status: 401, headers: corsHeaders });

    // instanceId = user-assigned embed name, or null if the widget has no name yet
    const instanceId   = (embedId || '').trim() || null;
    const safeWidgetId = typeof widgetId === 'string' ? widgetId.replace(/[^\w-]/g, '').substring(0, 64) : '';
    const safeUrl      = (pageUrl  || '').substring(0, 512);
    const now          = new Date().toISOString();
    const uid          = keyData.user_id;

    // Resolve org_id for the user (best-effort, nullable)
    const orgId = await getUserOrgId(uid);

    if (safeWidgetId) {
      // ── Widget-based path (Elementor / platform with a stable widget ID) ──────
      // The widget_id column uniquely identifies a physical widget on a page.
      // One row per widget — rename the label → UPDATE the row, never INSERT again.

      const { data: existing } = await supabase
        .from('embed_instances')
        .select('id, embed_id')
        .eq('user_id', uid)
        .eq('widget_id', safeWidgetId)
        .maybeSingle();

      if (existing?.id) {
        // ── Row already exists for this widget ──
        const oldEmbedId = existing.embed_id as string;
        // If the beacon sends no embedId keep the currently stored label;
        // if it sends a name that's a rename operation.
        const newEmbedId = instanceId ?? oldEmbedId;

        const { error: updateErr } = await supabase
          .from('embed_instances')
          .update({ embed_id: newEmbedId, page_url: safeUrl, last_seen: now })
          .eq('id', existing.id);
        if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500, headers: corsHeaders });

        // Cascade rename to published_schedules and user_selections
        if (newEmbedId !== oldEmbedId) {
          await Promise.all([
            supabase
              .from('published_schedules')
              .update({ embed_target: newEmbedId })
              .eq('user_id', uid)
              .eq('embed_target', oldEmbedId),
            supabase
              .from('user_selections')
              .update({ embed_target: newEmbedId })
              .eq('user_id', uid)
              .eq('embed_target', oldEmbedId),
          ]);
        }
      } else {
        // ── No row for this widget yet — first-ever beacon from this widget ──
        let newEmbedId: string;

        if (instanceId !== null) {
          // Named widget: adopt an existing row with this label (e.g. widget was
          // recreated and lost its widget_id) or insert fresh.
          const { data: byEmbed } = await supabase
            .from('embed_instances')
            .select('id')
            .eq('user_id', uid)
            .eq('embed_id', instanceId)
            .maybeSingle();

          if (byEmbed?.id) {
            // Adopt: stamp the widget_id onto the existing row
            const { error: adoptErr } = await supabase
              .from('embed_instances')
              .update({ widget_id: safeWidgetId, page_url: safeUrl, last_seen: now })
              .eq('id', byEmbed.id);
            if (adoptErr) return NextResponse.json({ error: adoptErr.message }, { status: 500, headers: corsHeaders });
            return NextResponse.json({ ok: true }, { headers: corsHeaders });
          }

          newEmbedId = instanceId;
        } else {
          // Unnamed widget: assign the next sequential integer ("1", "2", …).
          // Fetch all embed_ids for this user to determine the next number.
          const { data: allRows } = await supabase
            .from('embed_instances')
            .select('embed_id')
            .eq('user_id', uid);

          const maxNum = (allRows ?? [])
            .map(r => parseInt(r.embed_id ?? '', 10))
            .filter(n => Number.isFinite(n) && n > 0)
            .reduce((m, n) => Math.max(m, n), 0);

          newEmbedId = String(maxNum + 1);
        }

        const { error: insertErr } = await supabase
          .from('embed_instances')
          .insert({ user_id: uid, embed_id: newEmbedId, widget_id: safeWidgetId, page_url: safeUrl, last_seen: now, organization_id: orgId });
        if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500, headers: corsHeaders });
      }
    } else if (instanceId === null) {
      // ── Legacy unnamed shortcode with no widget ID ───────────────────────────
      // Postgres UNIQUE (user_id, embed_id) does NOT catch NULL duplicates —
      // handle with explicit UPDATE-or-INSERT.
      const { data: existing } = await supabase
        .from('embed_instances')
        .select('id')
        .eq('user_id', uid)
        .is('embed_id', null)
        .maybeSingle();

      if (existing?.id) {
        const { error } = await supabase
          .from('embed_instances')
          .update({ page_url: safeUrl, last_seen: now })
          .eq('id', existing.id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders });
      } else {
        const { error } = await supabase
          .from('embed_instances')
          .insert({ user_id: uid, embed_id: null, page_url: safeUrl, last_seen: now, organization_id: orgId });
        if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders });
      }
    } else {
      // ── Named shortcode with no widget ID — standard upsert ─────────────────
      const { error } = await supabase.from('embed_instances').upsert(
        { user_id: uid, embed_id: instanceId, page_url: safeUrl, last_seen: now, organization_id: orgId },
        { onConflict: 'user_id,embed_id' },
      );
      if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders });
    }

    return NextResponse.json({ ok: true }, { headers: corsHeaders });
  } catch (e) {
    return NextResponse.json({ error: 'Server error' }, { status: 500, headers: corsHeaders });
  }
}

/** PATCH /api/embed-instances — rename an embed (webapp only, session auth) */
export async function PATCH(req: NextRequest) {
  const sessionClient = await createServerClient();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { embedId, newName } = await req.json();
  if (!embedId || typeof newName !== 'string')
    return NextResponse.json({ error: 'Missing embedId or newName' }, { status: 400 });

  const safeName = newName.trim().substring(0, 64);
  if (!safeName) return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
  if (safeName === embedId) return NextResponse.json({ ok: true });

  const orgMemberIds = await getOrgMemberIds(user.id);

  // Reject if the new name is already in use by another instance
  const { data: conflict } = await supabase
    .from('embed_instances')
    .select('id')
    .in('user_id', orgMemberIds)
    .eq('embed_id', safeName)
    .maybeSingle();
  if (conflict) return NextResponse.json({ error: 'Name already in use' }, { status: 409 });

  const { error } = await supabase
    .from('embed_instances')
    .update({ embed_id: safeName })
    .in('user_id', orgMemberIds)
    .eq('embed_id', embedId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Cascade rename to related tables
  await Promise.all([
    supabase.from('published_schedules')
      .update({ embed_target: safeName })
      .in('user_id', orgMemberIds)
      .eq('embed_target', embedId),
    supabase.from('user_selections')
      .update({ embed_target: safeName })
      .in('user_id', orgMemberIds)
      .eq('embed_target', embedId),
  ]);

  return NextResponse.json({ ok: true, newName: safeName });
}

/** GET /api/embed-instances
 *  - With ?apiKey=xxx  → hashed key lookup (public/external)
 *  - Without apiKey   → uses the caller's login session (used internally by PublishButton)
 */
export async function GET(req: NextRequest) {
  const apiKey = req.nextUrl.searchParams.get('apiKey');
  let userId: string;

  if (apiKey) {
    const hash = resolveKeyHash(apiKey);
    const { data: keyData } = await supabase
      .from('user_api_keys')
      .select('user_id')
      .eq('key_hash', hash)
      .single();
    if (!keyData) return NextResponse.json({ error: 'Invalid key' }, { status: 401, headers: corsHeaders });
    userId = keyData.user_id;
  } else {
    const sessionClient = await createServerClient();
    const { data: { user } } = await sessionClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
    userId = user.id;
  }

  // If the user belongs to an org, also return embed instances from all active
  // org members so that invited/member users can see the org owner's embeds.
  const orgId = await getUserOrgId(userId);
  let userIds: string[] = [userId];
  if (orgId) {
    const { data: members } = await supabase
      .from('organization_members')
      .select('user_id')
      .eq('organization_id', orgId)
      .eq('status', 'active');
    if (members?.length) {
      userIds = [...new Set([userId, ...members.map((m: { user_id: string }) => m.user_id)])];
    }
  }

  const { data: instances } = await supabase
    .from('embed_instances')
    .select('embed_id, widget_id, page_url, last_seen, created_at')
    .in('user_id', userIds)
    .order('created_at', { ascending: true });

  // NOTE: No TTL / orphan auto-cleanup here.
  // Embed instances are permanent registrations managed explicitly by the user.
  // Silently deleting rows based on last_seen would cascade-delete published
  // schedules and selections when a page simply hasn't been visited in a few days.
  // Explicit cleanup is handled by the DELETE endpoint when the user intentionally
  // removes an embed via the web app UI.

  // embed_id is always set for widget-based embeds (numeric "1","2",… or user label).
  // Only legacy null rows (old shortcode embeds) get a fallback auto-label.
  const labeled = (instances ?? []).map((inst, idx) => ({
    ...inst,
    widget_id: inst.widget_id ?? null,
    display_id: inst.embed_id ?? `#${idx + 1}`,
  }));

  return NextResponse.json({ instances: labeled }, {
    headers: {
      ...corsHeaders,
      'Cache-Control': 'private, s-maxage=30, stale-while-revalidate=60',
    },
  });
}

/** DELETE /api/embed-instances?embedId=NAME
 *  Removes a single embed instance row for the authenticated user.
 *  Pass embedId=__null__ to delete the unnamed (embed_id IS NULL) row.
 *  Pass embedId=__all__ to delete ALL embed instances (used by WordPress uninstall).
 *  Auth: session cookie OR apiKey query param.
 */
export async function DELETE(req: NextRequest) {
  const sessionCors = getSessionCorsHeaders(req);

  // Support both session auth and API key auth (for WordPress uninstall),
  // but bulk deletion (__all__) requires session auth to prevent a compromised
  // API key from wiping all published schedules.
  let userId: string;
  let authedViaApiKey = false;
  const apiKey = req.nextUrl.searchParams.get('apiKey');
  if (apiKey) {
    const hash = resolveKeyHash(apiKey);
    const { data: keyData } = await supabase
      .from('user_api_keys')
      .select('user_id')
      .eq('key_hash', hash)
      .single();
    if (!keyData) return NextResponse.json({ error: 'Invalid key' }, { status: 401, headers: corsHeaders });
    userId = keyData.user_id;
    authedViaApiKey = true;
  } else {
    const sessionClient = await createServerClient();
    const { data: { user } } = await sessionClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: sessionCors });
    userId = user.id;
  }

  const rawWidgetId = req.nextUrl.searchParams.get('widgetId');
  let rawId = req.nextUrl.searchParams.get('embedId');

  // If widgetId is provided without embedId, resolve the embed_id from the DB.
  const orgMemberIds = await getOrgMemberIds(userId);
  if (rawWidgetId && !rawId) {
    const { data: inst } = await supabase
      .from('embed_instances')
      .select('embed_id')
      .in('user_id', orgMemberIds)
      .eq('widget_id', rawWidgetId)
      .maybeSingle();
    if (!inst) {
      // Nothing registered under this widgetId — treat as success
      return NextResponse.json({ ok: true }, { headers: apiKey ? corsHeaders : sessionCors });
    }
    rawId = inst.embed_id ?? '__null__';
  }

  if (rawId === null) {
    return NextResponse.json({ error: 'Missing embedId param' }, { status: 400, headers: apiKey ? corsHeaders : sessionCors });
  }

  const headers = apiKey ? corsHeaders : sessionCors;

  // '__all__' sentinel: delete ALL embed instances + related data for this org/user.
  // Requires session auth — a compromised API key must not be able to wipe everything.
  if (rawId === '__all__') {
    if (authedViaApiKey) {
      return NextResponse.json({ error: 'Session authentication required for bulk delete' }, { status: 403, headers: sessionCors });
    }
    await supabase.from('embed_instances').delete().in('user_id', orgMemberIds);
    await supabase.from('published_schedules').delete().in('user_id', orgMemberIds);
    await supabase.from('user_selections').delete().in('user_id', orgMemberIds);
    return NextResponse.json({ ok: true }, { headers });
  }

  // '__null__' is the sentinel for the unnamed (NULL embed_id) row
  const instanceId = rawId === '__null__' ? null : rawId;

  // Delete embed instance row
  const query = supabase
    .from('embed_instances')
    .delete()
    .in('user_id', orgMemberIds);

  if (instanceId === null) {
    await query.is('embed_id', null);
  } else {
    await query.eq('embed_id', instanceId);
  }

  // NOTE: published_schedules is intentionally NOT cascade-deleted here.
  // The MutationObserver (in shortcode.php / elementor-widget.php) fires this
  // DELETE on Elementor re-renders (false positives). If we also deleted
  // published_schedules the user would silently lose their published content,
  // and the beacon would re-create embed_instances on next load — making the
  // data disappear with no obvious trace. Published schedules must only be
  // cleared via the explicit "Clear Schedule" button (/api/delete-schedule).

  // Also clean up saved user selections for this embed target so stale rows
  // don't accumulate in user_selections after the embed is removed.
  const selDeleteQuery = supabase
    .from('user_selections')
    .delete()
    .in('user_id', orgMemberIds);

  if (instanceId === null) {
    await selDeleteQuery.is('embed_target', null);
  } else {
    await selDeleteQuery.eq('embed_target', instanceId);
  }

  return NextResponse.json({ ok: true }, { headers });
}
