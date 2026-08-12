import { createClient } from '@supabase/supabase-js';

// ── ESPN multi-host fetch layer ─────────────────────────────────────────────
// site.api.espn.com sits behind Akamai bot management and returns 403 for
// Vercel datacenter IPs (observed 2026-08). Two other ESPN hosts serve the
// same data without bot blocking:
//   1. cdn.espn.com/core/{sport}/scoreboard?xhr=1  — day-oriented, inline data
//   2. sports.core.api.espn.com/v2                 — $ref-based core API
// site.api is kept as a last resort so the feed self-heals if the block lifts.

export interface EspnRawCompetitor {
  homeAway?: string;
  order?: number;
  team?: { displayName?: string; logo?: string };
  athlete?: { displayName?: string; fullName?: string; flag?: { href: string; alt: string } };
  curatedRank?: { current?: number };
}

export interface EspnRawCompetition {
  id?: string;
  date?: string;
  competitors?: EspnRawCompetitor[];
  type?: { abbreviation?: string; text?: string; slug?: string };
  round?: { id?: string; displayName?: string };
  status?: { type: { state?: string; description?: string } };
}

export interface EspnRawEvent {
  id: string;
  name?: string;
  shortName?: string;
  date: string;
  season?: { slug?: string };
  status?: { type?: { state?: string; description?: string } };
  notes?: Array<{ headline?: string }>;
  competitions?: EspnRawCompetition[];
  groupings?: {
    grouping: { id: string; slug: string; displayName: string };
    competitions: EspnRawCompetition[];
  }[];
}

export type EspnHost = 'cdn' | 'core' | 'site';

export interface EspnFetchResult {
  events: EspnRawEvent[];
  host: EspnHost;
  /** true for golf/tennis via core API — events are tournaments, not matches */
  tournamentOnly?: boolean;
}

