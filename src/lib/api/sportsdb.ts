import type { MatchEvent, SportsDBEvent } from '@/types';
import { SPORTS_CONFIG } from '@/lib/config';
import { sportsDBToICT } from '@/lib/timezone';

/**
 * Build a URL that routes through our server-side proxy to avoid CORS.
 * The proxy at /api/sportsdb forwards to TheSportsDB server-side.
 */
function sportsdbUrl(endpoint: string): string {
  return `/api/sportsdb?path=${encodeURIComponent(endpoint)}`;
}

/** Small delay helper to avoid hitting TheSportsDB rate limits */
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch with retry on HTTP 429 (rate limit).
 * Retries up to `maxRetries` times with exponential backoff.
 */
async function fetchWithRetry(
  url: string,
  maxRetries = 2,
  baseDelayMs = 1500
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url);
    if (res.status === 429 && attempt < maxRetries) {
      const waitMs = baseDelayMs * Math.pow(2, attempt);
      console.warn(
        `[SportsDB] 429 rate-limited → retrying in ${waitMs}ms (attempt ${attempt + 1}/${maxRetries})`
      );
      await wait(waitMs);
      continue;
    }
    return res;
  }
  // Fallback (shouldn't happen)
  return fetch(url);
}

/**
 * Determine the 2 most likely season formats for the current date.
 *
 * Most leagues use either:
 * - Single year: "2026" (Jan–Dec seasons like NRL, NBL)
 * - Split year: "2025-2026" (seasons spanning two years like CPL, European leagues)
 *
 * Before July → "YYYY" + "YYYY-1–YYYY"
 * After June  → "YYYY" + "YYYY–YYYY+1"
 */
function getSmartSeasons(): string[] {
  const year = new Date().getFullYear();
  const month = new Date().getMonth() + 1;
  if (month <= 6) {
    return [`${year}`, `${year - 1}-${year}`];
  }
  return [`${year}`, `${year}-${year + 1}`];
}

/**
 * Fetch events for a league season from TheSportsDB (with retry)
 */
async function fetchLeagueSeason(
  leagueId: string,
  season: string
): Promise<SportsDBEvent[]> {
  try {
    const url = sportsdbUrl(`eventsseason.php?id=${leagueId}&s=${season}`);
    const res = await fetchWithRetry(url);
    if (!res.ok) {
      console.warn(`[SportsDB] eventsseason ${res.status} for league=${leagueId} s=${season}`);
      return [];
    }
    const data = await res.json();
    return data.events ?? [];
  } catch (err) {
    console.warn(`[SportsDB] eventsseason failed for league ${leagueId}:`, err);
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
 * Fetch events by iterating through rounds for a league season.
 * The free tier of eventsseason.php sometimes truncates results (~15 events).
 * This round-by-round approach fetches ALL events reliably.
 *
 * Includes retry logic for 429 and delays between requests.
 */
async function fetchLeagueByRounds(
  leagueId: string,
  season: string,
  maxRounds: number = 38
): Promise<SportsDBEvent[]> {
  const allEvents: SportsDBEvent[] = [];
  let consecutiveEmpty = 0;

  for (let round = 1; round <= maxRounds; round++) {
    try {
      const url = sportsdbUrl(`eventsround.php?id=${leagueId}&r=${round}&s=${season}`);
      const res = await fetchWithRetry(url, 2, 2000);

      if (!res.ok) {
        console.warn(
          `[SportsDB] Round ${round} still failed (${res.status}) after retries – league ${leagueId}`
        );
        break;
      }

      const data = await res.json();
      const events: SportsDBEvent[] = data.events ?? [];

      if (events.length === 0) {
        consecutiveEmpty++;
        if (consecutiveEmpty >= 3) break;
      } else {
        consecutiveEmpty = 0;
        allEvents.push(...events);
      }

      // Throttle: 200ms between round requests to stay under rate limit
      if (round < maxRounds) await wait(200);
    } catch {
      break;
    }
  }
  return allEvents;
}

/**
 * Fetch events for a specific SportsDB-backed league within a date range.
 * Uses smart season detection (2 formats instead of 4) and only falls
 * back to round-by-round when eventsseason.php returned truncated data.
 */
export async function fetchSportsDBLeague(
  sportId: string,
  startDate: string,
  endDate: string
): Promise<MatchEvent[]> {
  const config = SPORTS_CONFIG.find((s) => s.id === sportId);
  if (!config || !config.sportsdbId) return [];

  const seasons = getSmartSeasons();
  let allEvents: SportsDBEvent[] = [];

  // Try eventsseason.php sequentially with a small gap between requests
  for (let i = 0; i < seasons.length; i++) {
    const events = await fetchLeagueSeason(config.sportsdbId, seasons[i]);
    allEvents = [...allEvents, ...events];
    if (i < seasons.length - 1) await wait(150);
  }

  // Only fall back to round-by-round when eventsseason returned SOME but
  // limited events (1-20 → free-tier truncation). 0 means the league
  // simply doesn't exist in that season — no point fetching rounds.
  if (allEvents.length > 0 && allEvents.length <= 20) {
    console.log(
      `[SportsDB] League ${config.sportsdbId} (${config.label}): ${allEvents.length} events from eventsseason → trying round-by-round`
    );
    for (const season of seasons) {
      if (season.includes('-')) {
        const roundEvents = await fetchLeagueByRounds(config.sportsdbId, season);
        allEvents = [...allEvents, ...roundEvents];
      }
    }
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
 * Fetch all SportsDB-backed leagues SEQUENTIALLY with delays.
 *
 * The free tier of TheSportsDB rate-limits aggressively (~15 req/min).
 * Running all leagues in parallel caused HTTP 429 errors that killed
 * round-by-round fallback (especially CPL).  Sequential with delays
 * keeps us well under the limit.
 */
export async function fetchAllSportsDBLeagues(
  startDate: string,
  endDate: string
): Promise<{ sportId: string; events: MatchEvent[]; error?: string }[]> {
  const sportsDBSports = SPORTS_CONFIG.filter(
    (s) => s.sportsdbId !== undefined
  );

  const results: { sportId: string; events: MatchEvent[]; error?: string }[] = [];

  for (const sport of sportsDBSports) {
    try {
      const events = await fetchSportsDBLeague(sport.id, startDate, endDate);
      results.push({ sportId: sport.id, events });
      console.log(`[SportsDB] ✓ ${sport.label}: ${events.length} events`);
    } catch (err) {
      results.push({
        sportId: sport.id,
        events: [],
        error: (err as Error)?.message || 'Unknown error',
      });
      console.warn(`[SportsDB] ✗ ${sport.label}: ${(err as Error)?.message}`);
    }
    // 300ms between leagues to stay under rate limit
    await wait(300);
  }

  return results;
}
