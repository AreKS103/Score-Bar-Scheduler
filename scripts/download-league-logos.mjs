#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const configPath = path.join(root, 'src', 'lib', 'config.ts');
const publicDir = path.join(root, 'public');
const outDir = path.join(publicDir, 'league-logos');
const manifestPath = path.join(outDir, 'manifest.json');

function parseLeagueConfigBlocks(configText) {
  const blocks = [...configText.matchAll(/\{[^{}]*id:\s*'([^']+)'[^{}]*\}/g)];
  return blocks.map((match) => {
    const block = match[0];
    const id = match[1];
    const logo = block.match(/logo:\s*'([^']+)'/)?.[1] || '';
    const publishLogo = block.match(/publishLogo:\s*'([^']+)'/)?.[1] || '';
    return { id, logo, publishLogo };
  });
}

function getUrlExtension(urlValue) {
  try {
    const parsed = new URL(urlValue);
    const ext = path.extname(parsed.pathname).toLowerCase();
    return ext || '';
  } catch {
    return '';
  }
}

function getContentTypeExtension(contentType) {
  const type = (contentType || '').toLowerCase();
  if (type.includes('image/svg')) return '.svg';
  if (type.includes('image/png')) return '.png';
  if (type.includes('image/jpeg') || type.includes('image/jpg')) return '.jpg';
  if (type.includes('image/webp')) return '.webp';
  if (type.includes('image/gif')) return '.gif';
  return '';
}

function normalizeExt(ext) {
  if (!ext) return '.png';
  const safe = ext.toLowerCase();
  if (['.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(safe)) {
    return safe === '.jpeg' ? '.jpg' : safe;
  }
  return '.png';
}

async function copyLocalLogo(localPath, targetBase) {
  const src = path.join(publicDir, localPath.replace(/^\//, ''));
  await fs.access(src);
  const ext = normalizeExt(path.extname(src));
  const target = `${targetBase}${ext}`;
  await fs.copyFile(src, target);
  return { target, source: localPath, extension: ext };
}

async function downloadRemoteLogo(urlValue, targetBase) {
  const res = await fetch(urlValue, {
    headers: { 'user-agent': 'score-bar-scheduler-logo-fetcher/1.0' },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const ext = normalizeExt(
    getContentTypeExtension(res.headers.get('content-type')) || getUrlExtension(urlValue)
  );
  const target = `${targetBase}${ext}`;
  await fs.writeFile(target, buffer);
  return { target, source: urlValue, extension: ext };
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });

  const configText = await fs.readFile(configPath, 'utf8');
  const leagues = parseLeagueConfigBlocks(configText);

  const results = [];

  for (const league of leagues) {
    const targetBase = path.join(outDir, league.id);
    const candidates = [league.logo, league.publishLogo].filter(Boolean);

    let done = false;
    let lastError = 'No logo candidates';

    for (const candidate of candidates) {
      try {
        let saved;
        if (candidate.startsWith('/')) {
          saved = await copyLocalLogo(candidate, targetBase);
        } else {
          saved = await downloadRemoteLogo(candidate, targetBase);
        }

        results.push({
          id: league.id,
          ok: true,
          source: saved.source,
          file: path.relative(root, saved.target).replace(/\\/g, '/'),
          extension: saved.extension,
        });
        done = true;
        break;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }

    if (!done) {
      results.push({
        id: league.id,
        ok: false,
        source: null,
        file: null,
        extension: null,
        error: lastError,
      });
    }
  }

  const success = results.filter((r) => r.ok).length;
  const failed = results.length - success;

  await fs.writeFile(
    manifestPath,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), total: results.length, success, failed, results }, null, 2)}\n`,
    'utf8'
  );

  console.log(`Downloaded ${success}/${results.length} league logos to public/league-logos`);
  if (failed > 0) {
    console.log(`Failed: ${failed}. See public/league-logos/manifest.json`);
  }
}

main().catch((error) => {
  console.error('Logo download script failed:', error);
  process.exitCode = 1;
});
