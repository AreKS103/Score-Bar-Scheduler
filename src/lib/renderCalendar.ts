/**
 * renderCalendar.ts
 *
 * Renders events as a calendar-grid layout with day columns.
 * Enforces a Monday–Sunday week span with week navigation.
 * Used by the embed route when `layout=calendar`.
 */

import type { MatchEvent } from '@/types';
import { SPORTS_CONFIG } from '@/lib/config';
import { LOGO_PLACEHOLDER_REMOTE, resolvePublishLogoUrl } from '@/lib/logo';
import { parseISO, format, startOfWeek, addDays, isBefore, isAfter } from 'date-fns';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function dayName(dateStr: string): string {
  return format(parseISO(dateStr), 'EEE');
}

function shortDate(dateStr: string): string {
  return format(parseISO(dateStr), 'MMM d');
}

/** Get Monday of the week containing `dateStr` */
function weekMonday(dateStr: string): string {
  const d = parseISO(dateStr);
  const mon = startOfWeek(d, { weekStartsOn: 1 }); // 1 = Monday
  return format(mon, 'yyyy-MM-dd');
}

/** Get Sunday of the week starting with `mondayStr` */
function weekSunday(mondayStr: string): string {
  return format(addDays(parseISO(mondayStr), 6), 'yyyy-MM-dd');
}

/** Format a week range label: "Mar 17 – Mar 23" */
function weekRangeLabel(mondayStr: string): string {
  const mon = parseISO(mondayStr);
  const sun = addDays(mon, 6);
  return `${format(mon, 'MMM d')} – ${format(sun, 'MMM d')}`;
}

function countryFlag(code: string): string {
  const c = (code || '').trim().toUpperCase().substring(0, 2);
  if (!/^[A-Z]{2}$/.test(c)) return '';
  return Array.from(c).map(ch => String.fromCodePoint(0x1F1E6 + ch.charCodeAt(0) - 65)).join('');
}

// ─── Public interface ─────────────────────────────────────────────────────────

export interface CalendarRenderOpts {
  showTime: boolean;
  hideLogos: boolean;
  title?: string;
  featuredLeagues?: Map<string, string>;
}

export interface CalendarRenderResult {
  html: string;
}

// ─── Render ───────────────────────────────────────────────────────────────────

function renderCard(e: MatchEvent, opts: CalendarRenderOpts): string {
  const config = SPORTS_CONFIG.find((s) => s.id === e.sportId);
  const rawLogo = config?.logo || e.leagueLogo || '';
  const leagueLogo = resolvePublishLogoUrl(rawLogo, config?.publishLogo);
  const leagueLabel = e.leagueLabel || config?.label || '';

  const homeTeam = e.homeLogo
    ? `<span class="cal-team"><img class="cal-team-logo" src="${esc(e.homeLogo)}" alt="" loading="lazy" decoding="async" onerror="this.onerror=null;this.style.display='none'" /><span class="cal-team-name">${esc(e.home)}</span></span>`
    : `<span class="cal-team"><span class="cal-team-name">${esc(e.home)}</span></span>`;
  const awayTeam = e.away
    ? (e.awayLogo
      ? `<span class="cal-team"><img class="cal-team-logo" src="${esc(e.awayLogo)}" alt="" loading="lazy" decoding="async" onerror="this.onerror=null;this.style.display='none'" /><span class="cal-team-name">${esc(e.away)}</span></span>`
      : `<span class="cal-team"><span class="cal-team-name">${esc(e.away)}</span></span>`)
    : null;
  const matchHtml = awayTeam
    ? `${homeTeam}<span class="cal-vs">vs</span>${awayTeam}`
    : homeTeam;

  const isBigScreen = Array.isArray(e.tags) && e.tags.includes('Live Big Screen');
  const cardClasses = `cal-card${e.isFeatured ? ' cal-featured' : ''}${isBigScreen ? ' cal-bigscreen' : ''}`;
  const tagsHtml = Array.isArray(e.tags) && e.tags.length > 0
    ? `<div class="cal-tags">${e.tags.map(t =>
        `<span class="cal-tag${t === 'Live Big Screen' ? ' cal-tag-bigscreen' : ''}">${esc(t)}</span>`
      ).join('')}</div>`
    : '';

  return `<div class="${cardClasses}" data-sport-id="${esc(e.sportId)}">
  ${opts.showTime ? `<div class="cal-time">${esc(e.time)}</div>` : ''}
  <div class="cal-league">
    ${!opts.hideLogos && leagueLogo ? `<img class="cal-league-logo" src="${esc(leagueLogo)}" alt="${esc(leagueLabel)}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${LOGO_PLACEHOLDER_REMOTE}';" />` : ''}
    <span>${esc(leagueLabel)}</span>
  </div>
  <div class="cal-teams">${matchHtml}</div>
  ${e.round ? `<div class="cal-round">${esc(e.round)}</div>` : ''}
  ${tagsHtml}
</div>`;
}

