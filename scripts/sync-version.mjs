#!/usr/bin/env node
/**
 * sync-version.mjs
 *
 * Reads the latest git tag (e.g. "v0.1.1"), strips the leading "v", and
 * writes that version string into every package.json in the monorepo.
 *
 * Usage:
 *   node scripts/sync-version.mjs          # auto-detect from git tag
 *   node scripts/sync-version.mjs 1.2.3    # set an explicit version
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// Determine version: CLI arg or latest git tag
let version = process.argv[2];
if (!version) {
  try {
    const raw = execSync('git describe --tags --abbrev=0', { cwd: root }).toString().trim();
    version = raw.replace(/^v/, '');
  } catch {
    console.error('No git tag found and no version argument supplied.');
    process.exit(1);
  }
}

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`"${version}" does not look like a valid semver string.`);
  process.exit(1);
}

const packageFiles = [
  resolve(root, 'package.json'),
  resolve(root, 'packages/frontend/package.json'),
  resolve(root, 'packages/backend/package.json'),
];

for (const file of packageFiles) {
  const pkg = JSON.parse(readFileSync(file, 'utf-8'));
  const prev = pkg.version;
  pkg.version = version;
  writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
  console.log(`${file.replace(root + '/', '')}  ${prev} → ${version}`);
}

console.log(`\nVersion synced to ${version}`);
