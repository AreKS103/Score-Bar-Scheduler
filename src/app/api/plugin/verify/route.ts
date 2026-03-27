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
  const origin = req?.headers.get('origin') ?? '*';
  return {
    'Access-Control-Allow-Origin': origin,
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

    // Resolve the key to its DB hash using the same logic as embed-instances
    const hash = resolveKeyHash(apiKey);

    // ── Step 1: Try to find user by the resolved hash ─────────────────────
    const { data: keyData } = await supabase
      .from('user_api_keys')
      .select('user_id')
      .eq('key_hash', hash)
      .maybeSingle();

    let userId: string | null = keyData?.user_id ?? null;
    let foundByHash = userId !== null;

    // ── Step 2: Key not found by hash — try by siteUrl (handles key
    //    regeneration where WordPress still holds the old token but the
    //    user has pasted a new key; DB row exists but hash is stale) ───────
    if (!userId && siteUrl) {
      const { data: siteData } = await supabase
        .from('user_api_keys')
        .select('user_id')
        .eq('connected_site', siteUrl)
        .maybeSingle();
      userId = siteData?.user_id ?? null;
    }

    if (!userId) {
      return NextResponse.json({ error: 'Invalid API Key' }, { status: 401, headers: corsHeaders });
    }

    // ── Step 3: Sync DB — only update key_hash when the user was found by
    //    their own valid hash (Step 1). If found via siteUrl fallback (Step 2),
    //    do NOT overwrite key_hash — an unverified caller must not be able to
    //    replace a victim's stored hash with their own key. ──────────────────
    const updatePayload: Record<string, string> = {
      updated_at: new Date().toISOString(),
    };
    if (foundByHash) updatePayload.key_hash = hash;
    if (siteUrl) updatePayload.connected_site = siteUrl;

    const { error: updateErr } = await supabase
      .from('user_api_keys')
      .update(updatePayload)
      .eq('user_id', userId);

    if (updateErr) {
      console.error('[verify] Failed to update key_hash:', updateErr);
      // Non-fatal: still return success so WordPress can save the token.
    }

    // Return the key_hash as embedToken — this is safe to expose in iframe URLs
    // because a SHA-256 hash cannot be reversed to recover the original API key.
    return NextResponse.json({ ok: true, message: 'Connected successfully', embedToken: hash }, { headers: corsHeaders });
  } catch (error) {
    console.error('[plugin/verify] error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: getCorsHeaders(req) }
    );
  }
}
