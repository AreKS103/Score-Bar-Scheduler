import type { MatchEvent, SportConfig } from '@/types';
import { SPORTS_CONFIG } from '@/lib/config';
import { refreshWorldCupSnapshotEvents, WORLD_CUP_SPORT_ID } from '@/lib/worldCup';

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports';
const ESPN_REFRESH_CACHE_TTL_MS = 2 * 60 * 1000;
const DEFAULT_TIME_ZONE = 'Asia/Phnom_Penh';

const ESPN_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://www.espn.com/',
  Origin: 'https://www.espn.com',
  'Cache-Control': 'no-cache',
};

interface ESPNCompetitorRaw {
  homeAway?: string;
  order?: number;
  team?: { displayName?: string; shortDisplayName?: string; logo?: string };
  athlete?: { displayName?: string; fullName?: string };
}

interface ESPNCompetitionRaw {
  date?: string;
  competitors?: ESPNCompetitorRaw[];
  status?: { type?: { description?: string } };
}

interface ESPNEventRaw {
  id: string;
  name?: string;
  shortName?: string;
  date: string;
  competitions?: ESPNCompetitionRaw[];
  status?: { type?: { description?: string } };
}

interface ESPNScoreboardResponse {
  events?: ESPNEventRaw[];
}

interface CachedRefreshEvents {
  events: MatchEvent[];
  fetchedAt: number;
}

const refreshCache = new Map<string, CachedRefreshEvents>();

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

function addDays(date: string, amount: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  parsed.setUTCDate(parsed.getUTCDate() + amount);
  return parsed.toISOString().slice(0, 10);
}

function getCompName(competitor: ESPNCompetitorRaw | undefined): string {
  return competitor?.team?.displayName || competitor?.team?.shortDisplayName || competitor?.athlete?.displayName || competitor?.athlete?.fullName || '';
}

function getCompLogo(competitor: ESPNCompetitorRaw | undefined): string {
  return competitor?.team?.logo || '';
}

function formatUnresolvedOpponent(name: string, logo?: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '';
  if (/^tbd\b/i.test(trimmed)) return trimmed;
  if (!logo && trimmed.includes('/')) return `TBD ${trimmed}`;
  if (/\b(winner|loser|qualifier)\b/i.test(trimmed)) return 'TBD';
  return trimmed;
}

function espnDateRange(startDate: string, endDate: string): string {
  return `${startDate.replace(/-/g, '')}-${endDate.replace(/-/g, '')}`;
}

function supportsTeamRefresh(config: SportConfig | undefined): config is SportConfig & { espnSlug: string } {
  const slug = config?.espnSlug;
  if (!slug) return false;
  return !slug.startsWith('mma/')
    && !slug.startsWith('boxing/')
    && !slug.startsWith('racing/')
    && !slug.startsWith('tennis/')
    && !slug.startsWith('golf/');
}

function getSportConfig(sportId: string): SportConfig | undefined {
  return SPORTS_CONFIG.find((sport) => sport.id === sportId);
}

function parseEspnSourceEventId(event: MatchEvent): string {
  if (event.sourceEventId) return event.sourceEventId;
  const prefix = `espn-${event.sportId}-`;
  if (!event.id.startsWith(prefix)) return '';
  const rest = event.id.slice(prefix.length);
  const numeric = rest.match(/^\d+/);
  return numeric ? numeric[0] : rest;
}

function isWorldCupRefreshableEvent(event: MatchEvent): boolean {
  return event.sportId === WORLD_CUP_SPORT_ID && event.source !== 'manual';
}

function isEspnTeamRefreshableEvent(event: MatchEvent): boolean {
  if (event.source !== 'espn' || event.sportId === WORLD_CUP_SPORT_ID) return false;
  if (!parseEspnSourceEventId(event)) return false;
  return supportsTeamRefresh(getSportConfig(event.sportId));
}

export function isRefreshableSnapshotEvent(event: MatchEvent): boolean {
  return isWorldCupRefreshableEvent(event) || isEspnTeamRefreshableEvent(event);
}

export function hasRefreshableSnapshotEvents(events: MatchEvent[]): boolean {
  return events.some(isRefreshableSnapshotEvent);
}

function normalizeSlotText(value: string | undefined): string {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function slotKey(event: Pick<MatchEvent, 'sportId' | 'date' | 'time' | 'round'>): string {
  return `${event.sportId}|${event.date}|${event.time}|${normalizeSlotText(event.round)}`;
}

function buildUniqueSlotMap(events: MatchEvent[]): Map<string, MatchEvent> {
  const bySlot = new Map<string, MatchEvent>();
  const duplicates = new Set<string>();

  for (const event of events) {
    const key = slotKey(event);
    if (bySlot.has(key)) {
      duplicates.add(key);
      continue;
    }
    bySlot.set(key, event);
  }

  for (const key of duplicates) bySlot.delete(key);
  return bySlot;
}

function getRefreshRange(events: MatchEvent[]): { start: string; end: string } | null {
  const dates = events
    .map((event) => event.date)
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .sort();
  if (dates.length === 0) return null;
  return {
    start: addDays(dates[0], -1),
    end: addDays(dates[dates.length - 1], 1),
  };
}

async function fetchEspnJson(url: string): Promise<ESPNScoreboardResponse | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: ESPN_HEADERS,
      cache: 'no-store',
    });
    return response.ok ? (await response.json()) as ESPNScoreboardResponse : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function mapEspnTeamEvent(event: ESPNEventRaw, config: SportConfig, timeZone: string): MatchEvent | null {
  const comp = event.competitions?.[0];
  const competitors = comp?.competitors ?? [];
  const home = competitors.find((competitor) => competitor.homeAway === 'home') ?? competitors[0];
  const away = competitors.find((competitor) => competitor.homeAway === 'away') ?? competitors[1];
  const homeLogo = getCompLogo(home);
  const awayLogo = getCompLogo(away);
  const { date, time } = formatUtcDateInTimeZone(event.date, timeZone);
  if (!date) return null;

  let round = '';
  const eventName = event.name || '';
  if (eventName.includes(' - ')) {
    const parts = eventName.split(' - ');
    round = parts[parts.length - 1].trim();
  }

  const homeName = formatUnresolvedOpponent(getCompName(home) || event.shortName || event.name || 'TBD', homeLogo);
  const awayName = formatUnresolvedOpponent(getCompName(away), awayLogo);

  return {
    id: `espn-${config.id}-${event.id}`,
    source: 'espn',
    sportId: config.id,
    category: config.category,
    leagueLabel: config.label,
    leagueLogo: config.logo,
    date,
    time,
    home: homeName || 'TBD',
    away: awayName,
    homeLogo,
    awayLogo,
    round,
    tags: [],
    isFeatured: false,
    isSelected: false,
    sourceEventId: event.id,
    isoDate: event.date,
    status: event.status?.type?.description || comp?.status?.type?.description || '',
  };
}

