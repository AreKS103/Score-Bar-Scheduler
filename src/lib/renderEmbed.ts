/**
 * renderEmbed.ts
 *
 * Renders the schedule HTML content fresh from raw events data + customization
 * opts at request time. This replaces the old regex-transform approach where a
 * pre-formed HTML blob was patched in route.ts — giving true dynamic rendering.
 *
 * Used exclusively by the embed route handler.
 */

import type { MatchEvent } from '@/types';
import {
  CATEGORY_ORDER,
  FOOTBALL_LEAGUE_ORDER,
  SPORTS_CONFIG,
} from '@/lib/config';
import { LOGO_PLACEHOLDER_REMOTE, resolvePublishLogoUrl } from '@/lib/logo';
import { formatDisplayDate } from '@/lib/timezone';

// ─── Public interface ─────────────────────────────────────────────────────────

export interface EmbedRenderOpts {
  showTime: boolean;
  showDate: boolean;
  showHeader: boolean;
  hideLogos: boolean;
  showSportTabs: boolean;
  catLabels?: Record<string, string>;
}

export interface EmbedRenderResult {
  /** Inner schedule HTML (already wrapped in sport-section divs when tabs are active) */
  html: string;
  /** Ordered list of sport category names, used to build the tabs bar */
  categories: string[];
}

// ─── Private helpers ──────────────────────────────────────────────────────────

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

function countryFlag(code: string): string {
  const c = (code || '').trim().toUpperCase().substring(0, 2);
  if (!/^[A-Z]{2}$/.test(c)) return '';
  return Array.from(c).map(ch => String.fromCodePoint(0x1F1E6 + ch.charCodeAt(0) - 65)).join('');
}

/** Strip "Fighter vs. Fighter" suffix from combat sport event labels so it doesn't
 *  double-render alongside the home/away fighter names already shown in highlights. */
function cleanCombatLabel(e: MatchEvent): string {
  if (!['boxing', 'ufc', 'bellator'].includes(e.sportId) || !e.away) return e.leagueLabel;
  const colon = e.leagueLabel.indexOf(':');
  if (colon > 0 && /vs\.?\s/i.test(e.leagueLabel.slice(colon))) {
    return e.leagueLabel.slice(0, colon).trim();
  }
  return e.leagueLabel;
}

function buildMatchLine(event: MatchEvent, showTime: boolean, sharedRound: string): string {
  const e = sharedRound ? { ...event, round: '' } : event;
  const isCombat = ['boxing', 'ufc', 'bellator'].includes(e.sportId);
  const homeFlag = isCombat && e.homeCountry ? `<span style="font-size:1em;margin-right:2px" title="${esc(e.homeCountry)}">${countryFlag(e.homeCountry)}</span>` : '';
  const awayFlag = isCombat && e.awayCountry ? `<span style="font-size:1em;margin-right:2px" title="${esc(e.awayCountry)}">${countryFlag(e.awayCountry)}</span>` : '';
  // For combat-sport card-level entries (no away fighter), the home field may contain
  // the full advertised name like "UFC Fight Night: Adesanya vs. Pyfer". Strip the
  // ": Fighter vs. Fighter" suffix so individual fight rows below aren't duplicated.
  const homeDisplay = isCombat && !e.away && e.home.includes(':')
    ? e.home.substring(0, e.home.indexOf(':')).trim()
    : e.home;
  const matchContent = e.away
    ? `<span class="mc-team">${homeFlag}${esc(e.home)}</span><span class="vs-sep">vs</span><span class="mc-team">${awayFlag}${esc(e.away)}</span>`
    : `<span class="mc-team">${esc(homeDisplay)}</span>`;
  const roundStr = e.round ? `<span class="mc-round"> \u2013 ${esc(e.round)}</span>` : '';
  const tagsStr = e.tags?.length ? ` \u2013 <em>(${e.tags.join(', ')})</em>` : '';
  return showTime
    ? `<span class="ml-time">${esc(e.time)}</span><span class="ml-match">${matchContent}${roundStr}${tagsStr}</span>`
    : `<span class="ml-match">${matchContent}${roundStr}${tagsStr}</span>`;
}

function groupByLeague(events: MatchEvent[]): Map<string, Map<string, MatchEvent[]>> {
  const g = new Map<string, Map<string, MatchEvent[]>>();
  for (const e of events) {
    if (!g.has(e.sportId)) g.set(e.sportId, new Map());
    const lm = g.get(e.sportId)!;
    if (!lm.has(e.date)) lm.set(e.date, []);
    lm.get(e.date)!.push(e);
  }
  return g;
}

