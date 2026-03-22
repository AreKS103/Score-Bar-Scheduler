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

  const matchName = e.away
    ? `${esc(e.home)} vs ${esc(e.away)}`
    : esc(e.home);

  const tagBadges = (e.tags || [])
    .map((t) => `<span class="cal-tag">${esc(t)}</span>`)
    .join('');

  const featuredClass = e.isFeatured ? ' cal-featured' : '';

  return `<div class="cal-card${featuredClass}" data-sport-id="${esc(e.sportId)}">
  ${opts.showTime ? `<div class="cal-time">${esc(e.time)}</div>` : ''}
  <div class="cal-league">
    ${!opts.hideLogos && leagueLogo ? `<img class="cal-league-logo" src="${leagueLogo}" alt="${esc(leagueLabel)}" onerror="this.onerror=null;this.src='${LOGO_PLACEHOLDER_REMOTE}';" />` : ''}
    <span>${esc(leagueLabel)}</span>
  </div>
  <div class="cal-teams">${matchName}</div>
  ${e.round ? `<div class="cal-round">${esc(e.round)}</div>` : ''}
  ${tagBadges ? `<div class="cal-tags">${tagBadges}</div>` : ''}
</div>`;
}

function renderDayColumn(date: string, dayEvents: MatchEvent[], opts: CalendarRenderOpts): string {
  dayEvents.sort((a, b) => a.time.localeCompare(b.time));
  const cards = dayEvents.map((e) => renderCard(e, opts));

  return `<div class="cal-day">
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

  // Group events by date
  const byDate = new Map<string, MatchEvent[]>();
  for (const e of events) {
    if (!byDate.has(e.date)) byDate.set(e.date, []);
    byDate.get(e.date)!.push(e);
  }
  const sortedDates = Array.from(byDate.keys()).sort();

  // Determine unique weeks (Mon–Sun) that contain events
  const weekSet = new Set<string>();
  for (const d of sortedDates) weekSet.add(weekMonday(d));
  const weeks = Array.from(weekSet).sort();

  const titleText = opts.title || 'Weekly Lineup';

  // Build highlights section
  const featured = events.filter(e => e.isFeatured);
  const featuredLeagues = opts.featuredLeagues ?? new Map<string, string>();
  let highlightsHTML = '';
  if (featured.length > 0 || featuredLeagues.size > 0) {
    const items: string[] = [];
    featured
      .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
      .forEach(e => {
        const name = e.away ? `${esc(e.home)} vs ${esc(e.away)}` : esc(e.home);
        const roundStr = e.round ? ` \u2013 ${esc(e.round)}` : '';
        const cfg = SPORTS_CONFIG.find(s => s.id === e.sportId);
        const rawLogo = cfg?.logo || e.leagueLogo || '';
        const logoUrl = resolvePublishLogoUrl(rawLogo, cfg?.publishLogo);
        const logoImg = logoUrl ? `<img class="cal-highlights-logo" src="${logoUrl}" alt="" onerror="this.onerror=null;this.src='${LOGO_PLACEHOLDER_REMOTE}';" />` : '';
        items.push(`<li>${logoImg}<strong>${esc(e.leagueLabel || '')}</strong> \u2013 ${name}${roundStr}</li>`);
      });
    for (const [sportId, customLabel] of featuredLeagues) {
      const config = SPORTS_CONFIG.find(s => s.id === sportId);
      const label = (customLabel || '').trim() || config?.label || sportId;
      const rawLogo = config?.logo || '';
      const logoUrl = resolvePublishLogoUrl(rawLogo, config?.publishLogo);
      const logoImg = logoUrl ? `<img class="cal-highlights-logo" src="${logoUrl}" alt="" onerror="this.onerror=null;this.src='${LOGO_PLACEHOLDER_REMOTE}';" />` : '';
      items.push(`<li>${logoImg}<strong>${esc(label)}</strong></li>`);
    }
    if (items.length) {
      highlightsHTML = `<div class="cal-highlights">
  <h2 class="cal-highlights-title">This Week's Highlights</h2>
  <ul class="cal-highlights-list">${items.join('')}</ul>
</div>`;
    }
  }

  // Build week pages — one <div class="cal-week"> per Mon–Sun span
  const weekPages: string[] = [];
  for (let wi = 0; wi < weeks.length; wi++) {
    const monStr = weeks[wi];
    const sunStr = weekSunday(monStr);
    const monDate = parseISO(monStr);
    const sunDate = parseISO(sunStr);

    // Collect dates within this week that have events
    const weekDates = sortedDates.filter(d => {
      const dd = parseISO(d);
      return !isBefore(dd, monDate) && !isAfter(dd, sunDate);
    });

    const cols = weekDates.map(d => renderDayColumn(d, byDate.get(d)!, opts));
    const colCount = Math.min(weekDates.length, 7);
    const activeClass = wi === 0 ? ' cal-week-active' : '';

    weekPages.push(`<div class="cal-week${activeClass}" data-week="${wi}" data-week-label="${esc(weekRangeLabel(monStr))}">
  <div class="cal-columns" data-cols="${colCount}">
    ${cols.join('\n    ')}
  </div>
</div>`);
  }

  // Week navigation (only if multiple weeks)
  let navHTML = '';
  if (weeks.length > 1) {
    navHTML = `<div class="cal-nav">
  <button class="cal-nav-btn cal-nav-prev" aria-label="Previous week" disabled>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
  </button>
  <span class="cal-nav-label">${esc(weekRangeLabel(weeks[0]))}</span>
  <button class="cal-nav-btn cal-nav-next" aria-label="Next week">
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
  container-type:inline-size;
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
  font-size:.88em;
  font-weight:600;
  color:var(--text);
  line-height:1.3;
  word-break:break-word;
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
  margin-top:4px;
}
.cal-tag{
  font-size:.6em;
  font-weight:600;
  padding:1px 6px;
  border-radius:999px;
  background:var(--tab-bg,#f3f4f6);
  color:var(--muted,#888);
  white-space:nowrap;
}

/* ── Responsive: container queries ── */
@container(max-width:900px){
  .cal-columns{grid-template-columns:repeat(auto-fill,minmax(120px,1fr))!important}
}
@container(max-width:560px){
  .cal-columns{grid-template-columns:1fr!important}
  .cal-card{padding:6px}
  .cal-teams{font-size:.8em}
  .cal-header{flex-direction:column;align-items:flex-start;gap:8px}
  .cal-nav{width:100%;justify-content:center}
}

/* ── Highlights section ── */
.cal-highlights{margin-bottom:32px}
.cal-highlights-title{font-size:1.3em;font-weight:800;color:var(--heading,var(--text));margin:0 0 8px}
.cal-highlights-list{margin:0;padding-left:18px;font-size:.82em;color:var(--text);line-height:1.6}
.cal-highlights-list li{margin-bottom:2px;display:flex;align-items:center;gap:6px}
.cal-highlights-logo{height:16px;width:auto;flex-shrink:0}
.cal-highlights-list strong{color:var(--heading,var(--text))}
`;
}

// ─── Week Navigation JavaScript ───────────────────────────────────────────────

export function getCalendarNavJS(): string {
  return `
(function(){
  var weeks=document.querySelectorAll('.cal-week');
  if(weeks.length<2)return;
  var prev=document.querySelector('.cal-nav-prev');
  var next=document.querySelector('.cal-nav-next');
  var label=document.querySelector('.cal-nav-label');
  if(!prev||!next||!label)return;
  var current=0;
  function send(){try{window.parent.postMessage({sbHeight:document.documentElement.scrollHeight},'*');}catch(e){}}
  function show(i){
    weeks[current].classList.remove('cal-week-active');
    current=i;
    weeks[current].classList.add('cal-week-active');
    label.textContent=weeks[current].getAttribute('data-week-label')||'';
    prev.disabled=current===0;
    next.disabled=current===weeks.length-1;
    requestAnimationFrame(function(){requestAnimationFrame(send);});
  }
  prev.addEventListener('click',function(){if(current>0)show(current-1);});
  next.addEventListener('click',function(){if(current<weeks.length-1)show(current+1);});
})();
`;
}
