import { NextRequest, NextResponse } from 'next/server';

const SPORTSDB_ORIGIN = 'https://www.thesportsdb.com/api/v1/json/3';

/**
 * Server-side proxy for TheSportsDB to avoid CORS issues in the browser.
 * Usage: GET /api/sportsdb?path=eventsseason.php%3Fid%3D4793%26s%3D2025-2026
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
      next: { revalidate: 60 }, // cache for 60s
    });

    if (!res.ok) {
      return NextResponse.json({ events: null }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error('[sportsdb proxy] fetch error:', err);
    return NextResponse.json({ events: null }, { status: 500 });
  }
}
