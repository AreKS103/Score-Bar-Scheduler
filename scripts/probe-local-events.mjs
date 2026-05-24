// Probe local /api/events for tennis (Roland Garros) + MotoGP (Italy GP)
const url = 'http://localhost:3000/api/events?start=2026-05-23&end=2026-06-07&tz=America%2FNew_York';
console.log('GET', url);
const t0 = Date.now();
const res = await fetch(url);
const text = await res.text();
console.log('status:', res.status, 'ms:', Date.now() - t0, 'bytes:', text.length);
let json;
try { json = JSON.parse(text); } catch { console.log('non-json head:', text.slice(0, 400)); process.exit(1); }
const events = Array.isArray(json) ? json : (json.events || []);
console.log('events:', events.length);

const tennis = events.filter(e => /tennis|atp|wta/i.test(e.sportId || '') || e.category === 'Tennis');
const motogp = events.filter(e => e.sportId === 'motogp');
const rg = events.filter(e => /roland|french/i.test(e.leagueLabel || '') || /roland|french/i.test(e.home || ''));
const italyGP = events.filter(e => /italy/i.test(e.leagueLabel || '') && e.sportId === 'motogp');

console.log(`\nTennis events: ${tennis.length}`);
tennis.slice(0, 15).forEach(e => console.log(`  ${e.date} ${e.time}  ${e.sportId}  ${e.leagueLabel}  ${e.home} vs ${e.away}  round=${e.round}`));

console.log(`\nMotoGP events: ${motogp.length}`);
motogp.forEach(e => console.log(`  ${e.date} ${e.time}  ${e.leagueLabel}  ${e.home}  round=${e.round}`));

console.log(`\nRoland Garros / French Open matches: ${rg.length}`);
rg.slice(0, 10).forEach(e => console.log(`  ${e.date} ${e.time}  ${e.leagueLabel}  ${e.home} vs ${e.away}`));

console.log(`\nItaly MotoGP entries: ${italyGP.length}`);
italyGP.forEach(e => console.log(`  ${e.date} ${e.time}  ${e.home}`));
