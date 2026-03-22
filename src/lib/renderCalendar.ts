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
    ? `<span class="cal-team"><img class="cal-team-logo" src="${esc(e.homeLogo)}" alt="" loading="lazy" onerror="this.onerror=null;this.style.display='none'" />${esc(e.home)}</span>`
    : `<span class="cal-team">${esc(e.home)}</span>`;
  const awayTeam = e.away
    ? (e.awayLogo
      ? `<span class="cal-team"><img class="cal-team-logo" src="${esc(e.awayLogo)}" alt="" loading="lazy" onerror="this.onerror=null;this.style.display='none'" />${esc(e.away)}</span>`
      : `<span class="cal-team">${esc(e.away)}</span>`)
    : null;
  const matchHtml = awayTeam
    ? `${homeTeam}<span class="cal-vs">vs</span>${awayTeam}`
    : homeTeam;

  const featuredClass = e.isFeatured ? ' cal-featured' : '';

  return `<div class="cal-card${featuredClass}" data-sport-id="${esc(e.sportId)}">
  ${opts.showTime ? `<div class="cal-time">${esc(e.time)}</div>` : ''}
  <div class="cal-league">
    ${!opts.hideLogos && leagueLogo ? `<img class="cal-league-logo" src="${leagueLogo}" alt="${esc(leagueLabel)}" onerror="this.onerror=null;this.src='${LOGO_PLACEHOLDER_REMOTE}';" />` : ''}
    <span>${esc(leagueLabel)}</span>
  </div>
  <div class="cal-teams">${matchHtml}</div>
  ${e.round ? `<div class="cal-round">${esc(e.round)}</div>` : ''}
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
    const hlParts: string[] = [
      '<div class="hl-section">',
      '<h2 class="hl-title">This Week\'s Highlights</h2>',
    ];
    // Group by date
    const hlByDate = new Map<string, MatchEvent[]>();
    [...featured]
      .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
      .forEach(e => {
        if (!hlByDate.has(e.date)) hlByDate.set(e.date, []);
        hlByDate.get(e.date)!.push(e);
      });
    for (const [date, dayEvents] of hlByDate) {
      const displayDate = format(parseISO(date), 'EEEE d MMMM');
      hlParts.push(`<div class="hl-date-group">`);
      hlParts.push(`<div class="hl-date-header">${esc(displayDate)}</div>`);
      for (const e of dayEvents) {
        const isCombat = ['boxing', 'ufc', 'bellator'].includes(e.sportId);
        const homeFlag = isCombat && e.homeCountry ? `<span style="font-size:1em;margin-right:2px">${countryFlag(e.homeCountry)}</span>` : '';
        const awayFlag = isCombat && e.awayCountry ? `<span style="font-size:1em;margin-right:2px">${countryFlag(e.awayCountry)}</span>` : '';
        const homeImg = e.homeLogo ? `<img class="hl-team-logo" src="${esc(e.homeLogo)}" alt="" loading="lazy" onerror="this.onerror=null;this.style.display='none'" />` : '';
        const awayImg = e.awayLogo && e.away ? `<img class="hl-team-logo" src="${esc(e.awayLogo)}" alt="" loading="lazy" onerror="this.onerror=null;this.style.display='none'" />` : '';
        const leagueFallback = !e.away && !homeImg ? (() => {
          const cfg = SPORTS_CONFIG.find(s => s.id === e.sportId);
          return cfg ? resolvePublishLogoUrl(cfg.logo || e.leagueLogo || '', cfg.publishLogo) : '';
        })() : '';
        const leagueFallbackImg = leagueFallback ? `<img class="hl-team-logo" src="${esc(leagueFallback)}" alt="" loading="lazy" onerror="this.onerror=null;this.style.display='none'" />` : '';
        const teamsHtml = e.away
          ? `<span class="hl-team">${homeImg}${homeFlag}${esc(e.home)}</span><span class="hl-vs">vs</span><span class="hl-team">${awayImg}${awayFlag}${esc(e.away)}</span>`
          : `<span class="hl-team">${leagueFallbackImg}${homeImg}${esc(e.home)}</span>`;
        const roundStr = e.round ? `<div class="hl-round">${esc(e.round)}</div>` : '';
        hlParts.push(`<div class="hl-event"><div class="hl-event-meta">${e.time ? `<span class="hl-time">${esc(e.time)}</span>` : ''}<span class="hl-league-name">${esc(e.leagueLabel || '')}</span></div><div class="hl-teams">${teamsHtml}</div>${roundStr}</div>`);
      }
      hlParts.push('</div>');
    }
    for (const [sportId, customLabel] of featuredLeagues) {
      const config = SPORTS_CONFIG.find(s => s.id === sportId);
      const leagueLabel = config?.label || sportId;
      // Prefer a starred event; fall back to any team-vs-team event for this league
      const teamEvent =
        events.find(e => e.sportId === sportId && !!e.away && e.isFeatured) ||
        events.find(e => e.sportId === sportId && !!e.away);
      if (teamEvent) {
        const homeImg = teamEvent.homeLogo ? `<img class="hl-team-logo" src="${esc(teamEvent.homeLogo)}" alt="" onerror="this.onerror=null;this.style.display='none'" />` : '';
        const awayImg = teamEvent.awayLogo ? `<img class="hl-team-logo" src="${esc(teamEvent.awayLogo)}" alt="" onerror="this.onerror=null;this.style.display='none'" />` : '';
        const teamsHtml = `<span class="hl-team">${homeImg}${esc(teamEvent.home)}</span><span class="hl-vs">vs</span><span class="hl-team">${awayImg}${esc(teamEvent.away!)}</span>`;
        hlParts.push(`<div class="hl-event"><div class="hl-event-meta">${teamEvent.time ? `<span class="hl-time">${esc(teamEvent.time)}</span>` : ''}<span class="hl-league-name">${esc(leagueLabel)}</span></div><div class="hl-teams">${teamsHtml}</div></div>`);
      } else {
        const logoSrc = config ? resolvePublishLogoUrl(config.logo || '', config.publishLogo) : '';
        const logoImg = logoSrc ? `<img class="hl-team-logo" src="${esc(logoSrc)}" alt="" onerror="this.onerror=null;this.style.display='none'" />` : '';
        const label = (customLabel || '').trim() || leagueLabel;
        hlParts.push(`<div class="hl-league-spotlight">${logoImg}${esc(label)}</div>`);
      }
    }
    hlParts.push('</div>');
    highlightsHTML = `<div class="cal-highlights">${hlParts.join('')}</div>`;
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
  display:flex;
  flex-direction:column;
  gap:2px;
  margin-top:4px;
}
.cal-team{
  display:flex;
  align-items:center;
  gap:4px;
  font-size:.88em;
  font-weight:600;
  color:var(--text);
  word-break:break-word;
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
.hl-section{width:100%}
.hl-title{font-size:var(--sb-h3-size,1.15em)!important;font-weight:800;color:var(--heading,var(--text));margin:0 0 12px}
.hl-date-group{margin-bottom:12px}
.hl-date-header{font-size:var(--sb-date-size,.72em)!important;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--muted,#888);padding:6px 0;border-bottom:1px solid var(--border,#e5e7eb);margin-bottom:8px}
.hl-event{padding:7px 0}
.hl-event-meta{display:flex;align-items:center;gap:6px;margin-bottom:4px}
.hl-time{font-size:var(--sb-date-size,.8em)!important;font-weight:600;color:var(--accent,#3b82f6)}
.hl-league-name{font-size:var(--sb-date-size,.8em)!important;font-weight:700;color:var(--muted,#888)}
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
