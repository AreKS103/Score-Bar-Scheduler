/**
 * run-migrations.mjs
 * Executes SQL migration files against Supabase using the service role key.
 * Usage: node scripts/run-migrations.mjs [migration-file.sql]
 *   - With file arg: runs just that file
 *   - Without arg:   shows which migrations are tracked/untracked
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// Run arbitrary SQL via the Supabase REST API postgres endpoint
async function runSQL(sql) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });

  // If exec_sql RPC not available, fall back to the pg endpoint
  if (res.status === 404) {
    const res2 = await fetch(`${SUPABASE_URL}/pg/query`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    });
    const body2 = await res2.text();
    if (!res2.ok) throw new Error(`HTTP ${res2.status}: ${body2}`);
    return body2;
  }

  const body = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body}`);
  return body;
}

const MIGRATIONS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../supabase/migrations');
const arg = process.argv[2];

if (arg) {
  // Run a specific file
  const filePath = arg.includes('/') || arg.includes('\\') ? arg : join(MIGRATIONS_DIR, arg);
  const sql = readFileSync(filePath, 'utf8');
  console.log(`Running: ${filePath}`);
  try {
    await runSQL(sql);
    console.log('✓ Done');
  } catch (err) {
    console.error('✗ Error:', err.message);
  }
} else {
  // List migration files
  const files = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();
  console.log('\nMigration files in supabase/migrations/:');
  files.forEach(f => console.log('  -', f));
  console.log('\nRun a specific migration:');
  console.log('  node scripts/run-migrations.mjs 011_embed_instances_view.sql\n');
}
