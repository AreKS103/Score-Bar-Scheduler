import type { MatchEvent } from '@/types';
import {
  CATEGORY_ORDER,
  FOOTBALL_LEAGUE_ORDER,
  SPORTS_CONFIG,
} from '@/lib/config';
import { formatDisplayDate } from '@/lib/timezone';

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
  return (publishLogo || logo || '').trim();
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

  const parts: string[] = [
    '<h2>This Week\'s Highlights at SCORE</h2>',
    '',
  ];

  // All highlights in a single <ul> — match stars and league stars share the same bullet style
  const listItems: string[] = [];

  // Individual starred match highlights — no date or time
  featured
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
    .forEach((e) => {
      const name = e.away
        ? `${escapeHTML(e.home)} vs ${escapeHTML(e.away)}`
        : escapeHTML(e.home);
      const roundStr = e.round ? ` \u2013 ${escapeHTML(e.round)}` : '';
      listItems.push(`  <li><strong>${escapeHTML(e.leagueLabel)}</strong> \u2013 ${name}${roundStr}</li>`);
    });

  // League-level spotlights — same bullet, league title only
  for (const [sportId, customLabel] of featuredLeagues) {
    const config = SPORTS_CONFIG.find((s) => s.id === sportId);
    const defaultLabel = config?.label || sportId;
    const label = customLabel.trim() || defaultLabel;
    listItems.push(`  <li><strong>${escapeHTML(label)}</strong></li>`);
  }

  if (listItems.length) {
    parts.push('<ul>');
    parts.push(...listItems);
    parts.push('</ul>');
    parts.push('');
  }

  parts.push('<hr/>');
  parts.push('');
  return parts.join('\n');
}

/**
 * Generate match line HTML
 */
function generateMatchLine(event: MatchEvent): string {
  const matchName = event.away
    ? `${escapeHTML(event.home)} vs ${escapeHTML(event.away)}`
    : escapeHTML(event.home);
  const abbrev = getLeagueAbbrev(event.sportId, event.leagueLabel);
  const roundStr = event.round ? ` – ${escapeHTML(event.round)}` : '';
  const tags = formatTags(event.tags);
  return `${event.time} – ${abbrev} – ${matchName}${roundStr}${tags}`;
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
    'basketball-nba': 'NBA',
    'basketball-wnba': 'WNBA',
    'basketball-ncaam': 'NCAAM',
    'basketball-nbl': 'NBL',
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
  if (!selected.length) return '<p>No matches selected for this week.</p>';

  // Featured events: show even if not in the selected list
  const featured = events.filter((e) => e.isFeatured);
  const leagueSpotlights = featuredLeagues ?? new Map<string, string>();

  const parts: string[] = [];

  // Highlights section
  const highlightsHTML = generateHighlights(featured, leagueSpotlights);
  if (highlightsHTML) {
    parts.push(highlightsHTML);
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

    const config = SPORTS_CONFIG.find((s) => s.id === leagueKey);
    const leagueLabel = config?.label || firstEvent?.leagueLabel || leagueKey;
    const rawLeagueLogo = config?.logo || firstEvent?.leagueLogo || '';
    const leagueLogo = getPublishLogoSrc(rawLeagueLogo, config?.publishLogo);

    // League header with logo
    if (leagueLogo) {
      parts.push(
        `<img src="${leagueLogo}" alt="${escapeHTML(leagueLabel)}" style="height:40px;vertical-align:middle;margin-right:8px;" loading="lazy" decoding="async" referrerpolicy="no-referrer" crossorigin="anonymous" />`
      );
    }
    parts.push(`<h3>${escapeHTML(leagueLabel)}</h3>`);
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
        // Indent prelim fights (non-main-card fights in combat leagues)
        if (isCombatLeague && e.fightOrder !== undefined && !e.isMainCard) {
          return `&nbsp;&nbsp;&nbsp;&nbsp;${line}`;
        }
        return line;
      });

      parts.push(`<p>\n${matchLines.join('<br/>\n')}\n</p>`);
      parts.push('');
    }
  }

  return parts.join('\n');
}
