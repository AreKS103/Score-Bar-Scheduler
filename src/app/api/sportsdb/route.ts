import { NextRequest, NextResponse } from 'next/server';
import { rateLimitedFetch, getRateLimitStatus } from '@/lib/rate-limiter';

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

  // Check rate limit status before making request
  const status = getRateLimitStatus('sportsdb');
  if (!status.canRequest && status.requestsRemaining === 0) {
    console.log(`[sportsdb proxy] rate limited - waiting ${status.windowResetMs}ms`);
    return NextResponse.json(
      { events: null, rateLimited: true, retryAfter: Math.ceil(status.windowResetMs / 1000) },
      {
        status: 429,
        headers: { 
          'Cache-Control': 'no-store',
          'Retry-After': String(Math.ceil(status.windowResetMs / 1000))
        },
      }
    );
  }

  try {
    const upstream = `${SPORTSDB_ORIGIN}/${path}`;
    
    // Use rate-limited fetch
    const data = await rateLimitedFetch('sportsdb', async () => {
      const res = await fetch(upstream, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ScoreAdmin/1.0)' },
        cache: 'no-store',
      });

      if (!res.ok) {
        if (res.status === 429) {
          throw new Error('RATE_LIMITED');
        }
        throw new Error(`HTTP ${res.status}`);
      }

      return res.json();
    });

    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
    });
  } catch (err) {
    const error = err as Error;
    if (error.message === 'RATE_LIMITED') {
      return NextResponse.json(
        { events: null, rateLimited: true },
        {
          status: 429,
          headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' },
        }
      );
    }
    console.error('[sportsdb proxy] fetch error:', err);
    return NextResponse.json({ events: null }, { status: 500 });
  }
}
