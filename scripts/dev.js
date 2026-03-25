#!/usr/bin/env node
/**
 * Cross-platform dev server launcher.
 *
 * Why this exists:
 *   next.config.ts redirects distDir to AppData/Local to avoid OneDrive
 *   file-lock (EBUSY) errors on Windows. But when compiled server chunks
 *   live in AppData they can't resolve 'react', 'next', etc. via normal
 *   Node module lookup (there is no node_modules in AppData).
 *
 *   Setting NODE_PATH to the project's node_modules folder fixes that.
 *   This must be an absolute path and must be set BEFORE Node initialises
 *   its module-path cache — a plain env-var in package.json arrives too late.
 *
 *   This wrapper sets NODE_PATH programmatically then spawns `next dev`,
 *   inheriting the enriched environment.  Works on Windows, macOS and Linux.
 */

const { spawnSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');

// Prepend project node_modules so AppData-compiled chunks can find react, etc.
const existingPath = process.env.NODE_PATH || '';
process.env.NODE_PATH = existingPath
  ? `${path.join(root, 'node_modules')}${path.delimiter}${existingPath}`
  : path.join(root, 'node_modules');

// next binary (works cross-platform, no shell quoting issues)
const result = spawnSync(
  'next',
  ['dev', '--webpack', '-H', '0.0.0.0'],
  {
    stdio: 'inherit',
    cwd: root,
    env: process.env,
    shell: true, // lets the OS resolve 'next' via node_modules/.bin on all platforms
  }
);

process.exit(result.status ?? 1);
