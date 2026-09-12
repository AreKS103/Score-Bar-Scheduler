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

const LAST_SEEN_REFRESH_MS = 60 * 60 * 1000;

function shouldRefreshLastSeen(existingLastSeen: unknown, existingPageUrl: unknown, nextPageUrl: string): boolean {
  if (existingPageUrl !== nextPageUrl) return true;
  if (typeof existingLastSeen !== 'string') return true;

  const lastSeenMs = Date.parse(existingLastSeen);
  if (!Number.isFinite(lastSeenMs)) return true;

  return Date.now() - lastSeenMs >= LAST_SEEN_REFRESH_MS;
}

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

// ── Abuse protection ─────────────────────────────────────────────────────────
// The embed token (sha256 key_hash) appears in every embedded page's HTML by
// design. Without the checks below, anyone who copies the embed snippet onto
// their own site can register/rename/delete embed_instances rows in the
// owner's account (this happened with a tch1.com mockup in 2026-07).

// In-memory per-key rate limit: 30 beacons / 60s per key (normal sites send
// at most a handful per pageview, already debounced client-side).
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;
const keyRequests = new Map<string, number[]>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const timestamps = (keyRequests.get(key) ?? []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  timestamps.push(now);
  keyRequests.set(key, timestamps);
  if (keyRequests.size > 5000) {
    // Prevent unbounded growth under abuse
    for (const [k, ts] of keyRequests) {
      if (ts.every(t => now - t >= RATE_LIMIT_WINDOW_MS)) keyRequests.delete(k);
    }
  }
  return timestamps.length > RATE_LIMIT_MAX;
}

/** Extract a normalized hostname from a URL string (best effort). */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/** host matches an allowed domain exactly or as a subdomain. */
function domainAllowed(host: string, allowed: string[]): boolean {
  if (!host) return false;
  return allowed.some((d) => {
    const dom = d.toLowerCase().trim();
    return dom !== '' && (host === dom || host.endsWith(`.${dom}`));
  });
}

interface KeyRecord {
  user_id: string;
  allowed_domains: string[] | null;
}

async function lookupKey(hash: string): Promise<KeyRecord | null> {
  const { data, error } = await supabase
    .from('user_api_keys')
    .select('user_id, allowed_domains')
    .eq('key_hash', hash)
    .single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(error.message);
  }
  return data ?? null;
}

/**
 * Enforce the per-key domain allowlist for beacon-originated writes.
 * - Key pinned   → pageUrl host must match the allowlist (exact or subdomain).
 * - Key unpinned → auto-pin to the beacon's host (first legitimate embed wins).
 * Returns an error response to short-circuit, or null when allowed.
 */
async function enforceDomainAllowlist(
  keyHash: string,
  keyData: KeyRecord,
  pageUrl: string,
): Promise<NextResponse | null> {
  const host = hostOf(pageUrl);

  if (Array.isArray(keyData.allowed_domains) && keyData.allowed_domains.length > 0) {
    // Beacons always carry a pageUrl; reject anything off-domain (or missing).
    if (!domainAllowed(host, keyData.allowed_domains)) {
      return NextResponse.json(
        { error: 'Domain not allowed for this key' },
        { status: 403, headers: corsHeaders },
      );
    }
    return null;
  }

  // Unpinned legacy key — pin it to the first host we see a beacon from.
  if (host) {
    const { error } = await supabase
      .from('user_api_keys')
      .update({ allowed_domains: [host] })
      .eq('key_hash', keyHash)
      .is('allowed_domains', null);
    if (error) throw new Error(error.message);
  }
  return null;
}

function sanitizeWidgetId(widgetId: unknown): string {
  return typeof widgetId === 'string' ? widgetId.replace(/[^\w-]/g, '').substring(0, 64) : '';
}

function buildUniqueEmbedId(baseName: string, usedNames: Set<string>): string {
  const base = (baseName.trim().substring(0, 64) || 'Embed').trim();
  if (!usedNames.has(base)) return base;

  for (let suffix = 2; suffix < 1000; suffix++) {
    const suffixText = ` ${suffix}`;
    const prefix = base.substring(0, 64 - suffixText.length).trimEnd() || 'Embed';
    const candidate = `${prefix}${suffixText}`;
    if (!usedNames.has(candidate)) return candidate;
  }

  const fallbackSuffix = ` ${Date.now().toString(36).slice(-5)}`;
  return `${base.substring(0, 64 - fallbackSuffix.length).trimEnd() || 'Embed'}${fallbackSuffix}`;
}