const SITE_BASE = 'https://site.api.espn.com/apis/site/v2/sports';
const CDN_BASE = 'https://cdn.espn.com/core';
const CORE_BASE = 'https://sports.core.api.espn.com/v2/sports';

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.espn.com/',
  'Origin': 'https://www.espn.com',
};

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function fetchJson<T>(url: string, timeoutMs: number): Promise<T | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: BROWSER_HEADERS, cache: 'no-store' });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function enumerateDays(startDate: string, endDate: string): string[] {
  const days: string[] = [];
  const d = new Date(startDate + 'T00:00:00Z');
  const last = new Date(endDate + 'T00:00:00Z');
  while (d <= last) {
    days.push(d.toISOString().split('T')[0]);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return days;
}

function toCoreSlug(slug: string): { sport: string; league: string } | null {
  const [sport, league] = slug.split('/');
  if (!sport || !league) return null;
  return { sport, league };
}

// ── CDN host (cdn.espn.com) ─────────────────────────────────────────────────

function cdnTargetFor(slug: string): { sportPath: string; league?: string } | null {
  if (slug.startsWith('soccer/')) return { sportPath: 'soccer', league: slug.slice(7) };
  if (slug.startsWith('cricket/')) return { sportPath: 'cricket', league: slug.slice(8) };
  if (slug.startsWith('rugby/')) return { sportPath: 'rugby', league: slug.slice(6) };
  const direct: Record<string, string> = {
    'basketball/nba': 'nba',
    'basketball/wnba': 'wnba',
    'basketball/mens-college-basketball': 'mens-college-basketball',
    'basketball/womens-college-basketball': 'womens-college-basketball',
    'football/nfl': 'nfl',
    'football/college-football': 'college-football',
    'baseball/mlb': 'mlb',
    'australian-football/afl': 'afl',
  };
  const p = direct[slug];
  return p ? { sportPath: p } : null;
}

interface CdnScoreboardResponse {
  content?: {
    dateParams?: { date?: string };
    sbData?: { day?: { date?: string }; events?: EspnRawEvent[] };
  };
}

/** Fetch one day from the CDN scoreboard. Returns the served day's events, or
 *  null on failure. The CDN snaps to the nearest game day when the requested
 *  day has none, so callers must compare the echoed day to the requested day. */
async function fetchCdnDay(
  target: { sportPath: string; league?: string },
  yyyymmdd: string,
): Promise<{ requested: string; servedDay: string; events: EspnRawEvent[] } | null> {
  const leagueQs = target.league ? `&league=${encodeURIComponent(target.league)}` : '';
  const url = `${CDN_BASE}/${target.sportPath}/scoreboard?xhr=1${leagueQs}&dates=${yyyymmdd}&limit=1000`;
  const data = await fetchJson<CdnScoreboardResponse>(url, 4_000);
  if (!data?.content?.sbData) return null;
  const servedDay =
    data.content.sbData.day?.date?.replace(/-/g, '') ||
    data.content.dateParams?.date ||
    '';
  return { requested: yyyymmdd, servedDay, events: data.content.sbData.events ?? [] };
}

async function fetchViaCdn(
  slug: string,
  startDate: string,
  endDate: string,
): Promise<EspnRawEvent[] | null> {
  const target = cdnTargetFor(slug);
  if (!target) return null;

  // Include the day before the range so UTC games that shift past midnight
  // into the requested window (viewer timezone) are not missed.
  const dayBefore = new Date(startDate + 'T00:00:00Z');
  dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
  const days = enumerateDays(dayBefore.toISOString().split('T')[0], endDate);

  // Long ranges: the day loop gets too chatty — defer to the core API, which
  // handles date ranges natively.
  if (days.length > 45) return null;

  const seen = new Set<string>();
  const all: EspnRawEvent[] = [];
  let anySuccess = false;
  let consecutiveFailures = 0;
  let idx = 0;
  const CONCURRENCY = 4;

  const workers = Array(Math.min(CONCURRENCY, days.length)).fill(null).map(async () => {
    while (idx < days.length) {
      // Akamai answers datacenter fetch fingerprints with 202/empty — bail out
      // fast instead of burning the whole day loop.
      if (!anySuccess && consecutiveFailures >= 2) break;
      const day = days[idx++];
      if (!day) break;
      const yyyymmdd = day.replace(/-/g, '');
      const res = await fetchCdnDay(target, yyyymmdd);
      if (res) {
        anySuccess = true;
        consecutiveFailures = 0;
        // Skip snapped-forward responses — that day is fetched on its own turn.
        if (res.servedDay === yyyymmdd) {
          for (const ev of res.events) {
            if (ev?.id && !seen.has(ev.id)) {
              seen.add(ev.id);
              all.push(ev);
            }
          }
        }
      } else {
        consecutiveFailures++;
      }
      await sleep(30);
    }
  });
  await Promise.allSettled(workers);

  return anySuccess ? all : null;
}

// ── Core API host (sports.core.api.espn.com) ────────────────────────────────

interface CoreRef { $ref?: string }
interface CoreListResponse { count?: number; items?: CoreRef[] }

function coreUrl(ref: string): string {
  return ref.replace(/^http:\/\//i, 'https://');
}

async function fetchCoreRefs(listUrl: string, timeoutMs = 5_000): Promise<string[] | null> {
  const data = await fetchJson<CoreListResponse>(listUrl, timeoutMs);
  if (!data || !Array.isArray(data.items)) return null;
  return data.items.map((i) => i.$ref).filter((r): r is string => Boolean(r));
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R | null>,
): Promise<R[]> {
  const out: R[] = [];
  let idx = 0;
  const workers = Array(Math.min(concurrency, items.length)).fill(null).map(async () => {
    while (idx < items.length) {
      const item = items[idx++];
      if (item === undefined) break;
      const r = await fn(item).catch(() => null);
      if (r !== null) out.push(r);
      await sleep(15);
    }
  });
  await Promise.allSettled(workers);
  return out;
}

interface CoreEvent {
  id: string;
  name?: string;
  shortName?: string;
  date?: string;
  season?: { slug?: string };
  competitions?: CoreRef[];
}

interface CoreCompetition {
  id?: string;
  date?: string;
  type?: { abbreviation?: string; text?: string };
  competitors?: Array<CoreRef & { homeAway?: string; order?: number; team?: CoreRef; athlete?: CoreRef }>;
}

interface CoreTeam { displayName?: string; logos?: Array<{ href?: string }> }
interface CoreAthlete {
  displayName?: string;
  fullName?: string;
  flag?: { href?: string };
}

const teamCache = new Map<string, { displayName?: string; logo?: string }>();
const athleteCache = new Map<string, { displayName?: string; fullName?: string; flag?: { href: string; alt: string } }>();

async function resolveTeam(ref: string) {
  const key = coreUrl(ref);
  const hit = teamCache.get(key);
  if (hit) return hit;
  const t = await fetchJson<CoreTeam>(key, 4_000);
  const val = { displayName: t?.displayName, logo: t?.logos?.[0]?.href };
  teamCache.set(key, val);
  return val;
}

async function resolveAthlete(ref: string) {
  const key = coreUrl(ref);
  const hit = athleteCache.get(key);
  if (hit) return hit;
  const a = await fetchJson<CoreAthlete>(key, 4_000);
  const val = {
    displayName: a?.displayName,
    fullName: a?.fullName,
    flag: a?.flag?.href ? { href: a.flag.href, alt: '' } : undefined,
  };
  athleteCache.set(key, val);
  return val;
}

const TEAM_SPORT_CORE = new Set(['hockey', 'rugby-league']);
const COMBAT_CORE = new Set(['mma']);
const TOURNAMENT_CORE = new Set(['golf', 'tennis']);
const MOTORSPORT_CORE = new Set(['racing']);

async function fetchViaCore(
  slug: string,
  startDate: string,
  endDate: string,
): Promise<{ events: EspnRawEvent[]; tournamentOnly: boolean } | null> {
  const parts = toCoreSlug(slug);
  if (!parts) return null;
  const { sport, league } = parts;
  const range = `${startDate.replace(/-/g, '')}-${endDate.replace(/-/g, '')}`;
  const listUrl = `${CORE_BASE}/${sport}/leagues/${league}/events?dates=${range}&limit=1000`;
  const refs = await fetchCoreRefs(listUrl);
  if (refs === null) return null;
  if (refs.length === 0) return { events: [], tournamentOnly: TOURNAMENT_CORE.has(sport) };

  // Tournament sports (golf/tennis): event = tournament; name+date is all we need.
  if (TOURNAMENT_CORE.has(sport)) {
    const events = await mapWithConcurrency(refs, 6, async (ref) => {
      const ev = await fetchJson<CoreEvent>(coreUrl(ref), 4_000);
      if (!ev?.id || !ev.date) return null;
      return {
        id: String(ev.id),
        name: ev.name,
        shortName: ev.shortName,
        date: ev.date,
        competitions: [],
      } satisfies EspnRawEvent;
    });
    return { events, tournamentOnly: true };
  }

  // Combat sports: event = card; each competition = one fight.
  if (COMBAT_CORE.has(sport)) {
    const events = await mapWithConcurrency(refs, 4, async (ref) => {
      const ev = await fetchJson<CoreEvent>(coreUrl(ref), 5_000);
      if (!ev?.id || !ev.date) return null;
      const compRefs = (ev.competitions ?? [])
        .map((c) => c.$ref)
        .filter((r): r is string => Boolean(r));
      const competitions = await mapWithConcurrency(compRefs, 5, async (cref) => {
        const comp = await fetchJson<CoreCompetition>(coreUrl(cref), 4_000);
        if (!comp) return null;
        const competitors = await mapWithConcurrency(comp.competitors ?? [], 4, async (c) => {
          if (!c.athlete?.$ref && !c.$ref) return null;
          const athleteRef = c.athlete?.$ref ?? c.$ref;
          if (!athleteRef) return null;
          const athlete = await resolveAthlete(athleteRef);
          return { order: c.order, athlete } satisfies EspnRawCompetitor;
        });
        return {
          id: comp.id,
          date: comp.date,
          type: comp.type ? { abbreviation: comp.type.abbreviation, text: comp.type.text } : undefined,
          competitors,
        } satisfies EspnRawCompetition;
      });
      return {
        id: String(ev.id),
        name: ev.name,
        shortName: ev.shortName,
        date: ev.date,
        competitions,
      } satisfies EspnRawEvent;
    });
    return { events, tournamentOnly: false };
  }

  // Team sports + motorsport: resolve competition → competitors → teams.
  const events = await mapWithConcurrency(refs, 8, async (ref) => {
    const ev = await fetchJson<CoreEvent>(coreUrl(ref), 5_000);
    if (!ev?.id || !ev.date) return null;
    const compRefs = (ev.competitions ?? [])
      .map((c) => c.$ref)
      .filter((r): r is string => Boolean(r))
      .slice(0, MOTORSPORT_CORE.has(sport) ? 12 : 1);
    const competitions = await mapWithConcurrency(compRefs, 4, async (cref) => {
      const comp = await fetchJson<CoreCompetition>(coreUrl(cref), 4_000);
      if (!comp) return null;
      let competitors: EspnRawCompetitor[] = [];
      if (TEAM_SPORT_CORE.has(sport) || !MOTORSPORT_CORE.has(sport)) {
        competitors = await mapWithConcurrency(comp.competitors ?? [], 4, async (c) => {
          if (!c.team?.$ref) return null;
          const team = await resolveTeam(c.team.$ref);
          return { homeAway: c.homeAway, order: c.order, team } satisfies EspnRawCompetitor;
        });
      }
      return {
        id: comp.id,
        date: comp.date,
        type: comp.type ? { abbreviation: comp.type.abbreviation, text: comp.type.text } : undefined,
        competitors,
      } satisfies EspnRawCompetition;
    });
    return {
      id: String(ev.id),
      name: ev.name,
      shortName: ev.shortName,
      date: ev.date,
      season: ev.season ? { slug: ev.season.slug } : undefined,
      competitions,
    } satisfies EspnRawEvent;
  });
  return { events, tournamentOnly: false };
}

// ── site.api last resort ────────────────────────────────────────────────────

async function fetchViaSiteApi(slug: string, startDate: string, endDate: string): Promise<EspnRawEvent[] | null> {
  const range = `${startDate.replace(/-/g, '')}-${endDate.replace(/-/g, '')}`;
  const url = `${SITE_BASE}/${slug}/scoreboard?dates=${range}&limit=1000`;
  const data = await fetchJson<{ events?: EspnRawEvent[] }>(url, 3_000);
  if (!data) return null;
  return data.events ?? [];
}

// ── Public entry point ──────────────────────────────────────────────────────

/**
 * Fetch ESPN scoreboard events for a league slug, routing around the Akamai
 * bot block on site.api.espn.com (403 from datacenter IPs since 2026-08).
 * Returns null only when every reachable host failed.
 */
export async function fetchEspnEvents(
  slug: string,
  startDate: string,
  endDate: string,
): Promise<EspnFetchResult | null> {
  // 1. CDN host — not bot-blocked; covers soccer/US sports/cricket/rugby/AFL.
  if (cdnTargetFor(slug)) {
    const events = await fetchViaCdn(slug, startDate, endDate);
    if (events !== null) return { events, host: 'cdn' };
  }

  // 2. Core API — covers NHL, racing, NRL, MMA, golf, tennis (+ fallback).
  const core = await fetchViaCore(slug, startDate, endDate);
  if (core !== null) return { events: core.events, host: 'core', tournamentOnly: core.tournamentOnly };

  // 3. site.api — blocked from datacenters today; kept so the feed self-heals.
  const site = await fetchViaSiteApi(slug, startDate, endDate);
  if (site !== null) return { events: site, host: 'site' };

  return null;
}

// ── Persistent per-league stale cache (Supabase) ────────────────────────────
// Reuses the sportsdb_events_cache table under an `espn-league|` key prefix so
// a full ESPN outage keeps serving last-good data for up to 7 days.

let _cacheDb: ReturnType<typeof createClient> | null = null;
function getCacheDb(): ReturnType<typeof createClient> | null {
  if (_cacheDb) return _cacheDb;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) _cacheDb = createClient(url, key);
  return _cacheDb;
}

const LEAGUE_CACHE_PREFIX = 'espn-league|';
const LEAGUE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function readLeagueStaleCache<T>(leagueId: string, timeZone: string): Promise<T[] | null> {
  const db = getCacheDb();
  if (!db) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: row } = await (db as any)
      .from('sportsdb_events_cache')
      .select('response_data')
      .eq('endpoint', `${LEAGUE_CACHE_PREFIX}${leagueId}|${timeZone}`)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    const data = (row as { response_data?: T[] } | null)?.response_data;
    return Array.isArray(data) && data.length > 0 ? data : null;
  } catch {
    return null;
  }
}

export function writeLeagueStaleCache<T>(leagueId: string, timeZone: string, events: T[]): void {
  if (events.length === 0) return;
  const db = getCacheDb();
  if (!db) return;
  const now = Date.now();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (db as any)
    .from('sportsdb_events_cache')
    .upsert({
      endpoint: `${LEAGUE_CACHE_PREFIX}${leagueId}|${timeZone}`,
      response_data: events,
      fetched_at: new Date(now).toISOString(),
      expires_at: new Date(now + LEAGUE_CACHE_TTL_MS).toISOString(),
    })
    .then(
      () => {},
      (err: unknown) => console.warn('[ESPN] league stale-cache write failed:', err),
    );
}
