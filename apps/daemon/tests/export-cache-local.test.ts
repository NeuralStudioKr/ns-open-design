import { mkdtempSync, rmSync } from 'node:fs';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LocalFileExportCacheStore } from '../src/export-cache-local.js';

const KEY_A = 'a'.repeat(64);
const KEY_B = 'b'.repeat(64);

describe('LocalFileExportCacheStore', () => {
  let cacheDir = '';
  let store: LocalFileExportCacheStore;

  beforeEach(async () => {
    cacheDir = mkdtempSync(path.join(tmpdir(), 'od-export-cache-'));
    store = new LocalFileExportCacheStore(cacheDir);
  });

  afterEach(async () => {
    if (cacheDir) rmSync(cacheDir, { recursive: true, force: true });
    delete process.env.OD_EXPORT_CACHE_LOCAL_ENABLED;
    delete process.env.OD_EXPORT_CACHE_LOCAL_MAX_TOTAL_BYTES;
    delete process.env.OD_EXPORT_CACHE_LOCAL_MAX_AGE_SEC;
  });

  it('miss returns null when the cache is empty', async () => {
    expect(await store.get(KEY_A)).toBeNull();
    const metrics = await store.collectMetrics();
    expect(metrics.entries).toBe(0);
    expect(metrics.totalBytes).toBe(0);
  });

  it('put + get round-trips bytes via filePath (no RAM double-buffer)', async () => {
    const bytes = Buffer.from('%PDF-1.4 seed');
    const put = await store.put({
      key: KEY_A,
      body: bytes,
      mime: 'application/pdf',
      filename: 'seed.pdf',
      format: 'pdf',
    });
    expect(put).not.toBeNull();
    expect(put?.filePath).toBeTruthy();
    expect(put?.source).toBe('hit-local');

    const hit = await store.get(KEY_A);
    expect(hit).not.toBeNull();
    expect(hit?.source).toBe('hit-local');
    expect(hit?.filePath).toBe(put?.filePath);
    const contents = await fs.readFile(hit!.filePath!);
    expect(contents.equals(bytes)).toBe(true);

    const meta = await store.collectMetrics();
    expect(meta.entries).toBe(1);
    expect(meta.totalBytes).toBe(bytes.byteLength);
  });

  it('rejects non-hex keys (no path escape)', async () => {
    await expect(
      store.put({
        key: '../etc/passwd',
        body: Buffer.from('x'),
        mime: 'text/plain',
        filename: 'x',
        format: 'pdf',
      }),
    ).resolves.toBeNull();
    expect(await store.get('../etc/passwd')).toBeNull();
  });

  it('places files under a two-char hash prefix directory', async () => {
    await store.put({
      key: KEY_A,
      body: Buffer.from('x'),
      mime: 'application/pdf',
      filename: 'x.pdf',
      format: 'pdf',
    });
    const prefixDir = path.join(cacheDir, 'aa');
    const entries = await fs.readdir(prefixDir);
    expect(entries).toContain(`${KEY_A}.pdf`);
    expect(entries).toContain(`${KEY_A}.meta.json`);
  });

  it('invalidate removes payload + meta', async () => {
    await store.put({
      key: KEY_A,
      body: Buffer.from('x'),
      mime: 'application/pdf',
      filename: 'x.pdf',
      format: 'pdf',
    });
    await store.invalidate!(KEY_A);
    expect(await store.get(KEY_A)).toBeNull();
    const meta = await store.collectMetrics();
    expect(meta.entries).toBe(0);
  });

  it('enforceCaps evicts oldest entries beyond OD_EXPORT_CACHE_LOCAL_MAX_TOTAL_BYTES', async () => {
    process.env.OD_EXPORT_CACHE_LOCAL_MAX_TOTAL_BYTES = '10';
    await store.put({
      key: KEY_A,
      body: Buffer.alloc(6, 1),
      mime: 'application/pdf',
      filename: 'a.pdf',
      format: 'pdf',
    });
    // Ensure the second entry has a strictly-later mtime so LRU order is
    // deterministic on filesystems with second-level resolution.
    await new Promise((resolve) => setTimeout(resolve, 25));
    await store.put({
      key: KEY_B,
      body: Buffer.alloc(6, 2),
      mime: 'application/pdf',
      filename: 'b.pdf',
      format: 'pdf',
    });

    expect(await store.get(KEY_A)).toBeNull();
    expect(await store.get(KEY_B)).not.toBeNull();
    const metrics = await store.collectMetrics();
    expect(metrics.entries).toBe(1);
    expect(metrics.totalBytes).toBe(6);
  });

  it('enforceCaps drops entries older than OD_EXPORT_CACHE_LOCAL_MAX_AGE_SEC', async () => {
    process.env.OD_EXPORT_CACHE_LOCAL_MAX_AGE_SEC = '1';
    await store.put({
      key: KEY_A,
      body: Buffer.from('aged'),
      mime: 'application/pdf',
      filename: 'a.pdf',
      format: 'pdf',
    });
    // Backdate the mtime so the sweep considers it stale.
    const prefixDir = path.join(cacheDir, KEY_A.slice(0, 2));
    const payload = path.join(prefixDir, `${KEY_A}.pdf`);
    const past = new Date(Date.now() - 10_000);
    await fs.utimes(payload, past, past);
    await store.enforceCaps();
    expect(await store.get(KEY_A)).toBeNull();
  });

  it('skips writes larger than the total-bytes cap', async () => {
    process.env.OD_EXPORT_CACHE_LOCAL_MAX_TOTAL_BYTES = '4';
    const put = await store.put({
      key: KEY_A,
      body: Buffer.alloc(16, 1),
      mime: 'application/pdf',
      filename: 'big.pdf',
      format: 'pdf',
    });
    expect(put).toBeNull();
    expect(await store.get(KEY_A)).toBeNull();
  });

  it('is a no-op when OD_EXPORT_CACHE_LOCAL_ENABLED=0', async () => {
    process.env.OD_EXPORT_CACHE_LOCAL_ENABLED = '0';
    const put = await store.put({
      key: KEY_A,
      body: Buffer.from('x'),
      mime: 'application/pdf',
      filename: 'x.pdf',
      format: 'pdf',
    });
    expect(put).toBeNull();
    expect(await store.get(KEY_A)).toBeNull();
  });
});
