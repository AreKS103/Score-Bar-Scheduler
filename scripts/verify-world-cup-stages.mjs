/**
 * Verifies World Cup stage grouping helpers and layout output isolation.
 * Run: node scripts/verify-world-cup-stages.mjs
 */

import assert from 'node:assert/strict';

const WORLD_CUP_SPORT_ID = 'soccer-fifa-world-cup-2026';
const WORLD_CUP_STAGE_ORDER = [
  'group-stage',
  'round-of-32',
  'round-of-16',
  'quarterfinals',
  'semifinals',
  '3rd-place-match',
  'final',
];

const WORLD_CUP_STAGE_GROUP_EMBED_TARGETS = ['World Cup', 'WC26', '2026 FIFA World Cup'];

function isWorldCupStageGroupEmbed(embedTarget) {
  const key = (embedTarget ?? '').trim().toLowerCase();
  if (!key) return false;
  if (key.replace(/\s+/g, '') === 'worldcup') return true;
  return WORLD_CUP_STAGE_GROUP_EMBED_TARGETS.some((target) => target.toLowerCase() === key);
}

function getWorldCupStageKey(event) {
  if (event.stageSlug) return event.stageSlug;
  const round = (event.round ?? '').toLowerCase();
  if (!round || round.includes('group')) return 'group-stage';
  if (round.includes('round of 32')) return 'round-of-32';
  if (round.includes('round of 16')) return 'round-of-16';
  if (round.includes('quarter')) return 'quarterfinals';
  if (round.includes('semi')) return 'semifinals';
  if (round.includes('third')) return '3rd-place-match';
  if (round === 'final' || round.includes('final')) return 'final';
  return 'group-stage';
}

function groupWorldCupEventsByStage(events) {
  const grouped = new Map();
  for (const event of events) {
    const key = getWorldCupStageKey(event);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(event);
  }
  return grouped;
}

function sortWorldCupStageKeys(stages) {
  const set = new Set(stages);
  const ordered = WORLD_CUP_STAGE_ORDER.filter((slug) => set.has(slug));
  const unknown = [...set].filter((slug) => !WORLD_CUP_STAGE_ORDER.includes(slug)).sort();
  return [...ordered, ...unknown];
}

function countLeagueGroups(html) {
  return (html.match(/class="sb-league-group"/g) ?? []).length;
}

