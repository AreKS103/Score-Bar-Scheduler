import { NextRequest, NextResponse } from 'next/server';
import type { MatchEvent } from '@/types';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { normalizeTournamentGame, MARCH_MADNESS_LOGO, MARCH_MADNESS_WOMEN_LOGO } from '@/lib/marchMadness';
import { fetchWorldCupFixtures, formatWorldCupStage, WORLD_CUP_LABEL, WORLD_CUP_LOGO, WORLD_CUP_SPORT_ID, WORLD_CUP_ESPN_SLUG } from '@/lib/worldCup';

// ── Supabase service-role client for SportsDB endpoint cache ────────────────
// Created lazily so we don't throw at module load if env vars are absent.
let _sdbCacheDb: ReturnType<typeof createServiceClient> | null = null;
function getSdbCacheDb(): ReturnType<typeof createServiceClient> | null {
  if (_sdbCacheDb) return _sdbCacheDb;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) _sdbCacheDb = createServiceClient(url, key);
  return _sdbCacheDb;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERVER-SIDE CACHE — Stores fetched events in memory with TTL
// ═══════════════════════════════════════════════════════════════════════════════

interface CacheEntry {
  data: MatchEvent[];
  timestamp: number;
}

// In-memory cache (persists across requests in same Node process)
const CACHE = new Map<string, CacheEntry>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes – fresh window; serve immediately
const STALE_OK_TTL = 45 * 60 * 1000; // 45 minutes – serve stale + background-refresh

interface CustomEventsCacheEntry {
  data: MatchEvent[];
  timestamp: number;
}

const CUSTOM_EVENTS_CACHE = new Map<string, CustomEventsCacheEntry>();
const CUSTOM_EVENTS_CACHE_TTL = 60 * 1000;

// Fetch locks to prevent thundering herd — keyed by cacheKey so different
// date ranges never share the same in-flight promise.
// Each entry stores the promise AND a timestamp so we can GC orphaned promises
// that were abandoned after a HMR reload or unexpected crash.
interface FetchLock { promise: Promise<MatchEvent[]>; startedAt: number }
const fetchPromises = new Map<string, FetchLock>();
const FETCH_LOCK_MAX_AGE_MS = 60_000; // 60 s — any in-flight older than this is presumed dead

