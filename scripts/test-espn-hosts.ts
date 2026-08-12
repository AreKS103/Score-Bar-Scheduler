/* eslint-disable no-console */
// Temporary smoke test for the multi-host ESPN fetcher (runs the exact
// production code path used by /api/events on Vercel).
import { fetchEspnEvents } from '../src/lib/api/espnHosts';

async function main() {
  const start = '2026-08-11';
  const end = '2026-08-17';
  const slugs = [
    'soccer/eng.1',
    'basketball/nba',
    'football/nfl',
    'baseball/mlb',
    'hockey/nhl',
    'rugby-league/3',
    'mma/ufc',
    'golf/pga',
    'tennis/atp',
    'racing/f1',
    'australian-football/afl',
    'basketball/mens-college-basketball',
  ];

  for (const slug of slugs) {
    const t0 = Date.now();
    const res = await fetchEspnEvents(slug, start, end);
    const ms = Date.now() - t0;
    if (!res) {
      console.log(`${slug.padEnd(40)} FAIL (${ms}ms)`);
      continue;
    }
    const sample = res.events[0];
    const comp = sample?.competitions?.[0];
    const names = (comp?.competitors ?? []).map((c) => c.team?.displayName ?? c.athlete?.displayName ?? '?').join(' vs ');
    console.log(
      `${slug.padEnd(40)} ${res.host.padEnd(5)} ${String(res.events.length).padStart(3)} events (${ms}ms)` +
      (sample ? ` | e.g. ${sample.name ?? ''} @ ${sample.date}${names ? ` | ${names}` : ''}` : '') +
      (res.tournamentOnly ? ' | tournament-only' : ''),
    );
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
