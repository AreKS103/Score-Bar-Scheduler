/**
 * Shared schedule layout — Featured Matches cards + Full Schedule league groups.
 * Used by renderEmbed.ts (live embed) and generateHTML.ts (preview / publish snapshot).
 */

import type { MatchEvent } from '@/types';
import {
  CATEGORY_ORDER,
  FOOTBALL_LEAGUE_ORDER,
  SPORTS_CONFIG,
} from '@/lib/config';
import { LOGO_PLACEHOLDER_REMOTE, resolvePublishLogoUrl } from '@/lib/logo';
import { getActiveTimezone } from '@/lib/timezoneStore';
import { eventHasHeadToHead, getEventDisplay } from '@/lib/eventDisplay';
import { format, parseISO } from 'date-fns';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface ScheduleLayoutOpts {
  showTime?: boolean;
  hideLogos?: boolean;
  timezoneLabel?: string;
}

export interface ScheduleLayoutResult {
  html: string;
  /** Legacy — embed route builds its own fixed filter tabs */
  categories: string[];
}

export const FILTER_PILLS = [
  { key: 'all', label: 'All' },
  { key: 'football', label: 'Football' },
  { key: 'afl', label: 'AFL' },
  { key: 'nrl', label: 'NRL' },
  { key: 'motogp', label: 'MotoGP' },
  { key: 'f1', label: 'F1' },
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function esc(str: string): string {
  return (str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function catSort(cat: string): number {
  const idx = CATEGORY_ORDER.indexOf(cat);
  return idx === -1 ? 999 : idx;
}

function footSort(sportId: string): number {
  const idx = FOOTBALL_LEAGUE_ORDER.indexOf(sportId);
  return idx === -1 ? 999 : idx;
}

function formatShortDate(dateStr: string): string {
  return format(parseISO(dateStr), 'EEE d').toUpperCase();
}

function formatCardDate(dateStr: string): string {
  return format(parseISO(dateStr), 'EEE d MMMM');
}

function formatDateRange(dates: string[]): string {
  if (!dates.length) return '';
  const sorted = [...dates].sort();
  const start = format(parseISO(sorted[0]), 'd MMMM');
  const end = format(parseISO(sorted[sorted.length - 1]), 'd MMMM');
  return sorted.length === 1 ? start : `${start} to ${end}`;
}

export function getTimezoneLabel(): string {
  try {
    const zone = getActiveTimezone();
    const parts = new Intl.DateTimeFormat('en', {
      timeZone: zone,
      timeZoneName: 'shortOffset',
    }).formatToParts(new Date());
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  } catch {
    return 'GMT';
  }
}

function cleanCombatLabel(e: MatchEvent): string {
  if (!['boxing', 'ufc', 'bellator'].includes(e.sportId) || !e.away) return e.leagueLabel;
  const colon = e.leagueLabel.indexOf(':');
  if (colon > 0 && /vs\.?\s/i.test(e.leagueLabel.slice(colon))) {
    return e.leagueLabel.slice(0, colon).trim();
  }
  return e.leagueLabel;
}

function getSportBadge(event: MatchEvent): string {
  if (event.sportId === 'afl') return 'AFL';
  if (event.sportId === 'nrl') return 'NRL';
  if (event.sportId === 'f1') return 'F1';
  if (event.sportId === 'motogp') return 'MotoGP';
  return event.category;
}

function filterDataAttrs(event: MatchEvent): string {
  const attrs: string[] = ['data-filter-item="1"'];
  if (event.category === 'Football') attrs.push('data-filter-football="1"');
  if (event.sportId === 'afl') attrs.push('data-filter-afl="1"');
  if (event.sportId === 'nrl') attrs.push('data-filter-nrl="1"');
  if (event.sportId === 'motogp') attrs.push('data-filter-motogp="1"');
  if (event.sportId === 'f1') attrs.push('data-filter-f1="1"');
  return attrs.join(' ');
}

function getLeagueMeta(leagueKey: string, firstEvent?: MatchEvent) {
  const config = SPORTS_CONFIG.find((s) => s.id === leagueKey);
  const label =
    (leagueKey === 'basketball-ncaam' && firstEvent?.leagueLabel)
      ? firstEvent.leagueLabel
      : (config?.label || firstEvent?.leagueLabel || leagueKey);
  const rawLogo = config?.logo || firstEvent?.leagueLogo || '';
  const logo = resolvePublishLogoUrl(rawLogo, config?.publishLogo);
  return { config, label, logo };
}

function leagueLogoHtml(logo: string, hideLogos: boolean, alt: string): string {
  if (hideLogos || !logo) {
    return '<span class="sb-league-ph" aria-hidden="true"></span>';
  }
  return `<img class="sb-league-img" src="${esc(logo)}" alt="${esc(alt)}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${LOGO_PLACEHOLDER_REMOTE}';" />`;
}

function crestHtml(logo: string | undefined, hideLogos: boolean): string {
  if (hideLogos || !logo) {
    return '<span class="sb-crest-ph" aria-hidden="true"></span>';
  }
  return `<img class="sb-crest-img" src="${esc(logo)}" alt="" loading="lazy" decoding="async" onerror="this.onerror=null;this.style.display='none'" />`;
}

function venueText(event: MatchEvent): string {
  const parts: string[] = [];
  if (event.round) parts.push(event.round);
  const loc = [event.venue, event.city].filter(Boolean).join(', ');
  if (loc) parts.push(loc);
  return parts.join(' · ');
}

function leagueStageLabel(events: MatchEvent[]): string {
  const rounds = events.map((e) => e.round).filter(Boolean);
  if (!rounds.length) return '';
  const counts = new Map<string, number>();
  for (const r of rounds) counts.set(r, (counts.get(r) ?? 0) + 1);
  let best = '';
  let bestCount = 0;
  for (const [r, c] of counts) {
    if (c > bestCount) { best = r; bestCount = c; }
  }
  return best;
}

function hasBigScreenBadge(event: MatchEvent): boolean {
  return event.isFeatured || event.tags.some((t) => t.toLowerCase() === 'big screen');
}

const CALENDAR_SVG =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';

function groupByLeagueFlat(events: MatchEvent[]): Map<string, MatchEvent[]> {
  const grouped = new Map<string, MatchEvent[]>();
  for (const event of events) {
    if (!grouped.has(event.sportId)) grouped.set(event.sportId, []);
    grouped.get(event.sportId)!.push(event);
  }
  return grouped;
}

function sortLeagueEvents(leagueKey: string, events: MatchEvent[]): MatchEvent[] {
  const isCombat = ['ufc', 'bellator', 'boxing'].includes(leagueKey);
  const byDate = new Map<string, MatchEvent[]>();
  for (const e of events) {
    if (!byDate.has(e.date)) byDate.set(e.date, []);
    byDate.get(e.date)!.push(e);
  }

  const result: MatchEvent[] = [];
  for (const date of Array.from(byDate.keys()).sort()) {
    const dayEvents = byDate.get(date)!;
    if (isCombat && dayEvents.some((e) => e.fightOrder !== undefined)) {
      const cards = new Map<string, MatchEvent[]>();
      const noCard: MatchEvent[] = [];
      for (const e of dayEvents) {
        const k = e.cardName ?? '';
        if (!k) { noCard.push(e); continue; }
        if (!cards.has(k)) cards.set(k, []);
        cards.get(k)!.push(e);
      }
      noCard.sort((a, b) => a.time.localeCompare(b.time));
      for (const fights of Array.from(cards.values()).sort(
        (a, b) => (a[0]?.time ?? '').localeCompare(b[0]?.time ?? ''),
      )) {
        fights.sort((a, b) => (a.fightOrder ?? 0) - (b.fightOrder ?? 0));
        result.push(...fights);
      }
      result.push(...noCard);
    } else {
      result.push(...[...dayEvents].sort((a, b) => a.time.localeCompare(b.time)));
    }
  }
  return result;
}

function buildOrderedLeagues(
  byLeague: Map<string, MatchEvent[]>,
  selected: MatchEvent[],
  leagueOrder?: string[],
): string[] {
  const allIds = Array.from(byLeague.keys());
  const ordered: string[] = [];
  if (leagueOrder?.length) {
    for (const id of leagueOrder) {
      if (byLeague.has(id)) ordered.push(id);
    }
  }
  const remaining = allIds.filter((id) => !ordered.includes(id));
  remaining.sort((a, b) => {
    const evA = selected.find((e) => e.sportId === a);
    const evB = selected.find((e) => e.sportId === b);
    const catA = evA?.category ?? '';
    const catB = evB?.category ?? '';
    if (catA !== catB) return catSort(catA) - catSort(catB);
    if (catA === 'Football') return footSort(a) - footSort(b);
    return a.localeCompare(b);
  });
  ordered.push(...remaining);
  return ordered;
}

// ─── Featured card ────────────────────────────────────────────────────────────

function buildFeaturedCard(event: MatchEvent, opts: ScheduleLayoutOpts, labelOverride?: string): string {
  const hideLogos = opts.hideLogos ?? false;
  const showTime = opts.showTime !== false;
  const tz = opts.timezoneLabel ?? getTimezoneLabel();
  const display = getEventDisplay(event, { stripLeaguePrefix: true });
  const { label: leagueLabel, logo: leagueLogo } = getLeagueMeta(event.sportId, event);
  const leagueName = labelOverride ?? (cleanCombatLabel(event) || leagueLabel);

  const subtitleParts = [event.round, formatCardDate(event.date)].filter(Boolean);
  const subtitle = subtitleParts.map((p) => esc(p)).join(' · ');
  const venue = venueText(event);

  const attrs = filterDataAttrs(event);
  const previewAttrs = `data-preview-match="1" data-preview-match-id="${esc(event.id)}" data-preview-sport-id="${esc(event.sportId)}" data-preview-league-label="${esc(leagueLabel)}"`;

  let teamRows: string;

  if (display.isHeadToHead) {
    teamRows = `
      <div class="sb-fc-team-row">
        ${crestHtml(event.homeLogo, hideLogos)}
        <span class="sb-fc-team-name">${esc(display.primary)}</span>
        ${showTime ? `<div class="sb-fc-time-col"><span class="sb-fc-time">${esc(event.time)}</span><span class="sb-fc-tz">${esc(tz)}</span></div>` : ''}
      </div>
      <div class="sb-fc-team-row sb-fc-team-row-last">
        ${crestHtml(event.awayLogo, hideLogos)}
        <span class="sb-fc-team-name">${esc(display.secondary)}</span>
        ${hasBigScreenBadge(event) ? '<span class="sb-fc-badge">Big Screen</span>' : ''}
      </div>`;
  } else {
    teamRows = `
      <div class="sb-fc-team-row">
        ${crestHtml(event.homeLogo, hideLogos) || leagueLogoHtml(leagueLogo, hideLogos, leagueLabel)}
        <span class="sb-fc-team-name">${esc(display.title)}</span>
        ${showTime ? `<div class="sb-fc-time-col"><span class="sb-fc-time">${esc(event.time)}</span><span class="sb-fc-tz">${esc(tz)}</span></div>` : ''}
      </div>
      <div class="sb-fc-team-row sb-fc-team-row-last">
        <span class="sb-crest-ph sb-crest-ph-hidden" aria-hidden="true"></span>
        <span class="sb-fc-team-name sb-fc-team-muted">${display.secondary ? esc(display.secondary) : '&nbsp;'}</span>
        ${hasBigScreenBadge(event) ? '<span class="sb-fc-badge">Big Screen</span>' : ''}
      </div>`;
  }

  return `
<article class="sb-fc-card" ${attrs} ${previewAttrs}>
  <div class="sb-fc-header">
    ${leagueLogoHtml(leagueLogo, hideLogos, leagueName)}
    <div class="sb-fc-league-info">
      <div class="sb-fc-league-name">${esc(leagueName)}</div>
      ${subtitle ? `<div class="sb-fc-league-sub">${subtitle}</div>` : ''}
    </div>
    <button type="button" class="sb-fc-cal-btn" aria-label="Add to calendar">${CALENDAR_SVG}</button>
  </div>
  ${venue ? `<div class="sb-fc-venue">${esc(venue)}</div>` : ''}
  <div class="sb-fc-teams">${teamRows}</div>
</article>`;
}

function buildFeaturedSection(
  featured: MatchEvent[],
  featuredLeagues: Map<string, string>,
  allEvents: MatchEvent[],
  opts: ScheduleLayoutOpts,
): string {
  const cards: string[] = [];

  const starred = [...featured].sort(
    (a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time),
  );
  for (const e of starred) {
    cards.push(buildFeaturedCard(e, opts));
  }

  for (const [sportId, customLabel] of featuredLeagues) {
    if (starred.some((e) => e.sportId === sportId)) continue;
    const teamEvent =
      allEvents.find((e) => e.sportId === sportId && e.isFeatured && eventHasHeadToHead(e)) ||
      allEvents.find((e) => e.sportId === sportId && eventHasHeadToHead(e));
    if (teamEvent) {
      const label = (customLabel || '').trim() || getLeagueMeta(sportId).label;
      cards.push(buildFeaturedCard(teamEvent, opts, label));
    }
  }

  if (!cards.length) return '';

  return `
<section class="sb-featured-section">
  <div class="sb-section-header">
    <div class="sb-section-header-text">
      <h2 class="sb-section-title">Featured Matches</h2>
      <p class="sb-section-subtitle">Showing live on the big screen</p>
    </div>
    <div class="sb-section-header-line" aria-hidden="true"></div>
  </div>
  <div class="sb-featured-cards">${cards.join('\n')}</div>
</section>`;
}

// ─── Full schedule league group ───────────────────────────────────────────────

function buildLeagueGroup(
  leagueKey: string,
  events: MatchEvent[],
  opts: ScheduleLayoutOpts,
): string {
  const hideLogos = opts.hideLogos ?? false;
  const showTime = opts.showTime !== false;
  const sorted = sortLeagueEvents(leagueKey, events);
  const { label: leagueLabel, logo: leagueLogo } = getLeagueMeta(leagueKey, sorted[0]);
  const stage = leagueStageLabel(sorted);
  const filterAttrs = filterDataAttrs(sorted[0]);

  const rows = sorted.map((event, idx) => {
    const display = getEventDisplay(event, { stripLeaguePrefix: true });
    const isLast = idx === sorted.length - 1;
    const sportBadge = getSportBadge(event);
    const stageLabel = event.round ? esc(event.round.toUpperCase()) : '';

    const matchup = display.isHeadToHead
      ? `${esc(display.primary)}<span class="sb-vs">vs</span>${esc(display.secondary)}`
      : esc(display.title);

    const indent = ['ufc', 'bellator', 'boxing'].includes(leagueKey)
      && event.fightOrder !== undefined
      && !event.isMainCard
      ? ' sb-lg-row-indent'
      : '';

    const rowFilter = filterDataAttrs(event);

    return `
  <div class="sb-lg-row${isLast ? ' sb-lg-row-last' : ''}${indent}" ${rowFilter} data-preview-match="1" data-preview-match-id="${esc(event.id)}" data-preview-sport-id="${esc(leagueKey)}" data-preview-league-label="${esc(leagueLabel)}">
    <div class="sb-lg-time-col">
      ${showTime ? `<span class="sb-lg-time">${esc(event.time)}</span>` : ''}
      <span class="sb-lg-date">${esc(formatShortDate(event.date))}</span>
    </div>
    <div class="sb-lg-match-col">
      ${stageLabel ? `<div class="sb-lg-stage-label">${stageLabel}</div>` : ''}
      <div class="sb-lg-matchup">${matchup}</div>
    </div>
    <span class="sb-lg-sport-badge">${esc(sportBadge)}</span>
  </div>`;
  });

  return `
<div class="sb-league-group" ${filterAttrs}>
  <div class="sb-lg-header">
    ${leagueLogoHtml(leagueLogo, hideLogos, leagueLabel)}
    <span class="sb-lg-name" data-preview-league="1" data-preview-sport-id="${esc(leagueKey)}" data-preview-league-label="${esc(leagueLabel)}">${esc(leagueLabel)}</span>
    ${stage ? `<span class="sb-lg-stage">${esc(stage)}</span>` : ''}
  </div>
  ${rows.join('\n')}
</div>`;
}

function buildFullScheduleSection(
  selected: MatchEvent[],
  leagueOrder: string[] | undefined,
  opts: ScheduleLayoutOpts,
): string {
  if (!selected.length) return '';

  const byLeague = groupByLeagueFlat(selected);
  const ordered = buildOrderedLeagues(byLeague, selected, leagueOrder);
  const allDates = selected.map((e) => e.date);
  const dateRange = formatDateRange(allDates);

  const groups = ordered.map((key) => buildLeagueGroup(key, byLeague.get(key)!, opts));

  return `
<section class="sb-full-section">
  <div class="sb-section-header">
    <div class="sb-section-header-text">
      <h2 class="sb-section-title">Full Schedule</h2>
      <p class="sb-section-subtitle">All matches${dateRange ? ` — ${esc(dateRange)}` : ''}</p>
    </div>
    <div class="sb-section-header-line" aria-hidden="true"></div>
  </div>
  <div class="sb-league-groups">${groups.join('\n')}</div>
</section>`;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function renderScheduleLayout(
  events: MatchEvent[],
  leagueOrder: string[] | undefined,
  featuredLeagues: Map<string, string>,
  opts: ScheduleLayoutOpts = {},
): ScheduleLayoutResult {
  const selected = events;
  const featured = events.filter((e) => e.isFeatured);

  const featuredHTML = buildFeaturedSection(featured, featuredLeagues, selected, opts);
  const fullHTML = buildFullScheduleSection(selected, leagueOrder, opts);

  const parts: string[] = ['<div class="sb-schedule">'];

  if (featuredHTML) {
    parts.push(featuredHTML);
    if (fullHTML) {
      parts.push('<div class="sb-section-divider"><span>Full Schedule</span></div>');
    }
  }

  if (fullHTML) {
    parts.push(fullHTML);
  }

  parts.push('</div>');

  if (!featuredHTML && !fullHTML) {
    return { html: '<p class="sb-empty">No matches selected for this week.</p>', categories: [] };
  }

  const seenCats = new Set<string>();
  const categories: string[] = [];
  for (const e of selected) {
    if (e.category && e.category !== 'Custom' && !seenCats.has(e.category)) {
      seenCats.add(e.category);
      categories.push(e.category);
    }
  }

  return { html: parts.join('\n'), categories };
}

// ─── Layout CSS (embed + preview) ─────────────────────────────────────────────

export const SCHEDULE_LAYOUT_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Inter:wght@400;500;600;700&display=swap');
.sb-schedule{font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:var(--text,#111827);background:var(--bg,#fff)}
.sb-section-header{display:flex;align-items:flex-end;gap:12px;margin-bottom:14px}
.sb-section-header-text{flex-shrink:0}
.sb-section-title{font-family:'Barlow Condensed',sans-serif;font-size:1.35em;font-weight:700;color:var(--heading,#1e3a5f);margin:0;line-height:1.1;letter-spacing:.01em}
.sb-section-subtitle{font-size:.72em;color:var(--muted,#6b7280);margin:2px 0 0;font-weight:400}
.sb-section-header-line{flex:1;height:1px;background:var(--border,#e5e7eb);margin-bottom:4px}
.sb-featured-section{margin-bottom:20px}
.sb-featured-cards{display:flex;flex-direction:column;gap:10px}
.sb-fc-card{border:1px solid var(--border,#e5e7eb);border-radius:8px;overflow:hidden;background:#fff}
.sb-fc-header{display:flex;align-items:center;gap:10px;padding:10px 12px;background:#f3f4f6;border-bottom:1px solid var(--border,#e5e7eb)}
.sb-fc-league-info{flex:1;min-width:0}
.sb-fc-league-name{font-weight:700;font-size:.88em;color:var(--heading,#111827);line-height:1.2}
.sb-fc-league-sub{font-size:.7em;color:var(--muted,#6b7280);margin-top:1px}
.sb-fc-cal-btn{flex-shrink:0;display:flex;align-items:center;justify-content:center;width:28px;height:28px;border:1px solid var(--border,#e5e7eb);border-radius:6px;background:#fff;color:var(--muted,#6b7280);cursor:default;padding:0}
.sb-fc-venue{padding:6px 12px;font-size:.68em;color:var(--muted,#6b7280);border-bottom:1px solid var(--border,#e5e7eb)}
.sb-fc-teams{display:flex;flex-direction:column}
.sb-fc-team-row{display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid var(--border,#e5e7eb)}
.sb-fc-team-row-last{border-bottom:none}
.sb-fc-team-name{flex:1;font-weight:600;font-size:.88em;color:var(--heading,#111827);min-width:0;overflow-wrap:anywhere}
.sb-fc-team-muted{color:var(--muted,#6b7280);font-weight:500}
.sb-fc-time-col{text-align:right;flex-shrink:0}
.sb-fc-time{font-family:'Barlow Condensed',sans-serif;font-size:1.5em;font-weight:700;color:var(--heading,#111827);line-height:1}
.sb-fc-tz{font-size:.55em;text-transform:uppercase;color:var(--muted,#6b7280);letter-spacing:.04em}
.sb-fc-badge{flex-shrink:0;background:#3b82f6;color:#fff;font-size:.6em;font-weight:700;text-transform:uppercase;letter-spacing:.06em;padding:4px 10px;border-radius:999px}
.sb-league-ph,.sb-crest-ph{display:inline-block;width:24px;height:24px;border-radius:50%;background:#e5e7eb;flex-shrink:0}
.sb-crest-ph-hidden{visibility:hidden}
.sb-league-img,.sb-crest-img{width:24px;height:24px;object-fit:contain;flex-shrink:0;border-radius:50%}
.sb-section-divider{display:flex;align-items:center;margin:22px 0;text-align:center}
.sb-section-divider::before,.sb-section-divider::after{content:'';flex:1;height:1px;background:var(--border,#e5e7eb)}
.sb-section-divider span{font-family:'Barlow Condensed',sans-serif;font-size:.68em;font-weight:600;text-transform:uppercase;letter-spacing:.1em;color:var(--muted,#9ca3af);background:var(--bg,#fff);padding:2px 14px;border:1px solid var(--border,#e5e7eb);border-radius:999px;white-space:nowrap}
.sb-full-section{margin-bottom:8px}
.sb-league-groups{display:flex;flex-direction:column;gap:10px}
.sb-league-group{border:1px solid var(--border,#e5e7eb);border-radius:8px;overflow:hidden;background:#fff}
.sb-lg-header{display:flex;align-items:center;gap:10px;padding:10px 12px;background:#f3f4f6;border-bottom:1px solid var(--border,#e5e7eb)}
.sb-lg-name{flex:1;font-weight:700;font-size:.88em;color:var(--heading,#111827)}
.sb-lg-stage{font-size:.72em;color:var(--muted,#6b7280);flex-shrink:0}
.sb-lg-row{display:flex;align-items:center;gap:12px;padding:10px 12px;border-bottom:1px solid var(--border,#e5e7eb)}
.sb-lg-row-last{border-bottom:none}
.sb-lg-row-indent{padding-left:28px}
.sb-lg-time-col{flex-shrink:0;min-width:48px}
.sb-lg-time{font-family:'Barlow Condensed',sans-serif;font-size:1.1em;font-weight:700;color:var(--heading,#111827);display:block;line-height:1.1}
.sb-lg-date{font-size:.55em;text-transform:uppercase;color:var(--muted,#6b7280);letter-spacing:.04em;display:block;margin-top:2px}
.sb-lg-match-col{flex:1;min-width:0}
.sb-lg-stage-label{font-size:.58em;text-transform:uppercase;color:var(--muted,#6b7280);letter-spacing:.06em;margin-bottom:2px}
.sb-lg-matchup{font-weight:600;font-size:.86em;color:var(--heading,#111827);overflow-wrap:anywhere}
.sb-vs{font-style:normal;font-weight:400;font-size:.78em;color:var(--muted,#9ca3af);margin:0 5px}
.sb-lg-sport-badge{flex-shrink:0;font-size:.58em;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--muted,#6b7280);border:1px solid var(--border,#e5e7eb);border-radius:999px;padding:3px 8px;background:#fff;white-space:nowrap}
.sb-empty{color:var(--muted,#6b7280);font-size:.9em}
`;

export const SCHEDULE_FILTER_TAB_JS = `
(function(){
  document.addEventListener('click',function(e){
    var t=e.target&&e.target.closest&&e.target.closest('#sport-tabs .tab');
    if(!t)return;
    var f=t.getAttribute('data-filter');
    document.querySelectorAll('#sport-tabs .tab').forEach(function(x){
      x.classList.remove('active');
      x.setAttribute('aria-selected','false');
    });
    t.classList.add('active');
    t.setAttribute('aria-selected','true');
    document.querySelectorAll('[data-filter-item]').forEach(function(el){
      if(f==='all'){el.style.display='';return;}
      el.style.display=el.getAttribute('data-filter-'+f)?'':'none';
    });
  });
})();
`;

export function buildFilterTabsHTML(): string {
  return `<div id="sport-tabs" role="tablist">
  ${FILTER_PILLS.map((p, i) =>
    `<button class="tab${i === 0 ? ' active' : ''}" data-filter="${p.key}" role="tab"${i === 0 ? ' aria-selected="true"' : ''}>${p.label}</button>`,
  ).join('\n  ')}
</div>`;
}
