import { renderScheduleLayout, buildFilterTabsHTML, getActiveScheduleFilterKeys } from '../src/lib/scheduleLayout';
import { WORLD_CUP_SPORT_ID } from '../src/lib/worldCup';
import type { MatchEvent } from '../src/types';

const wc = (slug: string, round: string, id: string): MatchEvent => ({
  id,
  source: 'espn',
  sportId: WORLD_CUP_SPORT_ID,
  category: 'Football',
  leagueLabel: '2026 FIFA World Cup',
  leagueLogo: '',
  date: '2026-06-11',
  time: '12:00',
  home: 'A',
  away: 'B',
  round,
  stageSlug: slug,
  tags: [],
  isFeatured: false,
  isSelected: true,
});

const epl: MatchEvent = {
  id: 'epl-1',
  source: 'espn',
  sportId: 'soccer-epl',
  category: 'Football',
  leagueLabel: 'EPL',
  leagueLogo: '',
  date: '2026-06-11',
  time: '15:00',
  home: 'C',
  away: 'D',
  round: '',
  tags: [],
  isFeatured: false,
  isSelected: true,
};

const events = [
  wc('group-stage', 'Group Stage', 'wc-1'),
  wc('round-of-32', 'Round of 32', 'wc-2'),
  wc('final', 'Final', 'wc-3'),
  epl,
];

const grouped = renderScheduleLayout(events, undefined, new Map(), { groupWorldCupByStage: true });
const flat = renderScheduleLayout(events, undefined, new Map(), { groupWorldCupByStage: false });

const groupedCount = (grouped.html.match(/class="sb-league-group"/g) ?? []).length;
const flatCount = (flat.html.match(/class="sb-league-group"/g) ?? []).length;

if (groupedCount !== 4) throw new Error(`Expected 4 grouped league cards, got ${groupedCount}`);
if (flatCount !== 2) throw new Error(`Expected 2 flat league cards, got ${flatCount}`);
if (!grouped.html.includes('Group Stage')) throw new Error('Missing Group Stage header');
if (!grouped.html.includes('Round of 32')) throw new Error('Missing Round of 32 header');
if (!grouped.html.includes('Final')) throw new Error('Missing Final header');

console.log(`layout-ok grouped=${groupedCount} flat=${flatCount}`);

const wcOnly = events.filter((e) => e.sportId === WORLD_CUP_SPORT_ID);
if (buildFilterTabsHTML(wcOnly) !== '') throw new Error('World Cup-only schedule should hide filter tabs');
if (getActiveScheduleFilterKeys(wcOnly).length !== 1) {
  throw new Error('World Cup-only schedule should have one active filter key');
}

const footballOnly = [...wcOnly, epl];
if (buildFilterTabsHTML(footballOnly) !== '') {
  throw new Error('Single-sport football schedule should hide filter tabs');
}

const multiSport = [
  ...wcOnly,
  { ...epl, id: 'afl-1', sportId: 'afl', category: 'Australian Football', leagueLabel: 'AFL' },
];
const multiTabs = buildFilterTabsHTML(multiSport);
if (!multiTabs.includes('Football') || !multiTabs.includes('AFL')) {
  throw new Error('Expected Football and AFL tabs for multi-sport schedule');
}
if (multiTabs.includes('F1') || multiTabs.includes('MotoGP') || multiTabs.includes('NRL')) {
  throw new Error('Filter tabs should not include sports absent from schedule');
}

console.log('filter-tabs-ok');
