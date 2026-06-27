import assert from 'node:assert/strict';
import {
  buildTypographyCssVars,
  resolveFontWeight,
  resolveMatchLineSize,
  resolveTypographySizes,
} from '../src/lib/scheduleTypography';
import { renderScheduleLayout } from '../src/lib/scheduleLayout';
import type { MatchEvent } from '../src/types';

assert.equal(resolveMatchLineSize('20', '11'), '20px');
assert.equal(resolveMatchLineSize('', '18'), '18px');
assert.equal(resolveFontWeight('400', '700'), '400');
assert.equal(resolveFontWeight('', '600'), '600');

const sizes = resolveTypographySizes({
  matchFontSize: '22',
  dateFontSize: '10',
  headerSize: '17',
  highlightFontSize: '24',
  venueFontSize: '13',
  timeFontWeight: '500',
  dateFontWeight: '800',
});
assert.match(buildTypographyCssVars(sizes), /--sb-match-size:22px/);
assert.match(buildTypographyCssVars(sizes), /--sb-date-size:10px/);
assert.match(buildTypographyCssVars(sizes), /--sb-league-header-size:17px/);
assert.match(buildTypographyCssVars(sizes), /--sb-section-heading-size:24px/);
assert.match(buildTypographyCssVars(sizes), /--sb-venue-size:13px/);
assert.match(buildTypographyCssVars(sizes), /--sb-time-weight:500/);
assert.match(buildTypographyCssVars(sizes), /--sb-date-weight:800/);
assert.match(buildTypographyCssVars(sizes), /--sb-time-date-gap:12px/);

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
assert.ok(html.includes('sb-lg-datetime'), 'datetime wrapper expected for spacing');
assert.ok(html.includes('sb-section-title') || html.includes('sb-fl-team-name') || html.includes('sb-lg-matchup'), 'schedule content expected');

console.log('schedule-typography-ok');
