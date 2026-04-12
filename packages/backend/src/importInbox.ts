/**
 * File-based SVG import inbox.
 *
 * Watches a directory for `.json` files dropped by the Illustrator
 * "Send to Laserflow" plugin (or any other tool).  Each file is expected
 * to contain `{ svg: string, filename?: string }`.
 *
 * This provides a reliable import path for environments where ExtendScript
 * has no networking (no system.callSystem, no Socket, etc.).
 *
 * The directory defaults to `~/.laserflow/import/` but can be changed at
 * runtime via setInboxDir() (exposed through the settings API).
 *
 * Lifecycle:
 *   startImportInbox()  — creates the directory, writes a sentinel file,
 *                          and begins polling for new files.
 *   stopImportInbox()   — stops polling and removes the sentinel.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parseSvg } from './cam/SvgParser.js';
import { wsBroadcaster } from './ws/WebSocketServer.js';

/** Default inbox directory. */
const DEFAULT_INBOX_DIR = path.join(os.homedir(), '.laserflow', 'import');

/** Current active inbox directory (can be changed at runtime). */
let currentInboxDir = DEFAULT_INBOX_DIR;

/** Return the current inbox directory path. */
export function getInboxDir(): string {
  return currentInboxDir;
}

/**
 * Change the inbox directory.  Restarts polling if it was already active.
 * The path is resolved to an absolute path and must be under the user's
 * home directory to prevent path-injection attacks.
 * Returns the resolved absolute path, or throws on invalid input.
 */
export function setInboxDir(dir: string): string {
  const resolved = path.resolve(dir);

  // Safety: only allow directories under the user's home or /tmp.
  const home = os.homedir();
  const allowed = [home, os.tmpdir()];
  const isAllowed = allowed.some((prefix) => resolved === prefix || resolved.startsWith(prefix + path.sep));
  if (!isAllowed) {
    throw new Error(`Import inbox must be under the user home directory (${home}) or temp directory.`);
  }

  if (resolved === currentInboxDir) return resolved;

  const wasRunning = pollTimer !== null;
  if (wasRunning) stopImportInbox();

  currentInboxDir = resolved;

  if (wasRunning) startImportInbox();
  return resolved;
}

let pollTimer: ReturnType<typeof setInterval> | null = null;

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Start watching the inbox directory for new `.json` import files.
 * Safe to call multiple times (subsequent calls are no-ops).
 */
export function startImportInbox(): void {
  if (pollTimer) return; // already running

  fs.mkdirSync(currentInboxDir, { recursive: true });
  writeSentinel();

  // Poll every 2 seconds — lightweight (single readdir on a tiny directory).
  pollTimer = setInterval(scanInbox, 2000);
  // Run once immediately so files already present get picked up.
  scanInbox();
}

/**
 * Stop the inbox watcher and clean up the sentinel file.
 */
export function stopImportInbox(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  removeSentinel();
}

// ── Internals ──────────────────────────────────────────────────────────

function sentinelPath(): string {
  return path.join(currentInboxDir, '.laserflow-server');
}

function writeSentinel(): void {
  const data = JSON.stringify({
    pid: process.pid,
    port: parseInt(process.env['PORT'] ?? '3001', 10),
    startedAt: new Date().toISOString(),
  });
  fs.writeFileSync(sentinelPath(), data, 'utf-8');
}

function removeSentinel(): void {
  try {
    fs.unlinkSync(sentinelPath());
  } catch {
    // file may already be gone
  }
}

/** Scan the inbox directory and process any `.json` files. */
function scanInbox(): void {
  let entries: string[];
  try {
    entries = fs.readdirSync(currentInboxDir);
  } catch {
    return; // directory may have been deleted externally
  }

  for (const name of entries) {
    if (!name.endsWith('.json')) continue;
    const filePath = path.join(currentInboxDir, name);
    processImportFile(filePath);
  }
}

async function processImportFile(filePath: string): Promise<void> {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return; // file disappeared or is still being written
  }

  // Delete the file immediately to prevent re-processing on next poll.
  try {
    fs.unlinkSync(filePath);
  } catch {
    // If we can't delete it, skip to avoid duplicate processing.
    return;
  }

  let body: { svg?: string; filename?: string };
  try {
    body = JSON.parse(raw);
  } catch {
    console.error('[importInbox] Invalid JSON in', path.basename(filePath));
    return;
  }

  if (typeof body.svg !== 'string' || body.svg.trim().length === 0) {
    console.error('[importInbox] Missing or empty svg field in', path.basename(filePath));
    return;
  }

  const svgContent = body.svg;
  let filename = body.filename ?? 'Illustrator Export';
  filename = filename.replace(/\.svg$/i, '');

  try {
    const geometry = await parseSvg(svgContent);
    const payload = { geometry, sourceSvg: svgContent, filename };
    wsBroadcaster.broadcast('svgPushed', payload);
    console.log('[importInbox] Imported "%s" (%d shape(s))', filename, geometry.length);
  } catch (err) {
    console.error('[importInbox] SVG parse error for', filename, err);
  }
}
