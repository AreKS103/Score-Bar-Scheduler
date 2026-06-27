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
import {
  groupWorldCupEventsByStage,
  sortWorldCupStageKeys,
  WORLD_CUP_SPORT_ID,
} from '@/lib/worldCup';
import {
  getEventFilterKey,
  getActiveScheduleCategories,
  getScheduleFilterPills,
} from '@/lib/scheduleFilter';
import { LOGO_PLACEHOLDER_REMOTE, resolvePublishLogoUrl } from '@/lib/logo';
import { getActiveTimezone } from '@/lib/timezoneStore';
import { eventHasHeadToHead, getEventDisplay } from '@/lib/eventDisplay';
import { format, parseISO } from 'date-fns';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface ScheduleLayoutOpts {
  showTime?: boolean;
  hideLogos?: boolean;
  timezoneLabel?: string;
  /** Split World Cup matches into separate league-group cards per tournament stage. */
  groupWorldCupByStage?: boolean;
}

export interface ScheduleLayoutResult {
  html: string;
  /** Categories present in the schedule (for embed filter tabs). */
  categories: string[];
}

// Re-export filter helpers used by embed route and tests.
export {
  categoryToFilterKey,
  getEventFilterKey,
  getActiveScheduleCategories,
  getScheduleFilterPills,
} from '@/lib/scheduleFilter';

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

function filterDataAttrs(event: MatchEvent): string {
  const attrs: string[] = ['data-filter-item="1"'];
  const key = getEventFilterKey(event);
  if (key) attrs.push(`data-filter-${key}="1"`);
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
    return '';
  }
  return `<img class="sb-logo-img sb-logo-league" src="${esc(logo)}" alt="${esc(alt)}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${LOGO_PLACEHOLDER_REMOTE}';" />`;
}

function teamLogoHtml(logo: string | undefined, hideLogos: boolean): string {
  if (hideLogos || !logo) {
    return '';
  }
  return `<img class="sb-logo-img sb-logo-team" src="${esc(logo)}" alt="" loading="lazy" decoding="async" onerror="this.onerror=null;this.style.display='none'" />`;
}

function venueText(event: MatchEvent): string {
  return [event.venue, event.city].filter(Boolean).join(', ');
}

function tagClassName(tag: string): string {
  const lower = tag.toLowerCase();
  if (lower === 'big screen') return 'sb-meta-tag sb-meta-screen';
  if (lower === 'live') return 'sb-meta-tag sb-meta-live';
  return 'sb-meta-tag sb-meta-label';
}

/** Inline tag pills after matchup text (full schedule single-line rows). */
function buildMatchTagsInline(event: MatchEvent): string {
  const tags = event.tags.map((t) => t.trim()).filter(Boolean);
  if (!tags.length) return '';

  const parts = tags.map(
    (tag) => `<span class="${tagClassName(tag)}">${esc(tag)}</span>`,
  );

  return `<span class="sb-inline-tags"><span class="sb-tag-sep" aria-hidden="true"> - </span>${parts.join('')}</span>`;
}

/** Vertically centred tag column (featured multi-line rows). */
function buildMatchTagsColumn(event: MatchEvent): string {
  const tags = event.tags.map((t) => t.trim()).filter(Boolean);
  if (!tags.length) return '';

  const parts = tags.map(
    (tag) => `<span class="${tagClassName(tag)}">${esc(tag)}</span>`,
  );

  return `<div class="sb-fl-tags-col">${parts.join('')}</div>`;
}

function buildLeagueTitleParts(leagueLabel: string, events: MatchEvent[]): { name: string; stage: string } {
  const rounds = [...new Set(events.map((e) => e.round).filter(Boolean))];
  if (rounds.length === 1) {
    return { name: esc(leagueLabel), stage: ` - ${esc(rounds[0])}` };
  }
  return { name: esc(leagueLabel), stage: '' };
}

function buildLeagueHeaderHtml(
  leagueLabel: string,
  leagueLogo: string,
  hideLogos: boolean,
  events: MatchEvent[],
  previewAttrs?: string,
): string {
  const { name, stage } = buildLeagueTitleParts(leagueLabel, events);
  return `
  <div class="sb-league-header">
    ${leagueLogoHtml(leagueLogo, hideLogos, leagueLabel)}
    <div class="sb-league-title-wrap">
      <span class="sb-league-name"${previewAttrs ?? ''}>${name}</span>${stage ? `<span class="sb-league-stage">${stage}</span>` : ''}
    </div>
  </div>`;
}

