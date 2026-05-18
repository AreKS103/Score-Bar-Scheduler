import type { MatchEvent } from '@/types';

export const WORLD_CUP_SPORT_ID = 'soccer-fifa-world-cup-2026';
export const WORLD_CUP_LABEL = '2026 FIFA World Cup';
export const WORLD_CUP_ESPN_SLUG = 'soccer/fifa.world';
export const WORLD_CUP_LOGO = 'https://r2.thesportsdb.com/images/media/league/badge/e7er5g1696521789.png';
export const WORLD_CUP_START_DATE = '2026-06-11';
export const WORLD_CUP_END_DATE = '2026-07-19';

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports';
const ESPN_WORLD_CUP_URL = `${ESPN_BASE}/${WORLD_CUP_ESPN_SLUG}/scoreboard?dates=20260611-20260719&limit=1000`;
const SPORTSDB_WORLD_CUP_URL = 'https://www.thesportsdb.com/api/v1/json/3/eventsseason.php?id=4429&s=2026';
const DEFAULT_TIME_ZONE = 'Asia/Phnom_Penh';
const WORLD_CUP_ESPN_ID_PREFIX = `espn-${WORLD_CUP_SPORT_ID}-`;

const ESPN_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://www.espn.com/',
  Origin: 'https://www.espn.com',
};

interface ESPNTeam {
  displayName?: string;
  shortDisplayName?: string;
  logo?: string;
}

interface ESPNCompetitor {
  homeAway?: string;
  order?: number;
  team?: ESPNTeam;
}

interface ESPNCompetition {
  competitors?: ESPNCompetitor[];
  venue?: {
    fullName?: string;
    displayName?: string;
    address?: { city?: string; country?: string };
  };
  broadcasts?: Array<{ names?: string[] }>;
  status?: { type?: { description?: string } };
}

interface ESPNWorldCupEvent {
  id: string;
  name?: string;
  shortName?: string;
  date: string;
  season?: { slug?: string };
  status?: { type?: { description?: string } };
  competitions?: ESPNCompetition[];
}

interface ESPNWorldCupResponse {
  events?: ESPNWorldCupEvent[];
}

interface SportsDBWorldCupEvent {
  idEvent: string;
  strEvent?: string;
  dateEvent?: string;
  strTime?: string;
  strHomeTeam?: string;
  strAwayTeam?: string;
  strHomeTeamBadge?: string;
  strAwayTeamBadge?: string;
  strRound?: string;
}

interface SportsDBWorldCupResponse {
  events?: SportsDBWorldCupEvent[];
}

export interface WorldCupFixture extends MatchEvent {
  stage: string;
  stageSlug: string;
  status: string;
  isoDate: string;
  venue?: string;
  city?: string;
  country?: string;
  broadcasts: string[];
}

export interface WorldCupFixturesPayload {
  fixtures: WorldCupFixture[];
  source: 'espn' | 'sportsdb';
  updatedAt: string;
  complete: boolean;
}

function isWorldCupSnapshotEvent(event: MatchEvent): boolean {
  return event.sportId === WORLD_CUP_SPORT_ID && event.source !== 'manual';
}

function getWorldCupSourceEventId(event: MatchEvent): string {
  if (event.sourceEventId) return event.sourceEventId;
  if (event.id.startsWith(WORLD_CUP_ESPN_ID_PREFIX)) {
    return event.id.slice(WORLD_CUP_ESPN_ID_PREFIX.length);
  }
  if (event.id.startsWith('sportsdb-')) {
    return event.id.slice('sportsdb-'.length);
  }
  return '';
}

