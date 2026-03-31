import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUserOrgId } from '@/lib/supabase/org';
import crypto from 'crypto';

// Rate limiter: 5 requests per 60s per user
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;
const userRequests = new Map<string, number[]>();

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const timestamps = (userRequests.get(userId) ?? []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  timestamps.push(now);
  userRequests.set(userId, timestamps);
  return timestamps.length > RATE_LIMIT_MAX;
}

/**
 * POST /api/wp-connect/initiate
 *
 * Initiates the WordPress connection flow:
 * 1. Validates the site URL
 * 2. Generates an API key if user doesn't have one
 * 3. Constructs the redirect URL to the WP plugin's auth page
 *
 * Body: { siteUrl: string }
 * Returns: { redirectUrl: string } or { error: string }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limit per user
    if (isRateLimited(user.id)) {
      console.warn('[wp-connect/initiate] Rate limited user:', user.id);
      return NextResponse.json(
        { error: 'Too many connection attempts. Please wait a minute and try again.' },
        { status: 429 },
      );
    }

    console.log('[wp-connect/initiate] User:', user.id, 'starting connection flow');

    const body = await req.json();
    const rawUrl = body?.siteUrl;

    if (!rawUrl || typeof rawUrl !== 'string') {
      return NextResponse.json(
        { error: 'Missing siteUrl in request body.' },
        { status: 400 },
      );
    }

    // Validate & normalize URL
    const siteUrl = rawUrl.trim().replace(/\/+$/, '');
    let parsed: URL;
    try {
      parsed = new URL(siteUrl);
    } catch {
      return NextResponse.json(
        { error: 'Invalid URL format.' },
        { status: 400 },
      );
    }

    // Only allow http(s) schemes
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return NextResponse.json(
        { error: 'URL must use http or https.' },
        { status: 400 },
      );
    }

    // Ensure user has an API key; generate one if not
    const { data: existingKey } = await supabase
      .from('user_api_keys')
      .select('key_hash, key_preview')
      .eq('user_id', user.id)
      .maybeSingle();

    let keyHash = existingKey?.key_hash;

    if (!keyHash) {
      // Auto-generate a key for the user
      console.log('[wp-connect/initiate] No existing key, generating new one');
      const orgId = await getUserOrgId(user.id);
      const randomBytes = crypto.randomBytes(24).toString('hex');
      const plainKey = 'sb_live_' + randomBytes;
      keyHash = crypto.createHash('sha256').update(plainKey).digest('hex');
      const preview =
        'sb_live_***************************' + plainKey.slice(-4);

      const { error: insertErr } = await supabase
        .from('user_api_keys')
        .upsert(
          {
            user_id: user.id,
            key_hash: keyHash,
            key_preview: preview,
            connected_site: null,
            organization_id: orgId,
          },
          { onConflict: 'user_id' },
        );

      if (insertErr) {
        console.error('[wp-connect/initiate] Key generation failed:', insertErr);
        return NextResponse.json(
          { error: 'Failed to prepare connection. Please try again.' },
          { status: 500 },
        );
      }
    }

    // Build the redirect URL.
    // The WP plugin registers an auth endpoint at:
    //   {siteUrl}/wp-json/scorebar/v1/connect
    // We pass along a callback URL and the embed token (key hash)
    // so WP can verify and store the connection.
    const callbackUrl = new URL('/api/wp-callback', req.nextUrl.origin);
    callbackUrl.searchParams.set('token', keyHash);
    callbackUrl.searchParams.set('site', siteUrl);

    const redirectUrl = new URL(
      '/wp-json/scorebar/v1/connect',
      siteUrl,
    );
    redirectUrl.searchParams.set('callback', callbackUrl.toString());
    redirectUrl.searchParams.set('token', keyHash);

    console.log('[wp-connect/initiate] Redirect URL constructed for site:', siteUrl, '→', redirectUrl.hostname);

    return NextResponse.json({ redirectUrl: redirectUrl.toString() });
  } catch (error) {
    console.error('[wp-connect/initiate] error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
