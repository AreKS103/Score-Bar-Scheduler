import assert from 'node:assert/strict';
import {
  nationsMatchupKey,
  stripRugbyTeamSuffix,
  NATIONS_CHAMPIONSHIP_SPORT_ID,
} from '../src/lib/nationsChampionship';
import { parseSDBFightEvent } from '../src/lib/sportsdbCombat';
import { SPORTS_CONFIG } from '../src/lib/config';

assert.equal(stripRugbyTeamSuffix('England Rugby'), 'England');
assert.equal(nationsMatchupKey('France', 'New Zealand'), 'france|new zealand');

const boxing = parseSDBFightEvent('Teofimo Lopez vs Shakur Stevenson', '4445');
assert.equal(boxing.home, 'Teofimo Lopez');
assert.equal(boxing.away, 'Shakur Stevenson');

const ufc = parseSDBFightEvent('UFC 326 Holloway vs Oliveira 2', '4443');
assert.equal(ufc.cardName, 'UFC 326');

const nc = SPORTS_CONFIG.find((s) => s.id === NATIONS_CHAMPIONSHIP_SPORT_ID);
assert.ok(nc, 'Nations Championship should be in SPORTS_CONFIG');
assert.equal(nc?.sportsdbId, '5852');

console.log('sports-feed-ok');
