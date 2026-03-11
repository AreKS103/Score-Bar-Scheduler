import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/** Maximum HTML payload size (500 KB) — prevents abuse */
const MAX_BODY_BYTES = 512_000;

/**
 * Server-side API route that proxies the WP publish request.
 * WordPress credentials are stored in server-side env vars (never exposed to the browser).
 *
 * Required env vars in .env.local:
 *   WP_SITE_URL=https://scorekh.com
 *   WP_USERNAME=your_wp_username
 *   WP_APP_PASSWORD=xxxx xxxx xxxx xxxx xxxx xxxx
 */
export async function POST(req: NextRequest) {
  try {
    // Require authenticated session
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // Validate content type
    const ct = req.headers.get('content-type') ?? '';
    if (!ct.includes('application/json')) {
      return NextResponse.json(
        { error: 'Content-Type must be application/json' },
        { status: 415 }
      );
    }

    // Enforce size limit
    const contentLength = Number(req.headers.get('content-length') ?? 0);
    if (contentLength > MAX_BODY_BYTES) {
      return NextResponse.json(
        { error: 'Payload too large (max 500 KB)' },
        { status: 413 }
      );
    }

    const { html } = await req.json();

    if (!html || typeof html !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid HTML body' },
        { status: 400 }
      );
    }

    if (html.length > MAX_BODY_BYTES) {
      return NextResponse.json(
        { error: 'HTML content too large' },
        { status: 413 }
      );
    }

    const siteUrl = process.env.WP_SITE_URL || 'https://scorekh.com';
    const username = process.env.WP_USERNAME;
    const appPassword = process.env.WP_APP_PASSWORD;

    if (!username || !appPassword) {
      return NextResponse.json(
        {
          error:
            'WordPress credentials not configured. Add WP_USERNAME and WP_APP_PASSWORD to .env.local on the server.',
        },
        { status: 500 }
      );
    }

    const credentials = Buffer.from(`${username}:${appPassword}`).toString(
      'base64'
    );

    const wpResponse = await fetch(
      `${siteUrl}/wp-json/score/v1/schedule`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${credentials}`,
        },
        body: JSON.stringify({ html }),
      }
    );

    if (!wpResponse.ok) {
      let errMsg = `WordPress returned ${wpResponse.status}`;
      try {
        const err = await wpResponse.json();
        errMsg = err.message || errMsg;
      } catch {
        // could not parse error body
      }
      return NextResponse.json({ error: errMsg }, { status: wpResponse.status });
    }

    const result = await wpResponse.json();
    return NextResponse.json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Unknown server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
