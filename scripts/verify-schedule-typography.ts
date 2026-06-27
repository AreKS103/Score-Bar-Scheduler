import assert from 'node:assert/strict';
import {
  buildTypographyCssVars,
  resolveMatchLineSize,
  resolveTypographySizes,
} from '../src/lib/scheduleTypography';
import { renderScheduleLayout } from '../src/lib/scheduleLayout';
import type { MatchEvent } from '../src/types';

assert.equal(resolveMatchLineSize('20', '11'), '20px');
assert.equal(resolveMatchLineSize('', '18'), '18px');

const sizes = resolveTypographySizes({
  matchFontSize: '22',
  dateFontSize: '10',
  headerSize: '17',
  highlightFontSize: '24',
});
assert.match(buildTypographyCssVars(sizes), /--sb-match-size:22px/);
assert.match(buildTypographyCssVars(sizes), /--sb-date-size:10px/);
assert.match(buildTypographyCssVars(sizes), /--sb-league-header-size:17px/);
assert.match(buildTypographyCssVars(sizes), /--sb-section-heading-size:24px/);

const event: MatchEvent = {
  id: '1',
  source: 'espn',
  sportId: 'golf-pga',
  category: 'Golf',
  leagueLabel: 'PGA Tour',
  leagueLogo: '',
  date: '2026-06-25',
  time: '11:00',
  home: 'Travelers Championship',
  away: '',
  round: '',
  tags: [],
  isFeatured: true,
  isSelected: true,
  venue: 'TPC River Highlands',
};

const { html } = renderScheduleLayout([event], undefined, new Map(), { showTime: true });
assert.ok(html.includes('sb-fl-venue'), 'featured venue markup expected');
assert.ok(html.includes('sb-section-title') || html.includes('sb-fl-team-name') || html.includes('sb-lg-matchup'), 'schedule content expected');

console.log('schedule-typography-ok');
