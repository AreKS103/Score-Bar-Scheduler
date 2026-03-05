import { NextRequest, NextResponse } from 'next/server';

/**
 * Clears the published schedule on WordPress by posting an empty HTML string.
 */
export async function POST(req: NextRequest) {
  try {
    const siteUrl = process.env.WP_SITE_URL || 'https://scorekh.com';
    const username = process.env.WP_USERNAME;
    const appPassword = process.env.WP_APP_PASSWORD;

    if (!username || !appPassword) {
      return NextResponse.json(
        { error: 'WordPress credentials not configured.' },
        { status: 500 }
      );
    }

    const credentials = Buffer.from(`${username}:${appPassword}`).toString('base64');

    const wpResponse = await fetch(`${siteUrl}/wp-json/score/v1/schedule`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${credentials}`,
      },
      body: JSON.stringify({ html: '' }),
    });

    if (!wpResponse.ok) {
      return NextResponse.json(
        { error: `WordPress returned ${wpResponse.status}` },
        { status: wpResponse.status }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
