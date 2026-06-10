import type { MatchEvent } from '@/types';
import {
  CATEGORY_ORDER,
  FOOTBALL_LEAGUE_ORDER,
  SPORTS_CONFIG,
} from '@/lib/config';
import { LOGO_PLACEHOLDER_REMOTE, resolvePublishLogoUrl } from '@/lib/logo';
import { formatDisplayDate } from '@/lib/timezone';
import { eventHasHeadToHead, getEventDisplay } from '@/lib/eventDisplay';

/**
 * Encode HTML entities for safe insertion
 */
function escapeHTML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Format screen tags for inline display
 */
function formatTags(tags: string[]): string {
  if (!tags.length) return '';
  return ` – <em>(${tags.join(', ')})</em>`;
}

/**
 * Get sorting index for a sport category
 */
function categorySort(cat: string): number {
  const idx = CATEGORY_ORDER.indexOf(cat);
  return idx === -1 ? 999 : idx;
}

/**
 * Get sorting index for a football league
 */
function footballLeagueSort(sportId: string): number {
  const idx = FOOTBALL_LEAGUE_ORDER.indexOf(sportId);
  return idx === -1 ? 999 : idx;
}

/**
 * Keep app and publish logo logic separated:
 * - `logo` is used by scheduler UI
 * - `publishLogo` is used in generated HTML for WordPress
 */
function getPublishLogoSrc(logo: string, publishLogo?: string): string {
  return resolvePublishLogoUrl(logo, publishLogo);
}

/**
 * Group events by league → date
 */
function groupByLeague(events: MatchEvent[]): Map<string, Map<string, MatchEvent[]>> {
  const grouped = new Map<string, Map<string, MatchEvent[]>>();

  for (const event of events) {
    if (!grouped.has(event.sportId)) {
      grouped.set(event.sportId, new Map());
    }
    const leagueMap = grouped.get(event.sportId)!;

    if (!leagueMap.has(event.date)) {
      leagueMap.set(event.date, []);
    }
    leagueMap.get(event.date)!.push(event);
  }

  return grouped;
}

/**
 * Generate the highlights section HTML.
 * Handles both individual starred matches and league-level spotlights.
 */

