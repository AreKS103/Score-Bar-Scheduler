import type { MatchEvent } from '@/types';

type DisplayEvent = Partial<MatchEvent>;

export interface EventDisplayParts {
  title: string;
  primary: string;
  secondary: string;
  detail: string;
  separator: 'vs' | '–' | '';
  isHeadToHead: boolean;
}

const NON_HEAD_TO_HEAD_CATEGORIES = new Set(['cycling', 'motorsport', 'golf']);
const NON_HEAD_TO_HEAD_SPORT_IDS = new Set([
  'cycling-uci',
  'cycling-giro',
  'cycling-giro-women',
  'f1',
  'motogp',
  'indycar',
  'golf-pga',
  'golf-lpga',
]);
const COMBAT_SPORT_IDS = new Set(['boxing', 'ufc', 'bellator']);

function textField(event: DisplayEvent, keys: string[]): string {
  const record = event as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function normalizeDashes(value: string): string {
  return value.replace(/[‐‑‒–—―]/g, '–').replace(/\s+/g, ' ').trim();
}

function comparable(value: string): string {
  return normalizeDashes(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase();
}

function compactDuplicateRoute(value: string): string {
  const clean = normalizeDashes(value);
  const parts = clean.split(/\s+(?:–|-|to)\s+/i).map((part) => part.trim()).filter(Boolean);
  if (parts.length === 2 && comparable(parts[0]) === comparable(parts[1])) return parts[0];
  return clean;
}

function titleContainsDetail(title: string, detail: string): boolean {
  const normalizedTitle = comparable(title);
  const normalizedDetail = comparable(detail);
  return !!normalizedDetail && normalizedTitle.includes(normalizedDetail);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function leagueVariants(leagueLabel: string): string[] {
  const base = normalizeDashes(leagueLabel);
  const beforeColon = base.split(':')[0]?.trim() || base;
  return Array.from(new Set([
    base,
    beforeColon,
    base.replace(/\s+(Men|Women)$/i, '').trim(),
    beforeColon.replace(/\s+(Men|Women)$/i, '').trim(),
  ].filter(Boolean)));
}

function stripLeaguePrefix(title: string, leagueLabel: string): string {
  let out = normalizeDashes(title);
  for (const league of leagueVariants(leagueLabel)) {
    const re = new RegExp(`^${escapeRegExp(league)}\\s*(?:–|-|:)\\s*`, 'i');
    out = out.replace(re, '').trim();
  }
  return out || normalizeDashes(title);
}

function cleanStageTitle(title: string): string {
  const clean = normalizeDashes(title);
  return clean.replace(/^(.+?)\s+Stage\s+(\d+)(\b.*)?$/i, (_match, race, stage, suffix = '') => {
    return `${String(race).trim()} – Stage ${String(stage).trim()}${String(suffix).trim() ? ` ${String(suffix).trim()}` : ''}`;
  });
}

function isNonHeadToHeadEvent(event: DisplayEvent): boolean {
  const sportId = textField(event, ['sportId']).toLowerCase();
  const category = textField(event, ['category', 'sport', 'sportLabel']).toLowerCase();
  return NON_HEAD_TO_HEAD_SPORT_IDS.has(sportId) || NON_HEAD_TO_HEAD_CATEGORIES.has(category);
}

export function eventHasHeadToHead(event: DisplayEvent): boolean {
  const home = textField(event, ['home', 'homeTeam', 'strHomeTeam']);
  const away = textField(event, ['away', 'awayTeam', 'strAwayTeam']);
  if (!home || !away) return false;
  if (comparable(home) === comparable(away)) return false;
  return !isNonHeadToHeadEvent(event);
}

export function getEventDisplay(event: DisplayEvent, options: { stripLeaguePrefix?: boolean } = {}): EventDisplayParts {
  const home = textField(event, ['home', 'homeTeam', 'strHomeTeam']);
  const away = textField(event, ['away', 'awayTeam', 'strAwayTeam']);
  const explicit = textField(event, ['matchup', 'strEvent', 'eventName', 'name', 'label']);
  const league = textField(event, ['leagueLabel', 'league', 'strLeague', 'cardName']);
  const round = textField(event, ['round', 'strRound']);
  const isHeadToHead = eventHasHeadToHead(event);

  if (isHeadToHead) {
    return {
      title: `${home} vs ${away}`,
      primary: home,
      secondary: away,
      detail: '',
      separator: 'vs',
      isHeadToHead: true,
    };
  }

  const duplicateLocation = home && away && comparable(home) === comparable(away) ? compactDuplicateRoute(home) : '';
  let primary = explicit || home || away || 'Featured event';

  if (duplicateLocation && /^\d+$/.test(round) && !/\bstage\b/i.test(primary)) {
    primary = `Stage ${round}`;
  }

  if (COMBAT_SPORT_IDS.has(textField(event, ['sportId']).toLowerCase()) && !away && primary.includes(':') && /vs\.?\s/i.test(primary.slice(primary.indexOf(':')))) {
    primary = primary.substring(0, primary.indexOf(':')).trim();
  }

  primary = cleanStageTitle(primary);
  if (options.stripLeaguePrefix !== false && league) primary = stripLeaguePrefix(primary, league);
  // Collapse duplicate start–finish routes carried inside the title itself
  // (e.g. a cycling stage stored as "Roma – Roma" in the home field).
  primary = compactDuplicateRoute(primary);

  const detail = duplicateLocation || (away ? compactDuplicateRoute(away) : '');
  const shouldAppendDetail = !!detail && comparable(detail) !== comparable(primary) && !titleContainsDetail(primary, detail);
  const title = shouldAppendDetail ? `${primary} – ${detail}` : primary;

  return {
    title,
    primary,
    secondary: shouldAppendDetail ? detail : '',
    detail: shouldAppendDetail ? detail : '',
    separator: shouldAppendDetail ? '–' : '',
    isHeadToHead: false,
  };
}

export function getEventDisplayTitle(event: DisplayEvent, options: { stripLeaguePrefix?: boolean } = {}): string {
  return getEventDisplay(event, options).title;
}