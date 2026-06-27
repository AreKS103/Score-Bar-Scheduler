/**
 * Verification: Nations Championship fixtures from TheSportsDB round endpoints
 * cross-referenced against official anchor matchups.
 */
import {
  NATIONS_CHAMPIONSHIP_ANCHOR_FIXTURES,
  NATIONS_CHAMPIONSHIP_SPORTSDB_ID,
  nationsMatchupKey,
  stripRugbyTeamSuffix,
} from '../src/lib/nationsChampionship';

const SDB = 'https://www.thesportsdb.com/api/v1/json/123';

interface SdbEvent {
  idEvent: string;
  strHomeTeam?: string;
  strAwayTeam?: string;
  strEvent?: string;
  dateEvent: string;
  strVenue?: string;
  intRound?: string;
}

async function fetchRound(round: number, season = '2026', attempt = 0): Promise<SdbEvent[]> {
  const url = `${SDB}/eventsround.php?id=${NATIONS_CHAMPIONSHIP_SPORTSDB_ID}&r=${round}&s=${season}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'ScoreBarSchedule-Verify/1.0',
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      return fetchRound(round, season, attempt + 1);
    }
    return [];
  }
  const json = await res.json() as { events?: SdbEvent[] | null };
  const events = json.events ?? [];
  if (!events.length && attempt < 3) {
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    return fetchRound(round, season, attempt + 1);
  }
  return events;
}

function fightersFromEvent(event: SdbEvent): { home: string; away: string } {
  if (event.strHomeTeam && event.strAwayTeam) {
    return {
      home: stripRugbyTeamSuffix(event.strHomeTeam),
      away: stripRugbyTeamSuffix(event.strAwayTeam),
    };
  }
  const vs = (event.strEvent ?? '').split(/\s+vs\.?\s+/i);
  if (vs.length === 2) {
    return { home: stripRugbyTeamSuffix(vs[0]), away: stripRugbyTeamSuffix(vs[1]) };
  }
  return { home: '', away: '' };
}

async function main() {
  const all: SdbEvent[] = [];
  for (let round = 1; round <= 12; round++) {
    const events = await fetchRound(round);
    if (!events.length && round > 6) break;
    all.push(...events);
    await new Promise((r) => setTimeout(r, 300));
  }

  if (all.length < 28) {
    console.warn(
      `verify-nations-championship: only ${all.length} fixtures from SportsDB (rate limit or incomplete feed) — skipping live anchor check`,
    );
    return;
  }

  const byKey = new Map<string, SdbEvent>();
  for (const event of all) {
    const { home, away } = fightersFromEvent(event);
    if (!home || !away) continue;
    byKey.set(nationsMatchupKey(home, away), event);
  }

  for (const anchor of NATIONS_CHAMPIONSHIP_ANCHOR_FIXTURES) {
    const key = nationsMatchupKey(anchor.home, anchor.away);
    const match = byKey.get(key);
    if (!match) {
      throw new Error(`Missing anchor fixture: ${anchor.home} vs ${anchor.away} on ${anchor.date}`);
    }
    if (match.dateEvent !== anchor.date) {
      throw new Error(
        `Date mismatch for ${anchor.home} vs ${anchor.away}: expected ${anchor.date}, got ${match.dateEvent}`,
      );
    }
    if (anchor.venue && match.strVenue && !match.strVenue.toLowerCase().includes(anchor.venue.split(' ')[0].toLowerCase())) {
      console.warn(`Venue note: ${anchor.home} vs ${anchor.away} venue "${match.strVenue}" (expected ~${anchor.venue})`);
    }
  }

  console.log(`nations-championship-ok fixtures=${all.length} anchors=${NATIONS_CHAMPIONSHIP_ANCHOR_FIXTURES.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