function generateHighlights(
  featured: MatchEvent[],
  featuredLeagues: Map<string, string>,
  allEvents: MatchEvent[],
): string {
  if (!featured.length && !featuredLeagues.size) return '';

  const s = {
    section: 'margin-bottom:20px',
    title: 'font-size:1.1em;font-weight:800;margin:0 0 10px;text-transform:uppercase;letter-spacing:0.04em',
    dateGroup: 'margin:12px 0 0;padding-top:0',
    dateHeader: 'font-size:0.72em;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;opacity:1;padding:0 0 7px;border-bottom:1px solid rgba(128,128,128,0.25);margin-bottom:1px',
    event: 'padding:9px 0;border-bottom:1px solid rgba(128,128,128,0.18)',
    eventMain: 'display:grid;grid-template-columns:minmax(42px,max-content) minmax(0,1fr);align-items:center;column-gap:10px;row-gap:3px',
    time: 'font-size:0.78em;font-weight:800;line-height:1;white-space:nowrap',
    teams: 'grid-column:2;grid-row:2;display:flex;align-items:center;flex-wrap:wrap;min-width:0;gap:6px;font-size:1em;font-weight:700;line-height:1.25',
    team: 'display:inline-flex;align-items:center;gap:5px;min-width:0;font-weight:700',
    teamName: 'min-width:0;overflow-wrap:anywhere',
    flag: 'display:inline-flex;align-items:center;line-height:1;font-size:1.05em;flex-shrink:0',
    teamLogo: 'height:22px;max-width:28px;width:auto;vertical-align:middle;flex-shrink:0;object-fit:contain;border-radius:2px',
    vs: 'font-style:italic;font-size:0.78em;opacity:0.45;margin:0 2px;flex-shrink:0',
    detail: 'grid-column:2;grid-row:1;font-size:0.72em;font-weight:600;line-height:1.2;opacity:0.72;letter-spacing:0.05em;text-transform:uppercase',
    spotlight: 'padding:6px 0;font-weight:600;font-size:1em;display:flex;align-items:center;gap:8px',
  };

  const buildHighlightEvent = (e: MatchEvent, labelOverride?: string): string => {
    const display = getEventDisplay(e, { stripLeaguePrefix: true });
    const isCombat = ['boxing', 'ufc', 'bellator'].includes(e.sportId);
    const homeFlag = isCombat && e.homeCountry ? `<span class="hl-flag" style="${s.flag}">${countryFlag(e.homeCountry)}</span>` : '';
    const awayFlag = isCombat && e.awayCountry ? `<span class="hl-flag" style="${s.flag}">${countryFlag(e.awayCountry)}</span>` : '';
    const homeImg = e.homeLogo ? `<img class="hl-team-logo" src="${escapeHTML(e.homeLogo)}" alt="" loading="lazy" style="${s.teamLogo}" />` : '';
    const awayImg = e.awayLogo && display.isHeadToHead ? `<img class="hl-team-logo" src="${escapeHTML(e.awayLogo)}" alt="" loading="lazy" style="${s.teamLogo}" />` : '';
    const leagueFallback = !display.isHeadToHead && !homeImg ? (() => {
      const cfg = SPORTS_CONFIG.find(sc => sc.id === e.sportId);
      return cfg ? resolvePublishLogoUrl(cfg.logo || e.leagueLogo || '', cfg.publishLogo) : '';
    })() : '';
    const leagueFallbackImg = leagueFallback ? `<img class="hl-team-logo" src="${escapeHTML(leagueFallback)}" alt="" loading="lazy" style="${s.teamLogo}" />` : '';
    const homeBadge = isCombat ? (homeImg || homeFlag) : homeImg;
    const awayBadge = isCombat ? (awayImg || awayFlag) : awayImg;
    const teamsHtml = display.isHeadToHead
      ? `<div class="hl-teams hl-teams-h2h" style="${s.teams}"><span class="hl-team hl-team-primary" style="${s.team}">${homeBadge}<span class="hl-team-name" style="${s.teamName}">${escapeHTML(display.primary)}</span></span><span class="hl-vs" style="${s.vs}">vs</span><span class="hl-team hl-team-secondary" style="${s.team}">${awayBadge}<span class="hl-team-name" style="${s.teamName}">${escapeHTML(display.secondary)}</span></span></div>`
      : `<div class="hl-teams hl-teams-single" style="${s.teams}"><span class="hl-team hl-team-primary" style="${s.team}">${leagueFallbackImg}${homeImg}<span class="hl-team-name" style="${s.teamName}">${escapeHTML(display.title)}</span></span></div>`;
    const timeHtml = e.time ? `<span class="hl-time" style="${s.time};grid-column:1;grid-row:2">${escapeHTML(e.time)}</span>` : `<span class="hl-time hl-time-empty" aria-hidden="true" style="${s.time};grid-column:1;grid-row:2;visibility:hidden"></span>`;
    const detailParts = [labelOverride ?? cleanCombatLabel(e), e.round]
      .filter((part): part is string => Boolean(part))
      .map((part) => escapeHTML(part));
    const detailHtml = detailParts.length ? `<div class="hl-event-detail" style="${s.detail}">${detailParts.join(' &middot; ')}</div>` : '';
    return `<div class="hl-event" style="${s.event}"><div class="hl-event-main" style="${s.eventMain}">${timeHtml}${detailHtml}${teamsHtml}</div></div>`;
  };

  const parts: string[] = [
    `<div class="hl-section" style="${s.section}">`,
    `<h2 class="hl-title" style="${s.title}">This Week's Highlights</h2>`,
  ];

  // Group starred matches by date
  const byDate = new Map<string, MatchEvent[]>();
  [...featured]
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
    .forEach((e) => {
      if (!byDate.has(e.date)) byDate.set(e.date, []);
      byDate.get(e.date)!.push(e);
    });

  for (const [date, events] of byDate) {
    const displayDate = formatDisplayDate(date);
    parts.push(`<div class="hl-date-group" style="${s.dateGroup}">`);
    parts.push(`<div class="hl-date-header" style="${s.dateHeader}">${escapeHTML(displayDate)}</div>`);
    for (const e of events) {
      parts.push(buildHighlightEvent(e));
    }
    parts.push('</div>');
  }

  // League-level spotlights
  for (const [sportId, customLabel] of featuredLeagues) {
    const config = SPORTS_CONFIG.find((sc) => sc.id === sportId);
    const label = (customLabel || '').trim() || config?.label || sportId;
    const teamEvent =
      allEvents.find((event) => event.sportId === sportId && event.isFeatured && eventHasHeadToHead(event)) ||
      allEvents.find((event) => event.sportId === sportId && eventHasHeadToHead(event));
    if (teamEvent) {
      parts.push(`<div class="hl-date-group hl-date-group-spotlight" style="${s.dateGroup}">`);
      parts.push(`<div class="hl-date-header" style="${s.dateHeader}">${escapeHTML(formatDisplayDate(teamEvent.date))}</div>`);
      parts.push(buildHighlightEvent(teamEvent, label));
      parts.push('</div>');
    } else {
      const logoSrc = config ? resolvePublishLogoUrl(config.logo || '', config.publishLogo) : '';
      const logoImg = logoSrc ? `<img class="hl-team-logo" src="${escapeHTML(logoSrc)}" alt="" loading="lazy" style="${s.teamLogo}" />` : '';
      parts.push(`<div class="hl-league-spotlight" style="${s.spotlight}">${logoImg}${escapeHTML(label)}</div>`);
    }
  }

  parts.push('</div>');
  return parts.join('\n');
}

