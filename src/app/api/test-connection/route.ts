import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Server-side API route to test WordPress connection.
 * Uses server-side env vars only — credentials never reach the browser.
 */
export async function GET(_req: NextRequest) {
  void _req;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });

  const siteUrl = process.env.WP_SITE_URL || '';
  const username = process.env.WP_USERNAME;
  const appPassword = process.env.WP_APP_PASSWORD;

  if (!username || !appPassword) {
    return NextResponse.json(
      {
        ok: false,
        message:
          'WordPress credentials not configured. Add WP_USERNAME and WP_APP_PASSWORD to .env.local on the server.',
      },
      { status: 200 }
    );
  }

  try {
    const credentials = Buffer.from(`${username}:${appPassword}`).toString(
      'base64'
    );

    const res = await fetch(`${siteUrl}/wp-json/wp/v2/pages/327`, {
      headers: { Authorization: `Basic ${credentials}` },
    });

    if (res.ok) {
      return NextResponse.json({
        ok: true,
        message: 'Connection successful!',
        configured: true,
      });
    }

    // Generic error — don't leak specific HTTP status codes or WordPress internals
    console.error('[test-connection] WordPress responded with status:', res.status);
    return NextResponse.json({
      ok: false,
      message: 'Connection failed — verify your WordPress site URL, credentials, and plugin installation.',
      configured: true,
    });
  } catch (err) {
    console.error('[test-connection] Connection error:', err instanceof Error ? err.message : 'Unknown error');
    return NextResponse.json({
      ok: false,
      message: 'Could not reach the WordPress site. Check the URL and try again.',
      configured: true,
    });
  }
}
