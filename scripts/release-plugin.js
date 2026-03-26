/**
 * Release script — builds the plugin zip and pushes it to the GitHub
 * "plugin-latest" release so WordPress sites auto-update via the built-in
 * /api/plugin/update endpoint.
 *
 * Prerequisites:
 *   1. Add GITHUB_TOKEN=ghp_... to .env.local  (needs repo + write:packages scope)
 *   2. npm install  (nothing new — uses only built-in Node modules)
 *
 * Usage:
 *   npm run release:plugin
 *   node scripts/release-plugin.js
 *
 * What it does:
 *   1. Reads the version from the "Version:" header in scorebar-scheduler.php
 *   2. Runs build-plugin.js to produce scorebar-scheduler.zip
 *   3. Gets / creates the "plugin-latest" GitHub release
 *   4. Updates the release body to "Plugin version: X.Y.Z"
 *   5. Deletes the old zip asset and uploads the new one
 *
 * After this runs, WordPress installs will detect the update within 5 minutes
 * (the /api/plugin/update response is cached for 5 min on Vercel).
 * To force-check immediately: /wp-admin/plugins.php?force-update-check=1
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const https = require('https');

// ─── Constants ────────────────────────────────────────────────────────────────

const ROOT        = path.resolve(__dirname, '..');
const PHP_PATH    = path.join(ROOT, 'wordpress-plugin', 'scorebar-scheduler.php');
const ZIP_PATH    = path.join(ROOT, 'scorebar-scheduler.zip');
const GITHUB_REPO = 'AreKS103/Score-Bar-Scheduler';
const RELEASE_TAG = 'plugin-latest';

// ─── Load .env.local (no dotenv dependency) ───────────────────────────────────

function loadEnvLocal() {
  const envPath = path.join(ROOT, '.env.local');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    // Don't overwrite vars already set in the environment.
    if (process.env[key] !== undefined) continue;
    let val = trimmed.slice(eq + 1).trim();
    // Strip surrounding quotes.
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

// ─── GitHub API helper (uses built-in https — no axios/node-fetch needed) ────

function ghRequest(method, apiPath, body, binaryBuffer) {
  return new Promise((resolve, reject) => {
    const token = process.env.GITHUB_TOKEN;
    const isUpload = Boolean(binaryBuffer);
    const host = isUpload ? 'uploads.github.com' : 'api.github.com';
    const contentType = isUpload ? 'application/zip' : 'application/json';

    const bodyData = binaryBuffer
      ? binaryBuffer
      : body ? Buffer.from(JSON.stringify(body)) : null;

    const headers = {
      'Authorization':         `Bearer ${token}`,
      'Accept':                'application/vnd.github+json',
      'X-GitHub-Api-Version':  '2022-11-28',
      'User-Agent':            'ScoreBar-ReleaseScript/1.0',
    };
    if (bodyData) {
      headers['Content-Type']   = contentType;
      headers['Content-Length'] = String(bodyData.length);
    }

    const req = https.request(
      { host, path: apiPath, method, headers },
      (res) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json;
          try { json = JSON.parse(text); } catch { json = { _raw: text }; }
          if (res.statusCode >= 400) {
            reject(new Error(`GitHub ${method} ${apiPath} → ${res.statusCode}\n${text.slice(0, 300)}`));
          } else {
            resolve(json);
          }
        });
      }
    );
    req.on('error', reject);
    if (bodyData) req.write(bodyData);
    req.end();
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  loadEnvLocal();

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error('\n❌  GITHUB_TOKEN is not set.');
    console.error('    Add it to .env.local:');
    console.error('    GITHUB_TOKEN=ghp_your_token_here\n');
    console.error('    Create one at https://github.com/settings/tokens');
    console.error('    Required scopes: repo (or just "contents: write")\n');
    process.exit(1);
  }

  // ── 1. Read version ───────────────────────────────────────────────────────
  const phpSrc     = fs.readFileSync(PHP_PATH, 'utf8');
  const verMatch   = phpSrc.match(/^\s*\*\s*Version:\s*([\d.]+)/m);
  if (!verMatch) {
    console.error('❌  Could not find "Version:" header in scorebar-scheduler.php');
    process.exit(1);
  }
  const version = verMatch[1];
  console.log(`\n📦  Plugin version: ${version}`);

  // ── 2. Build zip ──────────────────────────────────────────────────────────
  console.log('\n🔨  Building scorebar-scheduler.zip...\n');
  execSync('node scripts/build-plugin.js', { stdio: 'inherit', cwd: ROOT });
  console.log('');

  if (!fs.existsSync(ZIP_PATH)) {
    console.error('❌  scorebar-scheduler.zip not found after build.');
    process.exit(1);
  }
  const zipBuffer = fs.readFileSync(ZIP_PATH);
  console.log(`✅  Zip ready (${(zipBuffer.length / 1024).toFixed(1)} KB)`);

  // ── 3. Get or create the plugin-latest release ───────────────────────────
  let release;
  try {
    release = await ghRequest('GET', `/repos/${GITHUB_REPO}/releases/tags/${RELEASE_TAG}`);
    console.log(`\n🔍  Found release: "${release.name}" (id=${release.id})`);
  } catch {
    console.log(`\n🆕  Release "${RELEASE_TAG}" not found — creating it...`);
    release = await ghRequest('POST', `/repos/${GITHUB_REPO}/releases`, {
      tag_name:    RELEASE_TAG,
      name:        `Plugin (latest) — v${version}`,
      body:        `Plugin version: ${version}`,
      prerelease:  false,
      make_latest: 'false',
    });
    console.log(`✅  Created release (id=${release.id})`);
  }

  // ── 4. Update release body + name with current version ───────────────────
  await ghRequest('PATCH', `/repos/${GITHUB_REPO}/releases/${release.id}`, {
    name: `Plugin (latest) — v${version}`,
    body: `Plugin version: ${version}`,
  });
  console.log(`✏️   Release body updated → "Plugin version: ${version}"`);

  // ── 5. Delete old zip asset(s) ────────────────────────────────────────────
  const assets = release.assets ?? [];
  for (const asset of assets) {
    if (asset.name.endsWith('.zip')) {
      await ghRequest('DELETE', `/repos/${GITHUB_REPO}/releases/assets/${asset.id}`);
      console.log(`🗑️   Deleted old asset: ${asset.name}`);
    }
  }

  // ── 6. Upload new zip asset ───────────────────────────────────────────────
  console.log('\n⬆️   Uploading scorebar-scheduler.zip to GitHub release...');
  const uploaded = await ghRequest(
    'POST',
    `/repos/${GITHUB_REPO}/releases/${release.id}/assets?name=scorebar-scheduler.zip`,
    null,
    zipBuffer,
  );
  console.log(`✅  Uploaded: ${uploaded.name} (${((uploaded.size ?? 0) / 1024).toFixed(1)} KB)`);

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚀  Done!  Plugin v${version} is live on GitHub.

WordPress sites will detect the update within 5 minutes.
To force an immediate check on a WordPress site:
  /wp-admin/plugins.php?force-update-check=1
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

main().catch((err) => {
  console.error('\n❌  Release failed:', err.message);
  process.exit(1);
});
