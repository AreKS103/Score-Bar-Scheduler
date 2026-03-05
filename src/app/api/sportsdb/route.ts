import { NextRequest, NextResponse } from 'next/server';

const SPORTSDB_ORIGIN = 'https://www.thesportsdb.com/api/v1/json/3';

/**
 * Server-side proxy for TheSportsDB to avoid CORS issues in the browser.
 * Usage: GET /api/sportsdb?path=eventsseason.php%3Fid%3D4793%26s%3D2025-2026
 *
 * Cache strategy: no-store on the upstream fetch so each request is fresh.
 * Successful responses get a short Cache-Control for the client.
 * Error responses (especially 429) are never cached.
 */
export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get('path');
  if (!path) {
    return NextResponse.json({ error: 'Missing path param' }, { status: 400 });
  }

  try {
    const upstream = `${SPORTSDB_ORIGIN}/${path}`;
    const res = await fetch(upstream, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ScoreAdmin/1.0)' },
      cache: 'no-store',
    });

    if (!res.ok) {
      // Never cache error / rate-limit responses
      return NextResponse.json(
        { events: null },
        {
          status: res.status,
          headers: { 'Cache-Control': 'no-store' },
        }
      );
    }

    const data = await res.json();
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
    });
  } catch (err) {
    console.error('[sportsdb proxy] fetch error:', err);
    return NextResponse.json({ events: null }, { status: 500 });
  }
}
