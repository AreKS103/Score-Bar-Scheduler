import type { MatchEvent } from '@/types';
import { formatDisplayDate } from '@/lib/timezone';
import { getEventDisplayTitle } from '@/lib/eventDisplay';

interface SeoOptions {
  pageUrl?: string;
  publishedAt?: string;
  embedTarget?: string;
}

interface FlatSeoMatch {
  id: string;
  sportId: string;
  category: string;
  league: string;
  date: string;
  displayDate: string;
  time: string;
  match: string;
  round: string;
  tags: string[];
}

function escapeHTML(value: string): string {
  return (value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function slugPart(value: string): string {
  return (value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function eventName(event: MatchEvent): string {
  return getEventDisplayTitle(event, { stripLeaguePrefix: true });
}

function toLocalStartDate(match: FlatSeoMatch): string {
  if (/^\d{2}:\d{2}$/.test(match.time)) {
    return `${match.date}T${match.time}:00`;
  }
  return match.date;
}

function seoAnchorId(match: FlatSeoMatch, index: number): string {
  return `scorebar-event-${slugPart(match.id || `${match.league}-${match.date}-${match.time}-${index}`) || index}`;
}

function dateRangeLabel(matches: FlatSeoMatch[]): string {
  const dates = [...new Set(matches.map((match) => match.date))].sort();
  if (!dates.length) return '';
  if (dates.length === 1) return formatDisplayDate(dates[0]);
  return `${formatDisplayDate(dates[0])} - ${formatDisplayDate(dates[dates.length - 1])}`;
}

function topLeagueLabels(matches: FlatSeoMatch[]): string[] {
  const counts = new Map<string, number>();
  for (const match of matches) {
    counts.set(match.league, (counts.get(match.league) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([league]) => league);
}

function flattenEvents(events: MatchEvent[]): FlatSeoMatch[] {
  return events
    .filter((event) => event.isSelected !== false)
    .map((event) => ({
      id: event.id,
      sportId: event.sportId,
      category: event.category || 'Sports',
      league: event.leagueLabel || event.sportId,
      date: event.date,
      displayDate: formatDisplayDate(event.date),
      time: event.time || '',
      match: eventName(event),
      round: event.round || '',
      tags: Array.isArray(event.tags) ? event.tags : [],
    }))
    .sort((a, b) => a.category.localeCompare(b.category) || a.league.localeCompare(b.league) || a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
}

function buildBodyHtml(matches: FlatSeoMatch[]): string {
  if (!matches.length) {
    return '<p>No matches are currently published for this schedule.</p>';
  }

  const parts: string[] = [];
  let currentCategory = '';
  let currentLeague = '';
  let currentDate = '';

  for (let index = 0; index < matches.length; index++) {
    const match = matches[index];
    if (match.category !== currentCategory) {
      if (currentDate) parts.push('</ul>');
      if (currentLeague) parts.push('</section>');
      if (currentCategory) parts.push('</section>');
      currentCategory = match.category;
      currentLeague = '';
      currentDate = '';
      parts.push(`<section class="scorebar-seo-category"><h3>${escapeHTML(match.category)}</h3>`);
    }

    if (match.league !== currentLeague) {
      if (currentDate) parts.push('</ul>');
      if (currentLeague) parts.push('</section>');
      currentLeague = match.league;
      currentDate = '';
      parts.push(`<section class="scorebar-seo-league"><h4>${escapeHTML(match.league)}</h4>`);
    }

    if (match.date !== currentDate) {
      if (currentDate) parts.push('</ul>');
      currentDate = match.date;
      parts.push(`<h5>${escapeHTML(match.displayDate)}</h5><ul>`);
    }

    const detail = [match.round, ...match.tags].filter(Boolean).join(' - ');
    const anchorId = seoAnchorId(match, index);
    parts.push(
      `<li id="${escapeHTML(anchorId)}"><time datetime="${escapeHTML(toLocalStartDate(match))}">${escapeHTML(match.time || match.displayDate)}</time> <strong>${escapeHTML(match.match)}</strong><span> ${escapeHTML(match.league)}${detail ? ` - ${escapeHTML(detail)}` : ''}</span></li>`,
    );
  }

  if (currentDate) parts.push('</ul>');
  if (currentLeague) parts.push('</section>');
  if (currentCategory) parts.push('</section>');

  return parts.join('\n');
}

export function buildScheduleSeoPayload(events: MatchEvent[], opts: SeoOptions = {}) {
  const matches = flattenEvents(events);
  const dateRange = dateRangeLabel(matches);
  const topLeagues = topLeagueLabels(matches);
  const titleBase = topLeagues.length ? `${topLeagues.join(', ')} Schedule` : 'Sports Schedule';
  const title = dateRange ? `${titleBase} (${dateRange})` : titleBase;
  const description = matches.length
    ? `Upcoming ${topLeagues.length ? topLeagues.join(', ') : 'sports'} fixtures${dateRange ? ` for ${dateRange}` : ''} with leagues, dates, kick-off times, and match details.`
    : 'No matches are currently published for this schedule.';

  const pageUrl = (opts.pageUrl || '').trim();
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: title,
    description,
    url: pageUrl || undefined,
    dateModified: opts.publishedAt || undefined,
    mainEntity: {
      '@type': 'ItemList',
      name: title,
      numberOfItems: matches.length,
      itemListElement: matches.slice(0, 100).map((match, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: `${match.league}: ${match.match}`,
        item: {
          '@type': 'Thing',
          '@id': pageUrl ? `${pageUrl}#${seoAnchorId(match, index)}` : undefined,
          additionalType: 'https://schema.org/SportsEvent',
          name: match.match,
          description: `${match.league}: ${match.match} on ${match.displayDate}${match.time ? ` at ${match.time}` : ''}`,
        },
      })),
    },
  };

  return {
    title,
    description,
    dateRange,
    matchCount: matches.length,
    topLeagues,
    embedTarget: opts.embedTarget || '',
    bodyHtml: buildBodyHtml(matches),
    jsonLd,
  };
}
