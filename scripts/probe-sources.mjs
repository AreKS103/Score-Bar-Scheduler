// Probe TheSportsDB round-by-round + official MotoGP API
const HDR = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': 'application/json' };

async function get(url) {
  try {
    const r = await fetch(url, { headers: HDR, signal: AbortSignal.timeout(15000) });
    if (!r.ok) return { error: `HTTP ${r.status}` };
    return await r.json();
  } catch (e) { return { error: e.message }; }
}

(async () => {
  console.log('========== TheSportsDB MotoGP round-by-round 2026 (rounds 1-15) ==========');
  let total = 0;
  for (let r = 1; r <= 15; r++) {
    const j = await get(`https://www.thesportsdb.com/api/v1/json/123/eventsround.php?id=4407&r=${r}&s=2026`);
    if (j.error) { console.log(`round ${r}: FAILED ${j.error}`); continue; }
    const ev = j.events || [];
    console.log(`round ${r}: ${ev.length} events`);
    for (const e of ev) {
      console.log(`    ${e.idEvent}  ${e.dateEvent} ${e.strTime}  '${e.strEvent}'  status=${e.strStatus}`);
      total++;
    }
    await new Promise(r => setTimeout(r, 150));
  }
  console.log(`TOTAL events across rounds: ${total}`);

  console.log('\n========== Official MotoGP API — seasons ==========');
  const seasons = await get('https://api.motogp.pulselive.com/motogp/v1/results/seasons');
  if (seasons.error) { console.log('FAILED:', seasons.error); }
  else {
    console.log('seasons:', seasons.length);
    seasons.slice(0, 5).forEach(s => console.log(`  id=${s.id}  year=${s.year}  current=${s.current}`));
    const s2026 = seasons.find(s => s.year === 2026);
    if (s2026) {
      console.log(`\nFetching events for season ${s2026.id} (year 2026)…`);
      const ev = await get(`https://api.motogp.pulselive.com/motogp/v1/results/events?seasonUuid=${s2026.id}&isFinished=false`);
      if (ev.error) { console.log('FAILED:', ev.error); }
      else {
        console.log('upcoming events:', ev.length);
        ev.slice(0, 30).forEach(e => console.log(`  ${e.id}  ${e.date_start}  to ${e.date_end}  '${e.name}'  status=${e.status}  test=${e.test}`));
      }
      const evAll = await get(`https://api.motogp.pulselive.com/motogp/v1/results/events?seasonUuid=${s2026.id}`);
      if (!evAll.error) console.log(`\nALL events for 2026: ${evAll.length}`);
    }
  }

  console.log('\n========== ESPN tennis event 172-2026 full structure ==========');
  const espn = await get('https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard?dates=20260518&limit=1000');
  if (!espn.error) {
    const rg = (espn.events || []).find(e => e.id === '172-2026') || (espn.events || [])[0];
    if (rg) {
      console.log('event keys:', Object.keys(rg));
      console.log('id:', rg.id, 'date:', rg.date, 'endDate:', rg.endDate, 'shortName:', rg.shortName);
      console.log('groupings count:', (rg.groupings || []).length);
      if (rg.groupings) {
        for (const g of rg.groupings) {
          const comps = g.competitions || [];
          const tba = comps.filter(c => {
            const cs = c.competitors || [];
            return !cs.find(x => x.athlete?.displayName) || cs.length === 0;
          }).length;
          console.log(`  draw ${g.grouping.slug}: ${comps.length} comps, ${tba} TBA`);
        }
      }
    } else console.log('no events for 2026-05-18');
  }
})();
