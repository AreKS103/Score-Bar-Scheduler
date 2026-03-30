import { type NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

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
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const token = searchParams.get('token');
  const site = searchParams.get('site');
  const status = searchParams.get('status') ?? 'authorized';

  const origin = req.nextUrl.origin;

  if (!token || !site) {
    return NextResponse.redirect(
      `${origin}/schedule?wp_error=missing_params`,
    );
  }

  if (status === 'denied') {
    return NextResponse.redirect(
      `${origin}/schedule?wp_error=denied`,
    );
  }

  try {
    const supabase = createServiceClient(supabaseUrl, supabaseKey);

    // Find the user by their key_hash and update connected_site
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