function collectFeaturedEvents(
  featured: MatchEvent[],
  featuredLeagues: Map<string, string>,
  allEvents: MatchEvent[],
): MatchEvent[] {
  const result: MatchEvent[] = [];
  const seenIds = new Set<string>();

  for (const e of [...featured].sort(
    (a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time),
  )) {
    if (!seenIds.has(e.id)) {
      seenIds.add(e.id);
      result.push(e);
    }
  }

  for (const [sportId] of featuredLeagues) {
    if (result.some((e) => e.sportId === sportId)) continue;
    const teamEvent =
      allEvents.find((e) => e.sportId === sportId && e.isFeatured && eventHasHeadToHead(e)) ||
      allEvents.find((e) => e.sportId === sportId && eventHasHeadToHead(e));
    if (teamEvent && !seenIds.has(teamEvent.id)) {
      seenIds.add(teamEvent.id);
      result.push(teamEvent);
    }
  }

  return result;
}

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

function expandLeagueGroups(
  leagueKey: string,
  events: MatchEvent[],
  opts: ScheduleLayoutOpts,
  buildGroup: (key: string, groupEvents: MatchEvent[]) => string,
): string[] {
  if (opts.groupWorldCupByStage && leagueKey === WORLD_CUP_SPORT_ID) {
    const byStage = groupWorldCupEventsByStage(events);
    return sortWorldCupStageKeys(byStage.keys())
      .map((stageKey) => byStage.get(stageKey))
      .filter((stageEvents): stageEvents is MatchEvent[] => Boolean(stageEvents?.length))
      .map((stageEvents) => buildGroup(leagueKey, stageEvents));
  }
  return [buildGroup(leagueKey, events)];
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

// ─── Featured league group (grouped by league, rows like full schedule) ───────

function buildFeaturedMatchRow(event: MatchEvent, opts: ScheduleLayoutOpts): string {
  const hideLogos = opts.hideLogos ?? false;
  const showTime = opts.showTime !== false;
  const display = getEventDisplay(event, { stripLeaguePrefix: true });
  const venue = venueText(event);
  const rowFilter = filterDataAttrs(event);
  const { label: leagueLabel } = getLeagueMeta(event.sportId, event);
  const tagsCol = buildMatchTagsColumn(event);

  let teamsRow: string;
  if (display.isHeadToHead) {
    teamsRow = `
      <div class="sb-fl-teams-box">
        <div class="sb-fl-team-line">${teamLogoHtml(event.homeLogo, hideLogos)}<span class="sb-fl-team-name">${esc(display.primary)}</span></div>
        <div class="sb-fl-team-line">${teamLogoHtml(event.awayLogo, hideLogos)}<span class="sb-fl-team-name">${esc(display.secondary)}</span></div>
      </div>${tagsCol}`;
  } else {
    teamsRow = `
      <div class="sb-fl-single-line">
        <span class="sb-fl-event-title">${esc(display.title)}</span>
      </div>${tagsCol}`;
  }

  return `
  <div class="sb-fl-row${venue ? '' : ' sb-fl-row-no-venue'}" ${rowFilter} data-preview-match="1" data-preview-match-id="${esc(event.id)}" data-preview-sport-id="${esc(event.sportId)}" data-preview-league-label="${esc(leagueLabel)}">
    <div class="sb-fl-time-col">
      ${showTime ? `<span class="sb-fl-time">${esc(event.time)}</span>` : ''}
      <span class="sb-fl-date">${esc(formatShortDate(event.date))}</span>
    </div>
    ${venue ? `<div class="sb-fl-venue">${esc(venue)}</div>` : ''}
    <div class="sb-fl-teams-row">${teamsRow}</div>
  </div>`;
}

function buildFeaturedLeagueGroup(
  leagueKey: string,
  events: MatchEvent[],
  opts: ScheduleLayoutOpts,
  labelOverride?: string,
): string {
  const hideLogos = opts.hideLogos ?? false;
  const sorted = sortLeagueEvents(leagueKey, events);
  const { label: leagueLabel, logo: leagueLogo } = getLeagueMeta(leagueKey, sorted[0]);
  const displayLabel = labelOverride ?? leagueLabel;
  const filterAttrs = filterDataAttrs(sorted[0]);
  const rows = sorted.map((e) => buildFeaturedMatchRow(e, opts));
  const previewAttrs = ` data-preview-league="1" data-preview-sport-id="${esc(leagueKey)}" data-preview-league-label="${esc(displayLabel)}"`;

  return `
<div class="sb-fl-group" ${filterAttrs}>
  ${buildLeagueHeaderHtml(displayLabel, leagueLogo, hideLogos, sorted, previewAttrs)}
  ${rows.join('\n')}
</div>`;
}

function buildFeaturedSection(
  featured: MatchEvent[],
  featuredLeagues: Map<string, string>,
  allEvents: MatchEvent[],
  leagueOrder: string[] | undefined,
  opts: ScheduleLayoutOpts,
): string {
  const featuredEvents = collectFeaturedEvents(featured, featuredLeagues, allEvents);
  if (!featuredEvents.length) return '';

  const byLeague = groupByLeagueFlat(featuredEvents);
  const ordered = buildOrderedLeagues(byLeague, featuredEvents, leagueOrder);

  const groups = ordered.flatMap((key) => {
    const labelOverride = featuredLeagues.get(key);
    return expandLeagueGroups(
      key,
      byLeague.get(key)!,
      opts,
      (leagueKey, groupEvents) => buildFeaturedLeagueGroup(
        leagueKey,
        groupEvents,
        opts,
        labelOverride?.trim() || undefined,
      ),
    );
  });

  return `
<section class="sb-featured-section">
  <div class="sb-section-header">
    <div class="sb-section-header-text">
      <h2 class="sb-section-title">This Week's Highlights</h2>
      <p class="sb-section-subtitle">Your starred matches</p>
    </div>
    <div class="sb-section-header-line" aria-hidden="true"></div>
  </div>
  <div class="sb-featured-groups">${groups.join('\n')}</div>
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
  const filterAttrs = filterDataAttrs(sorted[0]);
  const previewAttrs = ` data-preview-league="1" data-preview-sport-id="${esc(leagueKey)}" data-preview-league-label="${esc(leagueLabel)}"`;

  const rows = sorted.map((event, idx) => {
    const display = getEventDisplay(event, { stripLeaguePrefix: true });
    const isLast = idx === sorted.length - 1;

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
    <div class="sb-lg-line">
      ${showTime ? `<span class="sb-lg-time">${esc(event.time)}</span>` : ''}
      <span class="sb-lg-date">${esc(formatShortDate(event.date))}</span>
      <span class="sb-lg-matchup">${matchup}</span>${buildMatchTagsInline(event)}
    </div>
  </div>`;
  });

  return `
<div class="sb-league-group" ${filterAttrs}>
  ${buildLeagueHeaderHtml(leagueLabel, leagueLogo, hideLogos, sorted, previewAttrs)}
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

  const groups = ordered.flatMap((key) => expandLeagueGroups(
    key,
    byLeague.get(key)!,
    opts,
    (leagueKey, groupEvents) => buildLeagueGroup(leagueKey, groupEvents, opts),
  ));

  return `
