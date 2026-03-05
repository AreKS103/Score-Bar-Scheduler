import type { MatchEvent, ESPNScoreboardResponse } from '@/types';
import { SPORTS_CONFIG } from '@/lib/config';
import { utcToICT, espnDateRange } from '@/lib/timezone';

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports';

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch a single page from ESPN scoreboard
 */
async function fetchScoreboard(
  espnSlug: string,
  startDate: string,
  endDate: string,
  page = 1
): Promise<ESPNScoreboardResponse> {
  const dateParam = espnDateRange(startDate, endDate);
  const url = `${ESPN_BASE}/${espnSlug}/scoreboard?dates=${dateParam}&limit=100&page=${page}`;

  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) {
    throw new Error(`ESPN ${espnSlug} returned ${res.status}`);
  }
  return res.json();
}

/**
 * Fetch all pages for leagues that may have paginated results.
 * Caps at 5 pages max and uses 200ms between requests to avoid rate-limiting.
 */
async function fetchAllPages(
  espnSlug: string,
  startDate: string,
  endDate: string
): Promise<ESPNScoreboardResponse['events']> {
  const first = await fetchScoreboard(espnSlug, startDate, endDate, 1);
  const all = [...(first.events ?? [])];
  const totalPages = Math.min((first as any).pageCount ?? 1, 5);
  for (let p = 2; p <= totalPages; p++) {
    await sleep(200);
    const page = await fetchScoreboard(espnSlug, startDate, endDate, p);
    all.push(...(page.events ?? []));
  }
  return all;
}

/**
 * Convert ESPN events to our MatchEvent format
 */
function mapESPNEvents(
  data: ESPNScoreboardResponse,
  sportConfig: { id: string; label: string; category: string; logo: string }
): MatchEvent[] {
  if (!data.events || !Array.isArray(data.events)) return [];

  return data.events.map((event) => {
    const comp = event.competitions?.[0];
    const home = comp?.competitors?.find((c) => c.homeAway === 'home');
    const away = comp?.competitors?.find((c) => c.homeAway === 'away');

    const { date, time } = utcToICT(event.date);

    // Determine round info from event name if available
    let round = '';
    const name = event.name || '';
    // For cup competitions, the event name often contains round info
    if (name.includes(' - ')) {
      const parts = name.split(' - ');
      if (parts.length > 1) {
        round = parts[parts.length - 1].trim();
      }
    }

    return {
      id: `espn-${sportConfig.id}-${event.id}`,
      source: 'espn' as const,
      sportId: sportConfig.id,
      category: sportConfig.category,
      leagueLabel: sportConfig.label,
      leagueLogo: sportConfig.logo,
      date,
      time,
      home: home?.team?.displayName ?? event.shortName?.split(' @ ')?.[1] ?? event.name ?? 'TBD',
      away: away?.team?.displayName ?? event.shortName?.split(' @ ')?.[0] ?? '',
      homeLogo: home?.team?.logo ?? '',
      awayLogo: away?.team?.logo ?? '',
      round,
      tags: [],
      isFeatured: false,
      isSelected: false,
    };
  }).filter(event => {
    // Filter out placeholder matches (TBD, Winner, etc.)
    const placeholderPattern = /\bwinner\b|\btbd\b|\bloser\b|\bqualifier\b/i;
    return !placeholderPattern.test(event.home) && !placeholderPattern.test(event.away);
  });
}

/**
 * Fetch all matches for a single ESPN-backed league
 */
export async function fetchESPNLeague(
  sportId: string,
  startDate: string,
  endDate: string
): Promise<MatchEvent[]> {
  const config = SPORTS_CONFIG.find((s) => s.id === sportId);
  if (!config || !config.espnSlug) return [];

  try {
    const events = await fetchAllPages(config.espnSlug, startDate, endDate);
    return mapESPNEvents({ events } as ESPNScoreboardResponse, config);
  } catch (err) {
    console.warn(`ESPN fetch failed for ${sportId}:`, err);
    return [];
  }
}

/**
 * Fetch all ESPN-backed leagues in parallel
 */
export async function fetchAllESPNLeagues(
  startDate: string,
  endDate: string
): Promise<{ sportId: string; events: MatchEvent[]; error?: string }[]> {
  const espnSports = SPORTS_CONFIG.filter((s) => s.espnSlug !== null);

  const results = await Promise.allSettled(
    espnSports.map(async (sport) => {
      const events = await fetchESPNLeague(sport.id, startDate, endDate);
      return { sportId: sport.id, events };
    })
  );

  return results.map((result, i) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }
    return {
      sportId: espnSports[i].id,
      events: [],
      error: result.reason?.message || 'Unknown error',
    };
  });
}
