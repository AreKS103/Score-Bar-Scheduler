import { NextRequest, NextResponse } from 'next/server';

/**
 * Server-side API route to test WordPress connection.
 * Uses server-side env vars only — credentials never reach the browser.
 */
export async function GET(req: NextRequest) {
  const siteUrl = process.env.WP_SITE_URL || 'https://scorekh.com';
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

    if (res.status === 401) {
      return NextResponse.json({
        ok: false,
        message: 'Authentication failed — check WP_USERNAME and WP_APP_PASSWORD in .env.local.',
        configured: true,
      });
    }

    if (res.status === 404) {
      return NextResponse.json({
        ok: false,
        message: 'Page 327 not found — check your WordPress setup.',
        configured: true,
      });
    }

    return NextResponse.json({
      ok: false,
      message: `Unexpected response: ${res.status} ${res.statusText}`,
      configured: true,
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      message: `Connection error: ${err instanceof Error ? err.message : 'Unknown error'}`,
      configured: true,
    });
  }
}