function isGeneratedDuplicateName(name: string, baseName: string): boolean {
  const base = baseName.trim();
  if (!base || name === base) return name === base;
  if (!name.startsWith(`${base} `)) return false;
  return /^\d+$/.test(name.slice(base.length + 1));
}

async function getUniqueEmbedId(userId: string, desiredName: string, excludeId?: string): Promise<string> {
  const { data, error } = await supabase
    .from('embed_instances')
    .select('id, embed_id')
    .eq('user_id', userId)
    .not('embed_id', 'is', null);
  if (error) throw new Error(error.message);

  const usedNames = new Set(
    (data ?? [])
      .filter((row) => row.id !== excludeId)
      .map((row) => typeof row.embed_id === 'string' ? row.embed_id.trim() : '')
      .filter(Boolean),
  );

  return buildUniqueEmbedId(desiredName, usedNames);
}

async function getNextNumericEmbedId(userId: string): Promise<string> {
  const { data, error } = await supabase
    .from('embed_instances')
    .select('embed_id')
    .eq('user_id', userId);
  if (error) throw new Error(error.message);

  const maxNum = (data ?? [])
    .map((row) => parseInt(row.embed_id ?? '', 10))
    .filter((value) => Number.isFinite(value) && value > 0)
    .reduce((max, value) => Math.max(max, value), 0);

  return String(maxNum + 1);
}

const WIDGET_LABEL_RETRY_LIMIT = 5;

