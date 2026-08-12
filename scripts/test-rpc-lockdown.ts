/* eslint-disable no-console */
// Verifies that the SECURITY DEFINER lockdown (migration 044) works:
// calls each RPC with the anon key via PostgREST and expects 401/403.
export {};

const ANON = process.argv[2];
const BASE = 'https://qdixepzbsboqpewzlfvy.supabase.co/rest/v1/rpc';
if (!ANON) { console.error('usage: tsx test-rpc-lockdown.ts <anon-key>'); process.exit(2); }

async function probe(fn: string, body: unknown) {
  const r = await fetch(`${BASE}/${fn}`, {
    method: 'POST',
    headers: { apikey: ANON!, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  return { status: r.status, body: text.slice(0, 120) };
}

async function main() {
  const tests: Array<[string, unknown]> = [
    ['find_user_by_email', { target_email: 'test@example.com' }],
    ['resolve_user_emails', { user_ids: ['00000000-0000-0000-0000-000000000000'] }],
    ['user_org_ids', { uid: '00000000-0000-0000-0000-000000000000' }],
  ];
  let fail = 0;
  for (const [fn, body] of tests) {
    const r = await probe(fn, body);
    const blocked = r.status === 401 || r.status === 403;
    if (!blocked) fail++;
    console.log(`${blocked ? 'ok  ' : 'FAIL'}  ${fn} → HTTP ${r.status} ${r.body}`);
  }
  process.exit(fail ? 1 : 0);
}
main();
