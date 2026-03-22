// db-admin.mjs — Run SQL directly against Supabase via Management API
// Usage: node scripts/db-admin.mjs <sql-file-or-inline-sql>
// Examples:
//   node scripts/db-admin.mjs "SELECT table_name FROM information_schema.tables WHERE table_schema='public'"
//   node scripts/db-admin.mjs supabase/migrations/011_embed_instances_view.sql
//   node scripts/db-admin.mjs --list-tables
//   node scripts/db-admin.mjs --list-policies

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { config } from 'dotenv';
import { execSync } from 'child_process';

config({ path: resolve(process.cwd(), '.env.local') });

const REF = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace('https://', '').replace('.supabase.co', '');

// Get access token from Windows Credential Manager using PowerShell
function getToken() {
  try {
    const ps = `
$sig = '[DllImport("advapi32.dll", SetLastError=true, CharSet=CharSet.Unicode)] public static extern bool CredRead(string t, int type, int r, out IntPtr p); [DllImport("advapi32.dll")] public static extern void CredFree(IntPtr p);'
$T = Add-Type -MemberDefinition $sig -Name "CM4" -Namespace "CM4" -PassThru
$p = [IntPtr]::Zero
$ok = [CM4.CM4]::CredRead("Supabase CLI:access-token", 1, 0, [ref]$p)
if ($ok -and $p -ne [IntPtr]::Zero) {
  $bs = [Runtime.InteropServices.Marshal]::ReadInt32($p, 32)
  $bp = [Runtime.InteropServices.Marshal]::ReadIntPtr($p, 40)
  $b = New-Object byte[] $bs
  [Runtime.InteropServices.Marshal]::Copy($bp, $b, 0, $bs)
  [Text.Encoding]::UTF8.GetString($b)
  [CM4.CM4]::CredFree($p)
}`;
    return execSync(`powershell -Command "${ps.replace(/\n/g, '; ').replace(/"/g, '\\"')}"`, { encoding: 'utf8' }).trim();
  } catch {
    // Fallback: token was extracted and can be hardcoded temporarily
    return process.env.SUPABASE_ACCESS_TOKEN || '';
  }
}

async function runSQL(sql, token) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`API ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

const arg = process.argv[2];
const TOKEN = getToken() || process.env.SUPABASE_ACCESS_TOKEN || '';
if (!TOKEN) {
  console.error('Error: No Supabase access token found. Set SUPABASE_ACCESS_TOKEN env var or log in via `npx supabase login`.');
  process.exit(1);
}

const QUERIES = {
  '--list-tables': `SELECT table_name, table_type FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`,
  '--list-policies': `SELECT schemaname, tablename, policyname, cmd, qual FROM pg_policies WHERE schemaname='public' ORDER BY tablename, policyname`,
  '--list-views': `SELECT viewname, definition FROM pg_views WHERE schemaname='public' ORDER BY viewname`,
  '--list-indexes': `SELECT indexname, tablename FROM pg_indexes WHERE schemaname='public' ORDER BY tablename`,
};

let sql;
if (!arg) {
  console.log('Usage: node scripts/db-admin.mjs <sql|file|flag>');
  console.log('Flags:', Object.keys(QUERIES).join(', '));
  process.exit(0);
} else if (QUERIES[arg]) {
  sql = QUERIES[arg];
} else if (existsSync(arg)) {
  sql = readFileSync(arg, 'utf8');
  console.log(`Running file: ${arg}`);
} else {
  sql = arg;
}

const result = await runSQL(sql, TOKEN);
if (Array.isArray(result)) {
  console.table(result);
} else {
  console.log(JSON.stringify(result, null, 2));
}
