import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
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
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function hashKey(apiKey: string) {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

/** POST /api/embed-instances — called by beacon in embed HTML to register/refresh an instance */
export async function POST(req: NextRequest) {
  try {
    const { apiKey, embedId, widgetId, pageUrl } = await req.json();
    if (!apiKey) return NextResponse.json({ error: 'Missing apiKey' }, { status: 400, headers: corsHeaders });

    // Beacon may send a raw "sb_..." key or a pre-hashed 64-char hex token — avoid double-hashing
    const hash = /^[0-9a-f]{64}$/.test(apiKey) ? apiKey : hashKey(apiKey);
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
          .insert({ user_id: uid, embed_id: newEmbedId, widget_id: safeWidgetId, page_url: safeUrl, last_seen: now });
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
          .insert({ user_id: uid, embed_id: null, page_url: safeUrl, last_seen: now });
        if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders });
      }
    } else {
      // ── Named shortcode with no widget ID — standard upsert ─────────────────
      const { error } = await supabase.from('embed_instances').upsert(
        { user_id: uid, embed_id: instanceId, page_url: safeUrl, last_seen: now },
        { onConflict: 'user_id,embed_id' },
      );
      if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders });
    }

    return NextResponse.json({ ok: true }, { headers: corsHeaders });
  } catch (e) {
    return NextResponse.json({ error: 'Server error' }, { status: 500, headers: corsHeaders });
  }
}

/** GET /api/embed-instances
 *  - With ?apiKey=xxx  → hashed key lookup (public/external)
 *  - Without apiKey   → uses the caller's login session (used internally by PublishButton)
 */
export async function GET(req: NextRequest) {
  const apiKey = req.nextUrl.searchParams.get('apiKey');
  let userId: string;

  if (apiKey) {
    const hash = /^[0-9a-f]{64}$/.test(apiKey) ? apiKey : hashKey(apiKey);
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

  const { data: instances } = await supabase
    .from('embed_instances')
    .select('embed_id, page_url, last_seen, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  // Async TTL cleanup: remove rows not seen in 7 days. Fire-and-forget —
  // don't await so it doesn't slow down the response.
  const ttlCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  void supabase
    .from('embed_instances')
    .delete()
    .eq('user_id', userId)
    .lt('last_seen', ttlCutoff);

  // embed_id is always set for widget-based embeds (numeric "1","2",… or user label).
  // Only legacy null rows (old shortcode embeds) get a fallback auto-label.
  const labeled = (instances ?? []).map((inst, idx) => ({
    ...inst,
    display_id: inst.embed_id ?? `#${idx + 1}`,
  }));

  return NextResponse.json({ instances: labeled }, { headers: corsHeaders });
}

/** DELETE /api/embed-instances?embedId=NAME
 *  Removes a single embed instance row for the authenticated user.
 *  Pass embedId=__null__ to delete the unnamed (embed_id IS NULL) row.
 */
export async function DELETE(req: NextRequest) {
  const sessionCors = getSessionCorsHeaders(req);
  const sessionClient = await createServerClient();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: sessionCors });

  const rawId = req.nextUrl.searchParams.get('embedId');
  if (rawId === null) {
    return NextResponse.json({ error: 'Missing embedId param' }, { status: 400, headers: sessionCors });
  }

  // '__null__' is the sentinel for the unnamed (NULL embed_id) row
  const instanceId = rawId === '__null__' ? null : rawId;

  // Delete embed instance row
  const query = supabase
    .from('embed_instances')
    .delete()
    .eq('user_id', user.id);

  if (instanceId === null) {
    await query.is('embed_id', null);
  } else {
    await query.eq('embed_id', instanceId);
  }

  // Also delete published schedule for this embed target so a future embed with the
  // same ID doesn't inherit the old schedule contents.
  const scheduleDeleteQuery = supabase
    .from('published_schedules')
    .delete()
    .eq('user_id', user.id);

  if (instanceId === null) {
    await scheduleDeleteQuery.is('embed_target', null);
  } else {
    await scheduleDeleteQuery.eq('embed_target', instanceId);
  }

  // Also clean up saved user selections for this embed target so stale rows
  // don't accumulate in user_selections after the embed is removed.
  const selDeleteQuery = supabase
    .from('user_selections')
    .delete()
    .eq('user_id', user.id);

  if (instanceId === null) {
    await selDeleteQuery.is('embed_target', null);
  } else {
    await selDeleteQuery.eq('embed_target', instanceId);
  }

  return NextResponse.json({ ok: true }, { headers: sessionCors });
}
