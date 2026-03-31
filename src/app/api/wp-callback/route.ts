import { type NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * GET /api/wp-callback
 *
 * Called by the WordPress plugin after the user authorizes the connection.
 * Query params:
 *   - token: the key_hash (embed token)
 *   - site:  the WordPress site URL
 *   - status: "authorized" (success) or "denied"
 *
 * On success, updates the connected_site in user_api_keys and
 * redirects the user back to the onboarding connect page.
 *
 * Security: Requires active user session + token must belong to that user.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const token = searchParams.get('token');
  const site = searchParams.get('site');
  const status = searchParams.get('status') ?? 'authorized';

  const origin = req.nextUrl.origin;

  if (!token || !site) {
    console.warn('[wp-callback] Missing params — token:', !!token, 'site:', !!site);
    return NextResponse.redirect(
      `${origin}/schedule?wp_error=missing_params`,
    );
  }

  // Validate token format: must be exactly 64 lowercase hex characters
  if (!/^[0-9a-f]{64}$/.test(token)) {
    console.warn('[wp-callback] Invalid token format');
    return NextResponse.redirect(
      `${origin}/schedule?wp_error=invalid_token`,
    );
  }

  if (status === 'denied') {
    console.warn('[wp-callback] Connection denied by WordPress site');
    return NextResponse.redirect(
      `${origin}/schedule?wp_error=denied`,
    );
  }

  try {
    console.log('[wp-callback] Processing callback for site:', site);

    // CSRF protection: require active user session
    const userSupabase = await createClient();
    const { data: { user } } = await userSupabase.auth.getUser();
    if (!user) {
      console.warn('[wp-callback] No active session — possible CSRF or expired session');
      return NextResponse.redirect(
        `${origin}/login?redirect=${encodeURIComponent(`/schedule?wp_error=session_expired`)}`,
      );
    }

    const supabase = createServiceClient(supabaseUrl, supabaseKey);

    // Find the user by their key_hash and verify ownership
    const { data: keyData, error: findErr } = await supabase
      .from('user_api_keys')
      .select('user_id')
      .eq('key_hash', token)
      .maybeSingle();

    if (findErr || !keyData) {
      console.error('[wp-callback] Key not found:', findErr);
      return NextResponse.redirect(
        `${origin}/schedule?wp_error=invalid_token`,
      );
    }

    // Verify the token belongs to the logged-in user (prevents cross-user attacks)
    if (keyData.user_id !== user.id) {
      console.warn('[wp-callback] Token does not belong to authenticated user');
      return NextResponse.redirect(
        `${origin}/schedule?wp_error=invalid_token`,
      );
    }

    // Normalize site URL
    const siteUrl = site.trim().replace(/\/+$/, '');

    const { error: updateErr } = await supabase
      .from('user_api_keys')
      .update({
        connected_site: siteUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('key_hash', token);

    if (updateErr) {
      console.error('[wp-callback] Failed to update connection:', updateErr);
      return NextResponse.redirect(
        `${origin}/schedule?wp_error=update_failed`,
      );
    }

    console.log('[wp-callback] Connection completed successfully for site:', siteUrl);

    // Redirect back to schedule with success
    return NextResponse.redirect(
      `${origin}/schedule?wp_connected=true&site=${encodeURIComponent(siteUrl)}`,
    );
  } catch (error) {
    console.error('[wp-callback] error:', error);
    return NextResponse.redirect(
      `${origin}/schedule?wp_error=internal`,
    );
  }
}