async function fetchEspnTeamEvents(config: SportConfig & { espnSlug: string }, startDate: string, endDate: string, timeZone: string): Promise<MatchEvent[]> {
  const cacheKey = `${config.id}|${startDate}|${endDate}|${timeZone}`;
  const cached = refreshCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < ESPN_REFRESH_CACHE_TTL_MS) return cached.events;

  const dateRange = espnDateRange(startDate, endDate);
  const datedUrl = `${ESPN_BASE}/${config.espnSlug}/scoreboard?dates=${dateRange}&limit=1000`;
  const fallbackUrl = `${ESPN_BASE}/${config.espnSlug}/scoreboard?limit=1000`;
  const data = await fetchEspnJson(datedUrl) ?? await fetchEspnJson(fallbackUrl);
  const events = (data?.events ?? [])
    .map((event) => mapEspnTeamEvent(event, config, timeZone))
    .filter((event): event is MatchEvent => Boolean(event));

  refreshCache.set(cacheKey, { events, fetchedAt: Date.now() });
  return events;
}

function mergeSnapshotWithLatest(snapshot: MatchEvent, latest: MatchEvent): MatchEvent {
  return {
    ...snapshot,
    id: latest.id,
    source: latest.source,
    sportId: latest.sportId,
    category: latest.category,
    leagueLabel: latest.leagueLabel,
    leagueLogo: latest.leagueLogo,
    date: latest.date,
    time: latest.time,
    home: latest.home,
    away: latest.away,
    homeLogo: latest.homeLogo || (latest.home === snapshot.home ? snapshot.homeLogo : '') || '',
    awayLogo: latest.awayLogo || (latest.away === snapshot.away ? snapshot.awayLogo : '') || '',
    round: latest.round || snapshot.round,
    tags: Array.isArray(snapshot.tags) ? snapshot.tags : [],
    isFeatured: Boolean(snapshot.isFeatured),
    isSelected: snapshot.isSelected !== false,
    sourceEventId: latest.sourceEventId ?? snapshot.sourceEventId,
    isoDate: latest.isoDate ?? snapshot.isoDate,
    status: latest.status ?? snapshot.status,
  };
}

async function refreshEspnTeamSnapshotEvents(events: MatchEvent[], timeZone: string): Promise<MatchEvent[]> {
  const refreshable = events.filter(isEspnTeamRefreshableEvent);
  if (refreshable.length === 0) return events;

  const bySport = new Map<string, MatchEvent[]>();
  for (const event of refreshable) {
    if (!bySport.has(event.sportId)) bySport.set(event.sportId, []);
    bySport.get(event.sportId)!.push(event);
  }

  const latestEvents: MatchEvent[] = [];
  for (const [sportId, sportEvents] of bySport) {
    const config = getSportConfig(sportId);
    if (!supportsTeamRefresh(config)) continue;
    const range = getRefreshRange(sportEvents);
    if (!range) continue;
    try {
      latestEvents.push(...await fetchEspnTeamEvents(config, range.start, range.end, timeZone));
    } catch (error) {
      console.warn(`[SnapshotRefresh] ESPN refresh failed for ${sportId}:`, error);
    }
  }

  if (latestEvents.length === 0) return events;

  const latestById = new Map(latestEvents.map((event) => [event.id, event]));
  const latestBySourceId = new Map(
    latestEvents
      .map((event) => [event.sourceEventId ? `${event.sportId}|${event.sourceEventId}` : '', event] as const)
      .filter(([key]) => Boolean(key)),
  );
  const latestBySlot = buildUniqueSlotMap(latestEvents);

  return events.map((event) => {
    if (!isEspnTeamRefreshableEvent(event)) return event;
    const sourceEventId = parseEspnSourceEventId(event);
    const latest = latestById.get(event.id)
      ?? (sourceEventId ? latestBySourceId.get(`${event.sportId}|${sourceEventId}`) : undefined)
      ?? latestBySlot.get(slotKey(event));

    return latest ? mergeSnapshotWithLatest(event, latest) : event;
  });
}

export async function refreshSnapshotEvents(events: MatchEvent[], timeZone?: string | null): Promise<MatchEvent[]> {
  if (!hasRefreshableSnapshotEvents(events)) return events;

  const safeTimeZone = normalizeTimeZone(timeZone);
  const worldCupRefreshed = await refreshWorldCupSnapshotEvents(events, safeTimeZone);
  return refreshEspnTeamSnapshotEvents(worldCupRefreshed, safeTimeZone);
}