function renderDayColumn(date: string, dayEvents: MatchEvent[], opts: CalendarRenderOpts): string {
  dayEvents.sort((a, b) => a.time.localeCompare(b.time));
  const cards = dayEvents.map((e) => renderCard(e, opts));

  return `<div class="cal-day" data-date="${esc(date)}" data-date-label="${esc(shortDate(date))}">
  <div class="cal-day-header">
    <span class="cal-day-name">${dayName(date)}</span>
    <span class="cal-day-date">${shortDate(date)}</span>
  </div>
  <div class="cal-day-events" data-count="${dayEvents.length}">
    ${cards.join('\n    ')}
  </div>
</div>`;
}

export function renderCalendarContent(
  events: MatchEvent[],
  opts: CalendarRenderOpts,
): CalendarRenderResult {
  if (events.length === 0) {
    return { html: '<div class="cal-empty">No events scheduled.</div>' };
  }

  const byDate = new Map<string, MatchEvent[]>();
  for (const e of events) {
    if (!byDate.has(e.date)) byDate.set(e.date, []);
    byDate.get(e.date)!.push(e);
  }
  const sortedDates = Array.from(byDate.keys()).sort();

  const weekSet = new Set<string>();
  for (const date of sortedDates) weekSet.add(weekMonday(date));
  const weeks = Array.from(weekSet).sort();

  const titleText = opts.title || 'Weekly Lineup';
  const featured = events.filter(e => e.isFeatured);
  const featuredLeagues = opts.featuredLeagues ?? new Map<string, string>();
  let highlightsHTML = '';

  if (featured.length > 0 || featuredLeagues.size > 0) {
    const hlParts: string[] = [
      '<div class="hl-section">',
      '<h2 class="hl-title">This Week\'s Highlights</h2>',
    ];
    const hlByDate = new Map<string, MatchEvent[]>();
    [...featured]
      .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
      .forEach(event => {
        if (!hlByDate.has(event.date)) hlByDate.set(event.date, []);
        hlByDate.get(event.date)!.push(event);
      });

    for (const [date, dayEvents] of hlByDate) {
      const displayDate = format(parseISO(date), 'EEEE d MMMM');
      hlParts.push('<div class="hl-date-group">');
      hlParts.push(`<div class="hl-date-header">${esc(displayDate)}</div>`);
      for (const event of dayEvents) {
        const isCombat = ['boxing', 'ufc', 'bellator'].includes(event.sportId);
        const homeFlag = isCombat && event.homeCountry ? `<span style="font-size:1em;margin-right:2px">${countryFlag(event.homeCountry)}</span>` : '';
        const awayFlag = isCombat && event.awayCountry ? `<span style="font-size:1em;margin-right:2px">${countryFlag(event.awayCountry)}</span>` : '';
        const homeImg = event.homeLogo ? `<img class="hl-team-logo" src="${esc(event.homeLogo)}" alt="" loading="lazy" decoding="async" onerror="this.onerror=null;this.style.display='none'" />` : '';
        const awayImg = event.awayLogo && event.away ? `<img class="hl-team-logo" src="${esc(event.awayLogo)}" alt="" loading="lazy" decoding="async" onerror="this.onerror=null;this.style.display='none'" />` : '';
        const leagueFallback = !event.away && !homeImg ? (() => {
          const cfg = SPORTS_CONFIG.find(s => s.id === event.sportId);
          return cfg ? resolvePublishLogoUrl(cfg.logo || event.leagueLogo || '', cfg.publishLogo) : '';
        })() : '';
        const leagueFallbackImg = leagueFallback ? `<img class="hl-team-logo" src="${esc(leagueFallback)}" alt="" loading="lazy" decoding="async" onerror="this.onerror=null;this.style.display='none'" />` : '';
        const teamsHtml = event.away
          ? `<span class="hl-team">${homeImg}${homeFlag}${esc(event.home)}</span><span class="hl-vs">vs</span><span class="hl-team">${awayImg}${awayFlag}${esc(event.away)}</span>`
          : `<span class="hl-team">${leagueFallbackImg}${homeImg}${esc(event.home)}</span>`;
        const roundStr = event.round ? `<div class="hl-round">${esc(event.round)}</div>` : '';
        hlParts.push(`<div class="hl-event"><div class="hl-event-meta">${event.time ? `<span class="hl-time">${esc(event.time)}</span>` : ''}<span class="hl-league-name">${esc(event.leagueLabel || '')}</span></div><div class="hl-teams">${teamsHtml}</div>${roundStr}</div>`);
      }
      hlParts.push('</div>');
    }

    for (const [sportId, customLabel] of featuredLeagues) {
      const config = SPORTS_CONFIG.find(s => s.id === sportId);
      const leagueLabel = config?.label || sportId;
      const teamEvent =
        events.find(event => event.sportId === sportId && !!event.away && event.isFeatured) ||
        events.find(event => event.sportId === sportId && !!event.away);
      if (teamEvent) {
        const homeImg = teamEvent.homeLogo ? `<img class="hl-team-logo" src="${esc(teamEvent.homeLogo)}" alt="" loading="lazy" decoding="async" onerror="this.onerror=null;this.style.display='none'" />` : '';
        const awayImg = teamEvent.awayLogo ? `<img class="hl-team-logo" src="${esc(teamEvent.awayLogo)}" alt="" loading="lazy" decoding="async" onerror="this.onerror=null;this.style.display='none'" />` : '';
        const teamsHtml = `<span class="hl-team">${homeImg}${esc(teamEvent.home)}</span><span class="hl-vs">vs</span><span class="hl-team">${awayImg}${esc(teamEvent.away!)}</span>`;
        hlParts.push(`<div class="hl-event"><div class="hl-event-meta">${teamEvent.time ? `<span class="hl-time">${esc(teamEvent.time)}</span>` : ''}<span class="hl-league-name">${esc(leagueLabel)}</span></div><div class="hl-teams">${teamsHtml}</div></div>`);
      } else {
        const logoSrc = config ? resolvePublishLogoUrl(config.logo || '', config.publishLogo) : '';
        const logoImg = logoSrc ? `<img class="hl-team-logo" src="${esc(logoSrc)}" alt="" loading="lazy" decoding="async" onerror="this.onerror=null;this.style.display='none'" />` : '';
        const label = (customLabel || '').trim() || leagueLabel;
        hlParts.push(`<div class="hl-league-spotlight">${logoImg}${esc(label)}</div>`);
      }
    }
    hlParts.push('</div>');
    highlightsHTML = `<div class="cal-highlights">${hlParts.join('')}</div>`;
  }

  const weekPages: string[] = [];
  let needsMobileDayNav = false;
  for (let weekIndex = 0; weekIndex < weeks.length; weekIndex++) {
    const monStr = weeks[weekIndex];
    const sunStr = weekSunday(monStr);
    const monDate = parseISO(monStr);
    const sunDate = parseISO(sunStr);
    const weekDates = sortedDates.filter(date => {
      const parsedDate = parseISO(date);
      return !isBefore(parsedDate, monDate) && !isAfter(parsedDate, sunDate);
    });

    if (weekDates.length > 3) needsMobileDayNav = true;
    const cols = weekDates.map(date => renderDayColumn(date, byDate.get(date)!, opts));
    const colCount = Math.min(weekDates.length, 7);
    const activeClass = weekIndex === 0 ? ' cal-week-active' : '';

    weekPages.push(`<div class="cal-week${activeClass}" data-week="${weekIndex}" data-week-label="${esc(weekRangeLabel(monStr))}">
  <div class="cal-columns" data-cols="${colCount}">
    ${cols.join('\n    ')}
  </div>
</div>`);
  }

  let navHTML = '';
  if (weeks.length > 1 || needsMobileDayNav) {
    const mobileOnlyClass = weeks.length === 1 ? ' cal-nav-mobile-only' : '';
    navHTML = `<div class="cal-nav${mobileOnlyClass}">
  <button class="cal-nav-btn cal-nav-prev" aria-label="Previous days" disabled>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
  </button>
  <span class="cal-nav-label">${esc(weekRangeLabel(weeks[0]))}</span>
  <button class="cal-nav-btn cal-nav-next" aria-label="Next days">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
  </button>
</div>`;
  }

  const html = `${highlightsHTML}
<div class="cal-header">
  <div class="cal-header-left">
    <h2 class="cal-title">${esc(titleText)}</h2>
    <span class="cal-badge">LIVE &amp; UPCOMING</span>
  </div>
  ${navHTML}
</div>
<div class="cal-weeks" data-total="${weeks.length}">
  ${weekPages.join('\n  ')}
</div>`;

  return { html };
}

