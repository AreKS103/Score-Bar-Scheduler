/* eslint-disable no-console */
// Post-deploy live verification. Run AFTER deploying to production:
//   npx tsx scripts/verify-security-hardening.ts
//
// Proves, against the live https://scorebar.vercel.app deployment:
//   1. bogus API key is rejected (401)
//   2. the PUBLIC embed token (scraped from scorekh.com HTML) can no longer
//      register embeds from a foreign domain (tch1.com → 403)
//   3. the same token still works from the legitimate domain (200)
//   4. named-embed DELETE via the public token is refused (403)
//   5. /api/events returns ESPN-sourced events again
export {};

const APP = 'https://scorebar.vercel.app';
const SITE = 'https://scorekh.com/';

async function extractPublicEmbedToken(): Promise<string> {
  const html = await (await fetch(SITE)).text();
  // iframe src: /embed/<token>?...  (token = 64-hex key_hash)
  const m = html.match(/\/embed\/([0-9a-f]{64})/);
  if (m) return m[1];
  // beacon payload fallback: apiKey:'<token>'
  const m2 = html.match(/apiKey:'([0-9a-f]{64})'/);
  if (m2) return m2[1];
  throw new Error('Could not find public embed token in scorekh.com HTML');
}

async function postBeacon(apiKey: string, pageUrl: string) {
  const r = await fetch(`${APP}/api/embed-instances`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey, pageUrl, widgetId: 'verifytest', embedId: 'Security Verify Probe' }),
  });
  return r.status;
}

async function main() {
  let pass = 0, fail = 0;
  const check = (name: string, cond: boolean, detail = '') => {
    if (cond) { pass++; console.log('  ok  -', name, detail); }
    else { fail++; console.log('  FAIL -', name, detail); }
  };

  console.log('1) scraping public embed token from', SITE);
  const token = await extractPublicEmbedToken();
  console.log('   token:', token.slice(0, 12) + '…');

  console.log('2) bogus key rejected:');
  check('bogus key → 401', (await postBeacon('deadbeef'.repeat(8), 'https://scorekh.com/')) === 401);

  console.log('3) foreign-domain beacon blocked:');
  check('tch1.com → 403', (await postBeacon(token, 'https://tch1.com/score/')) === 403);
  check('evil lookalike → 403', (await postBeacon(token, 'https://scorekh.com.evil.example/')) === 403);

  console.log('4) legitimate domain still accepted:');
  check('scorekh.com → 200', (await postBeacon(token, 'https://scorekh.com/')) === 200);

  console.log('5) public token cannot delete named embeds:');
  const del = await fetch(`${APP}/api/embed-instances?embedId=${encodeURIComponent('Home Page')}&apiKey=${token}`, { method: 'DELETE' });
  check('DELETE embedId with public token → 403', del.status === 403, `(got ${del.status})`);

  console.log('6) ESPN pipeline restored:');
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  const end = new Date(today); end.setUTCDate(end.getUTCDate() + 7);
  const ev = await fetch(`${APP}/api/events?startDate=${fmt(today)}&endDate=${fmt(end)}`);
  const payload = await ev.json();
  const events = Array.isArray(payload) ? payload : (payload.events ?? []);
  const espn = events.filter((e: { source?: string }) => e.source === 'espn');
  check('ESPN events present', espn.length > 0, `(${espn.length} espn / ${events.length} total)`);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