function renderHighlights(
  featured: MatchEvent[],
  featuredLeagues: Map<string, string>,
  allEvents: MatchEvent[],
  opts: EmbedRenderOpts,
): string {
  if (!featured.length && !featuredLeagues.size) return '';

  const parts: string[] = [
    '<div class="hl-section">',
    '<h2 class="hl-title">This Week\'s Highlights</h2>',
  ];

  // Group individual starred matches by date
  const byDate = new Map<string, MatchEvent[]>();
  [...featured]
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
    .forEach((e) => {
      if (!byDate.has(e.date)) byDate.set(e.date, []);
      byDate.get(e.date)!.push(e);
    });

  for (const [date, events] of byDate) {
    const displayDate = formatDisplayDate(date);
    parts.push(`<div class="hl-date-group">`);
    parts.push(`<div class="hl-date-header">${esc(displayDate)}</div>`);
    for (const e of events) {
      const isCombat = ['boxing', 'ufc', 'bellator'].includes(e.sportId);
      const homeFlag = isCombat && e.homeCountry ? `<span style="font-size:1em;margin-right:2px">${countryFlag(e.homeCountry)}</span>` : '';
      const awayFlag = isCombat && e.awayCountry ? `<span style="font-size:1em;margin-right:2px">${countryFlag(e.awayCountry)}</span>` : '';
      const homeImg = (!opts.hideLogos && e.homeLogo) ? `<img class="hl-team-logo" src="${esc(e.homeLogo)}" alt="" loading="lazy" decoding="async" onerror="this.onerror=null;this.style.display='none'" />` : '';
      const awayImg = (!opts.hideLogos && e.awayLogo && e.away) ? `<img class="hl-team-logo" src="${esc(e.awayLogo)}" alt="" loading="lazy" decoding="async" onerror="this.onerror=null;this.style.display='none'" />` : '';
      // For singular events with no team logo, show league logo
      const leagueFallback = !opts.hideLogos && !e.away && !homeImg ? (() => {
        const cfg = SPORTS_CONFIG.find(s => s.id === e.sportId);
        return cfg ? resolvePublishLogoUrl(cfg.logo || e.leagueLogo || '', cfg.publishLogo) : '';
      })() : '';
      const leagueFallbackImg = leagueFallback ? `<img class="hl-team-logo" src="${esc(leagueFallback)}" alt="" loading="lazy" decoding="async" onerror="this.onerror=null;this.style.display='none'" />` : '';
      // For combat sports: homeLogo = flagcdn.com flag image (generated from ISO country code).
      // Prefer the image; if absent (e.g. unknown fighter nationality), fall back to emoji flag.
      // For non-combat sports: homeImg is the team logo; emoji flags don't apply.
      const homeBadge = isCombat ? (homeImg || homeFlag) : homeImg;
      const awayBadge = isCombat ? (awayImg || awayFlag) : awayImg;
      const teamsHtml = e.away
        ? `<span class="hl-team">${homeBadge}${esc(e.home)}</span><span class="hl-vs">vs</span><span class="hl-team">${awayBadge}${esc(e.away)}</span>`
        : `<span class="hl-team">${leagueFallbackImg}${homeImg}${esc(e.home)}</span>`;
      const roundStr = e.round ? `<div class="hl-round">${esc(e.round)}</div>` : '';
      parts.push(`<div class="hl-event"><div class="hl-event-meta">${e.time ? `<span class="hl-time">${esc(e.time)}</span>` : ''}<span class="hl-league-name">${esc(cleanCombatLabel(e))}</span></div><div class="hl-teams">${teamsHtml}</div>${roundStr}</div>`);
    }
    parts.push('</div>');
  }

  // League spotlights – for team sports use actual team logos; for solo sports show league logo
  for (const [sportId, customLabel] of featuredLeagues) {
    const config = SPORTS_CONFIG.find((s) => s.id === sportId);
    const leagueLabel = config?.label || sportId;
    // Prefer a starred event first, then any team-vs-team event for this league
    const teamEvent =
      allEvents.find(e => e.sportId === sportId && !!e.away && e.isFeatured) ||
      allEvents.find(e => e.sportId === sportId && !!e.away);
    if (teamEvent) {
      const homeImg = (!opts.hideLogos && teamEvent.homeLogo) ? `<img class="hl-team-logo" src="${esc(teamEvent.homeLogo)}" alt="" loading="lazy" decoding="async" onerror="this.onerror=null;this.style.display='none'" />` : '';
      const awayImg = (!opts.hideLogos && teamEvent.awayLogo) ? `<img class="hl-team-logo" src="${esc(teamEvent.awayLogo)}" alt="" loading="lazy" decoding="async" onerror="this.onerror=null;this.style.display='none'" />` : '';
      const teamsHtml = `<span class="hl-team">${homeImg}${esc(teamEvent.home)}</span><span class="hl-vs">vs</span><span class="hl-team">${awayImg}${esc(teamEvent.away!)}</span>`;
      parts.push(`<div class="hl-event"><div class="hl-event-meta">${teamEvent.time ? `<span class="hl-time">${esc(teamEvent.time)}</span>` : ''}<span class="hl-league-name">${esc(leagueLabel)}</span></div><div class="hl-teams">${teamsHtml}</div></div>`);
    } else {
      const logoUrl = (!opts.hideLogos && config) ? resolvePublishLogoUrl(config.logo || '', config.publishLogo) : '';
      const logoImg = logoUrl ? `<img class="hl-team-logo" src="${esc(logoUrl)}" alt="" loading="lazy" decoding="async" onerror="this.onerror=null;this.style.display='none'" />` : '';
      const label = (customLabel || '').trim() || leagueLabel;
      parts.push(`<div class="hl-league-spotlight">${logoImg}${esc(label)}</div>`);
    }
  }

  parts.push('</div>');
  return parts.join('\n');
}

