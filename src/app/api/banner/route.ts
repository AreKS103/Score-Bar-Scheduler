import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import type { MatchEvent } from '@/types';
import { getOrgMemberIds } from '@/lib/supabase/org';

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
  const home = textField(event, ['home', 'homeTeam', 'strHomeTeam']);
  const away = textField(event, ['away', 'awayTeam', 'strAwayTeam']);
  const explicit = textField(event, ['matchup', 'strEvent', 'eventName', 'name', 'label']);

  if (home && away) return { home, away, matchup: `${home} vs ${away}` };
  const matchup = explicit && !/^vs\.?$/i.test(explicit) ? explicit : (home || away || 'Featured match');
  return { home: home || matchup, away, matchup };
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

function normalizeLeagueLogo(rawLogo: string, league: string, sport: string): string {
  if (/^ufc\b/i.test(league) || /^ufc\b/i.test(sport) || /teamlogos\/leagues\/500\/ufc\.png/i.test(rawLogo)) {
    return '/league-logos/ufc.webp';
  }
  return rawLogo;
}

function buildSerial(publishedAt: string, items: BannerItem[]): string {
  const fingerprint = items
    .map((item) => [item.date, item.time, item.league, item.matchup].join('|'))
    .join('~');
  const hash = crypto.createHash('sha1').update(`${publishedAt}|${fingerprint}`).digest('hex').slice(0, 12);
  return `${publishedAt || 'none'}:${hash}`;
}

function noStoreHeaders(): Record<string, string> {
  return {
    ...corsHeaders,
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'CDN-Cache-Control': 'no-store',
    'Vercel-CDN-Cache-Control': 'no-store',
    Pragma: 'no-cache',
    Expires: '0',
  };
}

/** Build the banner items from a published schedule's featured (starred) events. */
function buildItems(events: MatchEvent[], origin: string, timeZone: string): BannerItem[] {
  const today = formatDateInTimeZone(new Date(), timeZone);

  return events
    .filter((e) => {
      if (!e || !e.isFeatured || e.isSelected === false) return false;
      return eventDateForTimeZone(e as SnapshotEvent, timeZone) === today;
    })
    .sort((a, b) => {
      const eventA = a as SnapshotEvent;
      const eventB = b as SnapshotEvent;
      return textField(eventA, ['date', 'dateEvent']).localeCompare(textField(eventB, ['date', 'dateEvent']))
        || textField(eventA, ['time', 'strTime']).localeCompare(textField(eventB, ['time', 'strTime']));
    })
    .map((e) => {
      const event = e as SnapshotEvent;
      const sport = textField(event, ['category', 'sport', 'sportLabel', 'leagueLabel']);
      const league = normalizeLeagueName(textField(event, ['leagueLabel', 'league', 'strLeague', 'cardName', 'category']), event);
      const { home, away, matchup } = buildMatchup(event);
      const labelCore = league ? `${league}: ${matchup}` : matchup;
      const rawLeagueLogo = normalizeLeagueLogo(
        textField(event, ['leagueLogo', 'strLeagueBadge', 'strThumb']) || fallbackLeagueLogo(league, sport),
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
        date: textField(event, ['date', 'dateEvent']),
        round: '',
        leagueLogo: toAbsoluteAssetUrl(rawLeagueLogo, origin),
        homeLogo: toAbsoluteAssetUrl(textField(event, ['homeLogo', 'homeTeamLogo', 'strHomeTeamBadge']), origin),
        awayLogo: toAbsoluteAssetUrl(textField(event, ['awayLogo', 'awayTeamLogo', 'strAwayTeamBadge']), origin),
      };
    });
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const apiKey = (sp.get('apiKey') || '').trim();
    const embedId = (sp.get('embedId') || '').replace(/[^\w#\- ]/g, '').substring(0, 64).trim();
    const timeZone = safeTimeZone(sp.get('tz') || 'UTC');

    if (!apiKey) {
      return NextResponse.json({ error: 'Missing apiKey' }, { status: 400, headers: corsHeaders });
    }
    if (!embedId) {
      // No target selected → return an empty (but valid) payload so the banner hides cleanly.
      return NextResponse.json({ items: [], publishedAt: '', serial: 'none' }, { headers: noStoreHeaders() });
    }

    const hash = resolveKeyHash(apiKey);
    const { data: keyData } = await supabase
      .from('user_api_keys')
      .select('user_id')
      .eq('key_hash', hash)
      .single();

    if (!keyData) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: corsHeaders });
    }

    const orgMemberIds = await getOrgMemberIds(keyData.user_id as string);

    const { data: schedule } = await supabase
      .from('published_schedules')
      .select('events_snapshot, published_at')
      .in('user_id', orgMemberIds)
      .eq('embed_target', embedId)
      .order('published_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!schedule) {
      return NextResponse.json({ items: [], publishedAt: '', serial: 'none' }, { headers: noStoreHeaders() });
    }

    const events = (Array.isArray(schedule.events_snapshot) ? schedule.events_snapshot : []) as MatchEvent[];
    const items = buildItems(events, req.nextUrl.origin, timeZone);
    const publishedAt = schedule.published_at ?? '';

    return NextResponse.json(
      { items, publishedAt, serial: buildSerial(publishedAt, items) },
      {
        headers: noStoreHeaders(),
      },
    );
  } catch (err) {
    return NextResponse.json(
      { error: 'Internal error', detail: err instanceof Error ? err.message : String(err) },
      { status: 500, headers: corsHeaders },
    );
  }
}
