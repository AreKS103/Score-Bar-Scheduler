/* eslint-disable no-console */
// Logic unit checks for the embed-instances hardening (pure functions,
// replicated 1:1 from the route so no server/env is needed).
export {};

function hostOf(url: string): string {
  try { return new URL(url).hostname.toLowerCase(); } catch { return ''; }
}
function domainAllowed(host: string, allowed: string[]): boolean {
  if (!host) return false;
  return allowed.some((d) => {
    const dom = d.toLowerCase().trim();
    return dom !== '' && (host === dom || host.endsWith(`.${dom}`));
  });
}

const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;
const keyRequests = new Map<string, number[]>();
function isRateLimited(key: string): boolean {
  const now = Date.now();
  const timestamps = (keyRequests.get(key) ?? []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  timestamps.push(now);
  keyRequests.set(key, timestamps);
  return timestamps.length > RATE_LIMIT_MAX;
}

let pass = 0, fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log('  ok  -', name); }
  else { fail++; console.log('  FAIL -', name); }
}

console.log('domain allowlist:');
check('scorekh.com beacon allowed', domainAllowed(hostOf('https://scorekh.com/sports-schedule/'), ['scorekh.com']));
check('www subdomain allowed', domainAllowed(hostOf('https://www.scorekh.com/'), ['scorekh.com']));
check('deep subdomain allowed', domainAllowed(hostOf('https://staging.scorekh.com/'), ['scorekh.com']));
check('tch1.com blocked', !domainAllowed(hostOf('https://tch1.com/score/'), ['scorekh.com']));
check('lookalike blocked (scorekh.com.evil.com)', !domainAllowed(hostOf('https://scorekh.com.evil.com/'), ['scorekh.com']));
check('suffix attack blocked (notscorekh.com)', !domainAllowed(hostOf('https://notscorekh.com/'), ['scorekh.com']));
check('empty pageUrl blocked', !domainAllowed(hostOf(''), ['scorekh.com']));
check('garbage pageUrl blocked', !domainAllowed(hostOf('not a url'), ['scorekh.com']));
check('localhost dev key works', domainAllowed(hostOf('http://scheduler.local/'), ['scheduler.local', 'localhost']));

console.log('rate limiter:');
let blocked = 0;
for (let i = 0; i < 40; i++) if (isRateLimited('key-a')) blocked++;
check('first 30 pass, next 10 blocked', blocked === 10);
check('other key unaffected', !isRateLimited('key-b'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
