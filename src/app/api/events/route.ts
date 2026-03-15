import { NextRequest, NextResponse } from 'next/server';
import type { MatchEvent } from '@/types';
import { createClient } from '@/lib/supabase/server';

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

// Fetch lock to prevent thundering herd
let fetchPromise: Promise<MatchEvent[]> | null = null;

// ═══════════════════════════════════════════════════════════════════════════════
// ESPN API
// ═══════════════════════════════════════════════════════════════════════════════

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports';

// Priority tiers - high priority leagues fetch first
const ESPN_PRIORITY_LEAGUES = [
  // Tier 1: Most important leagues
  { id: 'soccer-epl', slug: 'soccer/eng.1' },
  { id: 'soccer-ucl', slug: 'soccer/uefa.champions' },
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
  { id: 'soccer-belgian', slug: 'soccer/bel.1' },
  { id: 'soccer-spfl', slug: 'soccer/sco.1' },
  { id: 'soccer-eredivisie', slug: 'soccer/ned.1' },
  // Americas & Asia
  { id: 'soccer-mls', slug: 'soccer/usa.1' },
  { id: 'soccer-ligamx', slug: 'soccer/mex.1' },
  { id: 'soccer-aleague', slug: 'soccer/aus.1' },
  { id: 'soccer-saudipro', slug: 'soccer/ksa.1' },
  { id: 'soccer-jleague', slug: 'soccer/jpn.1' },
  { id: 'soccer-copam', slug: 'soccer/conmebol.libertadores' },
  // Other US sports
  { id: 'basketball-wnba', slug: 'basketball/wnba' },
  { id: 'basketball-ncaam', slug: 'basketball/mens-college-basketball' },
  { id: 'basketball-nbl', slug: 'basketball/nbl' },
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
  'soccer-belgian': { label: 'Belgian Pro League', category: 'Football', logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/34.png' },
  'soccer-spfl': { label: 'SPFL Scottish Prem', category: 'Football', logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/55.png' },
  'soccer-eredivisie': { label: 'Eredivisie', category: 'Football', logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/11.png' },
  'soccer-mls': { label: 'MLS', category: 'Football', logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/19.png' },
  'soccer-ligamx': { label: 'Liga MX', category: 'Football', logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/29.png' },
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
  'basketball-ncaam': { label: "NCAA Men's Basketball", category: 'Basketball', logo: 'https://a.espncdn.com/i/teamlogos/leagues/500/ncaa.png' },
  'basketball-nbl': { label: 'NBL Australia', category: 'Basketball', logo: 'https://r2.thesportsdb.com/images/media/league/badge/gvz6vb1726086476.png' },
  'football-nfl': { label: 'NFL', category: 'American Football', logo: 'https://a.espncdn.com/i/teamlogos/leagues/500/nfl.png' },
  'football-ncaaf': { label: 'NCAA Football', category: 'American Football', logo: 'https://a.espncdn.com/i/teamlogos/leagues/500/ncaa.png' },
  'baseball-mlb': { label: 'MLB', category: 'Baseball', logo: 'https://a.espncdn.com/i/teamlogos/leagues/500/mlb.png' },
  'hockey-nhl': { label: 'NHL', category: 'Ice Hockey', logo: 'https://a.espncdn.com/i/teamlogos/leagues/500/nhl.png' },
  'cricket-ipl': { label: 'IPL', category: 'Cricket', logo: 'https://r2.thesportsdb.com/images/media/league/badge/gaiti11741709844.png' },
  'cricket-bbl': { label: 'Big Bash League', category: 'Cricket', logo: 'https://r2.thesportsdb.com/images/media/league/badge/yko7ny1546635346.png' },
  'f1': { label: 'Formula 1', category: 'Motorsport', logo: 'https://r2.thesportsdb.com/images/media/league/badge/g8cofl1513623681.png' },
  'motogp': { label: 'MotoGP', category: 'Motorsport', logo: 'https://r2.thesportsdb.com/images/media/league/badge/gg3c201768486075.png' },
  'indycar': { label: 'IndyCar', category: 'Motorsport', logo: 'https://a.espncdn.com/i/teamlogos/leagues/500/indycar.png' },
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
  'tennis-wta': { label: 'WTA Tour', category: 'Tennis', logo: 'https://www.thesportsdb.com/images/media/league/badge/bddhun1768210678.png' },
  'golf-pga': { label: 'PGA Tour', category: 'Golf', logo: 'https://a.espncdn.com/i/teamlogos/leagues/500/pga.png' },
  'golf-lpga': { label: 'LPGA Tour', category: 'Golf', logo: 'https://a.espncdn.com/i/teamlogos/leagues/500/lpga.png' },
};

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Convert UTC ISO string to ICT date/time */
function utcToICT(utcDateString: string): { date: string; time: string } {
  try {
    const utc = new Date(utcDateString);
    const ictMs = utc.getTime() + 7 * 60 * 60 * 1000;
    const ict = new Date(ictMs);
    const date = ict.toISOString().split('T')[0];
    const time = ict.toISOString().split('T')[1].slice(0, 5);
    return { date, time };
  } catch {
    return { date: '', time: '' };
  }
}

/** Build ESPN date range string */
function espnDateRange(start: string, end: string): string {
  return `${start.replace(/-/g, '')}-${end.replace(/-/g, '')}`;
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
async function espnFetchWithRetry(url: string, ms = 4_000): Promise<any> {
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
}

interface ESPNCompetitionRaw {
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
  competitions?: ESPNCompetitionRaw[];
  groupings?: {
    grouping: { id: string; slug: string; displayName: string };
    competitions: ESPNCompetitionRaw[];
  }[];
}

// ── Helper: extract competitor name from ESPN competitor object ───────────────
function getCompName(c: ESPNCompetitorRaw | undefined): string {
  return c?.team?.displayName || c?.athlete?.displayName || c?.athlete?.fullName || '';
}

// ── MMA / Boxing mapper — one MatchEvent per fight (iterates ALL competitions) ──
function mapMMAFights(
  events: ESPNEvent[],
  league: { id: string; slug: string },
  meta: { label: string; category: string; logo: string }
): MatchEvent[] {
  const results: MatchEvent[] = [];

  for (const event of events) {
    // Use the full event name so each card has a unique label (e.g. "UFC Fight Night: Emmett vs. Vallejos")
    const cardName = event.name || event.shortName || meta.label;
    const { date, time } = utcToICT(event.date);
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
      const fightTime = comp.date ? utcToICT(comp.date) : { date, time };
      const weightClass = comp.type?.abbreviation ?? '';

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
        homeLogo: f1?.team?.logo || '',
        awayLogo: f2?.team?.logo || '',
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
  meta: { label: string; category: string; logo: string }
): MatchEvent[] {
  const results: MatchEvent[] = [];

  for (const event of events) {
    const gpName = (event.shortName || event.name || 'TBD')
      .replace(/Grand Prix/gi, 'GP')
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

      const sessionTime = comp.date ? utcToICT(comp.date) : utcToICT(event.date);

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
function mapTennisMatches(
  events: ESPNEvent[],
  league: { id: string; slug: string },
  meta: { label: string; category: string; logo: string }
): MatchEvent[] {
  const results: MatchEvent[] = [];

  for (const event of events) {
    const tournamentName = event.shortName || event.name || meta.label;

    for (const group of event.groupings ?? []) {
      const drawSlug = group.grouping.slug || '';
      // Skip doubles — ESPN often has missing athlete names for doubles
      if (drawSlug.includes('doubles')) continue;

      for (const comp of group.competitions ?? []) {
        const competitors = comp.competitors ?? [];
        const p1 = competitors.find(c => c.order === 1) ?? competitors[0];
        const p2 = competitors.find(c => c.order === 2) ?? competitors[1];
        const p1Name = p1 ? getCompName(p1) : '';
        const p2Name = p2 ? getCompName(p2) : '';
        if (!p1Name || !p2Name) continue;

        const matchTime = comp.date ? utcToICT(comp.date) : utcToICT(event.date);
        const roundName = comp.round?.displayName || '';
        const drawLabel = group.grouping.displayName || '';
        const round = roundName ? `${drawLabel} – ${roundName}` : drawLabel;

        results.push({
          id: `espn-${league.id}-${event.id}-${comp.competitors?.[0]?.athlete?.displayName || ''}-${comp.competitors?.[1]?.athlete?.displayName || ''}`.replace(/\s+/g, '-'),
          source: 'espn',
          sportId: league.id,
          category: meta.category,
          leagueLabel: `${meta.label}: ${tournamentName}`,
          leagueLogo: meta.logo,
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
      }
    }
  }

  return results;
}

// ── Default team-sport mapper (soccer, basketball, etc.) ─────────────────────
function mapTeamSportEvents(
  events: ESPNEvent[],
  league: { id: string; slug: string },
  meta: { label: string; category: string; logo: string }
): MatchEvent[] {
  const isGolf = league.slug.startsWith('golf/');

  return events.map((event): MatchEvent => {
    const comp = event.competitions?.[0];
    const competitors = comp?.competitors ?? [];
    const home = competitors.find(c => c.homeAway === 'home') ?? competitors[0];
    const away = competitors.find(c => c.homeAway === 'away') ?? competitors[1];
    const { date, time } = utcToICT(event.date);

    let homeName = home ? getCompName(home) : '';
    let awayName = away ? getCompName(away) : '';

    if (isGolf) {
      homeName = event.name || event.shortName || 'TBD';
      awayName = '';
    }

    // Round info from event name
    let round = '';
    const name = event.name || '';
    if (name.includes(' - ')) {
      const parts = name.split(' - ');
      if (parts.length > 1) round = parts[parts.length - 1].trim();
    }

    return {
      id: `espn-${league.id}-${event.id}`,
      source: 'espn',
      sportId: league.id,
      category: meta.category,
      leagueLabel: meta.label,
      leagueLogo: meta.logo,
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
    };
  }).filter(e => e.date && e.home !== 'TBD');
}

async function fetchESPNLeague(
  league: { id: string; slug: string },
  startDate: string,
  endDate: string
): Promise<MatchEvent[]> {
  const meta = LEAGUE_METADATA[league.id];
  if (!meta) return [];

  try {
    const isMMA = league.slug.startsWith('mma/') || league.slug.startsWith('boxing/');
    const isMotorsport = league.slug.startsWith('racing/');
    const isTennis = league.slug.startsWith('tennis/');
    const dateParam = espnDateRange(startDate, endDate);
    const url = `${ESPN_BASE}/${league.slug}/scoreboard?dates=${dateParam}&limit=1000`;

    const data = await espnFetchWithRetry(url, 3_500);

    // Diagnostic logging for combat sports (UFC/Bellator)
    if (isMMA) {
      const eventCount = data?.events?.length ?? 0;
      const fightCount = data?.events?.reduce((sum: number, e: ESPNEvent) => sum + (e.competitions?.length ?? 0), 0) ?? 0;
      console.log(`[ESPN-MMA] ${league.id}: fetch ${data ? 'OK' : 'FAILED'}, ${eventCount} events, ${fightCount} fights, url=${url}`);
    }

    if (!data?.events) {
      const stale = pathCache.get(league.id);
      if (stale && Date.now() - stale.fetchedAt < PATH_STALE_MAX_MS) {
        console.log(`[ESPN] ${league.id} failed → serving ${stale.events.length} stale events`);
        return stale.events;
      }
      console.warn(`[ESPN] ${league.id} returned no data`);
      return [];
    }

    const events: ESPNEvent[] = data.events ?? [];

    // Route to the correct mapper based on sport type
    let parsed: MatchEvent[];
    if (isMMA) {
      parsed = mapMMAFights(events, league, meta);
    } else if (isMotorsport) {
      parsed = mapMotorsportSessions(events, league, meta);
    } else if (isTennis) {
      parsed = mapTennisMatches(events, league, meta);
    } else {
      parsed = mapTeamSportEvents(events, league, meta);
    }

    if (parsed.length > 0) {
      pathCache.set(league.id, { events: parsed, fetchedAt: Date.now() });
    }
    if (isMMA) console.log(`[ESPN-MMA] ${league.id}: mapped ${parsed.length} fights from ${events.length} events`);
    return parsed;
  } catch (err) {
    const stale = pathCache.get(league.id);
    if (stale && Date.now() - stale.fetchedAt < PATH_STALE_MAX_MS) {
      console.log(`[ESPN] ${league.id} error → serving ${stale.events.length} stale events`);
      return stale.events;
    }
    console.warn(`[ESPN] ${league.id} failed:`, (err as Error).message);
    return [];
  }
}

/** Fetch ESPN leagues with controlled concurrency without strict batch bottlenecks */
async function fetchAllESPN(startDate: string, endDate: string): Promise<MatchEvent[]> {
  const allLeagues = [...ESPN_PRIORITY_LEAGUES, ...ESPN_SECONDARY_LEAGUES];
  const results: MatchEvent[] = [];
  const CONCURRENCY = 15;
  let i = 0;

  const workers = Array(CONCURRENCY).fill(null).map(async () => {
    while (i < allLeagues.length) {
      const league = allLeagues[i++];
      if (!league) break;
      try {
        const events = await fetchESPNLeague(league, startDate, endDate);
        results.push(...events);
      } catch (err) {
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

// C-League team IDs — all 10 clubs in the 2025-26 season
const CPL_TEAM_IDS = [139406, 139402, 147520, 139397, 149110, 152838, 139410, 139405, 139401, 139407];

async function sdbFetch(endpoint: string, responseKey: 'events' | 'results' = 'events'): Promise<SportsDBEvent[]> {
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
    if (!res.ok) return [];
    const json = await res.json();
    return (json[responseKey] as SportsDBEvent[]) ?? [];
  } catch {
    return [];
  }
}

function sportsDBToICT(dateStr: string, timeStr: string): { date: string; time: string } {
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const [h, min] = (timeStr || '00:00:00').split(':').map(Number);
    const utc = Date.UTC(y, m - 1, d, h, min);
    const ictMs = utc + 7 * 60 * 60 * 1000;
    const ict = new Date(ictMs);
    return {
      date: ict.toISOString().split('T')[0],
      time: ict.toISOString().split('T')[1].slice(0, 5),
    };
  } catch {
    return { date: dateStr, time: '00:00' };
  }
}

function mapSDBEvent(event: SportsDBEvent, league: typeof SPORTSDB_ONLY_LEAGUES[0]): MatchEvent {
  const { date, time } = sportsDBToICT(event.dateEvent, event.strTime || '00:00:00');
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
 *   "UFC 326 Holloway vs Oliveira 2"      → card="UFC 326", home="Holloway", away="Oliveira 2"
 *   "UFC Fight Night 269 Emmett vs Vallejos" → card="UFC Fight Night 269", home="Emmett", away="Vallejos"
 *   "UFC White House"                      → card="UFC White House", home="UFC White House", away=""
 *
 * Boxing examples:
 *   "Teofimo Lopez vs Shakur Stevenson"   → card="", home="Teofimo Lopez", away="Shakur Stevenson"
 *   "Zuffa Boxing 2 Valenzuela vs Torres" → card="Zuffa Boxing 2", home="Valenzuela", away="Torres"
 */
function parseSDBFightEvent(
  strEvent: string,
  sportsdbId: string
): { cardName: string; home: string; away: string } {
  const vsMatch = strEvent.match(/^(.+?)\s+vs\s+(.+)$/i);

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
  league: typeof SPORTSDB_ONLY_LEAGUES[0]
): MatchEvent {
  const { date, time } = sportsDBToICT(event.dateEvent, event.strTime || '00:00:00');
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
  endDate: string
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

  // Deduplicate by idEvent; keep only C-League fixtures
  const seen = new Set<string>();
  const deduped = allRaw.filter(e => {
    if (!e?.idEvent) return false;
    if (seen.has(e.idEvent)) return false;
    seen.add(e.idEvent);
    const lg = (e.strLeague ?? '').toLowerCase();
    return !lg || lg.includes('cambodia') || lg.includes('c-league') || lg.includes('c league');
  });

  console.log(`[SportsDB] ${league.label} fan-out: ${deduped.length} unique C-League events`);

  const mapped = deduped
    .filter(e => (e.strPostponed ?? 'no').toLowerCase() !== 'yes')
    .map(e => mapSDBEvent(e, league))
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
  endDate: string
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
    .map(e => mapSDBEvent(e, league))
    .filter(e => e.date >= startDate && e.date <= endDate);

  console.log(`[SportsDB] ✓ ${league.label}: ${mapped.length} events in date range (${startDate} to ${endDate})`);
  return mapped;
}

/** Season-based fetch — only used for combat sports (UFC, Boxing) as ESPN fallback */
async function fetchSportsDBCombatBySeason(
  league: typeof SPORTSDB_ONLY_LEAGUES[0],
  startDate: string,
  endDate: string
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
    .map(e => mapSDBCombatEvent(e, league))
    .filter(e => e.date >= startDate && e.date <= endDate);

  console.log(`[SportsDB] ✓ ${league.label}: ${mapped.length} combat events in date range`);
  return mapped;
}

async function fetchSportsDBLeague(
  league: typeof SPORTSDB_ONLY_LEAGUES[0],
  startDate: string,
  endDate: string
): Promise<MatchEvent[]> {
  if (league.id === 'soccer-cpl') {
    return fetchCPLFanout(league, startDate, endDate);
  }
  // Combat sports use season-based fetch (ESPN is primary; SportsDB is fallback)
  if (COMBAT_SPORT_IDS.has(league.sportsdbId)) {
    return fetchSportsDBCombatBySeason(league, startDate, endDate);
  }
  // All other leagues (AFC, MotoGP): efficient next+past strategy (2 API calls)
  return fetchSportsDBLeagueByNextPast(league, startDate, endDate);
}

async function fetchAllSportsDB(startDate: string, endDate: string): Promise<MatchEvent[]> {
  const results: MatchEvent[] = [];

  // Phase 1: CPL uses a heavy fan-out strategy (22 requests) — run it first alone
  const cplLeague = SPORTSDB_ONLY_LEAGUES.find(l => l.id === 'soccer-cpl');
  if (cplLeague) {
    try {
      const cplEvents = await fetchSportsDBLeague(cplLeague, startDate, endDate);
      results.push(...cplEvents);
    } catch (err) {
      console.warn('[SportsDB] CPL fetch failed:', err);
    }
    await sleep(150);
  }

  // Phase 2: Remaining leagues in batches of 3 (each uses ≤2-4 API calls)
  // This avoids overwhelming TheSportsDB's rate limiter.
  const otherLeagues = SPORTSDB_ONLY_LEAGUES.filter(l => l.id !== 'soccer-cpl');
  const BATCH_SIZE = 5;

  for (let i = 0; i < otherLeagues.length; i += BATCH_SIZE) {
    const batch = otherLeagues.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map(league => fetchSportsDBLeague(league, startDate, endDate))
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

async function fetchAllEvents(startDate: string, endDate: string): Promise<MatchEvent[]> {
  console.log(`[Events API] Fetching events from ${startDate} to ${endDate}`);
  const startTime = Date.now();

  // Fetch ESPN and SportsDB in parallel, but don't let a slow SportsDB pass
  // block first paint for the schedule page.
  const sportsDBBounded = Promise.race<MatchEvent[] | null>([
    fetchAllSportsDB(startDate, endDate),
    sleep(2_500).then(() => null),
  ]);

  const [espnEvents, sportsDBEvents] = await Promise.allSettled([
    fetchAllESPN(startDate, endDate),
    sportsDBBounded,
  ]);

  if (espnEvents.status === 'rejected') console.warn('[Events API] ESPN fetch failed:', espnEvents.reason);
  if (sportsDBEvents.status === 'rejected') console.warn('[Events API] SportsDB fetch failed:', sportsDBEvents.reason);
  if (sportsDBEvents.status === 'fulfilled' && sportsDBEvents.value === null) {
    console.warn('[Events API] SportsDB timed out for this request; returning ESPN-first payload');
  }

  // Diagnostic: count UFC events from each source
  const espnUFC = (espnEvents.status === 'fulfilled' ? espnEvents.value : []).filter(e => e.sportId === 'ufc');
  const sdbEvents = sportsDBEvents.status === 'fulfilled' && sportsDBEvents.value ? sportsDBEvents.value : [];
  const sdbUFC = sdbEvents.filter(e => e.sportId === 'ufc');
  console.log(`[Events API] UFC diagnostics: ESPN=${espnUFC.length} fights, SportsDB=${sdbUFC.length} events`);

  // Deduplicate: ESPN takes priority over SportsDB for the same sport+date.
  // This prevents SportsDB fallback entries from showing alongside ESPN individual fights.
  const espnSportDates = new Set(
    (espnEvents.status === 'fulfilled' ? espnEvents.value : []).map(e => `${e.sportId}|${e.date}`)
  );
  const mergedEvents = [
    ...(espnEvents.status === 'fulfilled' ? espnEvents.value : []),
    ...(sportsDBEvents.status === 'fulfilled' && sportsDBEvents.value
      ? sportsDBEvents.value.filter(e => !espnSportDates.has(`${e.sportId}|${e.date}`))
      : []),
  ];
  const seen = new Set<string>();
  const deduped = mergedEvents.filter(e => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });

  const elapsed = Date.now() - startTime;
  console.log(`[Events API] ✓ Fetched ${deduped.length} events in ${elapsed}ms`);

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
  const startDate = searchParams.get('start');
  const endDate = searchParams.get('end');

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

  const cacheKey = `${startDate}|${endDate}`;
  const now = Date.now();
  const cached = CACHE.get(cacheKey);

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
  if (cached && now - cached.timestamp < STALE_OK_TTL && !fetchPromise) {
    // Start background refresh
    fetchPromise = fetchAllEvents(startDate, endDate).then(events => {
      CACHE.set(cacheKey, { data: events, timestamp: Date.now() });
      fetchPromise = null;
      return events;
    }).catch(err => {
      console.error('[Events API] Background refresh failed:', err);
      fetchPromise = null;
      return cached.data;
    });

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
    // Prevent thundering herd - reuse existing fetch if in progress
    if (fetchPromise) {
      const [events, customEvents] = await Promise.all([fetchPromise, getCustomEvents()]);
      return NextResponse.json({ events: [...events, ...customEvents], cached: false });
    }

    fetchPromise = fetchAllEvents(startDate, endDate);
    const events = await fetchPromise;
    
    CACHE.set(cacheKey, { data: events, timestamp: Date.now() });
    fetchPromise = null;

    const customEvents = await getCustomEvents();
    return NextResponse.json({ events: [...events, ...customEvents], cached: false }, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=600' },
    });
  } catch (err) {
    fetchPromise = null;
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