<section class="sb-full-section">
  <div class="sb-section-header">
    <div class="sb-section-header-text">
      <h2 class="sb-section-title">Full Sports Schedule</h2>
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

  const featuredHTML = buildFeaturedSection(featured, featuredLeagues, selected, leagueOrder, opts);
  const fullHTML = buildFullScheduleSection(selected, leagueOrder, opts);

  const parts: string[] = ['<div class="sb-schedule">'];

  if (featuredHTML) {
    parts.push(featuredHTML);
  }

  if (fullHTML) {
    parts.push(fullHTML);
  }

  parts.push('</div>');

  if (!featuredHTML && !fullHTML) {
    return { html: '<p class="sb-empty">No matches selected for this week.</p>', categories: [] };
  }

  const categories = getActiveScheduleCategories(selected);

  return { html: parts.join('\n'), categories };
}

// ─── Layout CSS (embed + preview) ─────────────────────────────────────────────

export const SCHEDULE_LAYOUT_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Inter:wght@400;500;600;700&display=swap');
.sb-schedule{font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:var(--text,#111827);background:var(--bg,#fff)}
.sb-section-header{display:flex;align-items:flex-end;gap:12px;margin-bottom:14px}
.sb-section-header-text{flex-shrink:0}
.sb-section-title{font-family:'Barlow Condensed',sans-serif;font-size:var(--sb-section-heading-size,18px);font-weight:700;color:var(--heading,#1e3a5f);margin:0;line-height:1.1;letter-spacing:.01em}
.sb-section-subtitle{font-size:calc(var(--sb-section-heading-size,18px)*0.72);color:var(--muted,#6b7280);margin:2px 0 0;font-weight:400;line-height:1.2}
.sb-section-header-line{flex:1;height:1px;background:var(--border,#e5e7eb);margin-bottom:4px}
.sb-featured-section{margin-bottom:24px}
.sb-featured-groups{display:flex;flex-direction:column;gap:10px}
.sb-fl-group{border:1px solid var(--border,#e5e7eb);border-radius:8px;overflow:hidden;background:#fff}
.sb-league-header{display:flex;align-items:center;gap:10px;padding:10px 12px;background:#f3f4f6;border-bottom:1px solid var(--border,#e5e7eb)}
.sb-league-title-wrap{display:flex;align-items:center;flex-wrap:wrap;gap:8px;flex:1;min-width:0}
.sb-league-name{font-weight:700;font-size:var(--sb-league-header-size,16px);color:var(--heading,#111827);line-height:1.2}
.sb-league-stage{font-weight:500;font-size:var(--sb-league-header-size,16px);color:#6b7280;line-height:1.2}
.sb-inline-tags{display:inline-flex;align-items:center;flex-wrap:wrap;gap:6px;vertical-align:baseline}
.sb-tag-sep{color:var(--muted,#9ca3af);font-weight:400;font-size:calc(var(--sb-match-size,14px)*0.9);white-space:pre}
.sb-meta-tag{font-size:calc(var(--sb-match-size,14px)*0.72);font-weight:600;letter-spacing:.02em;padding:3px 8px;border-radius:999px;white-space:nowrap;line-height:1.2}
.sb-meta-screen{background:#fff;color:var(--heading,#111827);border:1px solid var(--border,#d1d5db);font-weight:700;text-transform:uppercase;font-size:calc(var(--sb-match-size,14px)*0.62);letter-spacing:.05em}
.sb-meta-live{background:#dc2626;color:#fff;border:1px solid #dc2626;font-weight:700;text-transform:uppercase;font-size:calc(var(--sb-match-size,14px)*0.62);letter-spacing:.05em}
.sb-meta-label{background:#fff;color:var(--muted,#6b7280);border:1px solid var(--border,#e5e7eb)}
.sb-fl-row{display:grid;grid-template-columns:minmax(54px,auto) 1fr;column-gap:12px;row-gap:3px;padding:10px 12px;border-bottom:1px solid var(--border,#e5e7eb);align-items:center}
.sb-fl-row:last-child{border-bottom:none}
.sb-fl-time-col{grid-column:1;grid-row:2;align-self:center}
.sb-fl-venue{grid-column:2;grid-row:1;font-size:var(--sb-section-heading-size,18px);color:var(--muted,#6b7280);align-self:end;line-height:1.2}
.sb-fl-teams-row{grid-column:2;grid-row:2;display:flex;align-items:center;gap:14px;min-width:0}
.sb-fl-row-no-venue .sb-fl-time-col,.sb-fl-row-no-venue .sb-fl-teams-row{grid-row:1}
.sb-fl-tags-col{display:flex;align-items:center;flex-wrap:wrap;gap:6px;flex-shrink:0}
.sb-fl-time{font-family:var(--sb-hl-font,'Barlow Condensed',sans-serif);font-size:var(--sb-match-size,14px);font-weight:var(--sb-hl-weight,700);color:var(--sb-hl-time-color,var(--heading,#111827));display:block;line-height:1.05}
.sb-fl-date{font-family:'Barlow Condensed',sans-serif;font-size:var(--sb-date-size,11px);font-weight:600;text-transform:uppercase;color:var(--muted,#6b7280);letter-spacing:.03em;display:block;margin-top:3px;line-height:1.05}
.sb-fl-teams-box{display:flex;flex-direction:column;gap:4px;flex:0 0 auto}
.sb-fl-team-line{display:flex;align-items:center;gap:8px}
.sb-fl-team-name{font-weight:var(--sb-hl-weight,600);font-family:var(--sb-hl-font,inherit);font-size:var(--sb-match-size,14px);color:var(--sb-hl-text,var(--heading,#111827));overflow-wrap:anywhere;line-height:1.25}
.sb-fl-single-line{display:flex;align-items:center;flex-wrap:wrap;gap:6px;flex:0 0 auto}
.sb-fl-event-title{font-weight:var(--sb-hl-weight,600);font-family:var(--sb-hl-font,inherit);font-size:var(--sb-match-size,14px);color:var(--sb-hl-text,var(--heading,#111827));overflow-wrap:anywhere;line-height:1.25}
.sb-logo-img{object-fit:contain;flex-shrink:0;display:block}
.sb-logo-league{height:var(--sb-logo-height,28px);width:auto;max-width:80px}
.sb-logo-team{height:calc(var(--sb-logo-height,28px)*0.78);width:auto;max-width:36px}
.sb-full-section{margin-bottom:8px;margin-top:8px}
.sb-league-groups{display:flex;flex-direction:column;gap:10px}
.sb-league-group{border:1px solid var(--border,#e5e7eb);border-radius:8px;overflow:hidden;background:#fff}
.sb-lg-row{display:flex;align-items:flex-start;padding:10px 12px;border-bottom:1px solid var(--border,#e5e7eb)}
.sb-lg-line{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px;width:100%;min-width:0}
.sb-lg-row-last{border-bottom:none}
.sb-lg-row-indent{padding-left:28px}
.sb-lg-time,.sb-lg-date{font-family:'Barlow Condensed',sans-serif;display:inline;line-height:1.3}
.sb-lg-time{font-size:var(--sb-match-size,14px);font-weight:var(--sb-normal-weight,700);font-family:var(--sb-normal-font,'Barlow Condensed',sans-serif);color:var(--sb-normal-time-color,var(--heading,#111827))}
.sb-lg-date{font-size:var(--sb-date-size,11px);font-weight:600;text-transform:uppercase;color:var(--muted,#6b7280);letter-spacing:.03em}
.sb-lg-matchup{font-weight:var(--sb-normal-weight,600);font-family:var(--sb-normal-font,inherit);font-size:var(--sb-match-size,14px);color:var(--sb-normal-text,var(--heading,#111827));overflow-wrap:anywhere;line-height:1.25}
.sb-vs{font-style:normal;font-weight:400;font-size:calc(var(--sb-match-size,14px)*0.85);color:var(--muted,#9ca3af);margin:0 5px}
.sb-empty{color:var(--muted,#6b7280);font-size:var(--sb-match-size,14px)}
@media (max-width:768px){
.sb-section-header{gap:8px;margin-bottom:12px}
.sb-fl-header,.sb-league-header{padding:9px 10px;gap:8px}
.sb-fl-row,.sb-lg-row{padding:9px 10px}
.sb-fl-time-col{min-width:50px}
.sb-logo-league{max-width:68px}
.sb-logo-team{max-width:32px}
}
@media (max-width:480px){
.sb-league-header{flex-wrap:wrap}
.sb-league-title-wrap{width:100%}
.sb-fl-row,.sb-lg-row{padding:8px 10px}
.sb-fl-time-col{min-width:46px}
.sb-lg-line{gap:5px}
.sb-meta-tag{padding:2px 7px}
.sb-lg-row-indent{padding-left:18px}
}
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

export function buildFilterTabsHTML(
  events: MatchEvent[] = [],
  catLabels: Record<string, string> = {},
): string {
  const pills = getScheduleFilterPills(events, catLabels);
  if (!pills.length) return '';

  return `<div id="sport-tabs" role="tablist">
  ${pills.map((pill, i) =>
    `<button class="tab${i === 0 ? ' active' : ''}" data-filter="${pill.key}" role="tab"${i === 0 ? ' aria-selected="true"' : ''}>${esc(pill.label)}</button>`,
  ).join('\n  ')}
</div>`;
}
