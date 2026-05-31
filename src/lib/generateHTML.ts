import type { MatchEvent } from '@/types';
import {
  CATEGORY_ORDER,
  FOOTBALL_LEAGUE_ORDER,
  SPORTS_CONFIG,
} from '@/lib/config';
import { LOGO_PLACEHOLDER_REMOTE, resolvePublishLogoUrl } from '@/lib/logo';
import { formatDisplayDate } from '@/lib/timezone';
import { getEventDisplay } from '@/lib/eventDisplay';

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
): string {
  if (!featured.length && !featuredLeagues.size) return '';

  const s = {
    section: 'margin-bottom:20px',
    title: 'font-size:1.1em;font-weight:800;margin:0 0 12px',
    dateHeader: 'font-size:0.72em;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;opacity:1;padding:6px 0;border-bottom:1px solid rgba(128,128,128,0.25);margin-bottom:8px',
    event: 'padding:7px 0',
    meta: 'display:flex;align-items:center;gap:6px;margin-bottom:4px',
    time: 'font-size:0.8em;font-weight:700',
    league: 'font-size:0.8em;font-weight:600;opacity:1',
    teams: 'display:flex;align-items:center;flex-wrap:wrap;gap:4px;font-size:1em;font-weight:600',
    teamLogo: 'height:20px;width:auto;vertical-align:middle;flex-shrink:0',
    vs: 'font-style:italic;font-size:0.82em;opacity:0.4;margin:0 3px',
    round: 'font-size:0.72em;opacity:0.5;margin-top:2px;font-style:italic',
    spotlight: 'padding:6px 0;font-weight:700;font-size:1em;display:flex;align-items:center;gap:8px',
  };

  const parts: string[] = [
    `<div style="${s.section}">`,
    `<h2 style="${s.title}">This Week's Highlights</h2>`,
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
    parts.push(`<div>`);
    parts.push(`<div style="${s.dateHeader}">${escapeHTML(displayDate)}</div>`);
    for (const e of events) {
      const display = getEventDisplay(e, { stripLeaguePrefix: true });
      const isCombat = ['boxing', 'ufc', 'bellator'].includes(e.sportId);
      const homeFlag = isCombat && e.homeCountry ? `<span style="font-size:1em;margin-right:2px">${countryFlag(e.homeCountry)}</span>` : '';
      const awayFlag = isCombat && e.awayCountry ? `<span style="font-size:1em;margin-right:2px">${countryFlag(e.awayCountry)}</span>` : '';
      const homeImg = e.homeLogo ? `<img src="${escapeHTML(e.homeLogo)}" alt="" loading="lazy" style="${s.teamLogo}" />` : '';
      const awayImg = e.awayLogo && display.isHeadToHead ? `<img src="${escapeHTML(e.awayLogo)}" alt="" loading="lazy" style="${s.teamLogo}" />` : '';
      const leagueFallback = !display.isHeadToHead && !homeImg ? (() => {
        const cfg = SPORTS_CONFIG.find(sc => sc.id === e.sportId);
        return cfg ? resolvePublishLogoUrl(cfg.logo || e.leagueLogo || '', cfg.publishLogo) : '';
      })() : '';
      const leagueFallbackImg = leagueFallback ? `<img src="${escapeHTML(leagueFallback)}" alt="" loading="lazy" style="${s.teamLogo}" />` : '';
      // For combat sports: homeLogo = flagcdn.com flag image; emoji flag falls back if image absent.
      // For non-combat sports: homeImg is the team logo; emoji flags don't apply.
      const homeBadge = isCombat ? (homeImg || homeFlag) : homeImg;
      const awayBadge = isCombat ? (awayImg || awayFlag) : awayImg;
      const teamsHtml = display.isHeadToHead
        ? `${homeBadge}<span>${escapeHTML(display.primary)}</span><span style="${s.vs}">vs</span>${awayBadge}<span>${escapeHTML(display.secondary)}</span>`
        : `${leagueFallbackImg}${homeImg}<span>${escapeHTML(display.title)}</span>`;
      const roundStr = e.round ? `<div style="${s.round}">${escapeHTML(e.round)}</div>` : '';
      parts.push(`<div style="${s.event}"><div style="${s.meta}">${e.time ? `<span style="${s.time}">${escapeHTML(e.time)}</span>` : ''}<span style="${s.league}">${escapeHTML(cleanCombatLabel(e))}</span></div><div style="${s.teams}">${teamsHtml}</div>${roundStr}</div>`);
    }
    parts.push('</div>');
  }

  // League-level spotlights
  for (const [sportId, customLabel] of featuredLeagues) {
    const config = SPORTS_CONFIG.find((sc) => sc.id === sportId);
    const label = (customLabel || '').trim() || config?.label || sportId;
    const logoSrc = config ? resolvePublishLogoUrl(config.logo || '', config.publishLogo) : '';
    const logoImg = logoSrc ? `<img src="${escapeHTML(logoSrc)}" alt="" loading="lazy" style="${s.teamLogo}" />` : '';
    parts.push(`<div style="${s.spotlight}">${logoImg}${escapeHTML(label)}</div>`);
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
 * Get short abbreviation for a league.
 * For combat sports, uses the event-specific card name (e.g. "UFC 326") from leagueLabel.
 */
function getLeagueAbbrev(sportId: string, label: string): string {
  // For combat sports, the leagueLabel is the full card name e.g.:
  //   "UFC 326: Max Holloway vs. Charles Oliveira 2"
  // Use only the part before ":" as the inline abbreviation so match lines stay compact:
  //   05:00 – UFC 326 – Holloway vs. Oliveira 2
  if (sportId === 'ufc' || sportId === 'bellator' || sportId === 'boxing') {
    const colonIdx = label.indexOf(':');
    return colonIdx > 0 ? label.substring(0, colonIdx).trim() : label;
  }

  const abbrevMap: Record<string, string> = {
    'soccer-epl': 'EPL',
    'soccer-ucl': 'UCL',
    'soccer-uel': 'UEL',
    'soccer-uecl': 'UECL',
    'soccer-facup': 'FA Cup',
    'soccer-efl': 'EFL',
    'soccer-leagueone': 'L1 (ENG)',
    'soccer-carabao': 'Carabao',
    'soccer-bundesliga': 'BL',
    'soccer-ligue1': 'L1',
    'soccer-laliga': 'LaLiga',
    'soccer-seriea': 'Serie A',
    'soccer-spfl': 'SPFL',
    'soccer-eredivisie': 'Eredivisie',
    'soccer-ligaportugal': 'Liga PT',
    'soccer-mls': 'MLS',
    'soccer-superlig': 'Süper Lig',
    'soccer-aleague': 'A-League',
    'soccer-saudipro': 'SPL',
    'soccer-bra1': 'Brasileirão',
    'soccer-arg1': 'LPA',
    'soccer-jleague': 'J-League',
    'soccer-isl': 'ISL',
    'soccer-afc': 'AFC CLE',
    'soccer-afc2': 'AFC CL2',
    'soccer-afccl': 'AFC CL',
    'soccer-copam': 'Libertadores',
    'soccer-cpl': 'CPL',
    'soccer-hun-sen-cup': 'Hun Sen Cup',
    'basketball-nba': 'NBA',
    'basketball-wnba': 'WNBA',
    'basketball-ncaam': 'NCAAM',
    'basketball-ncaaw': 'NCAAW',
    'football-nfl': 'NFL',
    'football-ncaaf': 'NCAAF',
    'baseball-mlb': 'MLB',
    'hockey-nhl': 'NHL',
    'cricket-ipl': 'IPL',
    'cricket-bbl': 'BBL',
    'f1': 'F1',
    'motogp': 'MotoGP',
    'indycar': 'IndyCar',
    // ufc, bellator, boxing handled above with event-level card names
    'rugby-superrugby': 'Super Rugby',
    'rugby-sixnations': '6N',
    'rugby-premship': 'Prem Rugby',
    'rugby-top14': 'Top 14',
    'rugby-urc': 'URC',
    'rugby-champscup': 'Champs Cup',
    'rugby-rc': 'TRC',
    'nrl': 'NRL',
    'afl': 'AFL',
    'tennis-atp': 'ATP',
    'tennis-wta': 'WTA',
    'tennis-australian-open': 'AO',
    'tennis-roland-garros': 'RG',
    'tennis-wimbledon': 'WIM',
    'tennis-us-open': 'USO',
    'golf-pga': 'PGA',
    'golf-lpga': 'LPGA',
  };
  return abbrevMap[sportId] || label;
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
  const highlightsHTML = generateHighlights(featured, leagueSpotlights);
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
