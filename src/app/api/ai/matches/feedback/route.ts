import { NextRequest, NextResponse } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 10;

// Light rate limit — feedback writes are best-effort and called from the
// client on Add-to-schedule. 120/min/IP is plenty for normal use and stops
// runaway loops.
const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(120, '1 m'),
  analytics: false,
  prefix: 'ai-feedback',
});

function getClientIP(request: NextRequest): string {
  return (
    request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'anonymous'
  );
}

const ALLOWED_FILTER_TYPES = new Set(['today', 'week', 'month', 'all', 'custom']);

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    const { success } = await ratelimit.limit(ip);
    if (!success) return NextResponse.json({ ok: true }, { status: 202 });

    const body = await request.json().catch(() => null) as {
      filterType?: string;
      scanMode?: boolean;
      timezone?: string;
      modelId?: string;
      shownIds?: unknown;
      acceptedIds?: unknown;
      cacheHit?: boolean;
    } | null;
    if (!body) return NextResponse.json({ ok: true }, { status: 202 });

    const filterType = ALLOWED_FILTER_TYPES.has(body.filterType ?? '')
      ? (body.filterType as string)
      : 'custom';

    // Sanitise ID arrays — cap length so a buggy client can't bloat the row.
    const toIds = (v: unknown): string[] => {
      if (!Array.isArray(v)) return [];
      return v
        .filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 256)
        .slice(0, 500);
    };
    const shownIds = toIds(body.shownIds);
    const acceptedIds = toIds(body.acceptedIds);

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: true }, { status: 202 });

    await supabase.from('ai_recommendation_feedback').insert({
      user_id: user.id,
      filter_type: filterType,
      scan_mode: Boolean(body.scanMode),
      timezone: typeof body.timezone === 'string' ? body.timezone.slice(0, 64) : null,
      model_id: typeof body.modelId === 'string' ? body.modelId.slice(0, 128) : null,
      shown_ids: shownIds,
      accepted_ids: acceptedIds,
      cache_hit: Boolean(body.cacheHit),
    });

    return NextResponse.json({ ok: true });
  } catch {
    // Best-effort: never fail the user-facing flow because of feedback.
    return NextResponse.json({ ok: true }, { status: 202 });
  }
}
