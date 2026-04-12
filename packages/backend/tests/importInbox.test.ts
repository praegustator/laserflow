import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { startImportInbox, stopImportInbox, INBOX_DIR } from '../src/importInbox.js';
import { wsBroadcaster } from '../src/ws/WebSocketServer.js';

const SIMPLE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10mm" height="10mm" viewBox="0 0 10 10"><rect x="1" y="1" width="8" height="8"/></svg>';

describe('importInbox', () => {
  beforeEach(() => {
    // Clean up inbox directory before each test
    if (fs.existsSync(INBOX_DIR)) {
      for (const f of fs.readdirSync(INBOX_DIR)) {
        fs.unlinkSync(path.join(INBOX_DIR, f));
      }
      fs.rmdirSync(INBOX_DIR);
    }
  });

  afterEach(() => {
    stopImportInbox();
    vi.restoreAllMocks();
    // Clean up
    if (fs.existsSync(INBOX_DIR)) {
      for (const f of fs.readdirSync(INBOX_DIR)) {
        fs.unlinkSync(path.join(INBOX_DIR, f));
      }
      fs.rmdirSync(INBOX_DIR);
    }
  });

  it('creates inbox directory and sentinel file on start', () => {
    startImportInbox();

    expect(fs.existsSync(INBOX_DIR)).toBe(true);
    const sentinelPath = path.join(INBOX_DIR, '.laserflow-server');
    expect(fs.existsSync(sentinelPath)).toBe(true);

    const sentinel = JSON.parse(fs.readFileSync(sentinelPath, 'utf-8'));
    expect(sentinel.pid).toBe(process.pid);
    expect(sentinel.startedAt).toBeTruthy();
  });

  it('removes sentinel file on stop', () => {
    startImportInbox();
    const sentinelPath = path.join(INBOX_DIR, '.laserflow-server');
    expect(fs.existsSync(sentinelPath)).toBe(true);

    stopImportInbox();
    expect(fs.existsSync(sentinelPath)).toBe(false);
  });

  it('processes a valid JSON import file', async () => {
    const broadcastSpy = vi.spyOn(wsBroadcaster, 'broadcast').mockImplementation(() => {});

    startImportInbox();

    // Write an import file
    const importFile = path.join(INBOX_DIR, 'test-import.json');
    fs.writeFileSync(importFile, JSON.stringify({
      svg: SIMPLE_SVG,
      filename: 'TestDesign.svg',
    }));

    // Wait for the poll interval to pick it up (poll is 2s, plus processing time)
    await new Promise(resolve => setTimeout(resolve, 3000));

    // File should be deleted after processing
    expect(fs.existsSync(importFile)).toBe(false);

    // Should have broadcast the svgPushed event
    expect(broadcastSpy).toHaveBeenCalledWith('svgPushed', expect.objectContaining({
      filename: 'TestDesign',
      sourceSvg: SIMPLE_SVG,
    }));
  });

  it('ignores non-JSON files', async () => {
    const broadcastSpy = vi.spyOn(wsBroadcaster, 'broadcast').mockImplementation(() => {});

    startImportInbox();

    // Write a non-JSON file
    const txtFile = path.join(INBOX_DIR, 'readme.txt');
    fs.writeFileSync(txtFile, 'not an import');

    await new Promise(resolve => setTimeout(resolve, 3000));

    // File should NOT be deleted
    expect(fs.existsSync(txtFile)).toBe(true);
    // No broadcast
    expect(broadcastSpy).not.toHaveBeenCalled();

    // Clean up
    fs.unlinkSync(txtFile);
  });

  it('handles invalid JSON gracefully', async () => {
    const broadcastSpy = vi.spyOn(wsBroadcaster, 'broadcast').mockImplementation(() => {});
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    startImportInbox();

    const importFile = path.join(INBOX_DIR, 'bad.json');
    fs.writeFileSync(importFile, '{ not valid json !!!');

    await new Promise(resolve => setTimeout(resolve, 3000));

    // File should be deleted (to prevent re-processing)
    expect(fs.existsSync(importFile)).toBe(false);
    // No broadcast
    expect(broadcastSpy).not.toHaveBeenCalled();
  });

  it('handles missing svg field gracefully', async () => {
    const broadcastSpy = vi.spyOn(wsBroadcaster, 'broadcast').mockImplementation(() => {});
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    startImportInbox();

    const importFile = path.join(INBOX_DIR, 'no-svg.json');
    fs.writeFileSync(importFile, JSON.stringify({ filename: 'test' }));

    await new Promise(resolve => setTimeout(resolve, 3000));

    expect(fs.existsSync(importFile)).toBe(false);
    expect(broadcastSpy).not.toHaveBeenCalled();
  });

  it('uses default filename when not provided', async () => {
    const broadcastSpy = vi.spyOn(wsBroadcaster, 'broadcast').mockImplementation(() => {});

    startImportInbox();

    const importFile = path.join(INBOX_DIR, 'no-name.json');
    fs.writeFileSync(importFile, JSON.stringify({ svg: SIMPLE_SVG }));

    await new Promise(resolve => setTimeout(resolve, 3000));

    expect(broadcastSpy).toHaveBeenCalledWith('svgPushed', expect.objectContaining({
      filename: 'Illustrator Export',
    }));
  });

  it('is safe to call startImportInbox multiple times', () => {
    startImportInbox();
    startImportInbox(); // should not throw or create duplicate timers

    const sentinelPath = path.join(INBOX_DIR, '.laserflow-server');
    expect(fs.existsSync(sentinelPath)).toBe(true);
  });

  it('INBOX_DIR points to ~/.laserflow/import', () => {
    expect(INBOX_DIR).toBe(path.join(os.homedir(), '.laserflow', 'import'));
  });
});
