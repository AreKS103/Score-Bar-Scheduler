import { renderScheduleLayout } from '../src/lib/scheduleLayout';
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
