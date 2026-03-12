import { NextResponse } from 'next/server';

/**
 * Diagnostic endpoint — tests UFC/MMA fetch from ESPN on Vercel.
 * Hit /api/debug-ufc to see if ESPN blocks Vercel's IP for MMA endpoints.
 * This endpoint is intentionally unauthenticated for quick debugging.
 * TODO: Remove or protect once diagnosed.
 */

const ESPN_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.espn.com/',
  'Origin': 'https://www.espn.com',
};

export async function GET() {
  const now = new Date();
  const start = now.toISOString().split('T')[0].replace(/-/g, '');
  const end = new Date(now.getTime() + 7 * 86400000).toISOString().split('T')[0].replace(/-/g, '');
  const dateRange = `${start}-${end}`;

  const results: Record<string, unknown> = { dateRange, timestamp: now.toISOString() };

  // Test UFC
  try {
    const url = `https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard?dates=${dateRange}&limit=1000`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(url, { signal: ctrl.signal, headers: ESPN_HEADERS, cache: 'no-store' });
    clearTimeout(timer);

    if (!res.ok) {
      results.ufc = { error: `HTTP ${res.status} ${res.statusText}`, headers: Object.fromEntries(res.headers.entries()) };
    } else {
      const data = await res.json();
      const events = data?.events ?? [];
      results.ufc = {
        status: 'ok',
        eventCount: events.length,
        events: events.map((e: { id: string; name?: string; date: string; competitions?: { date?: string; competitors?: { athlete?: { displayName?: string }; team?: { displayName?: string } }[] }[] }) => ({
          id: e.id,
          name: e.name,
          date: e.date,
          fightCount: e.competitions?.length ?? 0,
          firstFight: e.competitions?.[0]?.competitors?.map(c => c?.athlete?.displayName || c?.team?.displayName).join(' vs '),
          lastFight: e.competitions?.[e.competitions.length - 1]?.competitors?.map(c => c?.athlete?.displayName || c?.team?.displayName).join(' vs '),
        })),
      };
    }
  } catch (err) {
    results.ufc = { error: (err as Error).message };
  }

  // Test Bellator as comparison
  try {
    const url = `https://site.api.espn.com/apis/site/v2/sports/mma/bellator/scoreboard?dates=${dateRange}&limit=1000`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(url, { signal: ctrl.signal, headers: ESPN_HEADERS, cache: 'no-store' });
    clearTimeout(timer);

    if (!res.ok) {
      results.bellator = { error: `HTTP ${res.status}` };
    } else {
      const data = await res.json();
      results.bellator = { status: 'ok', eventCount: data?.events?.length ?? 0 };
    }
  } catch (err) {
    results.bellator = { error: (err as Error).message };
  }

  // Test a known working ESPN endpoint (soccer) as control
  try {
    const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard?dates=${dateRange}&limit=10`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(url, { signal: ctrl.signal, headers: ESPN_HEADERS, cache: 'no-store' });
    clearTimeout(timer);

    if (!res.ok) {
      results.eplControl = { error: `HTTP ${res.status}` };
    } else {
      const data = await res.json();
      results.eplControl = { status: 'ok', eventCount: data?.events?.length ?? 0 };
    }
  } catch (err) {
    results.eplControl = { error: (err as Error).message };
  }

  return NextResponse.json(results, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