function renderLeagueBlock(
  leagueKey: string,
  dateMap: Map<string, MatchEvent[]>,
  opts: EmbedRenderOpts,
): string {
  const config = SPORTS_CONFIG.find((s) => s.id === leagueKey);
  const firstEvent = Array.from(dateMap.values())[0]?.[0];
  const leagueLabel = (leagueKey === 'basketball-ncaam' && firstEvent?.leagueLabel)
    ? firstEvent.leagueLabel
    : (config?.label || firstEvent?.leagueLabel || leagueKey);
  const rawLogo = config?.logo || firstEvent?.leagueLogo || '';
  const leagueLogo = resolvePublishLogoUrl(rawLogo, config?.publishLogo);

  const eKey = esc(leagueKey);
  const eLabel = esc(leagueLabel);
  const parts: string[] = [];

  // League logo
  if (!opts.hideLogos && leagueLogo) {
    parts.push(
      `<img data-preview-league="1" data-preview-sport-id="${eKey}" data-preview-league-label="${eLabel}" src="${esc(leagueLogo)}" alt="${eLabel}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${LOGO_PLACEHOLDER_REMOTE}';" />`
    );
  }

  // League name heading
  parts.push(
    `<h3 data-preview-league="1" data-preview-sport-id="${eKey}" data-preview-league-label="${eLabel}">${eLabel}</h3>`
  );
  parts.push('');

  const isCombat = ['ufc', 'bellator', 'boxing'].includes(leagueKey);
  const sortedDates = Array.from(dateMap.keys()).sort();

  for (const date of sortedDates) {
    const dayEvents = dateMap.get(date)!;
    let sorted: MatchEvent[];

    // Combat sports: group by card, sort main event first within each card
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
      const cardSorted: MatchEvent[] = [];
      for (const fights of Array.from(cards.values()).sort(
        (a, b) => (a[0]?.time ?? '').localeCompare(b[0]?.time ?? '')
      )) {
        fights.sort((a, b) => (a.fightOrder ?? 0) - (b.fightOrder ?? 0));
        cardSorted.push(...fights);
      }
      sorted = [...noCard, ...cardSorted];
    } else {
      sorted = [...dayEvents].sort((a, b) => a.time.localeCompare(b.time));
    }

    // Detect shared round for this date
    const roundSet = new Set(sorted.map((e) => e.round).filter(Boolean));
    const sharedRound = roundSet.size === 1 ? Array.from(roundSet)[0]! : '';

    // Date header (conditional)
    if (opts.showDate) {
      const displayDate = formatDisplayDate(date);
      if (sharedRound) {
        parts.push(`<p><strong>${displayDate} \u2013 ${esc(sharedRound)}</strong></p>`);
      } else {
        parts.push(`<p><strong>${displayDate}</strong></p>`);
      }
    }

    // Match lines
    const lines = sorted.map((event) => {
      const line = buildMatchLine(event, opts.showTime, sharedRound);
      const eId = esc(event.id);
      const wrapped = `<span data-preview-match="1" data-preview-match-id="${eId}" data-preview-sport-id="${eKey}" data-preview-league-label="${eLabel}">${line}</span>`;
      // Indent undercard fights in combat sports
      if (isCombat && event.fightOrder !== undefined && !event.isMainCard) {
        return wrapped.replace('data-preview-match="1"', 'data-preview-match="1" style="padding-left:18px"');
      }
      return wrapped;
    });

    parts.push(`<div class="match-group">\n${lines.join('\n')}\n</div>`);
    parts.push('');
  }

  return parts.join('\n');
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Render schedule content HTML from raw events data with customization opts
 * applied at render time (no regex transforms needed).
 *
 * @param events        - Events from events_snapshot (all have isSelected=true)
 * @param leagueOrder   - User-defined league ordering
 * @param featuredLeagues - Map of sportId → custom label for spotlight leagues
 * @param opts          - Display customization options
 */