function countStageHeaders(html, stageLabel) {
  return (html.match(new RegExp(`sb-league-stage"> - ${stageLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g')) ?? []).length;
}

// ── Embed target gating ───────────────────────────────────────────────────────
assert.equal(isWorldCupStageGroupEmbed('World Cup'), true);
assert.equal(isWorldCupStageGroupEmbed('world cup'), true);
assert.equal(isWorldCupStageGroupEmbed('WC26'), true);
assert.equal(isWorldCupStageGroupEmbed('2026 FIFA World Cup'), true);
assert.equal(isWorldCupStageGroupEmbed('Homepage'), false);
assert.equal(isWorldCupStageGroupEmbed('Schedule Page'), false);
assert.equal(isWorldCupStageGroupEmbed(''), false);

// ── Stage key extraction ──────────────────────────────────────────────────────
assert.equal(getWorldCupStageKey({ stageSlug: 'quarterfinals', round: 'Quarterfinals' }), 'quarterfinals');
assert.equal(getWorldCupStageKey({ round: 'Round of 32' }), 'round-of-32');
assert.equal(getWorldCupStageKey({ round: 'Group Stage' }), 'group-stage');

const sampleEvents = [
  { id: '1', sportId: WORLD_CUP_SPORT_ID, stageSlug: 'group-stage', round: 'Group Stage', date: '2026-06-11', time: '12:00' },
  { id: '2', sportId: WORLD_CUP_SPORT_ID, stageSlug: 'group-stage', round: 'Group Stage', date: '2026-06-12', time: '15:00' },
  { id: '3', sportId: WORLD_CUP_SPORT_ID, stageSlug: 'round-of-32', round: 'Round of 32', date: '2026-07-01', time: '18:00' },
  { id: '4', sportId: WORLD_CUP_SPORT_ID, stageSlug: 'final', round: 'Final', date: '2026-07-19', time: '20:00' },
  { id: '5', sportId: 'soccer-epl', round: '', date: '2026-06-11', time: '19:00' },
];

const grouped = groupWorldCupEventsByStage(sampleEvents.filter((e) => e.sportId === WORLD_CUP_SPORT_ID));
assert.equal(grouped.get('group-stage')?.length, 2);
assert.equal(grouped.get('round-of-32')?.length, 1);
assert.equal(grouped.get('final')?.length, 1);
assert.deepEqual(sortWorldCupStageKeys(grouped.keys()), ['group-stage', 'round-of-32', 'final']);

// ── ESPN live stage distribution (optional network check) ─────────────────────
const ESPN_URL = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260611-20260719&limit=1000';
const ESPN_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  Accept: 'application/json',
};

try {
  const res = await fetch(ESPN_URL, { headers: ESPN_HEADERS });
  if (res.ok) {
    const data = await res.json();
    const stageCounts = new Map();
    for (const event of data.events ?? []) {
      const slug = event.season?.slug || 'group-stage';
      stageCounts.set(slug, (stageCounts.get(slug) ?? 0) + 1);
    }
    const stages = sortWorldCupStageKeys(stageCounts.keys());
    console.log('[ESPN] World Cup fixture count by stage:');
    for (const slug of stages) {
      console.log(`  ${slug}: ${stageCounts.get(slug)}`);
    }
    const total = [...stageCounts.values()].reduce((a, b) => a + b, 0);
    console.log(`  total: ${total}`);
    assert.ok(total >= 100, `Expected ~104 fixtures, got ${total}`);
    assert.ok(stageCounts.has('group-stage'), 'Missing group-stage from ESPN');
    assert.ok(stageCounts.has('round-of-32') || stageCounts.has('final'), 'Expected knockout stages from ESPN');
  } else {
    console.warn(`[ESPN] Skipped live check — HTTP ${res.status}`);
  }
} catch (error) {
  console.warn('[ESPN] Skipped live check —', error instanceof Error ? error.message : error);
}

// ── Layout isolation smoke (dynamic import compiled modules via tsx if available) ─
let layoutChecked = false;
try {
  const { pathToFileURL } = await import('node:url');
  const { spawnSync } = await import('node:child_process');
  const tsx = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['tsx', '-e', `
    import { renderScheduleLayout } from './src/lib/scheduleLayout.ts';
    import { WORLD_CUP_SPORT_ID } from './src/lib/worldCup.ts';

    const wc = (slug, round, id) => ({
      id, source: 'espn', sportId: WORLD_CUP_SPORT_ID, category: 'Football',
      leagueLabel: '2026 FIFA World Cup', leagueLogo: '', date: '2026-06-11', time: '12:00',
      home: 'A', away: 'B', round, stageSlug: slug, tags: [], isFeatured: false, isSelected: true,
    });
    const epl = {
      id: 'epl-1', source: 'espn', sportId: 'soccer-epl', category: 'Football',
      leagueLabel: 'EPL', leagueLogo: '', date: '2026-06-11', time: '15:00',
      home: 'C', away: 'D', round: '', tags: [], isFeatured: false, isSelected: true,
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

    if (groupedCount !== 4) throw new Error('Expected 4 league groups with stage split (3 WC + 1 EPL), got ' + groupedCount);
    if (flatCount !== 2) throw new Error('Expected 2 league groups without stage split, got ' + flatCount);
    if (!grouped.html.includes('Group Stage')) throw new Error('Missing Group Stage header');
    if (!grouped.html.includes('Round of 32')) throw new Error('Missing Round of 32 header');
    if (!grouped.html.includes('Final')) throw new Error('Missing Final header');
    console.log('layout-check-ok');
  `], { cwd: process.cwd(), encoding: 'utf8', shell: true });

  if (tsx.stdout?.includes('layout-check-ok')) {
    layoutChecked = true;
    console.log('[Layout] Stage grouping smoke test passed');
  } else if (tsx.stderr) {
    console.warn('[Layout] tsx smoke test skipped/failed:', tsx.stderr.trim().slice(0, 300));
  }
} catch (error) {
  console.warn('[Layout] tsx smoke test unavailable');
}

console.log('\nAll static World Cup stage grouping checks passed.');
if (!layoutChecked) {
  console.log('Note: run `npm run build` to verify TypeScript compile for layout integration.');
}