/** POST /api/embed-instances — called by beacon in embed HTML to register/refresh an instance */
export async function POST(req: NextRequest) {
  try {
    const { apiKey, embedId, widgetId, pageUrl } = await req.json();
    if (typeof apiKey !== 'string' || !apiKey) {
      return NextResponse.json({ error: 'Missing apiKey' }, { status: 400, headers: corsHeaders });
    }

    const hash = resolveKeyHash(apiKey);

    if (isRateLimited(hash)) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: corsHeaders });
    }

    const keyData = await lookupKey(hash);
    if (!keyData) return NextResponse.json({ error: 'Invalid key' }, { status: 401, headers: corsHeaders });

    const safeUrl      = typeof pageUrl === 'string' ? pageUrl.substring(0, 512) : '';
    const domainReject = await enforceDomainAllowlist(hash, keyData, safeUrl);
    if (domainReject) return domainReject;

    // instanceId = user-assigned embed name, or null if the widget has no name yet
    const instanceId   = typeof embedId === 'string'
      ? embedId.trim().substring(0, 64) || null
      : null;
    const safeWidgetId = sanitizeWidgetId(widgetId);
    const now          = new Date().toISOString();
    const uid          = keyData.user_id;

    const { data: orgMembership, error: orgError } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', uid)
      .eq('status', 'active')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (orgError) {
      return NextResponse.json({ error: orgError.message }, { status: 500, headers: corsHeaders });
    }
    const orgId = orgMembership?.organization_id ?? null;

    if (safeWidgetId) {
      // ── Widget-based path (Elementor / platform with a stable widget ID) ──────
      // The widget_id column uniquely identifies a physical widget on a page.
      // The upsert below is atomic once UNIQUE(user_id, widget_id) exists.

      const { data: existing, error: existingError } = await supabase
        .from('embed_instances')
        .select('id, embed_id, page_url, last_seen')
        .eq('user_id', uid)
        .eq('widget_id', safeWidgetId)
        .maybeSingle();
      if (existingError) {
        return NextResponse.json({ error: existingError.message }, { status: 500, headers: corsHeaders });
      }

      const oldEmbedId = ((existing?.embed_id as string | null) ?? '').trim();
      let newEmbedId = instanceId ?? oldEmbedId;

      if (!newEmbedId) {
        newEmbedId = await getNextNumericEmbedId(uid);
      } else if (existing?.id && instanceId !== null && newEmbedId !== oldEmbedId) {
        const { data: conflict, error: conflictError } = await supabase
          .from('embed_instances')
          .select('id')
          .eq('user_id', uid)
          .eq('embed_id', newEmbedId)
          .neq('id', existing.id)
          .maybeSingle();
        if (conflictError) {
          return NextResponse.json({ error: conflictError.message }, { status: 500, headers: corsHeaders });
        }
        if (conflict?.id) {
          newEmbedId = isGeneratedDuplicateName(oldEmbedId, newEmbedId)
            ? oldEmbedId
            : await getUniqueEmbedId(uid, newEmbedId, existing.id);
        }
      }

      if (
        existing?.id
        && newEmbedId === oldEmbedId
        && !shouldRefreshLastSeen(existing.last_seen, existing.page_url, safeUrl)
      ) {
        return NextResponse.json({ ok: true, skipped: true }, { headers: corsHeaders });
      }

      let savedEmbedId: string | null = null;
      for (let attempt = 0; attempt < WIDGET_LABEL_RETRY_LIMIT; attempt++) {
        const { data: saved, error: upsertError } = await supabase
          .from('embed_instances')
          .upsert(
            {
              user_id: uid,
              embed_id: newEmbedId,
              widget_id: safeWidgetId,
              page_url: safeUrl,
              last_seen: now,
              organization_id: orgId,
            },
            { onConflict: 'user_id,widget_id' },
          )
          .select('id, embed_id')
          .single();

        if (!upsertError) {
          savedEmbedId = saved.embed_id;
          break;
        }

        // The widget conflict itself is handled by ON CONFLICT. Retry only when
        // a different widget won the unique label concurrently.
        if (upsertError.code !== '23505') {
          return NextResponse.json({ error: upsertError.message }, { status: 500, headers: corsHeaders });
        }

        const { data: labelOwner, error: labelOwnerError } = await supabase
          .from('embed_instances')
          .select('id, widget_id')
          .eq('user_id', uid)
          .eq('embed_id', newEmbedId)
          .maybeSingle();
        if (labelOwnerError) {
          return NextResponse.json({ error: labelOwnerError.message }, { status: 500, headers: corsHeaders });
        }
        if (!labelOwner || labelOwner.widget_id === safeWidgetId) {
          return NextResponse.json({ error: upsertError.message }, { status: 500, headers: corsHeaders });
        }
        if (attempt === WIDGET_LABEL_RETRY_LIMIT - 1) {
          return NextResponse.json(
            { error: 'Could not allocate a unique embed label' },
            { status: 409, headers: corsHeaders },
          );
        }

        newEmbedId = instanceId === null && !oldEmbedId
          ? await getNextNumericEmbedId(uid)
          : await getUniqueEmbedId(uid, instanceId ?? oldEmbedId, existing?.id);
      }

      if (savedEmbedId === null) {
        return NextResponse.json({ error: 'Could not allocate a unique embed label' }, { status: 409, headers: corsHeaders });
      }

      // Cascade a true rename only after the widget row was saved.
      if (existing?.id && savedEmbedId !== oldEmbedId) {
        const [scheduleResult, selectionsResult] = await Promise.all([
          supabase
            .from('published_schedules')
            .update({ embed_target: savedEmbedId })
            .eq('user_id', uid)
            .eq('embed_target', oldEmbedId),
          supabase
            .from('user_selections')
            .update({ embed_target: savedEmbedId })
            .eq('user_id', uid)
            .eq('embed_target', oldEmbedId),
        ]);
        const cascadeError = scheduleResult.error ?? selectionsResult.error;
        if (cascadeError) {
          return NextResponse.json({ error: cascadeError.message }, { status: 500, headers: corsHeaders });
        }
      }
    } else if (instanceId === null) {
      // ── Legacy unnamed shortcode with no widget ID ───────────────────────────
      // Postgres UNIQUE (user_id, embed_id) does NOT catch NULL duplicates —
      // handle with explicit UPDATE-or-INSERT.
      const { data: existing, error: existingError } = await supabase
        .from('embed_instances')
        .select('id, page_url, last_seen')
        .eq('user_id', uid)
        .is('embed_id', null)
        .maybeSingle();
      if (existingError) {
        return NextResponse.json({ error: existingError.message }, { status: 500, headers: corsHeaders });
      }

      if (existing?.id) {
        if (!shouldRefreshLastSeen(existing.last_seen, existing.page_url, safeUrl)) {
          return NextResponse.json({ ok: true, skipped: true }, { headers: corsHeaders });
        }

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
      const { data: existing, error: existingError } = await supabase
        .from('embed_instances')
        .select('id, page_url, last_seen')
        .eq('user_id', uid)
        .eq('embed_id', instanceId)
        .maybeSingle();
      if (existingError) {
        return NextResponse.json({ error: existingError.message }, { status: 500, headers: corsHeaders });
      }

      if (existing?.id && !shouldRefreshLastSeen(existing.last_seen, existing.page_url, safeUrl)) {
        return NextResponse.json({ ok: true, skipped: true }, { headers: corsHeaders });
      }

      const { error } = await supabase.from('embed_instances').upsert(
        { user_id: uid, embed_id: instanceId, page_url: safeUrl, last_seen: now, organization_id: orgId },
        { onConflict: 'user_id,embed_id' },
      );
      if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders });
    }

    return NextResponse.json({ ok: true }, { headers: corsHeaders });
  } catch {
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

  // embed_id is always set for widget-based embeds (numeric "1","2",… or user label).
  // Only legacy null rows (old shortcode embeds) get a fallback auto-label.
  const labeled = (instances ?? []).map((inst, idx) => ({
    ...inst,
    widget_id: inst.widget_id ?? null,
    display_id: inst.embed_id ?? `#${idx + 1}`,
  }));
  const activeTargets = new Set(
    labeled
      .map((inst) => typeof inst.display_id === 'string' ? inst.display_id.trim() : '')
      .filter(Boolean),
  );

  const { data: publishedRows } = await supabase
    .from('published_schedules')
    .select('embed_target, published_at')
    .in('user_id', userIds)
    .not('embed_target', 'is', null)
    .order('published_at', { ascending: false })
    .limit(200);

  const publishedTargets: string[] = [];
  const seenPublishedTargets = new Set<string>();
  for (const row of publishedRows ?? []) {
    const target = typeof row.embed_target === 'string' ? row.embed_target.trim() : '';
    if (!target || seenPublishedTargets.has(target)) continue;
    if (!activeTargets.has(target)) continue;
    seenPublishedTargets.add(target);
    publishedTargets.push(target);
  }

  return NextResponse.json({ instances: labeled, publishedTargets }, {
    headers: {
      ...corsHeaders,
      // Session path (dashboard): never cache so renames/registers from
      // WordPress reflect immediately when the realtime hook refetches.
      // apiKey path (public, WordPress-consumed): allow a short shared cache.
      'Cache-Control': apiKey
        ? 'public, max-age=15, s-maxage=15, stale-while-revalidate=30'
        : 'no-store',
    },
  });
}