// ─── Calendar CSS ─────────────────────────────────────────────────────────────

export function getCalendarCSS(accent: string): string {
  return `
/* ── Calendar Grid Layout ── */
.cal-header{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:16px;flex-wrap:wrap}
.cal-header-left{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.cal-badge{background:${accent};color:#fff;font-size:10px;font-weight:800;letter-spacing:.08em;padding:3px 10px;border-radius:999px;text-transform:uppercase;white-space:nowrap}
.cal-title{font-size:1.3em;font-weight:800;color:var(--heading,var(--text));margin:0}
.cal-empty{padding:24px;text-align:center;color:var(--muted,#888);font-size:14px}

/* ── Week Navigation ── */
.cal-nav{display:flex;align-items:center;gap:6px;flex-shrink:0}
.cal-nav-mobile-only{display:none}
.cal-nav-btn{
  display:inline-flex;align-items:center;justify-content:center;
  width:28px;height:28px;border-radius:6px;border:1px solid var(--border,#e5e7eb);
  background:var(--surface,#f8f9fa);color:var(--text);cursor:pointer;
  transition:background .15s,border-color .15s,opacity .15s;
  padding:0;
}
.cal-nav-btn:hover:not(:disabled){background:color-mix(in srgb,${accent} 15%,var(--surface,#f8f9fa));border-color:${accent}}
.cal-nav-btn:disabled{opacity:.35;cursor:default}
.cal-nav-label{font-size:.78em;font-weight:600;color:var(--muted,#888);white-space:nowrap;min-width:120px;text-align:center}

/* ── Week Pages ── */
.cal-weeks{position:relative}
.cal-week{display:none}
.cal-week-active{display:block}

.cal-columns{
  display:grid;
  grid-template-columns:repeat(var(--cal-cols,7),minmax(0,1fr));
  gap:8px;
  width:100%;
  align-items:stretch;
}
.cal-columns[data-cols="1"]{--cal-cols:1}
.cal-columns[data-cols="2"]{--cal-cols:2}
.cal-columns[data-cols="3"]{--cal-cols:3}
.cal-columns[data-cols="4"]{--cal-cols:4}
.cal-columns[data-cols="5"]{--cal-cols:5}
.cal-columns[data-cols="6"]{--cal-cols:6}
.cal-columns[data-cols="7"]{--cal-cols:7}

.cal-day{
  min-width:0;
  display:flex;
  flex-direction:column;
  min-height:200px;
}
.cal-day-header{
  text-align:center;
  padding:8px 4px;
  border-bottom:2px solid ${accent};
  margin-bottom:8px;
}
.cal-day-name{
  display:block;
  font-size:.82em;
  font-weight:700;
  text-transform:uppercase;
  letter-spacing:.06em;
  color:var(--heading,var(--text));
}
.cal-day-date{
  display:block;
  font-size:.72em;
  color:var(--muted,#888);
  margin-top:1px;
}
.cal-day-events{
  display:grid;
  grid-template-columns:1fr;
  gap:6px;
  flex:1;
  align-content:start;
}

/* Dynamic sizing: fewer events = bigger cards */
.cal-day-events[data-count="1"]{grid-template-columns:1fr}
.cal-day-events[data-count="1"] .cal-card{padding:14px 10px}
.cal-day-events[data-count="1"] .cal-teams{font-size:1em}
.cal-day-events[data-count="2"] .cal-card{padding:12px 10px}
.cal-day-events[data-count="2"] .cal-teams{font-size:.95em}

.cal-card{
  background:var(--card-bg,var(--surface,#f4f6f9));
  border:1px solid var(--border,#e5e7eb);
  border-radius:8px;
  padding:8px 8px;
  transition:border-color .15s;
}
.cal-card:hover{border-color:${accent}}

.cal-featured{
  background:color-mix(in srgb,${accent} 12%,var(--card-bg,var(--surface,#f4f6f9)));
  border-color:color-mix(in srgb,${accent} 40%,var(--border,#e5e7eb));
}

.cal-time{
  font-size:.72em;
  font-weight:600;
  color:${accent};
  margin-bottom:3px;
  letter-spacing:.04em;
}
.cal-teams{
  display:flex;
  flex-direction:column;
  gap:2px;
  margin-top:4px;
}
.cal-team{
  display:flex;
  align-items:flex-start;
  gap:4px;
  font-size:.88em;
  font-weight:600;
  color:var(--text);
  word-break:normal;
  overflow-wrap:anywhere;
  min-width:0;
}
.cal-team-name{
  min-width:0;
  overflow-wrap:anywhere;
}
.cal-team-logo{
  height:16px;
  width:auto;
  flex-shrink:0;
}
.cal-vs{
  font-size:.7em;
  color:var(--muted,#888);
  font-style:italic;
  align-self:flex-start;
  padding:1px 0;
}
.cal-league{
  display:flex;
  align-items:center;
  gap:3px;
  margin-top:6px;
  font-size:.68em;
  color:var(--muted,#888);
}
.cal-league-logo{
  height:14px;
  width:auto;
  flex-shrink:0;
}
.cal-round{
  font-size:.65em;
  color:var(--muted,#888);
  margin-top:2px;
  font-style:italic;
}
.cal-tags{
  display:flex;
  flex-wrap:wrap;
  gap:3px;
  margin-top:5px;
}
.cal-tag{
  font-size:.6em;
  font-weight:700;
  padding:1px 6px;
  border-radius:999px;
  border:1px solid var(--border,#e5e7eb);
  color:var(--muted,#888);
  white-space:nowrap;
  letter-spacing:.03em;
}
.cal-tag-bigscreen{
  background:color-mix(in srgb,${accent} 90%,#fff);
  color:#fff;
  border-color:transparent;
}
.cal-bigscreen{
  border-color:${accent};
  box-shadow:0 0 0 2px color-mix(in srgb,${accent} 25%,transparent);
}

.cal-mobile-orientation-hint{display:none!important}


/* ── Responsive: tablet calendar, paged in 4-day increments ── */
@media (min-width:768px) and (max-width:1023px){
  .cal-nav-mobile-only{display:flex}
  .cal-columns{
    display:grid!important;
    grid-template-columns:repeat(4,minmax(0,1fr))!important;
    gap:8px!important;
  }
  body:not(.cal-mobile-ready) .cal-week-active .cal-day:nth-child(n+5),
  .cal-day.cal-tablet-hidden{display:none!important}
  .cal-day{min-height:0}
  .cal-card{padding:8px 8px}
  .cal-team{font-size:.82em;line-height:1.25}
  .cal-team-logo{height:14px}
  .cal-league{font-size:.66em}
  .cal-time{font-size:.7em}
}

/* ── Responsive: phone calendar, paged in 3-day increments ── */
@media (max-width:767px){
  .cal-header{align-items:flex-start;gap:10px;margin-bottom:12px}
  .cal-header-left{width:100%;gap:8px}
  .cal-title{font-size:1.18em;line-height:1.15}
  .cal-badge{font-size:9px;padding:3px 8px}
  .cal-nav-mobile-only{display:flex}
  .cal-nav{width:100%;justify-content:space-between;gap:8px}
  .cal-nav-label{flex:1;min-width:0;text-align:center;font-size:.84em}
  .cal-nav-btn{width:34px;height:34px;border-radius:9px;flex:0 0 34px}

  .cal-columns{
    display:grid!important;
    grid-template-columns:repeat(3,minmax(0,1fr))!important;
    gap:7px!important;
    width:100%!important;
    min-width:0!important;
  }
  body:not(.cal-mobile-ready) .cal-week-active .cal-day:nth-child(n+4),
  .cal-day.cal-mobile-hidden{display:none!important}
  .cal-day{
    width:auto;
    min-width:0;
    min-height:0;
    overflow:hidden;
  }
  .cal-day-header{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:10px;
    text-align:left;
    padding:6px 2px;
    margin:0 0 6px;
    border-bottom:2px solid ${accent};
    background:transparent;
  }
  .cal-day-name{font-size:.72em;letter-spacing:.07em}
  .cal-day-date{font-size:.67em;margin:0;white-space:nowrap}
  .cal-day-events{display:grid;grid-template-columns:1fr;gap:6px;padding:6px;flex:none}
  .cal-card{padding:7px 6px;border-radius:8px;background:var(--card-bg,var(--surface,#f4f6f9));min-width:0}
  .cal-time{display:block;margin:0 0 3px;font-size:.68em;line-height:1.2;white-space:nowrap}
  .cal-league{display:flex;max-width:100%;margin:0 0 4px;font-size:.62em;line-height:1.2;min-width:0}
  .cal-league span{min-width:0;overflow-wrap:anywhere}
  .cal-league-logo{height:12px;max-width:14px}
  .cal-teams{margin-top:1px;gap:3px;min-width:0}
  .cal-team{font-size:.74em;line-height:1.22;gap:3px;word-break:normal;overflow-wrap:anywhere}
  .cal-team-logo{height:14px;max-width:16px;object-fit:contain;margin-top:1px}
  .cal-vs{font-size:.62em;padding:0;margin:0;color:var(--muted,#888)}
  .cal-round{font-size:.62em;line-height:1.25;margin-top:4px;overflow-wrap:anywhere}
  .cal-tags{gap:3px;margin-top:5px}
  .cal-tag{font-size:.58em;padding:1px 5px;max-width:100%;overflow:hidden;text-overflow:ellipsis}
  .cal-day-events[data-count="1"] .cal-card,
  .cal-day-events[data-count="2"] .cal-card{padding:7px 6px}
  .cal-day-events[data-count="1"] .cal-teams,
  .cal-day-events[data-count="2"] .cal-teams{font-size:1em}
}


@media (max-width:932px) and (max-height:520px) and (orientation:landscape){
  .cal-header{margin-bottom:10px}
  .cal-columns{grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:8px!important}
  .cal-card{padding:7px 7px}
  .cal-team{font-size:.82em;line-height:1.25;word-break:normal;overflow-wrap:anywhere}
  .cal-league{font-size:.66em}
}

/* ── Highlights section ── */
.cal-highlights{margin-bottom:32px}
.hl-section{width:100%}
.hl-title{font-size:var(--sb-h3-size,1.15em)!important;font-weight:800;color:var(--heading,var(--text));margin:0 0 12px;text-transform:uppercase}
.hl-date-group{margin-bottom:12px}
.hl-date-header{font-size:var(--sb-date-size,.72em)!important;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--heading,var(--text));padding:6px 0;border-bottom:1px solid var(--border,#e5e7eb);margin-bottom:8px}
.hl-event{padding:7px 0}
.hl-event-meta{display:flex;align-items:center;gap:6px;margin-bottom:4px}
.hl-time{font-size:var(--sb-date-size,.8em)!important;font-weight:600;color:var(--accent,#3b82f6)}
.hl-league-name{font-size:var(--sb-date-size,.8em)!important;font-weight:700;color:var(--heading,var(--text))}
.hl-teams{display:flex;align-items:center;flex-wrap:wrap;gap:4px;font-size:var(--sb-hl-size,.9em);font-weight:600;color:var(--heading,#111827)}
.hl-team-logo{height:24px;width:auto;flex-shrink:0}
.hl-team{display:inline-flex;align-items:center;gap:4px;font-weight:600}
.hl-vs{font-style:italic;font-size:.82em;color:var(--muted,#888);margin:0 4px}
.hl-round{font-size:.72em;color:var(--muted,#888);margin-top:2px;font-style:italic}
.hl-league-spotlight{padding:6px 0;font-weight:700;color:var(--heading,var(--text));display:flex;align-items:center;gap:8px}
`;
}

