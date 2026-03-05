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
 * Group events by category → league → date
 */
function groupEvents(events: MatchEvent[]): Map<string, Map<string, Map<string, MatchEvent[]>>> {
  const grouped = new Map<string, Map<string, Map<string, MatchEvent[]>>>();

  for (const event of events) {
    if (!grouped.has(event.category)) {
      grouped.set(event.category, new Map());
    }
    const catMap = grouped.get(event.category)!;

    const leagueKey = event.sportId;
    if (!catMap.has(leagueKey)) {
      catMap.set(leagueKey, new Map());
    }
    const leagueMap = catMap.get(leagueKey)!;

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
  allSelected: MatchEvent[],
): string {
  const hasMatchHighlights = featured.length > 0;
  const hasLeagueHighlights = featuredLeagues.size > 0;
  if (!hasMatchHighlights && !hasLeagueHighlights) return '';

  const parts: string[] = [
    '<h2>This Week\'s Highlights at SCORE</h2>',
    '',
  ];

  // Individual starred match highlights
  if (hasMatchHighlights) {
    const items = featured
      .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
      .map((e) => {
        const displayDate = formatDisplayDate(e.date);
        const name = e.away
          ? `${escapeHTML(e.home)} vs ${escapeHTML(e.away)}`
          : escapeHTML(e.home);
        const roundStr = e.round ? ` \u2013 ${escapeHTML(e.round)}` : '';
        return `  <li><strong>${escapeHTML(e.leagueLabel)}</strong> \u2013 ${name}${roundStr} \u2013 ${displayDate} \u2013 ${e.time}</li>`;
      });
    parts.push('<ul>');
    parts.push(...items);
    parts.push('</ul>');
    parts.push('');
  }

  // League-level spotlights — include all selected matches in the league
  for (const [sportId, customLabel] of featuredLeagues) {
    const leagueEvents = allSelected
      .filter((e) => e.sportId === sportId)
      .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
    if (!leagueEvents.length) continue;
    const defaultLabel = leagueEvents[0].leagueLabel;
    const label = customLabel.trim() || defaultLabel;
    const lines = leagueEvents.map((e) => {
      const name = e.away
        ? `${escapeHTML(e.home)} vs ${escapeHTML(e.away)}`
        : escapeHTML(e.home);
      const roundStr = e.round ? ` \u2013 ${escapeHTML(e.round)}` : '';
      return `  ${formatDisplayDate(e.date)} \u2013 ${e.time} \u2013 ${name}${roundStr}`;
    });
    parts.push(`<p><strong>\uD83C\uDFC6 ${escapeHTML(label)}</strong><br/>`);
    parts.push(lines.join('<br/>\n'));
    parts.push('</p>');
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
 * Get short abbreviation for a league
 */
function getLeagueAbbrev(sportId: string, label: string): string {
  const abbrevMap: Record<string, string> = {
    'soccer-epl': 'EPL',
    'soccer-ucl': 'UCL',
    'soccer-uel': 'UEL',
    'soccer-facup': 'FA Cup',
    'soccer-efl': 'EFL',
    'soccer-carabao': 'Carabao',
    'soccer-bundesliga': 'BL',
    'soccer-ligue1': 'L1',
    'soccer-laliga': 'LaLiga',
    'soccer-seriea': 'Serie A',
    'soccer-spfl': 'SPFL',
    'soccer-afc': 'AFC',
    'soccer-cpl': 'CPL',
    'f1': 'F1',
    'motogp': 'MotoGP',
    'ufc': 'UFC',
    'nrl': 'NRL',
    'afl': 'AFL',
  };
  return abbrevMap[sportId] || label;
}

/**
 * Main HTML generation function.
 * Converts selected MatchEvents to the WordPress-ready HTML format.
 */
export function generateHTML(events: MatchEvent[], leagueOrder?: string[], featuredLeagues?: Map<string, string>): string {
  const selected = events.filter((e) => e.isSelected);
  if (!selected.length) return '<p>No matches selected for this week.</p>';

  const featured = selected.filter((e) => e.isFeatured);
  const grouped = groupEvents(selected);
  const leagueSpotlights = featuredLeagues ?? new Map<string, string>();

  const parts: string[] = [];

  // Highlights section
  const highlightsHTML = generateHighlights(featured, leagueSpotlights, selected);
  if (highlightsHTML) {
    parts.push(highlightsHTML);
  }

  // Sort categories
  const sortedCategories = Array.from(grouped.keys()).sort(
    (a, b) => categorySort(a) - categorySort(b)
  );

  for (const category of sortedCategories) {
    parts.push(`<h2>– ${escapeHTML(category)} –</h2>`);
    parts.push('');

    const leagueMap = grouped.get(category)!;

    // Sort leagues within category (user-defined order takes priority)
    const sortedLeagues = Array.from(leagueMap.keys()).sort((a, b) => {
      if (leagueOrder?.length) {
        const ai = leagueOrder.indexOf(a);
        const bi = leagueOrder.indexOf(b);
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;
      }
      if (category === 'Football') {
        return footballLeagueSort(a) - footballLeagueSort(b);
      }
      return a.localeCompare(b);
    });

    for (const leagueKey of sortedLeagues) {
      const config = SPORTS_CONFIG.find((s) => s.id === leagueKey);
      const leagueLabel = config?.label || leagueKey;
      const leagueLogo = config?.logo || '';

      // League header with logo
      if (leagueLogo) {
        parts.push(
          `<img src="${leagueLogo}" alt="${escapeHTML(leagueLabel)}" style="height:40px;vertical-align:middle;margin-right:8px;" onerror="this.style.display='none'" />`
        );
      }
      parts.push(`<h3>${escapeHTML(leagueLabel)}</h3>`);
      parts.push('');

      const dateMap = leagueMap.get(leagueKey)!;

      // Sort dates ascending
      const sortedDates = Array.from(dateMap.keys()).sort();

      for (const date of sortedDates) {
        const dayEvents = dateMap.get(date)!;
        // Sort by time ascending
        dayEvents.sort((a, b) => a.time.localeCompare(b.time));

        const displayDate = formatDisplayDate(date);

        // Check if all matches on this date share the same round
        const rounds = new Set(dayEvents.map((e) => e.round).filter(Boolean));
        const sharedRound = rounds.size === 1 ? Array.from(rounds)[0] : '';

        if (sharedRound) {
          parts.push(
            `<p><strong>${displayDate} – ${escapeHTML(sharedRound)}</strong></p>`
          );
        } else {
          parts.push(`<p><strong>${displayDate}</strong></p>`);
        }

        const matchLines = dayEvents.map((event) => {
          // If round is shared, don't repeat it on each line
          const e = sharedRound ? { ...event, round: '' } : event;
          return generateMatchLine(e);
        });

        parts.push(`<p>\n${matchLines.join('<br/>\n')}\n</p>`);
        parts.push('');
      }
    }
  }

  return parts.join('\n');
}