/** DELETE /api/embed-instances?embedId=NAME
 *  Removes a single embed instance row for the authenticated user.
 *  Pass embedId=__null__ to delete the unnamed (embed_id IS NULL) row.
 *  Pass embedId=__all__ to delete ALL embed instances (used by WordPress uninstall).
 *  Auth: session cookie OR raw sb_* account key.
 */
export async function DELETE(req: NextRequest) {
  const sessionCors = getSessionCorsHeaders(req);

  // Support session auth and raw account-key auth for server-to-server cleanup.
  // A public 64-hex embed token is present in page HTML and can never DELETE.
  let userId: string;
  let authedViaApiKey = false;
  let authedWithRawKey = false;
  const apiKey = req.nextUrl.searchParams.get('apiKey');
  if (apiKey) {
    if (!apiKey.startsWith('sb_')) {
      return NextResponse.json(
        { error: 'DELETE requires the account API key or a dashboard session' },
        { status: 403, headers: corsHeaders },
      );
    }
    authedWithRawKey = apiKey.startsWith('sb_');
    const hash = resolveKeyHash(apiKey);
    let keyData: KeyRecord | null;
    try {
      keyData = await lookupKey(hash);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Key lookup failed';
      return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders });
    }
    if (!keyData) return NextResponse.json({ error: 'Invalid key' }, { status: 401, headers: corsHeaders });
    if (isRateLimited(`del:${hash}`)) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: corsHeaders });
    }
    userId = keyData.user_id;
    authedViaApiKey = true;
  } else {
    const sessionClient = await createServerClient();
    const { data: { user }, error } = await sessionClient.auth.getUser();
    if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: sessionCors });
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: sessionCors });
    userId = user.id;
  }

  const rawWidgetId = req.nextUrl.searchParams.get('widgetId');
  const safeWidgetId = sanitizeWidgetId(rawWidgetId);
  const rawId = req.nextUrl.searchParams.get('embedId');

  if (safeWidgetId) {
    const { data: inst, error: instanceError } = await supabase
      .from('embed_instances')
      .select('id, embed_id')
      .eq('user_id', userId)
      .eq('widget_id', safeWidgetId)
      .maybeSingle();
    if (instanceError) {
      return NextResponse.json({ error: instanceError.message }, { status: 500, headers: apiKey ? corsHeaders : sessionCors });
    }
    if (!inst) {
      // Nothing registered under this widgetId — treat as success
      return NextResponse.json({ ok: true }, { headers: apiKey ? corsHeaders : sessionCors });
    }

    const { error: deleteError } = await supabase
      .from('embed_instances')
      .delete()
      .eq('user_id', userId)
      .eq('id', inst.id);
    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500, headers: apiKey ? corsHeaders : sessionCors });
    }

    // All callers here are trusted: session or raw account key.
    if (authedWithRawKey || !authedViaApiKey) {
      const selDeleteQuery = supabase
        .from('user_selections')
        .delete()
        .eq('user_id', userId);

      if (inst.embed_id === null) {
        const { error } = await selDeleteQuery.is('embed_target', null);
        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500, headers: apiKey ? corsHeaders : sessionCors });
        }
      } else {
        const { error } = await selDeleteQuery.eq('embed_target', inst.embed_id);
        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500, headers: apiKey ? corsHeaders : sessionCors });
        }
      }
    }

    return NextResponse.json({ ok: true }, { headers: apiKey ? corsHeaders : sessionCors });
  }

  if (rawId === null) {
    return NextResponse.json({ error: 'Missing embedId param' }, { status: 400, headers: apiKey ? corsHeaders : sessionCors });
  }

  const orgMemberIds = await getOrgMemberIds(userId);

  // Deletes by embed name (or the unnamed row) are destructive to account
  // configuration — the public embed token alone is never enough.
  if (authedViaApiKey && !authedWithRawKey) {
    return NextResponse.json(
      { error: 'This operation requires the account API key or a dashboard session' },
      { status: 403, headers: corsHeaders },
    );
  }

  const headers = apiKey ? corsHeaders : sessionCors;

  // '__all__' sentinel: delete ALL embed instances + related data for this org/user.
  // Requires session auth — a compromised API key must not be able to wipe everything.
  if (rawId === '__all__') {
    if (authedViaApiKey) {
      return NextResponse.json({ error: 'Session authentication required for bulk delete' }, { status: 403, headers: sessionCors });
    }
    const results = await Promise.all([
      supabase.from('embed_instances').delete().in('user_id', orgMemberIds),
      supabase.from('published_schedules').delete().in('user_id', orgMemberIds),
      supabase.from('user_selections').delete().in('user_id', orgMemberIds),
    ]);
    const error = results.find((result) => result.error)?.error;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500, headers });
    }
    return NextResponse.json({ ok: true }, { headers });
  }

  // '__null__' is the sentinel for the unnamed (NULL embed_id) row
  const instanceId = rawId === '__null__' ? null : rawId;

  // Delete embed instance row
  const query = supabase
    .from('embed_instances')
    .delete()
    .in('user_id', orgMemberIds);

  const { error: deleteError } = instanceId === null
    ? await query.is('embed_id', null)
    : await query.eq('embed_id', instanceId);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500, headers });
  }

  // NOTE: published_schedules is intentionally NOT cascade-deleted here.
  // Published schedules are managed separately through the explicit
  // "Clear Schedule" action (/api/delete-schedule).

  // Also clean up saved user selections for this embed target so stale rows
  // don't accumulate in user_selections after the embed is removed.
  const selDeleteQuery = supabase
    .from('user_selections')
    .delete()
    .in('user_id', orgMemberIds);

  const { error: selectionError } = instanceId === null
    ? await selDeleteQuery.is('embed_target', null)
    : await selDeleteQuery.eq('embed_target', instanceId);
  if (selectionError) {
    return NextResponse.json({ error: selectionError.message }, { status: 500, headers });
  }

  return NextResponse.json({ ok: true }, { headers });
}