/**
 * Generate match line HTML
 */
function countryFlag(code: string): string {
  const c = (code || '').trim().toUpperCase().substring(0, 2);
  if (!/^[A-Z]{2}$/.test(c)) return '';
  return Array.from(c).map(ch => String.fromCodePoint(0x1F1E6 + ch.charCodeAt(0) - 65)).join('');
}

/** Strip "Fighter vs. Fighter" suffix from combat sport event labels. */
function cleanCombatLabel(e: MatchEvent): string {
  if (!['boxing', 'ufc', 'bellator'].includes(e.sportId) || !e.away) return e.leagueLabel;
  const colon = e.leagueLabel.indexOf(':');
  if (colon > 0 && /vs\.?\s/i.test(e.leagueLabel.slice(colon))) {
    return e.leagueLabel.slice(0, colon).trim();
  }
  return e.leagueLabel;
}

function generateMatchLine(event: MatchEvent): string {
  const display = getEventDisplay(event, { stripLeaguePrefix: true });
  // Country flags are shown only in the highlights section (as images), not in the schedule list rows.
  const matchContent = display.isHeadToHead
    ? `<span class="mc-team">${escapeHTML(display.primary)}</span><span class="vs-sep">vs</span><span class="mc-team">${escapeHTML(display.secondary)}</span>`
    : `<span class="mc-team">${escapeHTML(display.title)}</span>`;
  const roundStr = event.round ? `<span class="mc-round"> \u2013 ${escapeHTML(event.round)}</span>` : '';
  const tags = formatTags(event.tags);
  return `<span class="ml-time">${escapeHTML(event.time)}</span><span class="ml-match">${matchContent}${roundStr}${tags}</span>`;
}

/**
 * Main HTML generation function.
 * Converts selected MatchEvents to the WordPress-ready HTML format.
 * Leagues are emitted in the exact order of leagueOrder; a category <h2>
 * header appears only when the category changes from the previous league,
 * so the preview always mirrors the sort panel order exactly.
 */
