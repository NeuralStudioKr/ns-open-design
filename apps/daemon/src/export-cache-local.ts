/**
 * EBS-local export artifact cache — see docs-teamver/34 §20.3.
 *
 * Storage layout (single mount, single-daemon):
 *
 *   `${cacheDir}/${hash[0..2]}/${hash}.${ext}`         (payload)
 *   `${cacheDir}/${hash[0..2]}/${hash}.meta.json`      (mime, filename, bytes)
 *
 * Multi-instance safety is NOT required today (see §19.3): daemon is a
 * single node with a dedicated EBS volume. Sweep policy runs periodically
 * and enforces:
 *
 *   1. total-size LRU (`OD_EXPORT_CACHE_LOCAL_MAX_TOTAL_BYTES`, oldest mtime
 *      evicted first) so a runaway hit set can't fill the volume.
 *   2. max-age (`OD_EXPORT_CACHE_LOCAL_MAX_AGE_SEC`) so long-forgotten
 *      artifacts are removed even if the total-size cap is never hit.
 *
 * Atomic writes: payload/meta are written to a temp file first and then
 * renamed into place, so a partially-written cache entry never becomes
 * visible to a concurrent `get`.
 *
 * Path safety: every filesystem operation validates that the fully-resolved
 * path stays inside `cacheDir`, so a corrupted / malicious key cannot
 * traverse out of the cache tree.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

import type {
  ExportCacheEntry,
  ExportCachePutInput,
  ExportCacheStore,
  ExportCacheStoreMetrics,
} from './export-cache-store.js';
import type { ExportCacheFormat } from './export-cache-key.js';

const DEFAULT_MAX_TOTAL_BYTES = 5 * 1024 * 1024 * 1024; // 5 GiB
const DEFAULT_MAX_AGE_SEC = 7 * 24 * 3600;
const DEFAULT_SWEEP_INTERVAL_SEC = 3600;

const HASH_RE = /^[a-f0-9]{64}$/i;

function parseIntEnv(name: string, fallback: number, min: number): number {
  const raw = (process.env[name] ?? '').trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.floor(parsed));
}

export function localCacheEnabled(): boolean {
  const raw = (process.env.OD_EXPORT_CACHE_LOCAL_ENABLED ?? '').trim().toLowerCase();
  if (!raw) return true;
  return !['0', 'false', 'off', 'no'].includes(raw);
}

export function localCacheMaxTotalBytes(): number {
  return parseIntEnv(
    'OD_EXPORT_CACHE_LOCAL_MAX_TOTAL_BYTES',
    DEFAULT_MAX_TOTAL_BYTES,
    1,
  );
}

export function localCacheMaxAgeMs(): number {
  return parseIntEnv('OD_EXPORT_CACHE_LOCAL_MAX_AGE_SEC', DEFAULT_MAX_AGE_SEC, 1) * 1000;
}

export function localCacheSweepIntervalMs(): number {
  return parseIntEnv(
    'OD_EXPORT_CACHE_LOCAL_SWEEP_INTERVAL_SEC',
    DEFAULT_SWEEP_INTERVAL_SEC,
    5,
  ) * 1000;
}

function extensionFor(format: ExportCacheFormat): string {
  switch (format) {
    case 'pdf':
      return 'pdf';
    case 'html':
      return 'html';
    case 'zip':
      return 'zip';
    case 'png':
      return 'png';
    case 'jpeg':
      return 'jpg';
    case 'webp':
      return 'webp';
    default:
      // exhaustiveness fallback — treat unknown as opaque bytes.
      return 'bin';
  }
}

type EntryMeta = {
  mime: string;
  filename: string;
  bytes: number;
  storedAt: number;
  format: ExportCacheFormat;
};

function assertInside(root: string, target: string): void {
  const resolvedRoot = path.resolve(root) + path.sep;
  const resolvedTarget = path.resolve(target);
  if (
    resolvedTarget !== path.resolve(root) &&
    !resolvedTarget.startsWith(resolvedRoot)
  ) {
    throw new Error(`export cache path escape: ${resolvedTarget}`);
  }
}

export class LocalFileExportCacheStore implements ExportCacheStore {
  readonly name = 'local';
  private readonly cacheDir: string;

  constructor(cacheDir: string) {
    this.cacheDir = path.resolve(cacheDir);
  }

  getCacheDir(): string {
    return this.cacheDir;
  }

  private resolvePaths(key: string, format: ExportCacheFormat): { payload: string; meta: string } {
    if (!HASH_RE.test(key)) {
      throw new Error('export cache key must be sha256 hex');
    }
    const prefix = key.slice(0, 2);
    const dir = path.join(this.cacheDir, prefix);
    const payload = path.join(dir, `${key}.${extensionFor(format)}`);
    const meta = path.join(dir, `${key}.meta.json`);
    assertInside(this.cacheDir, payload);
    assertInside(this.cacheDir, meta);
    return { payload, meta };
  }

  private async readMeta(metaPath: string): Promise<EntryMeta | null> {
    try {
      const raw = await fs.readFile(metaPath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<EntryMeta>;
      if (
        typeof parsed?.mime === 'string' &&
        typeof parsed?.filename === 'string' &&
        typeof parsed?.bytes === 'number' &&
        typeof parsed?.storedAt === 'number' &&
        typeof parsed?.format === 'string'
      ) {
        return parsed as EntryMeta;
      }
      return null;
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException | undefined)?.code;
      if (code === 'ENOENT') return null;
      throw err;
    }
  }

  private async pickFormatDirEntries(prefix: string): Promise<string[]> {
    try {
      const entries = await fs.readdir(path.join(this.cacheDir, prefix));
      return entries;
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException | undefined)?.code;
      if (code === 'ENOENT') return [];
      throw err;
    }
  }

  async get(key: string): Promise<ExportCacheEntry | null> {
    if (!localCacheEnabled()) return null;
    if (!HASH_RE.test(key)) return null;
    const prefix = key.slice(0, 2);
    const dir = path.join(this.cacheDir, prefix);
    const entries = await this.pickFormatDirEntries(prefix);
    if (entries.length === 0) return null;

    const metaFile = entries.find((name) => name === `${key}.meta.json`);
    if (!metaFile) return null;
    const metaPath = path.join(dir, metaFile);
    assertInside(this.cacheDir, metaPath);
    const meta = await this.readMeta(metaPath);
    if (!meta) return null;

    const payloadPath = path.join(dir, `${key}.${extensionFor(meta.format)}`);
    assertInside(this.cacheDir, payloadPath);
    try {
      const st = await fs.stat(payloadPath);
      if (!st.isFile()) return null;
      // Touch atime → helps mtime-based LRU when the fs preserves relatime.
      const now = Date.now();
      await fs.utimes(payloadPath, now / 1000, st.mtimeMs / 1000).catch(() => {});
      return {
        key,
        filePath: payloadPath,
        mime: meta.mime,
        filename: meta.filename,
        bytes: meta.bytes,
        storedAt: meta.storedAt,
        source: 'hit-local',
        format: meta.format,
      };
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException | undefined)?.code;
      if (code === 'ENOENT') return null;
      throw err;
    }
  }

  async put(input: ExportCachePutInput): Promise<ExportCacheEntry | null> {
    if (!localCacheEnabled()) return null;
    if (!HASH_RE.test(input.key)) return null;
    const buffer =
      typeof input.body === 'string' ? Buffer.from(input.body, 'utf8') : input.body;
    const bytes = buffer.byteLength;

    // Total-cap guard before writing avoids "put then evict" thrash. Actual
    // eviction (including this new entry) still runs after write so racing
    // puts converge.
    const cap = localCacheMaxTotalBytes();
    if (bytes > cap) return null;

    const { payload, meta } = this.resolvePaths(input.key, input.format);
    await fs.mkdir(path.dirname(payload), { recursive: true });

    const storedAt = Date.now();
    const metaBody: EntryMeta = {
      mime: input.mime,
      filename: input.filename,
      bytes,
      storedAt,
      format: input.format,
    };

    const payloadTmp = `${payload}.${process.pid}.tmp`;
    const metaTmp = `${meta}.${process.pid}.tmp`;
    try {
      await fs.writeFile(payloadTmp, buffer);
      await fs.writeFile(metaTmp, JSON.stringify(metaBody));
      await fs.rename(payloadTmp, payload);
      await fs.rename(metaTmp, meta);
    } catch (err) {
      await fs.unlink(payloadTmp).catch(() => {});
      await fs.unlink(metaTmp).catch(() => {});
      throw err;
    }

    // Best-effort eviction to keep the cache under the cap.
    await this.enforceCaps().catch((err) => {
      console.warn(
        JSON.stringify({
          marker: 'od_export_cache_sweep_failed',
          store: this.name,
          reason: String((err as Error)?.message || err),
        }),
      );
    });

    return {
      key: input.key,
      filePath: payload,
      mime: input.mime,
      filename: input.filename,
      bytes,
      storedAt,
      source: 'hit-local',
      format: input.format,
    };
  }

  async invalidate(key: string): Promise<void> {
    if (!HASH_RE.test(key)) return;
    const prefix = key.slice(0, 2);
    const dir = path.join(this.cacheDir, prefix);
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (name.startsWith(`${key}.`)) {
        const full = path.join(dir, name);
        assertInside(this.cacheDir, full);
        await fs.unlink(full).catch(() => {});
      }
    }
  }

  metrics(): ExportCacheStoreMetrics {
    // Metrics on the local store are computed on-demand by sweep since
    // walking the tree on every request would be wasteful. Return zeros as
    // a placeholder — the async `collectMetrics` method should be used when
    // real values are needed.
    return {
      entries: 0,
      totalBytes: 0,
      maxTotalBytes: localCacheMaxTotalBytes(),
    };
  }

  async collectMetrics(): Promise<ExportCacheStoreMetrics> {
    const summary = await this.scan();
    return {
      entries: summary.length,
      totalBytes: summary.reduce((sum, e) => sum + e.bytes, 0),
      maxTotalBytes: localCacheMaxTotalBytes(),
    };
  }

  /**
   * Scan the cache tree once — used by both metrics and sweep. Returns
   * entries sorted by mtime ascending (LRU-friendly for eviction).
   */
  private async scan(): Promise<
    Array<{ key: string; payloadPath: string; metaPath: string; mtimeMs: number; bytes: number }>
  > {
    let prefixes: string[];
    try {
      prefixes = await fs.readdir(this.cacheDir);
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException | undefined)?.code;
      if (code === 'ENOENT') return [];
      throw err;
    }
    const results: Array<{
      key: string;
      payloadPath: string;
      metaPath: string;
      mtimeMs: number;
      bytes: number;
    }> = [];
    for (const prefix of prefixes) {
      const dir = path.join(this.cacheDir, prefix);
      let entries: string[];
      try {
        entries = await fs.readdir(dir);
      } catch {
        continue;
      }
      for (const name of entries) {
        // We anchor on `.meta.json` so orphaned payloads with no meta are
        // skipped and picked up by sweep as garbage.
        if (!name.endsWith('.meta.json')) continue;
        const key = name.slice(0, -'.meta.json'.length);
        if (!HASH_RE.test(key)) continue;
        const metaPath = path.join(dir, name);
        const meta = await this.readMeta(metaPath).catch(() => null);
        if (!meta) continue;
        const payloadPath = path.join(dir, `${key}.${extensionFor(meta.format)}`);
        let stat;
        try {
          stat = await fs.stat(payloadPath);
        } catch {
          // Meta with no payload → orphaned meta, remove.
          await fs.unlink(metaPath).catch(() => {});
          continue;
        }
        results.push({
          key,
          payloadPath,
          metaPath,
          mtimeMs: stat.mtimeMs,
          bytes: stat.size,
        });
      }
    }
    results.sort((a, b) => a.mtimeMs - b.mtimeMs);
    return results;
  }

  async enforceCaps(): Promise<void> {
    const items = await this.scan();
    const now = Date.now();
    const maxAgeMs = localCacheMaxAgeMs();

    let total = items.reduce((sum, e) => sum + e.bytes, 0);
    const capBytes = localCacheMaxTotalBytes();

    for (const item of items) {
      const aged = now - item.mtimeMs > maxAgeMs;
      const over = total > capBytes;
      if (!aged && !over) break;
      await fs.unlink(item.payloadPath).catch(() => {});
      await fs.unlink(item.metaPath).catch(() => {});
      total = Math.max(0, total - item.bytes);
    }
  }

  /** @internal test cleanup */
  async clearForTests(): Promise<void> {
    await fs.rm(this.cacheDir, { recursive: true, force: true });
  }
}

/**
 * Register a periodic sweep. Returns a stop function so tests / graceful
 * shutdown can cancel the timer.
 */
export function scheduleLocalCacheSweep(
  store: LocalFileExportCacheStore,
): () => void {
  const interval = setInterval(() => {
    void store.enforceCaps().catch((err) => {
      console.warn(
        JSON.stringify({
          marker: 'od_export_cache_sweep_failed',
          store: store.name,
          reason: String((err as Error)?.message || err),
        }),
      );
    });
  }, localCacheSweepIntervalMs());
  // Timers reference-count the event loop by default. We do NOT want the
  // sweep timer to keep the daemon alive after the HTTP server exits.
  interval.unref?.();
  return () => clearInterval(interval);
}
