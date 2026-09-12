/**
 * Build script for the WordPress plugin zip.
 *
 * Output:  scorebar-scheduler.zip
 * Structure inside the zip:
 *   scorebar-scheduler/
 *     scorebar-scheduler.php
 *     uninstall.php
 *     includes/
 *       elementor-widget.php
 *       elementor-editor-sync.js
 *       elementor-init.php
 *       seo.php
 *       settings.php
 *       shortcode.php
 *       banner.php
 *       banner-frontend.js
 *
 * Usage:
 *   node scripts/build-plugin.js
 *   npm run build:plugin
 */

'use strict';

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

// ─── Paths ───────────────────────────────────────────────────────────────────

const ROOT       = path.resolve(__dirname, '..');
const PLUGIN_SRC = path.join(ROOT, 'wordpress-plugin');
const OUT_ZIP    = path.join(ROOT, 'scorebar-scheduler.zip');

// The root folder name INSIDE the zip — WordPress derives the plugin slug from this.
// It MUST match the main PHP filename (without .php) and must never have a version suffix.
const ZIP_ROOT = 'scorebar-scheduler';

// ─── File manifest ───────────────────────────────────────────────────────────
// Each entry is the path relative to wordpress-plugin/, which also becomes
// the path inside "scorebar-scheduler/" in the zip.

const PLUGIN_FILES = [
  'scorebar-scheduler.php',
  'uninstall.php',
  'includes/elementor-widget.php',
  'includes/elementor-editor-sync.js',
  'includes/elementor-init.php',
  'includes/seo.php',
  'includes/settings.php',
  'includes/shortcode.php',
  'includes/banner.php',
  'includes/banner-frontend.js',
  'includes/overflow-diagnostic.php',
];

// ─── Build ───────────────────────────────────────────────────────────────────

async function build() {
  // Remove stale zip
  if (fs.existsSync(OUT_ZIP)) {
    fs.unlinkSync(OUT_ZIP);
    console.log('Removed old scorebar-scheduler.zip\n');
  }

  const output  = fs.createWriteStream(OUT_ZIP);
  const archive = archiver('zip', { zlib: { level: 9 } });

  archive.on('warning', (err) => {
    if (err.code === 'ENOENT') {
      console.warn('Warning:', err.message);
    } else {
      throw err;
    }
  });

  archive.on('error', (err) => { throw err; });

  const done = new Promise((resolve, reject) => {
    output.on('close', resolve);
    output.on('error', reject);
  });

  archive.pipe(output);

  let added = 0;
  let missing = 0;

  for (const relPath of PLUGIN_FILES) {
    const srcAbs  = path.join(PLUGIN_SRC, relPath);
    const zipPath = `${ZIP_ROOT}/${relPath}`;   // e.g.  scorebar-scheduler/uninstall.php

    if (!fs.existsSync(srcAbs)) {
      console.warn(`  ⚠️  MISSING (skipped): ${relPath}`);
      missing++;
      continue;
    }

    archive.file(srcAbs, { name: zipPath });
    console.log(`  + ${zipPath}`);
    added++;
  }

  await archive.finalize();
  await done;

  const sizeKB = (archive.pointer() / 1024).toFixed(1);
  console.log(`\n✅  scorebar-scheduler.zip created (${sizeKB} KB, ${added} files)`);
  if (missing > 0) {
    console.warn(`⚠️  ${missing} file(s) were missing and skipped.`);
  }

  // ── Quick structure check ─────────────────────────────────────────────────
  console.log('\n── Zip contents ─────────────────────────────────────────────');
  const { execSync } = require('child_process');

  // Use PowerShell on Windows, unzip on Unix
  try {
    if (process.platform === 'win32') {
      const result = execSync(
        `powershell -NoProfile -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; ` +
        `[System.IO.Compression.ZipFile]::OpenRead('${OUT_ZIP}').Entries | ` +
        `Select-Object -First 20 -ExpandProperty FullName"`,
        { encoding: 'utf8' }
      );
      console.log(result.trim());
    } else {
      const result = execSync(`unzip -l "${OUT_ZIP}" | head -25`, { encoding: 'utf8' });
      console.log(result.trim());
    }
  } catch {
    console.log('(install unzip / PowerShell to see listing)');
  }
}

build().catch((err) => {
  console.error('\n❌ Build failed:', err.message);
  process.exit(1);
});