export function renderEmbedContent(
  events: MatchEvent[],
  leagueOrder: string[],
  featuredLeagues: Map<string, string>,
  opts: EmbedRenderOpts,
): EmbedRenderResult {
  // All snapshot events are selected; filter isFeatured for highlights
  const selected = events;
  const featured = events.filter((e) => e.isFeatured);

  const byLeague = groupByLeague(selected);

  // ── Build ordered league list ─────────────────────────────────────────────
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

  // ── Extract ordered unique categories ────────────────────────────────────
  const seenCats = new Set<string>();
  const categories: string[] = [];
  for (const leagueKey of ordered) {
    const firstEvent = Array.from(byLeague.get(leagueKey)!.values())[0]?.[0];
    const cat = firstEvent?.category ?? '';
    if (cat && cat !== 'Custom' && !seenCats.has(cat)) {
      seenCats.add(cat);
      categories.push(cat);
    }
  }

  const hasTabs = opts.showSportTabs && categories.length > 1;

  // ── Group leagues by category for section wrapping ───────────────────────
  interface CatGroup { cat: string; leagueKeys: string[] }
  const catGroups: CatGroup[] = [];
  let currentGroup: CatGroup | null = null;

  for (const leagueKey of ordered) {
    const firstEvent = Array.from(byLeague.get(leagueKey)!.values())[0]?.[0];
    const cat = firstEvent?.category ?? '';
    if (!currentGroup || currentGroup.cat !== cat) {
      currentGroup = { cat, leagueKeys: [] };
      catGroups.push(currentGroup);
    }
    currentGroup.leagueKeys.push(leagueKey);
  }

  // ── Render highlights ─────────────────────────────────────────────────────
  const highlightsHTML = renderHighlights(featured, featuredLeagues, events, opts);
  const htmlParts: string[] = [];

  if (highlightsHTML) {
    const highlightBlock = `${highlightsHTML}<p>&nbsp;</p>`;
    if (hasTabs) {
      htmlParts.push(`<div class="sport-section sport-always">${highlightBlock}</div>`);
    } else {
      htmlParts.push(highlightBlock);
    }
  }

  // ── Render each category group ────────────────────────────────────────────
  for (let gi = 0; gi < catGroups.length; gi++) {
    const group = catGroups[gi];
    const sectionParts: string[] = [];

    // Gap + category header between different categories (non-tab mode)
    if (!hasTabs && gi > 0 && group.cat !== 'Custom') {
      sectionParts.push('<div class="cat-gap"></div>');
    }

    if (opts.showHeader && group.cat !== 'Custom') {
      const catDisplay = opts.catLabels?.[group.cat] || group.cat;
      sectionParts.push(`<h2>\u2013 ${esc(catDisplay)} \u2013</h2>`);
      sectionParts.push('');
    }

    // Render each league in this group
    for (let li = 0; li < group.leagueKeys.length; li++) {
      if (li > 0) {
        // Subtle gap between consecutive leagues in the same category
        sectionParts.push('<br/>');
      }
      const leagueKey = group.leagueKeys[li];
      sectionParts.push(renderLeagueBlock(leagueKey, byLeague.get(leagueKey)!, opts));
    }

    const sectionHTML = sectionParts.join('\n');

    if (hasTabs) {
      const dataCat = group.cat.toLowerCase().replace(/\s+/g, '-');
      htmlParts.push(`<div class="sport-section" data-cat="${dataCat}">${sectionHTML}</div>`);
    } else {
      htmlParts.push(sectionHTML);
    }
  }

  return { html: htmlParts.join('\n'), categories };
}
