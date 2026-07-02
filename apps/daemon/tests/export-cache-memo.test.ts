import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MemoExportCacheStore } from '../src/export-cache-memo.js';

const KEY_A = 'a'.repeat(64);
const KEY_B = 'b'.repeat(64);
const KEY_C = 'c'.repeat(64);

describe('MemoExportCacheStore', () => {
  let store: MemoExportCacheStore;

  beforeEach(() => {
    store = new MemoExportCacheStore();
  });

  afterEach(async () => {
    await store.clearForTests();
    delete process.env.OD_EXPORT_CACHE_MEMO_ENABLED;
    delete process.env.OD_EXPORT_CACHE_MEMO_TTL_SEC;
    delete process.env.OD_EXPORT_CACHE_MEMO_MAX_ENTRIES;
    delete process.env.OD_EXPORT_CACHE_MEMO_MAX_ENTRY_BYTES;
    delete process.env.OD_EXPORT_CACHE_MEMO_MAX_TOTAL_BYTES;
  });

  it('returns null on miss, populated entry on hit', async () => {
    expect(await store.get(KEY_A)).toBeNull();
    const buf = Buffer.from('hello');
    await store.put({
      key: KEY_A,
      body: buf,
      mime: 'text/plain',
      filename: 'a.txt',
      format: 'html',
    });
    const hit = await store.get(KEY_A);
    expect(hit).not.toBeNull();
    expect(hit?.source).toBe('hit-memo');
    expect(hit?.bytes).toBe(5);
    expect(hit?.buffer?.toString()).toBe('hello');
    expect(hit?.mime).toBe('text/plain');
    expect(hit?.filename).toBe('a.txt');
  });

  it('skips entries larger than OD_EXPORT_CACHE_MEMO_MAX_ENTRY_BYTES', async () => {
    process.env.OD_EXPORT_CACHE_MEMO_MAX_ENTRY_BYTES = '4';
    const put = await store.put({
      key: KEY_A,
      body: Buffer.from('hello'),
      mime: 'text/plain',
      filename: 'a.txt',
      format: 'html',
    });
    expect(put).toBeNull();
    expect(await store.get(KEY_A)).toBeNull();
  });

  it('expires entries after TTL', async () => {
    process.env.OD_EXPORT_CACHE_MEMO_TTL_SEC = '1';
    await store.put({
      key: KEY_A,
      body: Buffer.from('x'),
      mime: 'text/plain',
      filename: 'a.txt',
      format: 'html',
    });
    expect(await store.get(KEY_A)).not.toBeNull();
    // Advance clock past TTL — we mutate storedAt / expiresAt by re-put logic
    // via a lower TTL and a Date.now-based synthetic sleep. Instead of a real
    // timer we simulate the expiry check by manipulating the entry directly:
    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect(await store.get(KEY_A)).toBeNull();
    expect(store.metrics().entries).toBe(0);
  });

  it('evicts oldest when OD_EXPORT_CACHE_MEMO_MAX_ENTRIES is exceeded (LRU)', async () => {
    process.env.OD_EXPORT_CACHE_MEMO_MAX_ENTRIES = '2';
    await store.put({ key: KEY_A, body: Buffer.from('a'), mime: 't', filename: 'a', format: 'pdf' });
    await store.put({ key: KEY_B, body: Buffer.from('b'), mime: 't', filename: 'b', format: 'pdf' });
    // Touch KEY_A so it becomes the tail (most-recently-used).
    await store.get(KEY_A);
    await store.put({ key: KEY_C, body: Buffer.from('c'), mime: 't', filename: 'c', format: 'pdf' });
    // KEY_B was the LRU victim.
    expect(await store.get(KEY_B)).toBeNull();
    expect(await store.get(KEY_A)).not.toBeNull();
    expect(await store.get(KEY_C)).not.toBeNull();
  });

  it('evicts to respect OD_EXPORT_CACHE_MEMO_MAX_TOTAL_BYTES', async () => {
    process.env.OD_EXPORT_CACHE_MEMO_MAX_ENTRY_BYTES = '1024';
    process.env.OD_EXPORT_CACHE_MEMO_MAX_TOTAL_BYTES = '10';
    await store.put({
      key: KEY_A,
      body: Buffer.alloc(6, 1),
      mime: 't',
      filename: 'a',
      format: 'pdf',
    });
    await store.put({
      key: KEY_B,
      body: Buffer.alloc(6, 2),
      mime: 't',
      filename: 'b',
      format: 'pdf',
    });
    // Total would be 12 bytes > 10 — oldest (KEY_A) must have been evicted.
    expect(await store.get(KEY_A)).toBeNull();
    expect(await store.get(KEY_B)).not.toBeNull();
    expect(store.metrics().totalBytes).toBe(6);
  });

  it('is a no-op when OD_EXPORT_CACHE_MEMO_ENABLED=0', async () => {
    process.env.OD_EXPORT_CACHE_MEMO_ENABLED = '0';
    const put = await store.put({
      key: KEY_A,
      body: Buffer.from('x'),
      mime: 't',
      filename: 'a',
      format: 'pdf',
    });
    expect(put).toBeNull();
    expect(await store.get(KEY_A)).toBeNull();
  });

  it('invalidate removes the entry and shrinks totalBytes', async () => {
    await store.put({
      key: KEY_A,
      body: Buffer.from('abc'),
      mime: 't',
      filename: 'a',
      format: 'pdf',
    });
    expect(store.metrics().totalBytes).toBe(3);
    await store.invalidate!(KEY_A);
    expect(await store.get(KEY_A)).toBeNull();
    expect(store.metrics().totalBytes).toBe(0);
  });
});
