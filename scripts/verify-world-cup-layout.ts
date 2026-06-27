import {
  renderScheduleLayout,
  buildFilterTabsHTML,
  getActiveScheduleCategories,
} from '../src/lib/scheduleLayout';
import { WORLD_CUP_SPORT_ID } from '../src/lib/worldCup';
import type { MatchEvent } from '../src/types';

const base = (overrides: Partial<MatchEvent>): MatchEvent => ({
  id: 'x',
  source: 'espn',
  sportId: 'soccer-epl',
  category: 'Football',
  leagueLabel: 'EPL',
  leagueLogo: '',
  date: '2026-06-11',
  time: '12:00',
  home: 'A',
  away: 'B',
  round: '',
  tags: [],
  isFeatured: false,
  isSelected: true,
  ...overrides,
});

const wc = (slug: string, round: string, id: string): MatchEvent => base({
  id,
  sportId: WORLD_CUP_SPORT_ID,
  leagueLabel: '2026 FIFA World Cup',
  round,
  stageSlug: slug,
});

const events = [
  wc('group-stage', 'Group Stage', 'wc-1'),
  wc('round-of-32', 'Round of 32', 'wc-2'),
  wc('final', 'Final', 'wc-3'),
  base({ id: 'epl-1' }),
];

const grouped = renderScheduleLayout(events, undefined, new Map(), {
  groupWorldCupByStage: true,
  showDateMonth: true,
});
const flat = renderScheduleLayout(events, undefined, new Map(), { groupWorldCupByStage: false });

const groupedCount = (grouped.html.match(/class="sb-league-group"/g) ?? []).length;
const flatCount = (flat.html.match(/class="sb-league-group"/g) ?? []).length;

if (groupedCount !== 4) throw new Error(`Expected 4 grouped league cards, got ${groupedCount}`);
if (flatCount !== 2) throw new Error(`Expected 2 flat league cards, got ${flatCount}`);
if (!grouped.html.includes('JUNE')) throw new Error('World Cup embed dates should include month name');
if (flat.html.includes('JUNE')) throw new Error('Non-World Cup layout should not append month to dates');

console.log(`layout-ok grouped=${groupedCount} flat=${flatCount}`);

const wcOnly = events.filter((e) => e.sportId === WORLD_CUP_SPORT_ID);
if (buildFilterTabsHTML(wcOnly) !== '') throw new Error('Single-category schedule should hide filter tabs');
if (getActiveScheduleCategories(wcOnly).length !== 1) {
  throw new Error('World Cup-only schedule should have one category');
}

const multiSport = [
  base({ id: 'epl-1' }),
  base({ id: 'afl-1', sportId: 'afl', category: 'Australian Football', leagueLabel: 'AFL' }),
];
const multiTabs = buildFilterTabsHTML(multiSport);
if (!multiTabs.includes('Football') || !multiTabs.includes('Australian Football')) {
  throw new Error('Expected Football and Australian Football tabs');
}
if (multiTabs.includes('Golf') || multiTabs.includes('Tennis')) {
  throw new Error('Filter tabs should not include absent categories');
}

const mixedEmbed = [
  base({ id: 'top14-1', sportId: 'rugby-top14', category: 'Rugby', leagueLabel: 'Top 14', away: '' }),
  base({ id: 'pga-1', sportId: 'golf-pga', category: 'Golf', leagueLabel: 'PGA Tour', away: '' }),
  base({ id: 'lpga-1', sportId: 'golf-lpga', category: 'Golf', leagueLabel: 'LPGA Tour', away: '' }),
  base({ id: 'wta-1', sportId: 'tennis-wta', category: 'Tennis', leagueLabel: 'WTA Tour', away: '' }),
  base({ id: 'f1-1', sportId: 'f1', category: 'Motorsport', leagueLabel: 'Formula 1', away: '' }),
];
const mixedTabs = buildFilterTabsHTML(mixedEmbed);
for (const label of ['Rugby', 'Golf', 'Tennis', 'Motorsport']) {
  if (!mixedTabs.includes(label)) throw new Error(`Missing ${label} filter tab`);
}
if (mixedTabs.includes('Football') || mixedTabs.includes('Cricket')) {
  throw new Error('Filter tabs should only include categories in the schedule');
}

const mixedHtml = renderScheduleLayout(mixedEmbed, undefined, new Map()).html;
if (!mixedHtml.includes('data-filter-golf="1"')) throw new Error('Golf rows missing filter attribute');
if (!mixedHtml.includes('data-filter-motorsport="1"')) throw new Error('Motorsport rows missing filter attribute');

console.log('filter-tabs-ok');