function normalizeSlotText(value: string | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function getWorldCupSlotKey(event: Pick<MatchEvent, 'date' | 'time' | 'round'> & { stage?: string }): string {
  return `${event.date}|${event.time}|${normalizeSlotText(event.stage || event.round)}`;
}

function buildUniqueSlotMap(fixtures: WorldCupFixture[]): Map<string, WorldCupFixture> {
  const bySlot = new Map<string, WorldCupFixture>();
  const duplicateSlots = new Set<string>();

  for (const fixture of fixtures) {
    const key = getWorldCupSlotKey(fixture);
    if (bySlot.has(key)) {
      duplicateSlots.add(key);
      continue;
    }
    bySlot.set(key, fixture);
  }

  for (const key of duplicateSlots) bySlot.delete(key);
  return bySlot;
}

function mergeWorldCupFixtureSnapshot(snapshot: MatchEvent, latest: WorldCupFixture): MatchEvent {
  return {
    ...snapshot,
    id: latest.id,
    source: latest.source,
    sportId: WORLD_CUP_SPORT_ID,
    category: latest.category,
    leagueLabel: latest.leagueLabel,
    leagueLogo: latest.leagueLogo,
    date: latest.date,
    time: latest.time,
    home: latest.home,
    away: latest.away,
    homeLogo: latest.homeLogo,
    awayLogo: latest.awayLogo,
    round: latest.round || latest.stage || snapshot.round,
    tags: Array.isArray(snapshot.tags) ? snapshot.tags : [],
    isFeatured: Boolean(snapshot.isFeatured),
    isSelected: snapshot.isSelected !== false,
    sourceEventId: latest.sourceEventId,
    isoDate: latest.isoDate,
    stageSlug: latest.stageSlug,
    status: latest.status,
    venue: latest.venue,
    city: latest.city,
    country: latest.country,
  };
}

function normalizeTimeZone(value?: string | null): string {
  const candidate = value?.trim() || DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

function formatUtcDateInTimeZone(utcISO: string, timeZone: string): { date: string; time: string } {
  const utc = new Date(utcISO);
  if (Number.isNaN(utc.getTime())) return { date: '', time: '' };

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
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;

  return {
    date: `${lookup.year}-${lookup.month}-${lookup.day}`,
    time: `${lookup.hour}:${lookup.minute}`,
  };
}

export function formatWorldCupStage(slug?: string): string {
  switch (slug) {
    case 'group-stage': return 'Group Stage';
    case 'round-of-32': return 'Round of 32';
    case 'round-of-16': return 'Round of 16';
    case 'quarterfinals': return 'Quarterfinals';
    case 'semifinals': return 'Semifinals';
    case '3rd-place-match': return 'Third Place';
    case 'final': return 'Final';
    default: return slug ? slug.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ') : 'Group Stage';
  }
}

function getCompetitorName(competitor: ESPNCompetitor | undefined): string {
  return competitor?.team?.displayName || competitor?.team?.shortDisplayName || '';
}

function getCompetitorLogo(competitor: ESPNCompetitor | undefined): string {
  return competitor?.team?.logo || '';
}

function getBroadcasts(comp: ESPNCompetition | undefined): string[] {
  const names = comp?.broadcasts?.flatMap((broadcast) => broadcast.names ?? []) ?? [];
  return Array.from(new Set(names.filter(Boolean)));
}

export function isWorldCupPlaceholderTeamName(value?: string | null): boolean {
  const name = (value ?? '').trim();
  if (!name) return false;
  return /\btbd\b/i.test(name)
    || /\b(winner|loser|qualifier)\b/i.test(name)
    || /^group\s+[a-l]\s+(winner|\d+(st|nd|rd|th)\s+place)$/i.test(name)
    || /^third\s+place\s+group\b/i.test(name)
    || /^round\s+of\s+\d+\b/i.test(name)
    || /^quarterfinal\s+\d+\b/i.test(name)
    || /^semifinal\s+\d+\b/i.test(name);
}

function formatWorldCupTeamName(value?: string | null): string {
  const name = (value ?? '').trim();
  if (!name) return '';
  return isWorldCupPlaceholderTeamName(name) ? 'TBD' : name;
}

function mapESPNWorldCupEvent(event: ESPNWorldCupEvent, timeZone: string): WorldCupFixture | null {
  const comp = event.competitions?.[0];
  const competitors = comp?.competitors ?? [];
  const home = competitors.find((c) => c.homeAway === 'home') ?? competitors.find((c) => c.order === 0) ?? competitors[0];
  const away = competitors.find((c) => c.homeAway === 'away') ?? competitors.find((c) => c.order === 1) ?? competitors[1];
  const homeName = formatWorldCupTeamName(getCompetitorName(home) || event.name || 'TBD');
  const awayName = formatWorldCupTeamName(getCompetitorName(away) || '');
  const local = formatUtcDateInTimeZone(event.date, timeZone);
  if (!local.date) return null;

  const stageSlug = event.season?.slug || 'group-stage';
  const stage = formatWorldCupStage(stageSlug);

  return {
    id: `espn-${WORLD_CUP_SPORT_ID}-${event.id}`,
    source: 'espn',
    sourceEventId: event.id,
    sportId: WORLD_CUP_SPORT_ID,
    category: 'Football',
    leagueLabel: WORLD_CUP_LABEL,
    leagueLogo: WORLD_CUP_LOGO,
    date: local.date,
    time: local.time,
    home: homeName,
    away: awayName,
    homeLogo: homeName === 'TBD' ? '' : getCompetitorLogo(home),
    awayLogo: awayName === 'TBD' ? '' : getCompetitorLogo(away),
    round: stage,
    tags: [],
    isFeatured: false,
    isSelected: false,
    stage,
    stageSlug,
    status: event.status?.type?.description || comp?.status?.type?.description || 'Scheduled',
    isoDate: event.date,
    venue: comp?.venue?.fullName || comp?.venue?.displayName,
    city: comp?.venue?.address?.city,
    country: comp?.venue?.address?.country,
    broadcasts: getBroadcasts(comp),
  };
}

function mapSportsDBWorldCupEvent(event: SportsDBWorldCupEvent, timeZone: string): WorldCupFixture | null {
  if (!event.idEvent || !event.dateEvent) return null;
  const time = event.strTime || '00:00:00';
  const local = formatUtcDateInTimeZone(`${event.dateEvent}T${time}Z`, timeZone);
  const stage = event.strRound || 'Group Stage';

  const homeName = formatWorldCupTeamName(event.strHomeTeam || event.strEvent || 'TBD');
  const awayName = formatWorldCupTeamName(event.strAwayTeam || '');

  return {
    id: `sportsdb-${event.idEvent}`,
    source: 'sportsdb',
    sourceEventId: event.idEvent,
    sportId: WORLD_CUP_SPORT_ID,
    category: 'Football',
    leagueLabel: WORLD_CUP_LABEL,
    leagueLogo: WORLD_CUP_LOGO,
    date: local.date,
    time: local.time,
    home: homeName,
    away: awayName,
    homeLogo: homeName === 'TBD' ? '' : event.strHomeTeamBadge || '',
    awayLogo: awayName === 'TBD' ? '' : event.strAwayTeamBadge || '',
    round: stage,
    tags: [],
    isFeatured: false,
    isSelected: false,
    stage,
    stageSlug: stage.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'group-stage',
    status: 'Scheduled',
    isoDate: `${event.dateEvent}T${time}Z`,
    broadcasts: [],
  };
}

async function fetchESPNWorldCup(timeZone: string): Promise<WorldCupFixture[]> {
  const res = await fetch(ESPN_WORLD_CUP_URL, {
    headers: ESPN_HEADERS,
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error(`ESPN World Cup returned ${res.status}`);
  const data = (await res.json()) as ESPNWorldCupResponse;
  return (data.events ?? [])
    .map((event) => mapESPNWorldCupEvent(event, timeZone))
    .filter((event): event is WorldCupFixture => event !== null)
    .sort((a, b) => a.isoDate.localeCompare(b.isoDate));
}

async function fetchSportsDBWorldCup(timeZone: string): Promise<WorldCupFixture[]> {
  const res = await fetch(SPORTSDB_WORLD_CUP_URL, {
    next: { revalidate: 900 },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as SportsDBWorldCupResponse;
  return (data.events ?? [])
    .map((event) => mapSportsDBWorldCupEvent(event, timeZone))
    .filter((event): event is WorldCupFixture => event !== null)
    .sort((a, b) => a.isoDate.localeCompare(b.isoDate));
}

export async function fetchWorldCupFixtures(timeZone?: string | null): Promise<WorldCupFixturesPayload> {
  const safeTimeZone = normalizeTimeZone(timeZone);
  const updatedAt = new Date().toISOString();

  try {
    const fixtures = await fetchESPNWorldCup(safeTimeZone);
    if (fixtures.length > 0) {
      return {
        fixtures,
        source: 'espn',
        updatedAt,
        complete: fixtures.length >= 100,
      };
    }
  } catch (error) {
    console.warn('[WorldCup] ESPN fetch failed:', error);
  }

  const fallbackFixtures = await fetchSportsDBWorldCup(safeTimeZone);
  return {
    fixtures: fallbackFixtures,
    source: 'sportsdb',
    updatedAt,
    complete: false,
  };
}

export async function refreshWorldCupSnapshotEvents(
  events: MatchEvent[],
  timeZone?: string | null,
): Promise<MatchEvent[]> {
  if (!events.some(isWorldCupSnapshotEvent)) return events;

  try {
    const { fixtures } = await fetchWorldCupFixtures(timeZone);
    if (fixtures.length === 0) return events;

    const byId = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
    const bySourceId = new Map(
      fixtures
        .map((fixture) => [fixture.sourceEventId, fixture] as const)
        .filter(([sourceEventId]) => Boolean(sourceEventId)),
    );
    const bySlot = buildUniqueSlotMap(fixtures);

    return events.map((event) => {
      if (!isWorldCupSnapshotEvent(event)) return event;

      const sourceEventId = getWorldCupSourceEventId(event);
      const latest = byId.get(event.id)
        ?? (sourceEventId ? bySourceId.get(sourceEventId) : undefined)
        ?? bySlot.get(getWorldCupSlotKey(event));

      return latest ? mergeWorldCupFixtureSnapshot(event, latest) : event;
    });
  } catch (error) {
    console.warn('[WorldCup] Snapshot refresh failed:', error);
    return events;
  }
}