export function generateHTML(events: MatchEvent[], leagueOrder?: string[], featuredLeagues?: Map<string, string>): string {
  const selected = events.filter((e) => e.isSelected);
  const featured = events.filter((e) => e.isFeatured);
  const leagueSpotlights = featuredLeagues ?? new Map<string, string>();

  const parts: string[] = [];

  // Highlights section
  const highlightsHTML = generateHighlights(featured, leagueSpotlights, selected);
  if (highlightsHTML) {
    parts.push(highlightsHTML);
    // Add an explicit post-highlights gap so published output clearly separates
    // the highlight bullets from the first sport category heading.
    parts.push('<p>&nbsp;</p>');
  }

  if (!selected.length) {
    return parts.length > 0 ? parts.join('\n') : '<p>No matches selected for this week.</p>';
  }

  // Group events by league → date (flat, no category nesting)
  const byLeague = groupByLeague(selected);

  // Build the ordered league list: user-defined order first, then any remaining
  const allLeagueIds = Array.from(byLeague.keys());
  const ordered: string[] = [];
  if (leagueOrder?.length) {
    for (const id of leagueOrder) {
      if (byLeague.has(id)) ordered.push(id);
    }
  }
  // Append leagues not in leagueOrder using default category/football sort
  const remaining = allLeagueIds.filter((id) => !ordered.includes(id));
  remaining.sort((a, b) => {
    const evA = selected.find((e) => e.sportId === a);
    const evB = selected.find((e) => e.sportId === b);
    const catA = evA?.category ?? '';
    const catB = evB?.category ?? '';
    if (catA !== catB) return categorySort(catA) - categorySort(catB);
    if (catA === 'Football') return footballLeagueSort(a) - footballLeagueSort(b);
    return a.localeCompare(b);
  });
  ordered.push(...remaining);

  // Emit leagues in order; insert a category <h2> only when category changes
  let lastCategory = '';
  let previousLeagueCategory = '';

  for (const leagueKey of ordered) {
    const dateMap = byLeague.get(leagueKey)!;
    const firstEvent = Array.from(dateMap.values())[0]?.[0];
    const category = firstEvent?.category ?? '';

    if (category !== lastCategory) {
      // Custom leagues should render only their league title, without a category header.
      if (category !== 'Custom') {
        // Use explicit HTML spacer so WordPress sanitization/theme CSS can't remove section gaps.
        if (lastCategory !== '') {
          parts.push('<p>&nbsp;</p>');
        }
        parts.push(`<h2>– ${escapeHTML(category)} –</h2>`);
        parts.push('');
        lastCategory = category;
      }
    }

    // Add a subtle gap between leagues inside the same sport category.
    if (previousLeagueCategory !== '' && category === previousLeagueCategory) {
      parts.push('<br/>');
    }
    previousLeagueCategory = category;

    const config = SPORTS_CONFIG.find((s) => s.id === leagueKey);
    const leagueLabel = (leagueKey === 'basketball-ncaam' && firstEvent?.leagueLabel)
      ? firstEvent.leagueLabel
      : (config?.label || firstEvent?.leagueLabel || leagueKey);
    const rawLeagueLogo = config?.logo || firstEvent?.leagueLogo || '';
    const leagueLogo = getPublishLogoSrc(rawLeagueLogo, config?.publishLogo);

    const escapedLeagueKey = escapeHTML(leagueKey);
    const escapedLeagueLabel = escapeHTML(leagueLabel);

    // League header with logo
    if (leagueLogo) {
      parts.push(
        `<img data-preview-league="1" data-preview-sport-id="${escapedLeagueKey}" data-preview-league-label="${escapedLeagueLabel}" src="${leagueLogo}" alt="${escapedLeagueLabel}" style="height:40px;vertical-align:middle;margin-right:8px;" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${LOGO_PLACEHOLDER_REMOTE}';" />`
      );
    }
    parts.push(`<h3 data-preview-league="1" data-preview-sport-id="${escapedLeagueKey}" data-preview-league-label="${escapedLeagueLabel}">${escapedLeagueLabel}</h3>`);
    parts.push('');

    // Sort dates ascending
    const sortedDates = Array.from(dateMap.keys()).sort();

    // Detect if this league has fight-card events (MMA/Boxing)
    const isCombatLeague = ['ufc', 'bellator', 'boxing'].includes(leagueKey);

    for (const date of sortedDates) {
      const dayEvents = dateMap.get(date)!;

      let sortedEvents: MatchEvent[];

      if (isCombatLeague && dayEvents.some((e) => e.fightOrder !== undefined)) {
        // Combat sports: group by cardName, then within each card sort prelims first,
        // main event last. Fights without fightOrder fall back to time sort.
        const cardGroups = new Map<string, MatchEvent[]>();
        const noCard: MatchEvent[] = [];
        for (const e of dayEvents) {
          const key = e.cardName ?? '';
          if (!key) { noCard.push(e); continue; }
          if (!cardGroups.has(key)) cardGroups.set(key, []);
          cardGroups.get(key)!.push(e);
        }
        // Sort no-card events by time
        noCard.sort((a, b) => a.time.localeCompare(b.time));
        // Within each card: sort by fightOrder ascending
        // → main event (fightOrder 0) at TOP, prelims (higher fightOrder) below
        const cardSorted: MatchEvent[] = [];
        for (const fights of Array.from(cardGroups.values()).sort(
          // Sort cards by the earliest fight time
          (a, b) => (a[0]?.time ?? '').localeCompare(b[0]?.time ?? '')
        )) {
          fights.sort((a, b) => (a.fightOrder ?? 0) - (b.fightOrder ?? 0));
          cardSorted.push(...fights);
        }
        sortedEvents = [...noCard, ...cardSorted];
      } else {
        // Default: sort by time ascending
        sortedEvents = [...dayEvents].sort((a, b) => a.time.localeCompare(b.time));
      }

      const displayDate = formatDisplayDate(date);

      // Check if all matches on this date share the same round
      const rounds = new Set(sortedEvents.map((e) => e.round).filter(Boolean));
      const sharedRound = rounds.size === 1 ? Array.from(rounds)[0] : '';

      if (sharedRound) {
        parts.push(
          `<p><strong>${displayDate} – ${escapeHTML(sharedRound)}</strong></p>`
        );
      } else {
        parts.push(`<p><strong>${displayDate}</strong></p>`);
      }

      const matchLines = sortedEvents.map((event) => {
        // If round is shared, don't repeat it on each line
        const e = sharedRound ? { ...event, round: '' } : event;
        const line = generateMatchLine(e);
        const escapedEventId = escapeHTML(event.id);
        const escapedLeagueKey = escapeHTML(leagueKey);
        const escapedLeagueLabel = escapeHTML(leagueLabel);
        const wrappedLine = `<span class="match-row" data-preview-match="1" data-preview-match-id="${escapedEventId}" data-preview-sport-id="${escapedLeagueKey}" data-preview-league-label="${escapedLeagueLabel}">${line}</span>`;
        // Indent prelim fights (non-main-card fights in combat leagues)
        if (isCombatLeague && e.fightOrder !== undefined && !e.isMainCard) {
          return wrappedLine.replace('class="match-row"', 'class="match-row" style="padding-left:18px"');
        }
        return wrappedLine;
      });

      parts.push(`<div class="match-group">\n${matchLines.join('\n')}\n</div>`);
      parts.push('');
    }
  }

  return parts.join('\n');
}
