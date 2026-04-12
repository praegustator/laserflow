/**
 * File-based SVG import inbox.
 *
 * Watches `~/.laserflow/import/` for `.json` files dropped by the
 * Illustrator "Send to Laserflow" plugin (or any other tool).  Each file
 * is expected to contain `{ svg: string, filename?: string }`.
 *
 * This provides a reliable import path for environments where ExtendScript
 * has no networking (no system.callSystem, no Socket, etc.).
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

/** Directory that plugin / external tools write import files into. */
export const INBOX_DIR = path.join(os.homedir(), '.laserflow', 'import');

/** Sentinel file the backend writes so the plugin can detect a running server. */
const SENTINEL_FILE = path.join(INBOX_DIR, '.laserflow-server');

let pollTimer: ReturnType<typeof setInterval> | null = null;

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Start watching the inbox directory for new `.json` import files.
 * Safe to call multiple times (subsequent calls are no-ops).
 */
export function startImportInbox(): void {
  if (pollTimer) return; // already running

  fs.mkdirSync(INBOX_DIR, { recursive: true });
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

function writeSentinel(): void {
  const data = JSON.stringify({
    pid: process.pid,
    port: parseInt(process.env['PORT'] ?? '3001', 10),
    startedAt: new Date().toISOString(),
  });
  fs.writeFileSync(SENTINEL_FILE, data, 'utf-8');
}

function removeSentinel(): void {
  try {
    fs.unlinkSync(SENTINEL_FILE);
  } catch {
    // file may already be gone
  }
}

/** Scan the inbox directory and process any `.json` files. */
function scanInbox(): void {
  let entries: string[];
  try {
    entries = fs.readdirSync(INBOX_DIR);
  } catch {
    return; // directory may have been deleted externally
  }

  for (const name of entries) {
    if (!name.endsWith('.json')) continue;
    const filePath = path.join(INBOX_DIR, name);
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