// ─── Week Navigation JavaScript ───────────────────────────────────────────────

export function getCalendarNavJS(): string {
  return `
(function(){
  var weeks=Array.prototype.slice.call(document.querySelectorAll('.cal-week'));
  if(!weeks.length)return;
  var prev=document.querySelector('.cal-nav-prev');
  var next=document.querySelector('.cal-nav-next');
  var label=document.querySelector('.cal-nav-label');
  if(!prev||!next||!label)return;
  var mqPhone=window.matchMedia?window.matchMedia('(max-width: 767px)'):{matches:false};
  var mqTablet=window.matchMedia?window.matchMedia('(min-width: 768px) and (max-width: 1023px)'):{matches:false};
  var current=Math.max(0,weeks.findIndex(function(w){return w.classList.contains('cal-week-active');}));
  var chunk=0;
  function chunkSize(){return mqPhone.matches?3:(mqTablet.matches?4:7);}
  function isPaged(){return mqPhone.matches||mqTablet.matches;}
  function daysOf(week){return Array.prototype.slice.call(week.querySelectorAll('.cal-day'));}
  function chunkCount(week){return Math.max(1,Math.ceil(daysOf(week).length/chunkSize()));}
  function send(){try{if(window._sbSendHeight){window._sbSendHeight();}else{window.parent.postMessage({sbHeight:document.documentElement.scrollHeight},'*');}}catch(e){}}
  function setActiveWeek(index){
    weeks.forEach(function(week,weekIndex){week.classList.toggle('cal-week-active',weekIndex===index);});
    current=index;
  }
  function chunkLabel(week,index){
    var size=chunkSize();
    var days=daysOf(week);
    var first=days[index*size];
    var last=days[Math.min(days.length-1,index*size+size-1)];
    if(!first||!last)return week.getAttribute('data-week-label')||'';
    var start=first.getAttribute('data-date-label')||'';
    var end=last.getAttribute('data-date-label')||'';
    return start&&end&&start!==end?start+' - '+end:(start||end||week.getAttribute('data-week-label')||'');
  }
  function render(){
    var paged=isPaged();
    var size=chunkSize();
    document.body.classList.toggle('cal-mobile-ready',paged);
    setActiveWeek(current);
    weeks.forEach(function(week,weekIndex){
      daysOf(week).forEach(function(day,dayIndex){
        var hidden=paged&&(weekIndex!==current||dayIndex<chunk*size||dayIndex>=chunk*size+size);
        day.classList.toggle('cal-mobile-hidden',hidden);
        day.classList.toggle('cal-tablet-hidden',hidden);
      });
    });
    if(paged){
      var total=chunkCount(weeks[current]);
      if(chunk>=total){chunk=total-1;return render();}
      label.textContent=chunkLabel(weeks[current],chunk);
      prev.disabled=current===0&&chunk===0;
      next.disabled=current===weeks.length-1&&chunk>=total-1;
    }else{
      chunk=0;
      weeks.forEach(function(week){daysOf(week).forEach(function(day){day.classList.remove('cal-mobile-hidden');day.classList.remove('cal-tablet-hidden');});});
      label.textContent=weeks[current].getAttribute('data-week-label')||'';
      prev.disabled=current===0;
      next.disabled=current===weeks.length-1;
    }
    requestAnimationFrame(function(){requestAnimationFrame(send);});
  }
  prev.addEventListener('click',function(){
    if(isPaged()){
      if(chunk>0){chunk--;render();return;}
      if(current>0){current--;chunk=chunkCount(weeks[current])-1;render();}
      return;
    }
    if(current>0){current--;render();}
  });
  next.addEventListener('click',function(){
    if(isPaged()){
      var total=chunkCount(weeks[current]);
      if(chunk<total-1){chunk++;render();return;}
      if(current<weeks.length-1){current++;chunk=0;render();}
      return;
    }
    if(current<weeks.length-1){current++;render();}
  });
  function onMQ(){chunk=0;render();}
  if(mqPhone.addEventListener){mqPhone.addEventListener('change',onMQ);}else if(mqPhone.addListener){mqPhone.addListener(onMQ);}
  if(mqTablet.addEventListener){mqTablet.addEventListener('change',onMQ);}else if(mqTablet.addListener){mqTablet.addListener(onMQ);}
  render();
})();
`;
}
