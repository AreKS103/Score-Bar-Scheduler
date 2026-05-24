// Mimic the exact sdbFetch behavior from the route
const HDR = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept':          'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer':         'https://www.thesportsdb.com/',
};

async function sdbFetch(endpoint) {
  try {
    const res = await fetch(`https://www.thesportsdb.com/api/v1/json/123/${endpoint}`, {
      signal: AbortSignal.timeout(8000),
      headers: HDR,
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const json = await res.json();
    return { data: json.events ?? [] };
  } catch (e) { return { error: e.message }; }
}

// Throttled pool with concurrency 4, 120ms spacing — identical to route
const tasks = [];
for (let r = 1; r <= 25; r++) tasks.push(`eventsround.php?id=4407&r=${r}&s=2026`);

const CONCURRENCY = 4;
const results = [];
let i = 0;
let totalEvents = 0;
await Promise.all(
  Array(CONCURRENCY).fill(null).map(async (_, w) => {
    while (i < tasks.length) {
      const url = tasks[i++];
      const r = await sdbFetch(url);
      if (r.error) console.log(`worker${w} ${url} ERR ${r.error}`);
      else {
        totalEvents += r.data.length;
        console.log(`worker${w} ${url} -> ${r.data.length} events`);
      }
      await new Promise(res => setTimeout(res, 120));
    }
  })
);
console.log(`\nTOTAL: ${totalEvents} events`);
