// Sequential calls with different spacings to find the sweet spot
const HDR = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept':          'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer':         'https://www.thesportsdb.com/',
};

async function get(endpoint) {
  try {
    const res = await fetch(`https://www.thesportsdb.com/api/v1/json/123/${endpoint}`, {
      signal: AbortSignal.timeout(8000), headers: HDR,
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const j = await res.json();
    return { data: j.events ?? [] };
  } catch (e) { return { error: e.message }; }
}

// Wait a moment in case prior burst tripped a rate-limit cooldown
console.log('Waiting 10s for any prior rate-limit to clear...');
await new Promise(r => setTimeout(r, 10000));

for (const delay of [400]) {
  console.log(`\n--- SEQUENTIAL, ${delay}ms spacing ---`);
  let total = 0, errs = 0;
  const t0 = Date.now();
  for (let r = 1; r <= 25; r++) {
    const res = await get(`eventsround.php?id=4407&r=${r}&s=2026`);
    if (res.error) { errs++; console.log(`  r=${r}: ${res.error}`); }
    else { total += res.data.length; }
    await new Promise(rr => setTimeout(rr, delay));
  }
  console.log(`total: ${total} events, errors: ${errs}, elapsed: ${Date.now() - t0}ms`);
}
