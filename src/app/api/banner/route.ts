import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import type { MatchEvent } from '@/types';
import { getOrgMemberIds } from '@/lib/supabase/org';
import { getEventDisplay } from '@/lib/eventDisplay';
import { SPORTS_CONFIG } from '@/lib/config';

export const dynamic = 'force-dynamic';

// ── CORS ────────────────────────────────────────────────────────────────────
// Public endpoint consumed by the WordPress banner script on arbitrary origins.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const SPORTS_BY_ID = new Map(SPORTS_CONFIG.map((sport) => [sport.id, sport]));
const SPORTS_BY_LABEL = new Map(
  SPORTS_CONFIG.map((sport) => [normalizeLookupText(sport.label), sport]),
);

/**
 * Resolve an incoming apiKey to the key_hash stored in the DB.
 *  - Starts with "sb_" → raw API key → hash it
 *  - 64 lowercase hex chars → already a hashed embed token → use as-is
 *  - Anything else → legacy raw key (pre-prefix era) → hash it
 */
function resolveKeyHash(apiKey: string): string {
  if (apiKey.startsWith('sb_')) return crypto.createHash('sha256').update(apiKey).digest('hex');
  if (/^[0-9a-f]{64}$/.test(apiKey)) return apiKey;
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

interface BannerItem {
  /** Composed display label, e.g. "EPL: Arsenal vs Man City" */
  label: string;
  sport: string;
  league: string;
  matchup: string;
  home: string;
  away: string;
  time: string;
  date: string;
  round: string;
  leagueLogo: string;
  homeLogo: string;
  awayLogo: string;
}

type BannerRange = 'today' | 'week';
type BannerItemSource = 'requested-window' | 'latest-published-snapshot' | 'none';

interface BannerBuildResult {
  items: BannerItem[];
  source: BannerItemSource;
  totalFeatured: number;
  windowedFeatured: number;
  dateWindow: { start: string; end: string };
}

interface BannerDiagnostics {
  status: 'ok' | 'empty' | 'error';
  reason: string;
  requestedEmbedId: string;
  resolvedEmbedTarget: string;
  tokenUser: string;
  orgMemberCount: number;
  scheduleFound: boolean;
  schedulePublishedAt: string;
  scheduleRange: { start: string; end: string };
  scheduleEventCount: number;
  selectedCount: number;
  featuredCount: number;
  windowedFeaturedCount: number;
  dateWindow: { start: string; end: string } | null;
  visibleTargets: string[];
  hint: string;
}

function publicOrigin(origin: string): string {
  return origin.replace('://0.0.0.0', '://localhost').replace('://[::]', '://localhost');
}

function toAbsoluteAssetUrl(value: string, origin: string): string {
  const trimmed = (value || '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('data:')) return trimmed;
  if (trimmed.startsWith('/')) return `${publicOrigin(origin)}${trimmed}`;
  return trimmed;
}

type SnapshotEvent = MatchEvent & Record<string, unknown>;

function textField(event: SnapshotEvent, keys: string[]): string {
  for (const key of keys) {
    const value = event[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function safeTimeZone(value: string): string {
  const timeZone = value.trim() || 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return 'UTC';
  }
}

function safeRange(value: string | null): BannerRange {
  return value === 'today' ? 'today' : 'week';
}

function formatDateInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(date: string, amount: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  parsed.setUTCDate(parsed.getUTCDate() + amount);
  return parsed.toISOString().slice(0, 10);
}

function normalizeLookupText(value: string): string {
  return value.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();
}

function bannerDateWindow(range: BannerRange, timeZone: string): { start: string; end: string } {
  const today = formatDateInTimeZone(new Date(), timeZone);
  if (range === 'today') return { start: today, end: today };

  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  const start = addDays(today, mondayOffset);
  return { start, end: addDays(start, 6) };
}

function eventDateForTimeZone(event: SnapshotEvent, timeZone: string): string {
  const iso = textField(event, ['isoDate', 'dateTime', 'dateTimeUtc', 'dateUTC']);
  if (iso) {
    const parsed = new Date(iso);
    if (!Number.isNaN(parsed.getTime())) return formatDateInTimeZone(parsed, timeZone);
  }

  const date = textField(event, ['date', 'dateEvent']);
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const parsed = new Date(date);
  if (!Number.isNaN(parsed.getTime())) return formatDateInTimeZone(parsed, timeZone);
  return date.substring(0, 10);
}

function buildMatchup(event: SnapshotEvent): { home: string; away: string; matchup: string } {
  const display = getEventDisplay(event, { stripLeaguePrefix: true });
  return { home: display.primary || display.title, away: display.isHeadToHead ? display.secondary : '', matchup: display.title || 'Featured match' };
}

function normalizeLeagueName(rawLeague: string, event: SnapshotEvent): string {
  const league = rawLeague.trim();
  const category = textField(event, ['category', 'sport', 'sportLabel']).toLowerCase();
  const isCombat = category === 'combat sports' || /^(ufc|pfl|bellator|boxing|fight night)\b/i.test(league);

  if (!isCombat) return league;

  const base = (league.split(':')[0] || league).trim();
  if (/^ufc fight night\b/i.test(league)) return 'UFC Fight Night';
  return base || league;
}

function fallbackLeagueLogo(league: string, sport: string): string {
  if (/^ufc\b/i.test(league) || /^ufc\b/i.test(sport)) {
    return '/league-logos/ufc.webp';
  }
  return '';
}

function configuredLeagueLogo(event: SnapshotEvent, league: string): string {
  const sportId = textField(event, ['sportId']);
  const configuredById = sportId ? SPORTS_BY_ID.get(sportId) : undefined;
  if (configuredById) return configuredById.logo || configuredById.publishLogo || '';

  const leagueKey = normalizeLookupText(league);
  const configuredByLabel = leagueKey ? SPORTS_BY_LABEL.get(leagueKey) : undefined;
  if (configuredByLabel) return configuredByLabel.logo || configuredByLabel.publishLogo || '';

  return '';
}

function normalizeLeagueLogo(rawLogo: string, league: string, sport: string): string {
  if (/^ufc\b/i.test(league) || /^ufc\b/i.test(sport) || /teamlogos\/leagues\/500\/ufc\.png/i.test(rawLogo)) {
    return '/league-logos/ufc.webp';
  }
  return rawLogo;
}

function buildSerial(publishedAt: string, items: BannerItem[], range: BannerRange): string {
  const fingerprint = items
    .map((item) => [item.date, item.time, item.league, item.matchup].join('|'))
    .join('~');
  const hash = crypto.createHash('sha1').update(`${publishedAt}|${range}|${fingerprint}`).digest('hex').slice(0, 12);
  return `${publishedAt || 'none'}:${range}:${hash}`;
}

function bannerCacheHeaders(): Record<string, string> {
  return {
    ...corsHeaders,
    'Cache-Control': 'public, max-age=30, stale-while-revalidate=120',
    'CDN-Cache-Control': 'max-age=60, stale-while-revalidate=300, stale-if-error=600',
    'Vercel-CDN-Cache-Control': 'max-age=60, stale-while-revalidate=300, stale-if-error=600',
  };
}

function diagnosticFingerprint(value: string): string {
  return crypto.createHash('sha1').update(value).digest('hex').slice(0, 8);
}

function eventCounts(events: MatchEvent[]): { selected: number; featured: number } {
  let selected = 0;
  let featured = 0;
  for (const event of events) {
    if (!event) continue;
    if (event.isSelected) selected += 1;
    if (event.isFeatured) featured += 1;
  }
  return { selected, featured };
}

function compareBannerEvents(a: MatchEvent, b: MatchEvent, timeZone: string): number {
  const eventA = a as SnapshotEvent;
  const eventB = b as SnapshotEvent;
  return eventDateForTimeZone(eventA, timeZone).localeCompare(eventDateForTimeZone(eventB, timeZone))
    || textField(eventA, ['time', 'strTime']).localeCompare(textField(eventB, ['time', 'strTime']));
}

function toBannerItem(e: MatchEvent, origin: string, timeZone: string): BannerItem {
  const event = e as SnapshotEvent;
  const sport = textField(event, ['category', 'sport', 'sportLabel', 'leagueLabel']);
  const league = normalizeLeagueName(textField(event, ['leagueLabel', 'league', 'strLeague', 'cardName', 'category']), event);
  const { home, away, matchup } = buildMatchup(event);
  const labelCore = league ? `${league}: ${matchup}` : matchup;
  const rawLeagueLogo = normalizeLeagueLogo(
    configuredLeagueLogo(event, league) || textField(event, ['leagueLogo', 'strLeagueBadge', 'strThumb']) || fallbackLeagueLogo(league, sport),
    league,
    sport,
  );
  return {
    label: labelCore,
    sport,
    league,
    matchup,
    home,
    away,
    time: textField(event, ['time', 'strTime']),
    date: eventDateForTimeZone(event, timeZone),
    round: '',
    leagueLogo: toAbsoluteAssetUrl(rawLeagueLogo, origin),
    homeLogo: toAbsoluteAssetUrl(textField(event, ['homeLogo', 'homeTeamLogo', 'strHomeTeamBadge']), origin),
    awayLogo: toAbsoluteAssetUrl(textField(event, ['awayLogo', 'awayTeamLogo', 'strAwayTeamBadge']), origin),
  };
}

/** Build banner items from the latest published schedule's featured events. */
function buildItems(events: MatchEvent[], origin: string, timeZone: string, range: BannerRange): BannerBuildResult {
  const window = bannerDateWindow(range, timeZone);
  const featuredEvents = events.filter((e) => e && e.isFeatured);
  const windowedEvents = featuredEvents.filter((e) => {
    const eventDate = eventDateForTimeZone(e as SnapshotEvent, timeZone);
    return eventDate >= window.start && eventDate <= window.end;
  });
  const sourceEvents = windowedEvents.length > 0 ? windowedEvents : featuredEvents;

  return {
    items: sourceEvents
      .slice()
      .sort((a, b) => compareBannerEvents(a, b, timeZone))
      .map((e) => toBannerItem(e, origin, timeZone)),
    source: windowedEvents.length > 0 ? 'requested-window' : (featuredEvents.length > 0 ? 'latest-published-snapshot' : 'none'),
    totalFeatured: featuredEvents.length,
    windowedFeatured: windowedEvents.length,
    dateWindow: window,
  };
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const apiKey = (sp.get('apiKey') || '').trim();
    const embedId = (sp.get('embedId') || '').replace(/[^\w#\- ]/g, '').substring(0, 64).trim();
    const timeZone = safeTimeZone(sp.get('tz') || 'UTC');
    const range = safeRange(sp.get('range'));

    if (!apiKey) {
      return NextResponse.json({ error: 'Missing apiKey' }, { status: 400, headers: corsHeaders });
    }
    if (!embedId) {
      // No target selected → return an empty (but valid) payload so the banner hides cleanly.
      return NextResponse.json({ items: [], publishedAt: '', serial: 'none' }, { headers: bannerCacheHeaders() });
    }

    const hash = resolveKeyHash(apiKey);
    const { data: keyData } = await supabase
      .from('user_api_keys')
      .select('user_id')
      .eq('key_hash', hash)
      .maybeSingle();

    if (!keyData) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders });
    }

    const orgMemberIds = await getOrgMemberIds(keyData.user_id as string);
    const tokenUser = diagnosticFingerprint(keyData.user_id as string);

    const { data: schedule } = await supabase
      .from('published_schedules')
      .select('events_snapshot, published_at, date_range_start, date_range_end, embed_target')
      .in('user_id', orgMemberIds)
      .eq('embed_target', embedId)
      .order('published_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!schedule) {
      const { data: visibleRows } = await supabase
        .from('published_schedules')
        .select('embed_target, published_at')
        .in('user_id', orgMemberIds)
        .not('embed_target', 'is', null)
        .order('published_at', { ascending: false })
        .limit(50);

      const visibleTargets: string[] = [];
      const seenTargets = new Set<string>();
      for (const row of visibleRows ?? []) {
        const target = typeof row.embed_target === 'string' ? row.embed_target.trim() : '';
        if (!target || seenTargets.has(target)) continue;
        seenTargets.add(target);
        visibleTargets.push(target);
      }

      const diagnostics: BannerDiagnostics = {
        status: 'empty',
        reason: 'schedule_not_found_for_token_scope',
        requestedEmbedId: embedId,
        resolvedEmbedTarget: '',
        tokenUser,
        orgMemberCount: orgMemberIds.length,
        scheduleFound: false,
        schedulePublishedAt: '',
        scheduleRange: { start: '', end: '' },
        scheduleEventCount: 0,
        selectedCount: 0,
        featuredCount: 0,
        windowedFeaturedCount: 0,
        dateWindow: bannerDateWindow(range, timeZone),
        visibleTargets,
        hint: visibleTargets.length > 0
          ? `This token is valid, but no published schedule named "${embedId}" is visible to it. Choose one of the visible targets or reconnect WordPress with the account that published this embed.`
          : `This token is valid, but it cannot see any published embed targets. Reconnect WordPress with the account that published "${embedId}".`,
      };

      return NextResponse.json({
        items: [],
        publishedAt: '',
        range,
        serial: 'none',
        source: 'none',
        reason: diagnostics.reason,
        diagnostics,
      }, { headers: bannerCacheHeaders() });
    }

    const snapshotEvents = (Array.isArray(schedule.events_snapshot) ? schedule.events_snapshot : []) as MatchEvent[];
    const banner = buildItems(snapshotEvents, req.nextUrl.origin, timeZone, range);
    const items = banner.items;
    const publishedAt = schedule.published_at ?? '';
    const counts = eventCounts(snapshotEvents);
    const reason = items.length > 0 ? 'ok' : (snapshotEvents.length === 0 ? 'schedule_snapshot_empty' : 'no_featured_events_in_snapshot');
    const diagnostics: BannerDiagnostics = {
      status: items.length > 0 ? 'ok' : 'empty',
      reason,
      requestedEmbedId: embedId,
      resolvedEmbedTarget: schedule.embed_target ?? embedId,
      tokenUser,
      orgMemberCount: orgMemberIds.length,
      scheduleFound: true,
      schedulePublishedAt: publishedAt,
      scheduleRange: {
        start: schedule.date_range_start ?? '',
        end: schedule.date_range_end ?? '',
      },
      scheduleEventCount: snapshotEvents.length,
      selectedCount: counts.selected,
      featuredCount: counts.featured,
      windowedFeaturedCount: banner.windowedFeatured,
      dateWindow: banner.dateWindow,
      visibleTargets: [schedule.embed_target ?? embedId].filter(Boolean),
      hint: items.length > 0
        ? 'The selected published schedule contains banner items.'
        : 'The selected published schedule was found, but none of its snapshot events are starred for banner highlights.',
    };

    return NextResponse.json(
      {
        items,
        publishedAt,
        range,
        serial: buildSerial(publishedAt, items, range),
        source: banner.source,
        reason,
        totalFeatured: banner.totalFeatured,
        windowedFeatured: banner.windowedFeatured,
        dateWindow: banner.dateWindow,
        scheduleRange: {
          start: schedule.date_range_start ?? '',
          end: schedule.date_range_end ?? '',
        },
        embedTarget: schedule.embed_target ?? embedId,
        diagnostics,
      },
      {
        headers: bannerCacheHeaders(),
      },
    );
  } catch (err) {
    return NextResponse.json(
      { error: 'Internal error', detail: err instanceof Error ? err.message : String(err) },
      { status: 500, headers: corsHeaders },
    );
  }
}
