import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// We use service role here so the WordPress plugin can verify without standard auth headers
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Simple IP-based rate limiter: 10 requests per 60 seconds per IP
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;
const ipRequests = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = (ipRequests.get(ip) ?? []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  timestamps.push(now);
  ipRequests.set(ip, timestamps);
  return timestamps.length > RATE_LIMIT_MAX;
}

function getCorsHeaders(req?: NextRequest): Record<string, string> {
  const origin = req?.headers.get('origin') ?? '';
  // Reflect only http(s) origins — never echo arbitrary Origin values.
  const safeOrigin = /^https?:\/\/[^\s/]+$/i.test(origin) ? origin : '';
  return {
    'Access-Control-Allow-Origin': safeOrigin || 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

function hashKey(raw: string): string {
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

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(req) });
}

export async function POST(req: NextRequest) {
  const corsHeaders = getCorsHeaders(req);

  // Rate limit by IP
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: corsHeaders }
    );
  }

  try {
    const { apiKey, siteUrl } = await req.json();

    if (!apiKey) {
      return NextResponse.json({ error: 'Missing API Key' }, { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Resolve the key to its DB hash using the same logic as embed-instances.
    // IMPORTANT: never authenticate by connected_site alone — knowing a public
    // WordPress URL must not be enough to obtain that account's embedToken.
    const hash = resolveKeyHash(apiKey);

    const { data: keyData } = await supabase
      .from('user_api_keys')
      .select('user_id, key_hash')
      .eq('key_hash', hash)
      .maybeSingle();

    if (!keyData?.user_id || !keyData.key_hash) {
      return NextResponse.json({ error: 'Invalid API Key' }, { status: 401, headers: corsHeaders });
    }

    // Only the raw sb_live_* key may mutate account fields (connected_site,
    // key_hash re-sync). The public embed token (64-hex) is in every embedded
    // page's HTML — accepting it here would let anyone repoint connected_site.
    const isRawKey = apiKey.startsWith('sb_');

    if (isRawKey) {
      const updatePayload: Record<string, string> = {
        updated_at: new Date().toISOString(),
      };
      // Keep hash in sync (idempotent when already correct).
      updatePayload.key_hash = hash;
      if (typeof siteUrl === 'string' && siteUrl.trim()) {
        const normalized = siteUrl.trim().replace(/\/+$/, '');
        if (/^https?:\/\/[^\s]+$/i.test(normalized) && normalized.length <= 500) {
          updatePayload.connected_site = normalized;
        }
      }

      const { error: updateErr } = await supabase
        .from('user_api_keys')
        .update(updatePayload)
        .eq('user_id', keyData.user_id);

      if (updateErr) {
        console.error('[verify] Failed to update key_hash:', updateErr);
        // Non-fatal: still return success so WordPress can save the token.
      }
    }

    const embedToken = keyData.key_hash;
    if (!/^[0-9a-f]{64}$/.test(embedToken)) {
      return NextResponse.json(
        { error: 'Connection found, but no valid embed token is stored. Reconnect WordPress from the Scorebar setup wizard.' },
        { status: 409, headers: corsHeaders }
      );
    }

    // Return the key_hash as embedToken — safe in iframe URLs (not reversible to sb_live_*).
    return NextResponse.json({ ok: true, message: 'Connected successfully', embedToken }, { headers: corsHeaders });
  } catch (error) {
    console.error('[plugin/verify] error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: getCorsHeaders(req) }
    );
  }
}
