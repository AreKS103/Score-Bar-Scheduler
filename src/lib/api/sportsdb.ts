import type { MatchEvent, SportsDBEvent } from '@/types';
import { SPORTS_CONFIG } from '@/lib/config';
import { sportsDBToICT } from '@/lib/timezone';

const SPORTSDB_BASE = 'https://www.thesportsdb.com/api/v1/json/3';

/**
 * Fetch events for a league season from TheSportsDB
 */
async function fetchLeagueSeason(
  leagueId: string,
  season: string
): Promise<SportsDBEvent[]> {
  try {
    const url = `${SPORTSDB_BASE}/eventsseason.php?id=${leagueId}&s=${season}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`TheSportsDB returned ${res.status}`);
    const data = await res.json();
    return data.events ?? [];
  } catch (err) {
    console.warn(`TheSportsDB fetch failed for league ${leagueId}:`, err);
    return [];
  }
}

/**
 * Parse fight event name into fighters and card name.
 * Handles: "UFC 326 Holloway vs Oliveira 2", "Canelo Alvarez vs Terence Crawford"
 */
function parseFightEvent(eventName: string): { fighter1: string; fighter2: string; cardName?: string } {
  let remaining = eventName;
  let cardName: string | undefined;

  // Extract card prefix: "UFC 326", "UFC Fight Night 271", "PFL 12", "Bellator 300"
  const cardPrefixMatch = remaining.match(
    /^(UFC\s+\d+|UFC\s+Fight\s+Night\s*\d*|PFL\s+\d+|Bellator\s+\d+)\s*/i
  );
  if (cardPrefixMatch) {
    cardName = cardPrefixMatch[1].trim();
    remaining = remaining.slice(cardPrefixMatch[0].length);
  }

  // Split by "vs" or "vs."
  const vsMatch = remaining.match(/^(.+?)\s+vs\.?\s+(.+)$/i);
  if (vsMatch) {
    return { fighter1: vsMatch[1].trim(), fighter2: vsMatch[2].trim(), cardName };
  }

  return { fighter1: eventName, fighter2: '', cardName };
}

/**
 * Convert a SportsDB event to our MatchEvent format
 */
function mapSportsDBEvent(
  event: SportsDBEvent,
  sportConfig: { id: string; label: string; category: string; logo: string }
): MatchEvent {
  const { date, time } = sportsDBToICT(
    event.dateEvent,
    event.strTime || '00:00:00'
  );

  let home = event.strHomeTeam || event.strEvent || 'TBD';
  let away = event.strAwayTeam || '';
  let leagueLabel = sportConfig.label;

  // For combat sports, parse fighters from event name (strHomeTeam/strAwayTeam are null)
  if (sportConfig.category === 'Combat Sports' && !event.strHomeTeam && event.strEvent) {
    const parsed = parseFightEvent(event.strEvent);
    home = parsed.fighter1;
    away = parsed.fighter2;
    if (parsed.cardName) leagueLabel = parsed.cardName;
  }

  return {
    id: `sportsdb-${event.idEvent}`,
    source: 'sportsdb' as const,
    sportId: sportConfig.id,
    category: sportConfig.category,
    leagueLabel,
    leagueLogo: sportConfig.logo,
    date,
    time,
    home,
    away,
    round: event.strRound || '',
    tags: [],
    isFeatured: false,
    isSelected: false,
  };
}

/**
 * Fetch events for a specific SportsDB-backed league within a date range
 */
export async function fetchSportsDBLeague(
  sportId: string,
  startDate: string,
  endDate: string
): Promise<MatchEvent[]> {
  const config = SPORTS_CONFIG.find((s) => s.id === sportId);
  if (!config || !config.sportsdbId) return [];

  const currentYear = new Date().getFullYear();
  // TheSportsDB uses different season formats.
  // Try current calendar year, current split-year season, next split-year season, and previous year
  // Note: Some leagues (e.g. Cambodia C-League) may have incomplete data for the current season
  // if SportsDB contributors haven't entered later rounds yet.
  const seasons = [
    `${currentYear}`,
    `${currentYear - 1}-${currentYear}`,
    `${currentYear + 1}`,
    `${currentYear}-${currentYear + 1}`,
  ];

  let allEvents: SportsDBEvent[] = [];
  for (const season of seasons) {
    const events = await fetchLeagueSeason(config.sportsdbId, season);
    allEvents = [...allEvents, ...events];
  }

  // Deduplicate by event ID
  const seen = new Set<string>();
  allEvents = allEvents.filter((e) => {
    if (seen.has(e.idEvent)) return false;
    seen.add(e.idEvent);
    return true;
  });

  // Map and filter to date range
  return allEvents
    .map((e) => mapSportsDBEvent(e, config))
    .filter((e) => e.date >= startDate && e.date <= endDate);
}

/**
 * Fetch all SportsDB-backed leagues in parallel
 */
export async function fetchAllSportsDBLeagues(
  startDate: string,
  endDate: string
): Promise<{ sportId: string; events: MatchEvent[]; error?: string }[]> {
  const sportsDBSports = SPORTS_CONFIG.filter(
    (s) => s.sportsdbId !== undefined
  );

  const results = await Promise.allSettled(
    sportsDBSports.map(async (sport) => {
      const events = await fetchSportsDBLeague(
        sport.id,
        startDate,
        endDate
      );
      return { sportId: sport.id, events };
    })
  );

  return results.map((result, i) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }
    return {
      sportId: sportsDBSports[i].id,
      events: [],
      error: result.reason?.message || 'Unknown error',
    };
  });
}