/** Remove orphaned fetch locks that have been running for too long. */
function gcStaleFetchLocks() {
  const now = Date.now();
  for (const [key, lock] of fetchPromises) {
    if (now - lock.startedAt > FETCH_LOCK_MAX_AGE_MS) {
      console.warn(`[Events API] GC stale fetch lock for key "${key}" (age: ${Math.round((now - lock.startedAt) / 1000)}s)`);
      fetchPromises.delete(key);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ESPN API
// ═══════════════════════════════════════════════════════════════════════════════

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports';

// Priority tiers - high priority leagues fetch first
const ESPN_PRIORITY_LEAGUES = [
  // Tier 1: Most important leagues
  { id: 'soccer-epl', slug: 'soccer/eng.1' },
  { id: 'soccer-ucl', slug: 'soccer/uefa.champions' },
  { id: WORLD_CUP_SPORT_ID, slug: WORLD_CUP_ESPN_SLUG },
  { id: 'basketball-nba', slug: 'basketball/nba' },
  { id: 'football-nfl', slug: 'football/nfl' },
  { id: 'soccer-laliga', slug: 'soccer/esp.1' },
  { id: 'soccer-bundesliga', slug: 'soccer/ger.1' },
  { id: 'soccer-seriea', slug: 'soccer/ita.1' },
  // Combat Sports — must be early to survive Vercel's function timeout
  { id: 'ufc', slug: 'mma/ufc' },
  { id: 'bellator', slug: 'mma/bellator' },
];

const ESPN_SECONDARY_LEAGUES = [
  // Tier 2: European football
  { id: 'soccer-uel', slug: 'soccer/uefa.europa' },
  { id: 'soccer-uecl', slug: 'soccer/uefa.europa.conf' },
  { id: 'soccer-facup', slug: 'soccer/eng.fa' },
  { id: 'soccer-efl', slug: 'soccer/eng.2' },
  { id: 'soccer-leagueone', slug: 'soccer/eng.3' },
  { id: 'soccer-carabao', slug: 'soccer/eng.league_cup' },
  { id: 'soccer-ligue1', slug: 'soccer/fra.1' },
  { id: 'soccer-spfl', slug: 'soccer/sco.1' },
  { id: 'soccer-eredivisie', slug: 'soccer/ned.1' },
  // Americas & Asia
  { id: 'soccer-mls', slug: 'soccer/usa.1' },
  { id: 'soccer-ligamx', slug: 'soccer/mex.1' },
  { id: 'soccer-brasileirao', slug: 'soccer/bra.1' },
  { id: 'soccer-arg-primera', slug: 'soccer/arg.1' },
  { id: 'soccer-portugal', slug: 'soccer/por.1' },
  { id: 'soccer-superlig', slug: 'soccer/tur.1' },
  { id: 'soccer-concacaf', slug: 'soccer/concacaf.champions' },
  { id: 'soccer-aleague', slug: 'soccer/aus.1' },
  { id: 'soccer-saudipro', slug: 'soccer/ksa.1' },
  { id: 'soccer-jleague', slug: 'soccer/jpn.1' },
  { id: 'soccer-copam', slug: 'soccer/conmebol.libertadores' },
  { id: 'soccer-afc', slug: 'soccer/afc.champions' },
  { id: 'soccer-afc2', slug: 'soccer/afc.cup' },
  // Other US sports
  { id: 'basketball-wnba', slug: 'basketball/wnba' },
  { id: 'basketball-ncaam', slug: 'basketball/mens-college-basketball' },
  { id: 'basketball-ncaaw', slug: 'basketball/womens-college-basketball' },
  { id: 'football-ncaaf', slug: 'football/college-football' },
  { id: 'baseball-mlb', slug: 'baseball/mlb' },
  { id: 'hockey-nhl', slug: 'hockey/nhl' },
  { id: 'cricket-ipl', slug: 'cricket/8048' },
  { id: 'cricket-bbl', slug: 'cricket/8044' },
  // Motorsport, Combat, Rugby
  { id: 'f1', slug: 'racing/f1' },
  { id: 'indycar', slug: 'racing/irl' },
  { id: 'rugby-superrugby', slug: 'rugby/242041' },
  { id: 'rugby-sixnations', slug: 'rugby/180659' },
  { id: 'rugby-premship', slug: 'rugby/267979' },
  { id: 'rugby-top14', slug: 'rugby/270559' },
  { id: 'rugby-urc', slug: 'rugby/270557' },
  { id: 'rugby-champscup', slug: 'rugby/271937' },
  { id: 'rugby-rc', slug: 'rugby/244293' },
  { id: 'nrl', slug: 'rugby-league/3' },
  { id: 'afl', slug: 'australian-football/afl' },
  { id: 'tennis-atp', slug: 'tennis/atp' },
  { id: 'tennis-wta', slug: 'tennis/wta' },
  { id: 'golf-pga', slug: 'golf/pga' },
  { id: 'golf-lpga', slug: 'golf/lpga' },
];

const LEAGUE_METADATA: Record<string, { label: string; category: string; logo: string }> = {
  'soccer-epl': { label: 'EPL', category: 'Football', logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/23.png' },
  'soccer-ucl': { label: 'UEFA Champions League', category: 'Football', logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/2.png' },
  [WORLD_CUP_SPORT_ID]: { label: WORLD_CUP_LABEL, category: 'Football', logo: WORLD_CUP_LOGO },
  'soccer-uel': { label: 'UEFA Europa League', category: 'Football', logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/2310.png' },
  'soccer-uecl': { label: 'Europa Conference League', category: 'Football', logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/45.png' },
  'soccer-facup': { label: 'FA Cup', category: 'Football', logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/4.png' },
  'soccer-efl': { label: 'EFL Championship', category: 'Football', logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/24.png' },
  'soccer-leagueone': { label: 'League One', category: 'Football', logo: 'https://r2.thesportsdb.com/images/media/league/badge/afedb31688770443.png' },
  'soccer-carabao': { label: 'Carabao Cup', category: 'Football', logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/41.png' },
  'soccer-bundesliga': { label: 'Bundesliga', category: 'Football', logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/10.png' },
  'soccer-ligue1': { label: 'Ligue 1', category: 'Football', logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/9.png' },
  'soccer-laliga': { label: 'La Liga', category: 'Football', logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/15480.png' },
  'soccer-seriea': { label: 'Serie A', category: 'Football', logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/12.png' },
  'soccer-spfl': { label: 'SPFL Scottish Prem', category: 'Football', logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/55.png' },
  'soccer-eredivisie': { label: 'Eredivisie', category: 'Football', logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/11.png' },
  'soccer-mls': { label: 'MLS', category: 'Football', logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/19.png' },
  'soccer-ligamx': { label: 'Liga MX', category: 'Football', logo: '/league-logos/soccer-ligamx.webp' },
  'soccer-brasileirao': { label: 'Brasileirão Série A', category: 'Football', logo: '/league-logos/soccer-brasileirao.webp' },
  'soccer-arg-primera': { label: 'Argentine Primera', category: 'Football', logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/13.png' },
  'soccer-portugal': { label: 'Liga Portugal', category: 'Football', logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/14.png' },
  'soccer-superlig': { label: 'Süper Lig', category: 'Football', logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/18.png' },
  'soccer-concacaf': { label: 'CONCACAF Champions Cup', category: 'Football', logo: '/league-logos/soccer-concacaf.webp' },
  'soccer-aleague': { label: 'A-League', category: 'Football', logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/1003.png' },
  'soccer-saudipro': { label: 'Saudi Pro League', category: 'Football', logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/4710.png' },
  'soccer-jleague': { label: 'J-League', category: 'Football', logo: 'https://r2.thesportsdb.com/images/media/league/badge/3j8bni1675170553.png' },
  'soccer-afc': { label: 'AFC Champions League Elite', category: 'Football', logo: 'https://r2.thesportsdb.com/images/media/league/badge/gsbq4k1719686780.png' },
  'soccer-afc2': { label: 'AFC Champions League Two', category: 'Football', logo: 'https://r2.thesportsdb.com/images/media/league/badge/sfg2dl1719686962.png' },
  'soccer-afccl': { label: 'AFC Challenge League', category: 'Football', logo: 'https://r2.thesportsdb.com/images/media/league/badge/ctg73b1721497942.png' },
  'soccer-afc-asian-cup': { label: 'AFC Asian Cup', category: 'Football', logo: 'https://r2.thesportsdb.com/images/media/league/badge/0a86rp1710997941.png' },
  'soccer-asian-cup-women': { label: 'Asian Cup Women', category: 'Football', logo: 'https://r2.thesportsdb.com/images/media/league/badge/m0scwf1726416187.png' },
  'soccer-copam': { label: 'Copa Libertadores', category: 'Football', logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/26.png' },
  'soccer-cpl': { label: 'Cambodian Premier League', category: 'Football', logo: 'https://r2.thesportsdb.com/images/media/league/badge/fdhux61655121747.png' },
  'basketball-nba': { label: 'NBA', category: 'Basketball', logo: 'https://a.espncdn.com/i/teamlogos/leagues/500/nba.png' },
  'basketball-wnba': { label: 'WNBA', category: 'Basketball', logo: 'https://a.espncdn.com/i/teamlogos/leagues/500/wnba.png' },
  'basketball-ncaam': { label: "NCAA Men's Basketball", category: 'Basketball', logo: '/league-logos/basketball-ncaam.webp' },
  'basketball-ncaaw': { label: "NCAA Women's Basketball", category: 'Basketball', logo: '/league-logos/basketball-ncaaw.svg' },
  'football-nfl': { label: 'NFL', category: 'American Football', logo: 'https://a.espncdn.com/i/teamlogos/leagues/500/nfl.png' },
  'football-ncaaf': { label: 'NCAA Football', category: 'American Football', logo: '/league-logos/football-ncaaf.webp' },
  'baseball-mlb': { label: 'MLB', category: 'Baseball', logo: 'https://a.espncdn.com/i/teamlogos/leagues/500/mlb.png' },
  'hockey-nhl': { label: 'NHL', category: 'Ice Hockey', logo: 'https://a.espncdn.com/i/teamlogos/leagues/500/nhl.png' },
  'cricket-ipl': { label: 'IPL', category: 'Cricket', logo: 'https://r2.thesportsdb.com/images/media/league/badge/gaiti11741709844.png' },
  'cricket-bbl': { label: 'Big Bash League', category: 'Cricket', logo: 'https://r2.thesportsdb.com/images/media/league/badge/yko7ny1546635346.png' },
  'f1': { label: 'Formula 1', category: 'Motorsport', logo: 'https://r2.thesportsdb.com/images/media/league/badge/g8cofl1513623681.png' },
  'motogp': { label: 'MotoGP', category: 'Motorsport', logo: 'https://r2.thesportsdb.com/images/media/league/badge/gg3c201768486075.png' },
  'indycar': { label: 'IndyCar', category: 'Motorsport', logo: '/league-logos/indycar.webp' },
  'ufc': { label: 'UFC / MMA', category: 'Combat Sports', logo: 'https://a.espncdn.com/i/teamlogos/leagues/500/ufc.png' },
  'bellator': { label: 'PFL / Bellator', category: 'Combat Sports', logo: 'https://a.espncdn.com/i/teamlogos/leagues/500/pfl.png' },
  'boxing': { label: 'Boxing', category: 'Combat Sports', logo: 'https://r2.thesportsdb.com/images/media/league/badge/6enin21740228549.png' },
  'rugby-superrugby': { label: 'Super Rugby Pacific', category: 'Rugby', logo: 'https://r2.thesportsdb.com/images/media/league/badge/gz76v11717091774.png' },
  'rugby-sixnations': { label: 'Six Nations', category: 'Rugby', logo: 'https://r2.thesportsdb.com/images/media/league/badge/7h1wr91738670253.png' },
  'rugby-premship': { label: 'Premiership Rugby', category: 'Rugby', logo: 'https://r2.thesportsdb.com/images/media/league/badge/r59qxy1755025703.png' },
  'rugby-top14': { label: 'Top 14', category: 'Rugby', logo: 'https://r2.thesportsdb.com/images/media/league/badge/xrsqtw1452903237.png' },
  'rugby-urc': { label: 'United Rugby Championship', category: 'Rugby', logo: 'https://r2.thesportsdb.com/images/media/league/badge/o6dhfo1716481482.png' },
  'rugby-champscup': { label: 'Champions Cup', category: 'Rugby', logo: 'https://r2.thesportsdb.com/images/media/league/badge/kohne11716546580.png' },
  'rugby-rc': { label: 'The Rugby Championship', category: 'Rugby', logo: 'https://r2.thesportsdb.com/images/media/league/badge/dy0n4c1716684531.png' },
  'nrl': { label: 'NRL', category: 'Rugby League', logo: 'https://r2.thesportsdb.com/images/media/league/badge/gsztcj1552071996.png' },
  'afl': { label: 'AFL', category: 'Australian Football', logo: 'https://a.espncdn.com/i/teamlogos/leagues/500/afl.png' },
  'tennis-atp': { label: 'ATP Tour', category: 'Tennis', logo: 'https://r2.thesportsdb.com/images/media/league/badge/q7aej51769857150.png' },
  'tennis-wta': { label: 'WTA Tour', category: 'Tennis', logo: '/league-logos/tennis-wta.webp' },
  'tennis-australian-open': { label: 'Australian Open', category: 'Tennis', logo: '/league-logos/tennis-australian-open.svg' },
  'tennis-roland-garros': { label: 'Roland Garros', category: 'Tennis', logo: '/league-logos/tennis-roland-garros.svg' },
  'tennis-wimbledon': { label: 'Wimbledon', category: 'Tennis', logo: '/league-logos/tennis-wimbledon.svg' },
  'tennis-us-open': { label: 'US Open', category: 'Tennis', logo: '/league-logos/tennis-us-open.webp' },
  'golf-pga': { label: 'PGA Tour', category: 'Golf', logo: 'https://a.espncdn.com/i/teamlogos/leagues/500/pga.png' },
  'golf-lpga': { label: 'LPGA Tour', category: 'Golf', logo: 'https://a.espncdn.com/i/teamlogos/leagues/500/lpga.png' },
  'cycling-giro': { label: "Giro d'Italia Men", category: 'Cycling', logo: '/league-logos/cycling-giro.svg' },
  'cycling-giro-women': { label: "Giro d'Italia Women", category: 'Cycling', logo: '/league-logos/cycling-giro.svg' },
};

const TENNIS_GRAND_SLAMS = [
  { id: 'tennis-australian-open', patterns: [/australian open/i] },
  { id: 'tennis-roland-garros', patterns: [/roland garros/i, /french open/i] },
  { id: 'tennis-wimbledon', patterns: [/wimbledon/i] },
  { id: 'tennis-us-open', patterns: [/\bus open\b/i, /u\.s\. open/i] },
] as const;

function resolveTennisCompetition(
  tournamentName: string,
  drawSlug: string,
  fallbackMeta: { label: string; category: string; logo: string },
  fallbackSportId: string
): { sportId: string; meta: { label: string; category: string; logo: string }; leagueLabel: string } {
  const grandSlam = TENNIS_GRAND_SLAMS.find(t => t.patterns.some(pattern => pattern.test(tournamentName)));
  if (grandSlam) {
    const meta = LEAGUE_METADATA[grandSlam.id] ?? fallbackMeta;
    return { sportId: grandSlam.id, meta, leagueLabel: meta.label };
  }

  if (drawSlug.startsWith('mens-')) {
    const meta = LEAGUE_METADATA['tennis-atp'] ?? fallbackMeta;
    return { sportId: 'tennis-atp', meta, leagueLabel: `${meta.label}: ${tournamentName}` };
  }

  if (drawSlug.startsWith('womens-')) {
    const meta = LEAGUE_METADATA['tennis-wta'] ?? fallbackMeta;
    return { sportId: 'tennis-wta', meta, leagueLabel: `${meta.label}: ${tournamentName}` };
  }

  return { sportId: fallbackSportId, meta: fallbackMeta, leagueLabel: `${fallbackMeta.label}: ${tournamentName}` };
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const DEFAULT_EVENTS_TIMEZONE = 'Asia/Phnom_Penh';

function normalizeTimeZone(value: string | null): string {
  const candidate = value?.trim() || DEFAULT_EVENTS_TIMEZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return DEFAULT_EVENTS_TIMEZONE;
  }
}

function formatUtcDateInTimeZone(utc: Date, timeZone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(utc);

  const lookup = Object.fromEntries(
    parts
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, part.value])
  ) as Record<string, string>;

  return {
    date: `${lookup.year}-${lookup.month}-${lookup.day}`,
    time: `${lookup.hour}:${lookup.minute}`,
  };
}

/** Convert UTC ISO string to date/time in a DST-aware IANA timezone */
function utcToLocal(utcDateString: string, timeZone: string): { date: string; time: string } {
  try {
    const utc = new Date(utcDateString);
    if (Number.isNaN(utc.getTime())) return { date: '', time: '' };
    return formatUtcDateInTimeZone(utc, timeZone);
  } catch {
    return { date: '', time: '' };
  }
}

/** Build ESPN date range string */
function espnDateRange(start: string, end: string): string {
  return `${start.replace(/-/g, '')}-${end.replace(/-/g, '')}`;
}

/** Enumerate every YYYY-MM-DD between start and end (inclusive) */
function enumerateDates(start: string, end: string): string[] {
  const dates: string[] = [];
  const d = new Date(start + 'T00:00:00Z');
  const last = new Date(end + 'T00:00:00Z');
  while (d <= last) {
    dates.push(d.toISOString().split('T')[0]);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return dates;
}

/** NCAA basketball leagues use a whitelist calendar on ESPN — date-range
 *  queries always 404. Instead we must query each date individually and
 *  merge results. Returns null if nothing was fetched (so callers can
 *  still fall through to other fallbacks). */
async function fetchNCAASingleDayScoreboard(
  slug: string,
  startDate: string,
  endDate: string,
): Promise<ESPNScoreboardResponse | null> {
  // Fetch one day before startDate so UTC games that shift forward
  // via utcToLocal (+7h) into the requested range are not missed.
  const dayBefore = new Date(startDate + 'T00:00:00Z');
  dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
  const extendedStart = dayBefore.toISOString().split('T')[0];
  const dates = enumerateDates(extendedStart, endDate);
  const CONCURRENCY = 3;            // max parallel per NCAA league
  const seenIds = new Set<string>();
  const allEvents: ESPNEvent[] = [];
  let leagues: ESPNScoreboardResponse['leagues'];

  let idx = 0;
  const workers = Array(Math.min(CONCURRENCY, dates.length)).fill(null).map(async () => {
    while (idx < dates.length) {
      const date = dates[idx++];
      if (!date) break;
      const dateParam = date.replace(/-/g, '');       // YYYYMMDD (single day)
      const url = `${ESPN_BASE}/${slug}/scoreboard?dates=${dateParam}&limit=1000`;
      const data = await espnFetchWithRetry<ESPNScoreboardResponse>(url, 4_000);
      if (data?.events?.length) {
        if (!leagues) leagues = data.leagues;
        for (const ev of data.events) {
          if (!seenIds.has(ev.id)) {
            seenIds.add(ev.id);
            allEvents.push(ev);
          }
        }
      }
      await sleep(50);                                // gentle spacing between requests
    }
  });

  await Promise.allSettled(workers);

  if (allEvents.length === 0) return null;
  console.log(`[ESPN-NCAA] single-day fetch for ${slug}: ${dates.length} days queried → ${allEvents.length} unique events`);
  return { events: allEvents, leagues };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ESPN FETCHING — Batched with controlled concurrency
// ═══════════════════════════════════════════════════════════════════════════════

// Browser-spoof headers — ESPN blocks bare server-to-server fetches from cloud IPs.
const ESPN_HEADERS: Record<string, string> = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept':          'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer':         'https://www.espn.com/',
  'Origin':          'https://www.espn.com',
  'Cache-Control':   'no-cache',
  'Pragma':          'no-cache',
};

// Per-path stale cache — serves last-known data when a path fails (up to 10 min)
interface PathCacheEntry { events: MatchEvent[]; fetchedAt: number }
const pathCache = new Map<string, PathCacheEntry>();
const PATH_STALE_MAX_MS = 10 * 60_000;

/** Fetch with timeout + 1 automatic retry */
async function espnFetchWithRetry<T>(url: string, ms = 4_000): Promise<T | null> {
  const attempt = async (timeout: number) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: ESPN_HEADERS, cache: 'no-store' });
      return res.ok ? await res.json() : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };
  const result = await attempt(ms);
  if (result !== null) return result;
  // Retry once with minimal delay
  await sleep(150 + Math.random() * 200);
  return attempt(ms); // keep timeout same to avoid massive cascades
}

interface ESPNCompetitorRaw {
  homeAway?: string;
  order?: number;
  team?: { displayName?: string; logo?: string };
  athlete?: { displayName?: string; fullName?: string; flag?: { href: string; alt: string } };
  curatedRank?: { current?: number };
}

interface ESPNCompetitionRaw {
  id?: string;
  date?: string;
  competitors?: ESPNCompetitorRaw[];
  type?: { abbreviation?: string; text?: string; slug?: string };
  round?: { id?: string; displayName?: string };
  status?: { type: { state?: string; description?: string } };
}

interface ESPNEvent {
  id: string;
  name?: string;
  shortName?: string;
  date: string;
  season?: { slug?: string };
  notes?: Array<{ headline?: string }>;
  competitions?: ESPNCompetitionRaw[];
  groupings?: {
    grouping: { id: string; slug: string; displayName: string };
    competitions: ESPNCompetitionRaw[];
  }[];
}

interface ESPNScoreboardResponse {
  events?: ESPNEvent[];
  leagues?: Array<{ season?: { type?: { id?: string | number } } }>;
}

// ── Helper: extract competitor name from ESPN competitor object ───────────────
function getCompName(c: ESPNCompetitorRaw | undefined): string {
  return c?.team?.displayName || c?.athlete?.displayName || c?.athlete?.fullName || '';
}

// ── Country name → ISO-3166-1 alpha-2 (for fighter flag images) ──────────────
const NAME_TO_ISO: Record<string, string> = {
  'Afghanistan':'AF','Albania':'AL','Algeria':'DZ','American Samoa':'AS',
  'Argentina':'AR','Armenia':'AM','Australia':'AU','Austria':'AT',
  'Azerbaijan':'AZ','Bahrain':'BH','Belarus':'BY','Belgium':'BE',
  'Bolivia':'BO','Bosnia and Herzegovina':'BA','Brazil':'BR','Bulgaria':'BG',
  'Cameroon':'CM','Canada':'CA','Chile':'CL','China':'CN',
  'Colombia':'CO','Costa Rica':'CR','Croatia':'HR','Cuba':'CU',
  'Czech Republic':'CZ','Czechia':'CZ','Denmark':'DK','Dominican Republic':'DO',
  'Ecuador':'EC','Egypt':'EG','El Salvador':'SV','Estonia':'EE',
  'Ethiopia':'ET','Finland':'FI','France':'FR','Georgia':'GE',
  'Germany':'DE','Ghana':'GH','Great Britain':'GB','Greece':'GR',
  'Guatemala':'GT','Guyana':'GY','Honduras':'HN','Hungary':'HU',
  'Iceland':'IS','India':'IN','Indonesia':'ID','Iran':'IR',
  'Ireland':'IE','Israel':'IL','Italy':'IT','Jamaica':'JM',
  'Japan':'JP','Jordan':'JO','Kazakhstan':'KZ','Kenya':'KE',
  'Kosovo':'XK','Kyrgyzstan':'KG','Latvia':'LV','Lebanon':'LB',
  'Lithuania':'LT','Malaysia':'MY','Mexico':'MX','Moldova':'MD',
  'Montenegro':'ME','Morocco':'MA','Netherlands':'NL','New Zealand':'NZ',
  'Nicaragua':'NI','Nigeria':'NG','North Macedonia':'MK','Norway':'NO',
  'Pakistan':'PK','Panama':'PA','Paraguay':'PY','Peru':'PE',
  'Philippines':'PH','Poland':'PL','Portugal':'PT','Puerto Rico':'PR',
  'Romania':'RO','Russia':'RU','Saudi Arabia':'SA','Senegal':'SN',
  'Serbia':'RS','Singapore':'SG','Slovakia':'SK','Slovenia':'SI',
  'South Africa':'ZA','South Korea':'KR','Spain':'ES','Suriname':'SR',
  'Sweden':'SE','Switzerland':'CH','Tajikistan':'TJ','Thailand':'TH',
  'Trinidad and Tobago':'TT','Tunisia':'TN','Turkey':'TR','Turkiye':'TR',
  'Uganda':'UG','Ukraine':'UA','United Arab Emirates':'AE',
  'United Kingdom':'GB','United States':'US','Uruguay':'UY',
  'USA':'US','U.S.A.':'US','U.S.':'US','United States of America':'US',
  'UK':'GB','England':'GB','Scotland':'GB','Wales':'GB','Northern Ireland':'GB',
  'Britain':'GB',
  'Korea':'KR','DPR Korea':'KP',
  'Chinese Taipei':'TW','Taiwan':'TW',
  'Ivory Coast':'CI',"Cote d'Ivoire":'CI',
  'Uzbekistan':'UZ','Venezuela':'VE','Vietnam':'VN',
  'Zambia':'ZM','Zimbabwe':'ZW',
  'Congo':'CG','DR Congo':'CD','Democratic Republic of the Congo':'CD',
  'Dominican Rep.':'DO','Czech Rep.':'CZ',
  'Republic of Ireland':'IE','Rep. of Ireland':'IE',
  'Bosnia':'BA',
  'Myanmar':'MM','Burma':'MM',
  'Samoa':'WS','Tonga':'TO','Fiji':'FJ','Papua New Guinea':'PG',
  'Cape Verde':'CV','Cabo Verde':'CV',
  'Guam':'GU','Haiti':'HT','Cambodia':'KH','Laos':'LA',
  'Nepal':'NP','Sri Lanka':'LK','Bangladesh':'BD',
  'Bahamas':'BS','Barbados':'BB','Bermuda':'BM',
  'Curacao':'CW','Curaçao':'CW',
};
function countryNameToISO(name: string): string {
  if (!name) return '';
  return NAME_TO_ISO[name] || NAME_TO_ISO[name.trim()] || '';
}
function countryToFlagUrl(country: string): string {
  const iso = countryNameToISO(country);
  return iso ? `https://flagcdn.com/w40/${iso.toLowerCase()}.png` : '';
}

// ── MMA / Boxing mapper — one MatchEvent per fight (iterates ALL competitions) ──
function mapMMAFights(
  events: ESPNEvent[],
  league: { id: string; slug: string },
  meta: { label: string; category: string; logo: string },
  timeZone: string
): MatchEvent[] {
  const results: MatchEvent[] = [];

  for (const event of events) {
    // Use the full event name so each card has a unique label (e.g. "UFC Fight Night: Emmett vs. Vallejos")
    const cardName = event.name || event.shortName || meta.label;
    const { date, time } = utcToLocal(event.date, timeZone);
    const competitions = event.competitions ?? [];
    if (competitions.length === 0) continue;

    // Main card = the latest time group among all fights.
    // ESPN returns competitions with individual comp.date values grouped by segment
    // (Early Prelims → Prelims → Main Card), so the latest timestamp = main card.
    const mainCardTime = competitions
      .map(c => c.date || event.date)
      .reduce((latest, t) => (t > latest ? t : latest), '');

    // ESPN competitions are NOT cleanly ordered: some events have prelims and
    // main card fights interleaved. Sort by comp.date descending (later = main card)
    // then by original index descending (ESPN always lists the main event last).
    // This guarantees: main event → rest of main card → prelims, regardless of ESPN ordering.
    const orderedComps = [...competitions]
      .map((comp, idx) => ({ comp, idx }))
      .sort((a, b) => {
        const aTime = a.comp.date || event.date;
        const bTime = b.comp.date || event.date;
        if (aTime !== bTime) return bTime.localeCompare(aTime); // later time first
        return b.idx - a.idx; // same time group: higher original index first (main event)
      })
      .map(({ comp }) => comp);

    // Build one MatchEvent per competition (fight)
    const fights: MatchEvent[] = [];
    for (let i = 0; i < orderedComps.length; i++) {
      const comp = orderedComps[i];
      const fighters = comp.competitors ?? [];
      const f1 = fighters[0];
      const f2 = fighters[1];
      const f1Name = f1 ? getCompName(f1) : '';
      if (!f1Name) continue;

      const compTime = comp.date || event.date;
      const fightTime = comp.date ? utcToLocal(comp.date, timeZone) : { date, time };
      const weightClass = comp.type?.abbreviation ?? '';

      // Fighter flags: ESPN provides athlete.flag.href (image) and .alt (country name).
      // Prefer ESPN image → flagcdn.com fallback from country name → empty.
      const f1Flag = f1?.athlete?.flag;
      const f2Flag = f2?.athlete?.flag;
      const f1Country = f1Flag?.alt ? countryNameToISO(f1Flag.alt) : '';
      const f2Country = f2Flag?.alt ? countryNameToISO(f2Flag.alt) : '';
      const f1Logo = f1?.team?.logo
        || f1Flag?.href
        || countryToFlagUrl(f1Flag?.alt ?? '')
        || '';
      const f2Logo = f2?.team?.logo
        || f2Flag?.href
        || countryToFlagUrl(f2Flag?.alt ?? '')
        || '';

      fights.push({
        id: `espn-${league.id}-${event.id}-fight-${competitions.length - 1 - i}`,
        source: 'espn',
        sportId: league.id,
        category: meta.category,
        leagueLabel: cardName,
        leagueLogo: meta.logo,
        date: fightTime.date,
        time: fightTime.time,
        home: f1Name,
        away: f2 ? getCompName(f2) : '',
        homeLogo: f1Logo,
        awayLogo: f2Logo,
        homeCountry: f1Country,
        awayCountry: f2Country,
        round: weightClass,
        tags: [],
        isFeatured: false,
        isSelected: false,
        // Main card = fights whose time matches the latest time group in the event
        isMainCard: compTime === mainCardTime,
        cardName,
        fightOrder: i,
      });
    }

    results.push(...fights);
  }

  return results;
}

// ── Motorsport mapper — one MatchEvent per session (FP1/FP2/FP3/Qual/Sprint/Race) ──
function mapMotorsportSessions(
  events: ESPNEvent[],
  league: { id: string; slug: string },
  meta: { label: string; category: string; logo: string },
  timeZone: string
): MatchEvent[] {
  const results: MatchEvent[] = [];

  for (const event of events) {
    const gpName = (event.shortName || event.name || 'TBD')
      .replace(/\s+/g, ' ')
      .trim();

    const competitions = event.competitions ?? [];
    for (let i = 0; i < competitions.length; i++) {
      const comp = competitions[i];
      const sessionType = comp.type?.abbreviation ?? '';
      const sessionLabel =
        sessionType === 'FP1'   ? 'Practice 1'  :
        sessionType === 'FP2'   ? 'Practice 2'  :
        sessionType === 'FP3'   ? 'Practice 3'  :
        sessionType === 'Qual'  ? 'Qualifying'  :
        sessionType === 'SQ'    ? 'Sprint Qualifying' :
        sessionType === 'Sprint'? 'Sprint'       :
        sessionType === 'Race'  ? 'Race'         :
        sessionType || `Session ${i + 1}`;

      const sessionTime = comp.date ? utcToLocal(comp.date, timeZone) : utcToLocal(event.date, timeZone);

      results.push({
        id: `espn-${league.id}-${event.id}-${sessionType || i}`,
        source: 'espn',
        sportId: league.id,
        category: meta.category,
        leagueLabel: meta.label,
        leagueLogo: meta.logo,
        date: sessionTime.date,
        time: sessionTime.time,
        home: `${gpName} – ${sessionLabel}`,
        away: '',
        homeLogo: '',
        awayLogo: '',
        round: '',
        tags: [],
        isFeatured: false,
        isSelected: false,
      });
    }
  }

  return results;
}

// ── Tennis mapper — flattens groupings→competitions into individual matches ──
// When a tournament has groupings but every match is still TBD (e.g. Grand Slam
// week before the draw is confirmed), emit ONE tournament-level placeholder per
// draw so users can still see "Roland Garros – Singles" on the schedule.
function mapTennisMatches(
  events: ESPNEvent[],
  league: { id: string; slug: string },
  meta: { label: string; category: string; logo: string },
  timeZone: string
): MatchEvent[] {
  const results: MatchEvent[] = [];

  for (const event of events) {
    const tournamentName = event.shortName || event.name || meta.label;
    const groupings = event.groupings ?? [];

    // No groupings at all → ESPN sometimes returns a top-level competitions array
    // for early-week tournament announcements. Render a single tournament card.
    if (groupings.length === 0) {
      const compTop = event.competitions?.[0];
      const matchTime = compTop?.date ? utcToLocal(compTop.date, timeZone) : utcToLocal(event.date, timeZone);
      results.push({
        id: `espn-${league.id}-${event.id}-tournament`,
        source: 'espn',
        sportId: league.id,
        category: meta.category,
        leagueLabel: `${meta.label}: ${tournamentName}`,
        leagueLogo: meta.logo,
        date: matchTime.date,
        time: matchTime.time,
        home: tournamentName,
        away: '',
        homeLogo: meta.logo,
        awayLogo: '',
        round: '',
        tags: [],
        isFeatured: false,
        isSelected: false,
      });
      continue;
    }

    for (const group of groupings) {
      const drawSlug = group.grouping.slug || '';
      const tennisCompetition = resolveTennisCompetition(tournamentName, drawSlug, meta, league.id);

      const competitionsInDraw = group.competitions ?? [];
      let realMatchesEmitted = 0;

      for (const comp of competitionsInDraw) {
        const competitors = comp.competitors ?? [];
        const p1 = competitors.find(c => c.order === 1) ?? competitors[0];
        const p2 = competitors.find(c => c.order === 2) ?? competitors[1];
        const p1Name = p1 ? getCompName(p1) : '';
        const p2Name = p2 ? getCompName(p2) : '';
        if (!p1Name || !p2Name) continue;

        const matchTime = comp.date ? utcToLocal(comp.date, timeZone) : utcToLocal(event.date, timeZone);
        const roundName = comp.round?.displayName || '';
        const drawLabel = group.grouping.displayName || '';
        const round = roundName ? `${drawLabel} – ${roundName}` : drawLabel;
        const compKey = comp.id || `${drawSlug}-${p1Name}-${p2Name}`;

        results.push({
          id: `espn-${tennisCompetition.sportId}-${event.id}-${compKey}`.replace(/\s+/g, '-'),
          source: 'espn',
          sportId: tennisCompetition.sportId,
          category: tennisCompetition.meta.category,
          leagueLabel: tennisCompetition.leagueLabel,
          leagueLogo: tennisCompetition.meta.logo,
          date: matchTime.date,
          time: matchTime.time,
          home: p1Name,
          away: p2Name,
          homeLogo: p1?.athlete?.flag?.href || '',
          awayLogo: p2?.athlete?.flag?.href || '',
          round,
          tags: [],
          isFeatured: false,
          isSelected: false,
        });
        realMatchesEmitted++;
      }

      // Draw exists but no resolved match-ups → render a single tournament-level
      // card so users see Grand Slams (Roland Garros, Wimbledon, AO, US Open)
      // during the pre-draw / quiet week instead of an empty Tennis section.
      if (realMatchesEmitted === 0 && competitionsInDraw.length > 0) {
        const matchTime = utcToLocal(event.date, timeZone);
        const drawLabel = group.grouping.displayName || 'Singles';
        results.push({
          id: `espn-${tennisCompetition.sportId}-${event.id}-${drawSlug || 'draw'}-tba`,
          source: 'espn',
          sportId: tennisCompetition.sportId,
          category: tennisCompetition.meta.category,
          leagueLabel: tennisCompetition.leagueLabel,
          leagueLogo: tennisCompetition.meta.logo,
          date: matchTime.date,
          time: matchTime.time,
          home: tournamentName,
          away: '',
          homeLogo: tennisCompetition.meta.logo,
          awayLogo: '',
          round: drawLabel,
          tags: [],
          isFeatured: false,
          isSelected: false,
        });
      }
    }
  }

  return results;
}

// ── Default team-sport mapper (soccer, basketball, etc.) ─────────────────────
function mapTeamSportEvents(
  events: ESPNEvent[],
  league: { id: string; slug: string },
  meta: { label: string; category: string; logo: string },
  seasonTypeId: string | number | undefined,
  timeZone: string
): MatchEvent[] {
  const isGolf = league.slug.startsWith('golf/');
  const isNCAA = league.id === 'basketball-ncaam' || league.id === 'basketball-ncaaw';
  const isWorldCup = league.id === WORLD_CUP_SPORT_ID;

  return events.map((event): MatchEvent => {
    const comp = event.competitions?.[0];
    const competitors = comp?.competitors ?? [];
    const home = competitors.find(c => c.homeAway === 'home') ?? competitors[0];
    const away = competitors.find(c => c.homeAway === 'away') ?? competitors[1];
    const { date, time } = utcToLocal(event.date, timeZone);

    let homeName = home ? getCompName(home) : '';
    let awayName = away ? getCompName(away) : '';

    if (isGolf) {
      homeName = event.name || event.shortName || 'TBD';
      awayName = '';
    }

    let leagueLabel = meta.label;
    let round = '';
    let leagueLogo = meta.logo;

    if (isNCAA) {
      const info = normalizeTournamentGame({
        seasonTypeId,
        notesHeadline: event.notes?.[0]?.headline,
        competitors: competitors.map(c => ({ curatedRank: c.curatedRank })),
      }, meta.label);
      leagueLabel = info.leagueLabel;
      round = info.round;
      if (info.leagueLabel === 'March Madness') {
        leagueLogo = league.id === 'basketball-ncaaw' ? MARCH_MADNESS_WOMEN_LOGO : MARCH_MADNESS_LOGO;
      }
    } else if (isWorldCup) {
      round = formatWorldCupStage(event.season?.slug);
    } else {
      // Round info from event name
      const name = event.name || '';
      if (name.includes(' - ')) {
        const parts = name.split(' - ');
        if (parts.length > 1) round = parts[parts.length - 1].trim();
      }
    }

    return {
      id: `espn-${league.id}-${event.id}`,
      source: 'espn',
      sportId: league.id,
      category: meta.category,
      leagueLabel,
      leagueLogo,
      date,
      time,
      home: homeName || 'TBD',
      away: awayName,
      homeLogo: home?.team?.logo || '',
      awayLogo: away?.team?.logo || '',
      round,
      tags: [],
      isFeatured: false,
      isSelected: false,
      ...(isWorldCup ? {
        sourceEventId: event.id,
        isoDate: event.date,
        stageSlug: event.season?.slug || 'group-stage',
      } : {}),
    };
  }).filter(e => e.date && (e.home !== 'TBD' || isNCAA || isWorldCup));
  // NCAA and World Cup tournament bracket slots with placeholders are valid and should be shown.
}

async function fetchESPNLeague(
  league: { id: string; slug: string },
  startDate: string,
  endDate: string,
  timeZone: string
): Promise<MatchEvent[]> {
  const meta = LEAGUE_METADATA[league.id];
  if (!meta) return [];

  if (league.id === WORLD_CUP_SPORT_ID) {
    const { fixtures } = await fetchWorldCupFixtures(timeZone);
    return fixtures.filter((event) => event.date >= startDate && event.date <= endDate);
  }

  try {
    const isMMA = league.slug.startsWith('mma/') || league.slug.startsWith('boxing/');
    const isMotorsport = league.slug.startsWith('racing/');
    const isTennis = league.slug.startsWith('tennis/');
    const isCricket = league.slug.startsWith('cricket/');
    const isNCAA_BB = league.id === 'basketball-ncaam' || league.id === 'basketball-ncaaw';
    const dateParam = espnDateRange(startDate, endDate);

    let data: ESPNScoreboardResponse | null = null;

    // ── NCAA basketball: ESPN rejects date-range queries (404). Fetch each
    //    day individually and merge to capture all tournament rounds. ──────────
    if (isNCAA_BB) {
      // 1) Try single-day iteration (most reliable)
      data = await fetchNCAASingleDayScoreboard(league.slug, startDate, endDate);

      // 2) Augment with schedule endpoint (full bracket, if available)
      const refYear = new Date(endDate);
      const ncaaSeasonYear = (refYear.getMonth() + 1) >= 8
        ? refYear.getFullYear() + 1
        : refYear.getFullYear();
      const schedUrl = `${ESPN_BASE}/${league.slug}/schedule?season=${ncaaSeasonYear}&seasontype=3`;
      const schedData = await espnFetchWithRetry<ESPNScoreboardResponse>(schedUrl, 5_000);
      if (schedData?.events?.length) {
        const existingIds = new Set((data?.events ?? []).map(e => e.id));
        const extra = schedData.events.filter(e => !existingIds.has(e.id));
        if (data) {
          data = { events: [...(data.events ?? []), ...extra], leagues: data.leagues ?? schedData.leagues };
        } else {
          data = { events: schedData.events, leagues: schedData.leagues };
        }
        console.log(`[ESPN-NCAA] schedule endpoint for ${league.id}: ${schedData.events.length} tournament events, +${extra.length} new`);
      }

      // 3) Last resort: no-dates scoreboard (returns only near-future games)
      if (!data) {
        const fallbackUrl = `${ESPN_BASE}/${league.slug}/scoreboard?limit=1000`;
        const fallbackData = await espnFetchWithRetry<ESPNScoreboardResponse>(fallbackUrl, 3_500);
        if (fallbackData?.events?.length) {
          data = fallbackData;
          console.log(`[ESPN-NCAA] ${league.id}: single-day + schedule both empty → no-dates fallback returned ${fallbackData.events.length} events`);
        }
      }
    } else if (isCricket || isTennis) {
      // ── Cricket: ESPN cricket scoreboards 404 with ?dates= parameter.
      // ── Tennis: ESPN scoreboard's ?dates= filters by tournament START date,
      //    which drops multi-week Grand Slams (e.g. Roland Garros runs
      //    May 18 → Jun 8 — a query for dates=20260520+ silently excludes it
      //    even though hundreds of singles matches are scheduled inside the
      //    requested window).
      //    For both sports: fetch the full league scoreboard (no dates) and let
      //    the downstream per-match date filter trim to the requested window.
      const url = `${ESPN_BASE}/${league.slug}/scoreboard?limit=1000`;
      data = await espnFetchWithRetry<ESPNScoreboardResponse>(url, 4_000);
      if (data?.events?.length) {
        const tag = isCricket ? 'Cricket' : 'Tennis';
        console.log(`[ESPN-${tag}] ${league.id}: no-dates fetch returned ${data.events.length} events`);
      }
    } else {
      // ── All other leagues: standard date-range query ───────────────────────
      const url = `${ESPN_BASE}/${league.slug}/scoreboard?dates=${dateParam}&limit=1000`;
      data = await espnFetchWithRetry<ESPNScoreboardResponse>(url, 3_500);

      // Fallback: retry without dates if range query failed
      if (data === null) {
        const fallbackUrl = `${ESPN_BASE}/${league.slug}/scoreboard?limit=1000`;
        const fallbackData = await espnFetchWithRetry<ESPNScoreboardResponse>(fallbackUrl, 3_500);
        if (fallbackData?.events?.length) {
          data = fallbackData;
          console.log(`[ESPN] ${league.id}: 404 with date range → fallback without dates returned ${fallbackData.events.length} events`);
        }
      }
    }

    // NCAA Tournament: augment men's with the full bracket from the schedule endpoint
    // (already handled above for both men's and women's in the isNCAA_BB block)

    // Diagnostic logging for combat sports (UFC/Bellator)
    if (isMMA) {
      const eventCount = data?.events?.length ?? 0;
      const fightCount = data?.events?.reduce((sum: number, e: ESPNEvent) => sum + (e.competitions?.length ?? 0), 0) ?? 0;
      console.log(`[ESPN-MMA] ${league.id}: fetch ${data ? 'OK' : 'FAILED'}, ${eventCount} events, ${fightCount} fights`);
    }

    if (!data?.events) {
      const stale = pathCache.get(league.id);
      if (stale && Date.now() - stale.fetchedAt < PATH_STALE_MAX_MS) {
        const filtered = stale.events.filter(e => e.date >= startDate && e.date <= endDate);
        console.log(`[ESPN] ${league.id} failed → serving ${filtered.length}/${stale.events.length} stale events in range`);
        return filtered;
      }
      console.warn(`[ESPN] ${league.id} returned no data`);
      return [];
    }

    const events: ESPNEvent[] = data.events ?? [];
    const seasonTypeId = data.leagues?.[0]?.season?.type?.id;

    // Route to the correct mapper based on sport type
    let parsed: MatchEvent[];
    if (isMMA) {
      parsed = mapMMAFights(events, league, meta, timeZone);
    } else if (isMotorsport) {
      parsed = mapMotorsportSessions(events, league, meta, timeZone);
    } else if (isTennis) {
      parsed = mapTennisMatches(events, league, meta, timeZone);
    } else {
      parsed = mapTeamSportEvents(events, league, meta, seasonTypeId, timeZone);
    }

    // Apply date-range guard to all leagues: prevents the 404-fallback (which fetches
    // without dates when ESPN returns 404 for off-season leagues like BBL in March) or
    // the stale path-cache from leaking out-of-range events into the schedule view.
    const beforeDateGuard = parsed.length;
    parsed = parsed.filter(e => e.date >= startDate && e.date <= endDate);

    if (isMMA) console.log(`[ESPN-MMA] ${league.id}: mapped ${parsed.length} fights from ${events.length} events`);
    if (isNCAA_BB) {
      console.log(`[ESPN-NCAA] ${league.id}: ${events.length} raw ESPN events → ${beforeDateGuard} after mapping (TBD allowed) → ${parsed.length} in range [${startDate}, ${endDate}]`);
      if (parsed.length === 0 && beforeDateGuard > 0) {
        console.warn(`[ESPN-NCAA] ${league.id}: ZERO in-range events — all ${beforeDateGuard} mapped games fell outside [${startDate}, ${endDate}]`);
      }
    }

    if (parsed.length > 0) {
      pathCache.set(league.id, { events: parsed, fetchedAt: Date.now() });
    }
    return parsed;
  } catch (err) {
    const stale = pathCache.get(league.id);
    if (stale && Date.now() - stale.fetchedAt < PATH_STALE_MAX_MS) {
      const filtered = stale.events.filter(e => e.date >= startDate && e.date <= endDate);
      console.log(`[ESPN] ${league.id} error → serving ${filtered.length}/${stale.events.length} stale events in range`);
      return filtered;
    }
    console.warn(`[ESPN] ${league.id} failed:`, (err as Error).message);
    return [];
  }
}

/** Fetch ESPN leagues with controlled concurrency without strict batch bottlenecks */
async function fetchAllESPN(startDate: string, endDate: string, timeZone: string): Promise<MatchEvent[]> {
  const allLeagues = [...ESPN_PRIORITY_LEAGUES, ...ESPN_SECONDARY_LEAGUES];
  const results: MatchEvent[] = [];
  const CONCURRENCY = 15;
  let i = 0;

  const workers = Array(CONCURRENCY).fill(null).map(async () => {
    while (i < allLeagues.length) {
      const league = allLeagues[i++];
      if (!league) break;
      try {
        const events = await fetchESPNLeague(league, startDate, endDate, timeZone);
        results.push(...events);
      } catch {
        // Ignored, handled in fetchESPNLeague
      }
      await sleep(25); // tiny spacing
    }
  });

  await Promise.allSettled(workers);
  return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SPORTSDB FETCHING — Only for CPL and MotoGP (no ESPN coverage)
// ═══════════════════════════════════════════════════════════════════════════════

const SPORTSDB_BASE = 'https://www.thesportsdb.com/api/v1/json/123';

const SPORTSDB_ONLY_LEAGUES = [
  { id: 'soccer-cpl', sportsdbId: '4793', label: 'Cambodian Premier League', category: 'Football', logo: 'https://r2.thesportsdb.com/images/media/league/badge/fdhux61655121747.png' },
  { id: 'soccer-afccl', sportsdbId: '5485', label: 'AFC Challenge League', category: 'Football', logo: 'https://r2.thesportsdb.com/images/media/league/badge/ctg73b1721497942.png' },
  { id: 'soccer-afc', sportsdbId: '4719', label: 'AFC Champions League Elite', category: 'Football', logo: 'https://r2.thesportsdb.com/images/media/league/badge/gsbq4k1719686780.png' },
  { id: 'soccer-afc2', sportsdbId: '4804', label: 'AFC Champions League Two', category: 'Football', logo: 'https://r2.thesportsdb.com/images/media/league/badge/sfg2dl1719686962.png' },
  { id: 'soccer-afc-asian-cup', sportsdbId: '4866', label: 'AFC Asian Cup', category: 'Football', logo: 'https://r2.thesportsdb.com/images/media/league/badge/0a86rp1710997941.png' },
  { id: 'soccer-asian-cup-women', sportsdbId: '5179', label: 'Asian Cup Women', category: 'Football', logo: 'https://r2.thesportsdb.com/images/media/league/badge/m0scwf1726416187.png' },
  { id: 'motogp', sportsdbId: '4407', label: 'MotoGP', category: 'Motorsport', logo: 'https://r2.thesportsdb.com/images/media/league/badge/gg3c201768486075.png' },
  { id: 'boxing', sportsdbId: '4445', label: 'Boxing', category: 'Combat Sports', logo: 'https://r2.thesportsdb.com/images/media/league/badge/6enin21740228549.png' },
  { id: 'cycling-uci', sportsdbId: '4465', label: 'UCI World Tour', category: 'Cycling', logo: 'https://r2.thesportsdb.com/images/media/league/badge/igahc11535183469.png' },
  { id: 'soccer-hun-sen-cup', sportsdbId: '5859', label: 'Cambodian Hun Sen Cup', category: 'Football', logo: 'https://r2.thesportsdb.com/images/media/league/badge/4motr51774278480.png' },
];

interface SportsDBEvent {
  idEvent: string;
  strEvent: string;
  dateEvent: string;
  strTime?: string;
  strHomeTeam?: string;
  strAwayTeam?: string;
  strHomeTeamBadge?: string;
  strAwayTeamBadge?: string;
  strStatus?: string;
  strPostponed?: string;
  strLeague?: string;
  strRound?: string;
}

// C-League team IDs — all 11 clubs in the 2025-26 season
const CPL_TEAM_IDS = [139406, 139402, 147520, 139397, 149110, 152838, 139410, 139405, 139401, 139407, 139403];

// ── Per-endpoint SportsDB cache (two layers) ────────────────────────────
// SportsDB endpoints (eventsnextleague, eventsnext, eventslast, etc.) are
// NOT parameterised by date — the same URL returns the same events no
// matter what date range the user selects.  Two-layer caching prevents
// re-fetching (and 429s) even across Vercel cold starts:
//   Layer 1: in-process Map  — fastest; lives only within the current Node instance
//   Layer 2: Supabase table  — persistent; survives Vercel restarts; 7-day TTL
interface SdbEndpointEntry { data: SportsDBEvent[]; ts: number }
const SDB_ENDPOINT_CACHE = new Map<string, SdbEndpointEntry>();
const SDB_ENDPOINT_TTL = 10 * 60 * 1000; // 10 min in-memory
const SDB_DB_CACHE_TTL_DAYS = 7;

async function sdbFetch(endpoint: string, responseKey: 'events' | 'results' = 'events'): Promise<SportsDBEvent[]> {
  const ck = `${endpoint}|${responseKey}`;

  // ── Layer 1: in-process memory ──────────────────────────────────────────
  const hit = SDB_ENDPOINT_CACHE.get(ck);
  if (hit && Date.now() - hit.ts < SDB_ENDPOINT_TTL) return hit.data;

  // ── Layer 2: Supabase persistent cache ──────────────────────────────────
  const db = getSdbCacheDb();
  if (db) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: row } = await (db as any)
        .from('sportsdb_events_cache')
        .select('response_data')
        .eq('endpoint', ck)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();
      if (row) {
        const cached = (row as { response_data: SportsDBEvent[] }).response_data;
        SDB_ENDPOINT_CACHE.set(ck, { data: cached, ts: Date.now() }); // backfill L1
        return cached;
      }
    } catch { /* db unavailable — fall through to live fetch */ }
  }

  // ── Layer 3: live SportsDB fetch ─────────────────────────────────────────
  try {
    const res = await fetch(`${SPORTSDB_BASE}/${endpoint}`, {
      signal: AbortSignal.timeout(8_000),
      headers: {
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept':          'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer':         'https://www.thesportsdb.com/',
      },
    });
    if (!res.ok) return []; // 429 / 5xx — do NOT cache failures
    const json = await res.json();
    const data = (json[responseKey] as SportsDBEvent[]) ?? [];

    // Do NOT persist empty responses. TheSportsDB occasionally returns []
    // on transient rate-limit, and caching that for 10 min / 7 days poisons
    // the cache for endpoints that DO have data. Empty results are cheap to
    // refetch and almost always indicate "try again", not "no events exist".
    if (data.length === 0) return data;

    // Store in both caches
    SDB_ENDPOINT_CACHE.set(ck, { data, ts: Date.now() });
    if (db) {
      const expiresAt = new Date(Date.now() + SDB_DB_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      void (db as any).from('sportsdb_events_cache')
        .upsert({ endpoint: ck, response_data: data, fetched_at: new Date().toISOString(), expires_at: expiresAt });
    }

    return data;
  } catch {
    return [];
  }
}

function sportsDBToLocal(dateStr: string, timeStr: string, timeZone: string): { date: string; time: string } {
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const [h, min, sec] = (timeStr || '00:00:00').split(':').map(Number);
    const utc = new Date(Date.UTC(y, m - 1, d, h || 0, min || 0, sec || 0));
    if (Number.isNaN(utc.getTime())) return { date: dateStr, time: '00:00' };
    return formatUtcDateInTimeZone(utc, timeZone);
  } catch {
    return { date: dateStr, time: '00:00' };
  }
}

function mapSDBEvent(event: SportsDBEvent, league: typeof SPORTSDB_ONLY_LEAGUES[0], timeZone: string): MatchEvent {
  const { date, time } = sportsDBToLocal(event.dateEvent, event.strTime || '00:00:00', timeZone);
  return {
    id: `sportsdb-${event.idEvent}`,
    source: 'sportsdb',
    sportId: league.id,
    category: league.category,
    leagueLabel: league.label,
    leagueLogo: league.logo,
    date,
    time,
    home: event.strHomeTeam || event.strEvent || 'TBD',
    away: event.strAwayTeam || '',
    homeLogo: event.strHomeTeamBadge || undefined,
    awayLogo: event.strAwayTeamBadge || undefined,
    round: event.strRound || '',
    tags: [],
    isFeatured: false,
    isSelected: false,
  };
}

// ── Combat Sports (UFC / Boxing) mapper for TheSportsDB events ──────────────

const COMBAT_SPORT_IDS = new Set(['4445']);

/**
 * Parse a TheSportsDB fight event name into card name, home fighter, away fighter.
 *
 * UFC examples:
 *   "UFC 326 Holloway vs Oliveira 2"        → card="UFC 326", home="Holloway", away="Oliveira 2"
 *   "UFC Fight Night 269 Emmett vs Vallejos"  → card="UFC Fight Night 269", home="Emmett", away="Vallejos"
 *   "UFC Fight Night: Adesanya vs. Pyfer"     → card="UFC Fight Night", home="Adesanya", away="Pyfer"
 *   "UFC White House"                         → card="UFC White House", home="UFC White House", away=""
 *
 * Boxing examples:
 *   "Teofimo Lopez vs Shakur Stevenson"   → card="", home="Teofimo Lopez", away="Shakur Stevenson"
 *   "Zuffa Boxing 2 Valenzuela vs Torres" → card="Zuffa Boxing 2", home="Valenzuela", away="Torres"
 */
function parseSDBFightEvent(
  strEvent: string,
  sportsdbId: string
): { cardName: string; home: string; away: string } {
  // Handle "Card Name: Fighter vs. Fighter" (colon-separated, optional dot after vs).
  // TheSportsDB often uses this format, e.g. "UFC Fight Night: Adesanya vs. Pyfer".
  // Must be checked BEFORE the plain-vs path so the colon doesn't end up in home.
  const colonVsMatch = strEvent.match(/^(.+?):\s*(.+?)\s+vs\.?\s+(.+)$/i);
  if (colonVsMatch) {
    return {
      cardName: colonVsMatch[1].trim(),
      home:     colonVsMatch[2].trim(),
      away:     colonVsMatch[3].trim(),
    };
  }

  // Standard "Fighter vs[.] Fighter" or "Card# Fighter vs Fighter" format.
  // Also handles "vs." (with dot) used by ESPN-style names copied into SportsDB.
  const vsMatch = strEvent.match(/^(.+?)\s+vs\.?\s+(.+)$/i);

  if (!vsMatch) {
    // No "vs" — special event (e.g. "UFC White House", "Night of Champions XIV")
    return { cardName: strEvent, home: strEvent, away: '' };
  }

  const leftPart = vsMatch[1].trim();
  const away = vsMatch[2].trim();

  if (sportsdbId === '4443') {
    // UFC: extract numbered card prefix ("UFC 326" or "UFC Fight Night 269")
    const ufcCardMatch = leftPart.match(
      /^(UFC\s+(?:Fight Night\s+)?\d+)\s+(.+)$/i
    );
    if (ufcCardMatch) {
      return { cardName: ufcCardMatch[1].trim(), home: ufcCardMatch[2].trim(), away };
    }
    // No numbered prefix — use "UFC" as card name, full left part as fighter
    return { cardName: 'UFC', home: leftPart, away };
  }

  // Boxing: check for known card-series prefixes (e.g. "Zuffa Boxing 2")
  const boxingCardMatch = leftPart.match(
    /^(Zuffa Boxing\s+\d+|Night of Champions\s+[\w]+)\s+(.+)$/i
  );
  if (boxingCardMatch) {
    return { cardName: boxingCardMatch[1].trim(), home: boxingCardMatch[2].trim(), away };
  }

  // Default for boxing: full left part is fighter name, no card prefix
  return { cardName: '', home: leftPart, away };
}

/**
 * Map a TheSportsDB combat-sport event to a MatchEvent.
 * – For UFC: leagueLabel = "UFC 326: Holloway vs Oliveira 2" (getLeagueAbbrev extracts "UFC 326")
 * – For Boxing: leagueLabel = "Boxing" (no card prefix) or "Zuffa Boxing 2: Valenzuela vs Torres"
 */
function mapSDBCombatEvent(
  event: SportsDBEvent,
  league: typeof SPORTSDB_ONLY_LEAGUES[0],
  timeZone: string
): MatchEvent {
  const { date, time } = sportsDBToLocal(event.dateEvent, event.strTime || '00:00:00', timeZone);
  const { cardName, home, away } = parseSDBFightEvent(event.strEvent, league.sportsdbId);

  // Build leagueLabel used by generateHTML's getLeagueAbbrev:
  //   "UFC 326: Holloway vs Oliveira 2" → abbrev = "UFC 326"
  //   "Boxing" → abbrev = "Boxing"
  let leagueLabel: string;
  if (cardName && away) {
    leagueLabel = `${cardName}: ${home} vs ${away}`;
  } else if (cardName) {
    leagueLabel = cardName;
  } else {
    leagueLabel = league.label;
  }

  return {
    id: `sportsdb-${event.idEvent}`,
    source: 'sportsdb',
    sportId: league.id,
    category: league.category,
    leagueLabel,
    leagueLogo: league.logo,
    date,
    time,
    home,
    away,
    round: '',
    tags: [],
    isFeatured: false,
    isSelected: false,
    cardName: cardName || undefined,
    isMainCard: true,
    fightOrder: 0,
  };
}

/**
 * C-League fan-out strategy (mirrors globall-nine.vercel.app implementation):
 * Calls league next+past endpoints AND per-team next+last for all 10 clubs in
 * parallel, then deduplicates. This is far more reliable than eventsseason.php
 * which is capped at ~15 results on the free tier.
 */
async function fetchCPLFanout(
  league: typeof SPORTSDB_ONLY_LEAGUES[0],
  startDate: string,
  endDate: string,
  timeZone: string
): Promise<MatchEvent[]> {
  const allCalls: Promise<SportsDBEvent[]>[] = [
    sdbFetch(`eventsnextleague.php?id=${league.sportsdbId}`),
    sdbFetch(`eventspastleague.php?id=${league.sportsdbId}`),
    ...CPL_TEAM_IDS.flatMap(id => [
      sdbFetch(`eventsnext.php?id=${id}`),
      sdbFetch(`eventslast.php?id=${id}`, 'results'),
    ]),
  ];

  const settled = await Promise.all(allCalls);
  const allRaw = settled.flat();

  // Deduplicate by idEvent; keep only C-League fixtures (exclude Hun Sen Cup)
  const seen = new Set<string>();
  const deduped = allRaw.filter(e => {
    if (!e?.idEvent) return false;
    if (seen.has(e.idEvent)) return false;
    seen.add(e.idEvent);
    const lg = (e.strLeague ?? '').toLowerCase();
    // Exclude Hun Sen Cup events — they're fetched separately via their own league entry
    if (lg.includes('hun sen')) return false;
    return !lg || lg.includes('cambodia') || lg.includes('c-league') || lg.includes('c league');
  });

  console.log(`[SportsDB] ${league.label} fan-out: ${deduped.length} unique C-League events`);

  const mapped = deduped
    .filter(e => (e.strPostponed ?? 'no').toLowerCase() !== 'yes')
    .map(e => mapSDBEvent(e, league, timeZone))
    .filter(e => e.date >= startDate && e.date <= endDate);

  console.log(`[SportsDB] ✓ ${league.label}: ${mapped.length} events in date range`);
  return mapped;
}

/**
 * Next+past strategy: only 2 API calls per league.
 * The free-tier eventsseason endpoint caps results at 15 (oldest first),
 * so for long seasons the current month's matches are never returned.
 * eventsnextleague / eventspastleague return the ~15 nearest upcoming / recent
 * events which is exactly what we need for a schedule view.
 */
async function fetchSportsDBLeagueByNextPast(
  league: typeof SPORTSDB_ONLY_LEAGUES[0],
  startDate: string,
  endDate: string,
  timeZone: string
): Promise<MatchEvent[]> {
  const allEvents: SportsDBEvent[] = [];
  const seen = new Set<string>();

  console.log(`[SportsDB] ${league.label} (id=${league.sportsdbId}): using next+past strategy`);

  const next = await sdbFetch(`eventsnextleague.php?id=${league.sportsdbId}`);
  for (const e of next) {
    if (!seen.has(e.idEvent)) { seen.add(e.idEvent); allEvents.push(e); }
  }
  if (next.length > 0) console.log(`[SportsDB] ${league.label} eventsnextleague: ${next.length} events`);

  await sleep(300);

  const past = await sdbFetch(`eventspastleague.php?id=${league.sportsdbId}`);
  for (const e of past) {
    if (!seen.has(e.idEvent)) { seen.add(e.idEvent); allEvents.push(e); }
  }
  if (past.length > 0) console.log(`[SportsDB] ${league.label} eventspastleague: ${past.length} events`);

  const mapped = allEvents
    .map(e => mapSDBEvent(e, league, timeZone))
    .filter(e => e.date >= startDate && e.date <= endDate);

  console.log(`[SportsDB] ✓ ${league.label}: ${mapped.length} events in date range (${startDate} to ${endDate})`);
  return mapped;
}

/** Season-based fetch — only used for combat sports (UFC, Boxing) as ESPN fallback */
async function fetchSportsDBCombatBySeason(
  league: typeof SPORTSDB_ONLY_LEAGUES[0],
  startDate: string,
  endDate: string,
  timeZone: string
): Promise<MatchEvent[]> {
  const startYear = parseInt(startDate.slice(0, 4), 10);
  const endYear   = parseInt(endDate.slice(0, 4), 10);
  const years = new Set<number>();
  for (let y = startYear; y <= endYear; y++) years.add(y);
  years.add(startYear - 1);

  const allEvents: SportsDBEvent[] = [];
  const seen = new Set<string>();

  for (const year of Array.from(years).sort()) {
    const events = await sdbFetch(`eventsseason.php?id=${league.sportsdbId}&s=${year}`);
    for (const e of events) {
      if (!seen.has(e.idEvent)) { seen.add(e.idEvent); allEvents.push(e); }
    }
    await sleep(400);
  }

  // If season fetch returned nothing useful, try eventsnextleague as fallback
  const inRange = allEvents.filter(e => e.dateEvent >= startDate && e.dateEvent <= endDate);
  if (inRange.length === 0) {
    const next = await sdbFetch(`eventsnextleague.php?id=${league.sportsdbId}`);
    for (const e of next) {
      if (!seen.has(e.idEvent)) { seen.add(e.idEvent); allEvents.push(e); }
    }
    await sleep(300);
    const past = await sdbFetch(`eventspastleague.php?id=${league.sportsdbId}`);
    for (const e of past) {
      if (!seen.has(e.idEvent)) { seen.add(e.idEvent); allEvents.push(e); }
    }
  }

  const mapped = allEvents
    .map(e => mapSDBCombatEvent(e, league, timeZone))
    .filter(e => e.date >= startDate && e.date <= endDate);

  console.log(`[SportsDB] ✓ ${league.label}: ${mapped.length} combat events in date range`);
  return mapped;
}

// Hun Sen Cup team IDs — 8 teams in the 2025-26 season
const HSC_TEAM_IDS = [139402, 147520, 139397, 139410, 139405, 139401, 139407, 139403];

/**
 * Hun Sen Cup fan-out: league next+past + per-team eventsnext/eventslast.
 * Same approach as CPL but with fewer teams and strict league-name filtering.
 */
async function fetchHSCFanout(
  league: typeof SPORTSDB_ONLY_LEAGUES[0],
  startDate: string,
  endDate: string,
  timeZone: string
): Promise<MatchEvent[]> {
  // Derive the cross-year season string from startDate (e.g. Apr 2026 → "2025-2026")
  const year = parseInt(startDate.slice(0, 4), 10);
  const month = parseInt(startDate.slice(5, 7), 10);
  const season = month >= 8 ? `${year}-${year + 1}` : `${year - 1}-${year}`;

  const allCalls: Promise<SportsDBEvent[]>[] = [
    // Season endpoint is most reliable: returns all cup fixtures including future rounds
    // (next/last per-team endpoints miss HSC games when a team's next game is in C-League)
    sdbFetch(`eventsseason.php?id=${league.sportsdbId}&s=${season}`),
    sdbFetch(`eventsnextleague.php?id=${league.sportsdbId}`),
    sdbFetch(`eventspastleague.php?id=${league.sportsdbId}`),
    ...HSC_TEAM_IDS.flatMap(id => [
      sdbFetch(`eventsnext.php?id=${id}`),
      sdbFetch(`eventslast.php?id=${id}`, 'results'),
    ]),
  ];

  const settled = await Promise.all(allCalls);
  const allRaw = settled.flat();

  const seen = new Set<string>();
  const deduped = allRaw.filter(e => {
    if (!e?.idEvent) return false;
    if (seen.has(e.idEvent)) return false;
    seen.add(e.idEvent);
    const lg = (e.strLeague ?? '').toLowerCase();
    return lg.includes('hun sen');
  });

  console.log(`[SportsDB] ${league.label} fan-out: ${deduped.length} unique Hun Sen Cup events`);

  const mapped = deduped
    .filter(e => (e.strPostponed ?? 'no').toLowerCase() !== 'yes')
    .map(e => mapSDBEvent(e, league, timeZone))
    .filter(e => e.date >= startDate && e.date <= endDate);

  console.log(`[SportsDB] ✓ ${league.label}: ${mapped.length} events in date range`);
  return mapped;
}

async function fetchSportsDBLeague(
  league: typeof SPORTSDB_ONLY_LEAGUES[0],
  startDate: string,
  endDate: string,
  timeZone: string
): Promise<MatchEvent[]> {
  if (league.id === 'soccer-cpl') {
    return fetchCPLFanout(league, startDate, endDate, timeZone);
  }
  if (league.id === 'soccer-hun-sen-cup') {
    return fetchHSCFanout(league, startDate, endDate, timeZone);
  }
  // Combat sports use season-based fetch (ESPN is primary; SportsDB is fallback)
  if (COMBAT_SPORT_IDS.has(league.sportsdbId)) {
    return fetchSportsDBCombatBySeason(league, startDate, endDate, timeZone);
  }
  // MotoGP: use the official MotoGP site API for canonical event names and
  // session times. TheSportsDB is too sparse for the full race-weekend slate.
  if (league.id === 'motogp') {
    return fetchMotoGPOfficial(league, startDate, endDate, timeZone);
  }
  // All other leagues (AFC, UCI World Tour): efficient next+past strategy (2 API calls)
  return fetchSportsDBLeagueByNextPast(league, startDate, endDate, timeZone);
}

// ─────────────────────────────────────────────────────────────────────────────
// Official MotoGP API used by motogp.com.
// ─────────────────────────────────────────────────────────────────────────────
interface MotoGPCalendarEvent {
  id: string;
  name: string;
  additional_name?: string;
  kind?: string;
  date_start: string;
  date_end: string;
  status?: string;
  country?: string;
  shortname?: string;
  time_zone?: string;
  circuit?: { name?: string; region?: string };
}

interface MotoGPBroadcast {
  id: string;
  name: string;
  shortname?: string;
  date_start: string;
  date_end?: string;
  status?: string;
  live?: boolean;
  type?: string;
  category?: { acronym?: string; name?: string };
}

interface MotoGPEventDetail extends MotoGPCalendarEvent {
  broadcasts?: MotoGPBroadcast[];
}

const MOTOGP_API_BASE = 'https://api.pulselive.motogp.com/motogp/v1';
const MOTOGP_HDR = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept':     'application/json',
  'x-client':   'FE',
  'x-referer-path': '/en/calendar',
  'Referer':    'https://www.motogp.com/en/calendar',
};
const MOTOGP_CACHE_TTL = 60 * 60 * 1000; // 1 hour — calendar rarely changes
const motoGpApiCache = new Map<string, { data: unknown; ts: number }>();

const MOTOGP_SESSION_SHORTNAMES = new Set(['FP1', 'FP2', 'FP3', 'P1', 'P2', 'P3', 'PR', 'Q1', 'Q2', 'WUP', 'SPR', 'RAC']);

function cleanMotoGPText(value: string | undefined | null): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function parseMotoGPDate(value: string | undefined): Date | null {
  if (!value) return null;
  const normalized = value.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function motoGPEventTouchesRange(event: MotoGPCalendarEvent, startDate: string, endDate: string): boolean {
  const eventStart = event.date_start.slice(0, 10);
  const eventEnd = event.date_end.slice(0, 10);
  return eventEnd >= startDate && eventStart <= endDate;
}

function isMotoGPScheduleSession(session: MotoGPBroadcast): boolean {
  return (session.type === 'SESSION' || session.type === 'SE')
    && session.category?.acronym === 'MGP'
    && MOTOGP_SESSION_SHORTNAMES.has(session.shortname ?? '');
}

async function motoGpFetch<T>(path: string): Promise<T | null> {
  const hit = motoGpApiCache.get(path);
  if (hit && Date.now() - hit.ts < MOTOGP_CACHE_TTL) return hit.data as T;
  try {
    const res = await fetch(`${MOTOGP_API_BASE}${path}`, {
      headers: MOTOGP_HDR,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as T;
    motoGpApiCache.set(path, { data, ts: Date.now() });
    return data;
  } catch {
    return null;
  }
}

async function fetchMotoGPOfficial(
  league: typeof SPORTSDB_ONLY_LEAGUES[0],
  startDate: string,
  endDate: string,
  timeZone: string
): Promise<MatchEvent[]> {
  const startYear = parseInt(startDate.slice(0, 4), 10);
  const endYear = parseInt(endDate.slice(0, 4), 10);
  const years: number[] = [];
  for (let year = startYear; year <= endYear; year++) years.push(year);

  const calendarEvents = (await Promise.all(
    years.map(year => motoGpFetch<MotoGPCalendarEvent[]>(`/events?seasonYear=${year}`))
  )).flatMap(list => Array.isArray(list) ? list : []);

  const gpEvents = calendarEvents.filter(event =>
    event.kind === 'GP' && motoGPEventTouchesRange(event, startDate, endDate)
  );

  const details = await Promise.all(
    gpEvents.map(event => motoGpFetch<MotoGPEventDetail>(`/events/${event.id}`))
  );

  const out = details.flatMap((detail): MatchEvent[] => {
    if (!detail?.broadcasts?.length) return [];

    const eventTitle = cleanMotoGPText(detail.name || detail.additional_name || league.label);
    const eventRound = cleanMotoGPText(detail.additional_name);
    const sessions = detail.broadcasts.filter(isMotoGPScheduleSession);

    return sessions.map((session): MatchEvent | null => {
      const utc = parseMotoGPDate(session.date_start);
      if (!utc) return null;
      const { date, time } = formatUtcDateInTimeZone(utc, timeZone);
      if (date < startDate || date > endDate) return null;

      const sessionName = cleanMotoGPText(session.name);
      return {
        id: `motogp-official-${detail.id}-${session.id || session.shortname || date}`,
        source: 'sportsdb',
        sportId: league.id,
        category: league.category,
        leagueLabel: league.label,
        leagueLogo: league.logo,
        date,
        time,
        home: sessionName ? `${eventTitle} - ${sessionName}` : eventTitle,
        away: '',
        round: eventRound,
        tags: [],
        isFeatured: false,
        isSelected: false,
        sourceEventId: detail.id,
        isoDate: utc.toISOString(),
        status: session.status || detail.status,
        venue: detail.circuit?.name,
        city: detail.circuit?.region,
        country: detail.country,
      };
    }).filter((event): event is MatchEvent => Boolean(event));
  });

  console.log(`[MotoGP-Official] ${league.label}: ${out.length} official sessions in range (${gpEvents.length} GP events across ${years.length} season year(s))`);
  return out;
}

async function fetchAllSportsDB(startDate: string, endDate: string, timeZone: string): Promise<MatchEvent[]> {
  const results: MatchEvent[] = [];

  // Phase 1: Cambodian leagues use heavy fan-out strategies — run them first
  const cambodianLeagues = SPORTSDB_ONLY_LEAGUES.filter(l => l.id === 'soccer-cpl' || l.id === 'soccer-hun-sen-cup');
  for (const league of cambodianLeagues) {
    try {
      const events = await fetchSportsDBLeague(league, startDate, endDate, timeZone);
      results.push(...events);
    } catch (err) {
      console.warn(`[SportsDB] ${league.label} fetch failed:`, err);
    }
    await sleep(150);
  }

  // Phase 2: Remaining leagues in batches (each uses ≤2-4 API calls)
  // This avoids overwhelming TheSportsDB's rate limiter.
  const otherLeagues = SPORTSDB_ONLY_LEAGUES.filter(l => l.id !== 'soccer-cpl' && l.id !== 'soccer-hun-sen-cup');
  const BATCH_SIZE = 5;

  for (let i = 0; i < otherLeagues.length; i += BATCH_SIZE) {
    const batch = otherLeagues.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map(league => fetchSportsDBLeague(league, startDate, endDate, timeZone))
    );

    for (const outcome of batchResults) {
      if (outcome.status === 'fulfilled') {
        results.push(...outcome.value);
      } else {
        console.warn('[SportsDB] league fetch failed:', outcome.reason);
      }
    }

    // Small delay between batches to lower burst pressure while staying responsive.
    if (i + BATCH_SIZE < otherLeagues.length) {
      await sleep(150);
    }
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN FETCH FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

async function fetchAllEvents(startDate: string, endDate: string, timeZone: string): Promise<MatchEvent[]> {
  console.log(`[Events API] Fetching events from ${startDate} to ${endDate} (${timeZone})`);
  const startTime = Date.now();

  // Fetch ESPN and SportsDB in parallel, but don't let a slow SportsDB pass
  // block the response indefinitely.
  // 15 s accommodates the CPL + Hun Sen Cup fan-outs (~40 parallel requests)
  // plus 9 other league batches.  The old 6 s cap was too tight and silently
  // dropped ALL SportsDB events on wider date ranges when Node was busy.
  const sportsDBBounded = Promise.race<MatchEvent[] | null>([
    fetchAllSportsDB(startDate, endDate, timeZone),
    sleep(15_000).then(() => null),
  ]);

  const [espnEvents, sportsDBEvents] = await Promise.allSettled([
    fetchAllESPN(startDate, endDate, timeZone),
    sportsDBBounded,
  ]);

  if (espnEvents.status === 'rejected') console.warn('[Events API] ESPN fetch failed:', espnEvents.reason);
  if (sportsDBEvents.status === 'rejected') console.warn('[Events API] SportsDB fetch failed:', sportsDBEvents.reason);
  if (sportsDBEvents.status === 'fulfilled' && sportsDBEvents.value === null) {
    console.warn('[Events API] SportsDB timed out for this request; returning ESPN-first payload');
  }

  const rawSportsDBEvents = sportsDBEvents.status === 'fulfilled' && sportsDBEvents.value ? sportsDBEvents.value : [];
  const sdbEvents = rawSportsDBEvents;

  // Diagnostic: count UFC events from each source
  const espnUFC = (espnEvents.status === 'fulfilled' ? espnEvents.value : []).filter(e => e.sportId === 'ufc');
  const sdbUFC = sdbEvents.filter(e => e.sportId === 'ufc');
  console.log(`[Events API] UFC diagnostics: ESPN=${espnUFC.length} fights, SportsDB=${sdbUFC.length} events`);

  // Deduplicate: ESPN takes priority over SportsDB for the same sport+date.
  // This prevents SportsDB fallback entries from showing alongside ESPN individual fights.
  const espnSportDates = new Set(
    (espnEvents.status === 'fulfilled' ? espnEvents.value : []).map(e => `${e.sportId}|${e.date}`)
  );
  const mergedEvents = [
    ...(espnEvents.status === 'fulfilled' ? espnEvents.value : []),
    ...sdbEvents.filter(e => !espnSportDates.has(`${e.sportId}|${e.date}`)),
  ];
  const seen = new Set<string>();
  const deduped = mergedEvents.filter(e => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });

  const elapsed = Date.now() - startTime;
  console.log(`[Events API] ✓ Fetched ${deduped.length} events in ${elapsed}ms`);

  // ── Structured per-source / per-sport diagnostics ─────────────────────────
  // Makes it trivial to spot "missing sport" issues from logs alone.
  const espnAll = espnEvents.status === 'fulfilled' ? espnEvents.value : [];
  const sdbAll  = sportsDBEvents.status === 'fulfilled' && sportsDBEvents.value ? sportsDBEvents.value : [];
  const sourceCounts = { espn: espnAll.length, sportsdb: sdbAll.length };
  const perSport = new Map<string, { espn: number; sportsdb: number }>();
  for (const e of espnAll) {
    const row = perSport.get(e.sportId) ?? { espn: 0, sportsdb: 0 };
    row.espn++;
    perSport.set(e.sportId, row);
  }
  for (const e of sdbAll) {
    const row = perSport.get(e.sportId) ?? { espn: 0, sportsdb: 0 };
    row.sportsdb++;
    perSport.set(e.sportId, row);
  }
  const zeroSports = [...perSport.entries()].filter(([, c]) => c.espn === 0 && c.sportsdb === 0).map(([id]) => id);
  console.log(`[Events API] sources: espn=${sourceCounts.espn} sportsdb=${sourceCounts.sportsdb} merged=${deduped.length}`);
  if (zeroSports.length > 0) {
    console.log(`[Events API] sports with zero events in window: ${zeroSports.join(', ')}`);
  }

  return deduped;
}

// ═══════════════════════════════════════════════════════════════════════════════
// API ROUTE HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

export async function GET(req: NextRequest) {
  // Auth can fail locally (e.g. transient env/read issues in synced folders).
  // Keep core event feed available and only skip per-user custom events.
  let supabase: Awaited<ReturnType<typeof createClient>> | null = null;
  let userId: string | null = null;

  try {
    supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch (err) {
    console.warn('[Events API] Auth init failed, continuing without user context:', err);
  }

  const { searchParams } = new URL(req.url);
  const sportId = searchParams.get('sportId');
  const scope = searchParams.get('scope');
  const startDate = searchParams.get('start');
  const endDate = searchParams.get('end');
  const timeZone = normalizeTimeZone(searchParams.get('timeZone'));

  if (sportId === WORLD_CUP_SPORT_ID && scope === 'all') {
    const payload = await fetchWorldCupFixtures(timeZone);
    return NextResponse.json({
      events: payload.fixtures,
      cached: false,
      source: payload.source,
      complete: payload.complete,
      updatedAt: payload.updatedAt,
      scope: 'world-cup-all',
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900' },
    });
  }

  if (!startDate || !endDate) {
    return NextResponse.json(
      { error: 'Missing start or end date' },
      { status: 400 }
    );
  }

  // Fetch this user's custom events (per-user, not server-cached)
  const getCustomEvents = async (): Promise<MatchEvent[]> => {
    if (!supabase || !userId) return [];

    const customCacheKey = `${userId}|${startDate}|${endDate}`;
    const now = Date.now();
    const cachedCustom = CUSTOM_EVENTS_CACHE.get(customCacheKey);
    if (cachedCustom && now - cachedCustom.timestamp < CUSTOM_EVENTS_CACHE_TTL) {
      return cachedCustom.data;
    }

    try {
      const { data } = await supabase
        .from('custom_events')
        .select('event_data')
        .eq('user_id', userId)
        .gt('expires_at', new Date().toISOString());
      const all = (data ?? []).map(r => r.event_data as MatchEvent);
      const filtered = all.filter(e => e.date >= startDate && e.date <= endDate);
      CUSTOM_EVENTS_CACHE.set(customCacheKey, { data: filtered, timestamp: now });
      return filtered;
    } catch { return []; }
  };

  const cacheKey = `${startDate}|${endDate}|${timeZone}`;
  const now = Date.now();
  const cached = CACHE.get(cacheKey);

  // GC any orphaned fetch locks before checking
  gcStaleFetchLocks();

  // Return cached data if fresh
  if (cached && now - cached.timestamp < CACHE_TTL) {
    const customEvents = await getCustomEvents();
    return NextResponse.json({
      events: [...cached.data, ...customEvents],
      cached: true,
      age: Math.round((now - cached.timestamp) / 1000),
    }, { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=600' } });
  }

  // Return stale data while refreshing in background
  if (cached && now - cached.timestamp < STALE_OK_TTL && !fetchPromises.has(cacheKey)) {
    // Start background refresh
    const bgPromise = fetchAllEvents(startDate, endDate, timeZone).then(events => {
      CACHE.set(cacheKey, { data: events, timestamp: Date.now() });
      fetchPromises.delete(cacheKey);
      return events;
    }).catch(err => {
      console.error('[Events API] Background refresh failed:', err);
      fetchPromises.delete(cacheKey);
      return cached.data;
    });
    fetchPromises.set(cacheKey, { promise: bgPromise, startedAt: Date.now() });

    const customEvents = await getCustomEvents();
    return NextResponse.json({
      events: [...cached.data, ...customEvents],
      cached: true,
      stale: true,
      age: Math.round((now - cached.timestamp) / 1000),
    }, { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=300' } });
  }

  // Need fresh data
  try {
    // Prevent thundering herd — reuse existing fetch for the same date range.
    // Each date range gets its own promise so different-range requests never
    // return each other's data.
    if (fetchPromises.has(cacheKey)) {
      const [events, customEvents] = await Promise.all([fetchPromises.get(cacheKey)!.promise, getCustomEvents()]);
      return NextResponse.json({ events: [...events, ...customEvents], cached: false });
    }

    const p = fetchAllEvents(startDate, endDate, timeZone);
    fetchPromises.set(cacheKey, { promise: p, startedAt: Date.now() });
    // ── Parallel-fetch custom events from Supabase alongside the external
    //    sports APIs so the user's manual events don't add ~50-200ms of
    //    serial Supabase latency on top of the (already slow) ESPN/SportsDB fan-out.
    const [events, customEvents] = await Promise.all([p, getCustomEvents()]);

    CACHE.set(cacheKey, { data: events, timestamp: Date.now() });
    fetchPromises.delete(cacheKey);

    return NextResponse.json({ events: [...events, ...customEvents], cached: false }, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=600' },
    });
  } catch (err) {
    fetchPromises.delete(cacheKey);
    console.error('[Events API] Fetch failed:', err);

    // Return stale data on error if available
    if (cached) {
      const customEvents = await getCustomEvents();
      return NextResponse.json({
        events: [...cached.data, ...customEvents],
        cached: true,
        stale: true,
        error: 'Fetch failed, returning stale data',
      });
    }

    return NextResponse.json(
      { error: 'Failed to fetch events', events: [] },
      { status: 500 }
    );
  }
}
