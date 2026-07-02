/**
 * Export artifact cache adapter contract — see docs-teamver/34 §20.1.
 *
 * Stores are consulted in order (memo first, then local file, then future S3)
 * so the fastest hit wins. Layers are lossy: memo evicts on TTL/LRU, local
 * evicts on sweep, and any layer may throw on I/O without failing the
 * export request (see `populateExportCache` — best-effort semantics).
 *
 * `filePath` vs `buffer`:
 *   - When an adapter returns `filePath`, the caller MAY pipe the file
 *     directly (fs.createReadStream) without copying into RAM. Adapters
 *     MUST guarantee the file exists at least until the next `get` on the
 *     same key resolves — the ticket layer is expected to unlink temp
 *     files only, never the cache-owned files.
 *   - When an adapter returns `buffer` only, the caller must consume it.
 */
import type { ExportCacheFormat } from './export-cache-key.js';

export type ExportCacheHitSource = 'hit-memo' | 'hit-local' | 'hit-s3';
export type ExportCacheMissSource = 'miss' | 'disabled';
export type ExportCacheSource = ExportCacheHitSource | ExportCacheMissSource;

export interface ExportCacheEntry {
  key: string;
  filePath?: string;
  buffer?: Buffer;
  mime: string;
  filename: string;
  bytes: number;
  storedAt: number;
  source: ExportCacheHitSource;
  format: ExportCacheFormat;
}

export interface ExportCachePutInput {
  key: string;
  body: Buffer | string;
  mime: string;
  filename: string;
  format: ExportCacheFormat;
}

export interface ExportCacheStoreMetrics {
  entries: number;
  totalBytes: number;
  maxTotalBytes: number;
}

export interface ExportCacheStore {
  readonly name: string;
  get(key: string): Promise<ExportCacheEntry | null>;
  put(input: ExportCachePutInput): Promise<ExportCacheEntry | null>;
  invalidate?(key: string): Promise<void>;
  metrics(): ExportCacheStoreMetrics;
  /** @internal for vitest — no-op in prod paths */
  clearForTests?(): Promise<void>;
}

export type ExportCacheLookup = {
  entry: ExportCacheEntry | null;
  ageMs: number | null;
};

export async function lookupExportCache(
  stores: readonly ExportCacheStore[],
  key: string,
): Promise<ExportCacheLookup> {
  const now = Date.now();
  for (const store of stores) {
    try {
      const entry = await store.get(key);
      if (entry) {
        return { entry, ageMs: Math.max(0, now - entry.storedAt) };
      }
    } catch (err) {
      // Cache errors are non-fatal — fall through to next store / miss.
      console.warn(
        JSON.stringify({
          marker: 'od_export_cache_get_failed',
          store: store.name,
          reason: String((err as Error)?.message || err),
        }),
      );
    }
  }
  return { entry: null, ageMs: null };
}

export async function populateExportCache(
  stores: readonly ExportCacheStore[],
  input: ExportCachePutInput,
): Promise<void> {
  for (const store of stores) {
    try {
      await store.put(input);
    } catch (err) {
      console.warn(
        JSON.stringify({
          marker: 'od_export_cache_put_failed',
          store: store.name,
          reason: String((err as Error)?.message || err),
        }),
      );
    }
  }
}
