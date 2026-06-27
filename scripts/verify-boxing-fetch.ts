/**
 * Verification: Boxing league fetch via round endpoints + fight name parsing.
 */
import { parseSDBFightEvent } from '../src/lib/sportsdbCombat';

const BOXING_SPORTSDB_ID = '4445';
const SDB = 'https://www.thesportsdb.com/api/v1/json/123';
const HEADERS = {
  'User-Agent': 'ScoreBarSchedule-Verify/1.0',
  Accept: 'application/json',
};

interface SdbEvent {
  idEvent: string;
  strEvent: string;
  dateEvent: string;
  strVenue?: string;
}

async function sdbGet(path: string): Promise<SdbEvent[]> {
  const res = await fetch(`${SDB}/${path}`, { headers: HEADERS });
  if (!res.ok) return [];
  const json = await res.json() as { events?: SdbEvent[] | null };
  return json.events ?? [];
}

async function fetchBoxingEvents(): Promise<SdbEvent[]> {
  const seen = new Set<string>();
  const all: SdbEvent[] = [];
  const merge = (list: SdbEvent[]) => {
    for (const event of list) {
      if (!event?.idEvent || seen.has(event.idEvent)) continue;
      seen.add(event.idEvent);
      all.push(event);
    }
  };

  for (const season of ['2026', '2025']) {
    merge(await sdbGet(`eventsseason.php?id=${BOXING_SPORTSDB_ID}&s=${season}`));
    await new Promise((r) => setTimeout(r, 300));
    for (let round = 1; round <= 20; round++) {
      const events = await sdbGet(`eventsround.php?id=${BOXING_SPORTSDB_ID}&r=${round}&s=${season}`);
      if (!events.length) {
        if (round > 3) break;
        continue;
      }
      merge(events);
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  return all;
}

async function main() {
  const all = await fetchBoxingEvents();

  if (all.length < 5) {
    console.warn(
      `verify-boxing-fetch: only ${all.length} events from SportsDB (rate limit or outage) — skipping live check`,
    );
    return;
  }

  let parsedFights = 0;
  for (const event of all) {
    const { home, away } = parseSDBFightEvent(event.strEvent, BOXING_SPORTSDB_ID);
    if (!home) {
      throw new Error(`Failed to parse boxing bout: ${event.strEvent}`);
    }
    if (!away && !/champions|gala|card$/i.test(event.strEvent)) {
      throw new Error(`Expected away fighter for: ${event.strEvent}`);
    }
    parsedFights++;
  }

  const hasVsBout = all.some((e) => /\svs\.?\s/i.test(e.strEvent));
  if (!hasVsBout) {
    throw new Error('Expected at least one head-to-head boxing bout in feed');
  }

  console.log(`boxing-fetch-ok events=${all.length} parsed=${parsedFights}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
