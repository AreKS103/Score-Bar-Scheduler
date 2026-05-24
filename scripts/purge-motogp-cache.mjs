// Purge MotoGP-related poisoned cache rows from sportsdb_events_cache.
import { config } from 'dotenv';
config({ path: '.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('missing supabase env'); process.exit(1); }

const { createClient } = await import('@supabase/supabase-js');
const sb = createClient(url, key);

// Match any key for league id 4407 (MotoGP) — covers eventsround/eventsnext/eventspast/eventsseason
const { data: rows, error: e1 } = await sb
  .from('sportsdb_events_cache')
  .select('endpoint')
  .like('endpoint', '%id=4407%');
if (e1) { console.error(e1); process.exit(1); }
console.log('matching rows:', rows?.length ?? 0);
rows?.slice(0, 10).forEach(r => console.log(' ', r.endpoint));

const { error: e2, count } = await sb
  .from('sportsdb_events_cache')
  .delete({ count: 'exact' })
  .like('endpoint', '%id=4407%');
if (e2) { console.error(e2); process.exit(1); }
console.log('deleted:', count);
