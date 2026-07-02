/**
 * Cache-aware export runtime — see docs-teamver/34 §20.
 *
 * Wraps the `runHeadlessExportJob` pipeline with a chain of cache adapters
 * (memo → local → S3). A cache hit skips Chromium entirely and logs the same
 * `od_export_done` marker with `cache=hit-…`, so CloudWatch dashboards can
 * compute hit ratios by field.
 */
import type { ExportCacheFormat, ExportCacheKeyInput } from './export-cache-key.js';
import { computeExportCacheKey, shortCacheKeyPrefix } from './export-cache-key.js';
import type {
  ExportCacheEntry,
  ExportCacheHitSource,
  ExportCacheStore,
} from './export-cache-store.js';
import { lookupExportCache, populateExportCache } from './export-cache-store.js';
import { MemoExportCacheStore } from './export-cache-memo.js';
import {
  LocalFileExportCacheStore,
  scheduleLocalCacheSweep,
} from './export-cache-local.js';
import { logExportMetrics, type ExportJobMeta } from './export-runtime.js';

const memoStore = new MemoExportCacheStore();
let localStore: LocalFileExportCacheStore | null = null;
let stopLocalSweep: (() => void) | null = null;
let storeChain: ExportCacheStore[] = [memoStore];

export function getExportCacheStores(): readonly ExportCacheStore[] {
  return storeChain;
}

/**
 * Wire the EBS-backed local cache under `cacheDir`. Idempotent: repeated
 * calls after the first are no-ops. Called by `server.ts` startup with
 * `${RUNTIME_DATA_DIR}/.od-export-cache`.
 */
export function registerLocalExportCache(cacheDir: string): () => void {
  if (localStore) {
    return stopLocalSweep ?? (() => {});
  }
  localStore = new LocalFileExportCacheStore(cacheDir);
  storeChain = [memoStore, localStore];
  stopLocalSweep = scheduleLocalCacheSweep(localStore);
  return stopLocalSweep;
}

/** @internal test hook to replace the chain (e.g. add a fake local store). */
export function setExportCacheStoresForTests(next: ExportCacheStore[]): void {
  storeChain = next;
}

/** @internal test cleanup. */
export async function resetExportCacheForTests(): Promise<void> {
  for (const store of storeChain) {
    if (store.clearForTests) await store.clearForTests();
  }
  if (stopLocalSweep) {
    stopLocalSweep();
    stopLocalSweep = null;
  }
  localStore = null;
  storeChain = [memoStore];
  await memoStore.clearForTests();
}

/**
 * Rendered artifact returned by the miss-path. `filename` / `mime` are stored
 * alongside the bytes so future hits reproduce the same download headers.
 */
export type ExportRenderResult = {
  body: Buffer | string;
  filename: string;
  mime: string;
};

export type ExportCacheDescriptor = {
  keyInput: ExportCacheKeyInput;
  filename: string;
  mime: string;
};

export type ExportCacheOutcome =
  | {
      cache: 'miss';
      key: string;
      body: Buffer | string;
      filePath?: undefined;
      filename: string;
      mime: string;
      bytes: number;
    }
  | {
      cache: ExportCacheHitSource;
      key: string;
      entry: ExportCacheEntry;
      body?: Buffer;
      filePath?: string;
      filename: string;
      mime: string;
      bytes: number;
      ageMs: number | null;
    };

function isExportCacheDisabled(): boolean {
  const raw = (process.env.OD_EXPORT_CACHE_ENABLED ?? '').trim().toLowerCase();
  return ['0', 'false', 'off', 'no'].includes(raw);
}

/**
 * Look up + render + populate. `render` MUST be idempotent — it may be
 * re-invoked on subsequent misses.
 */
export async function runCachedExport(
  meta: ExportJobMeta,
  descriptor: ExportCacheDescriptor,
  render: () => Promise<ExportRenderResult>,
): Promise<ExportCacheOutcome> {
  const key = computeExportCacheKey(descriptor.keyInput);
  const shortKey = shortCacheKeyPrefix(key);

  const cachingEnabled = !isExportCacheDisabled();
  if (cachingEnabled) {
    const started = Date.now();
    const { entry, ageMs } = await lookupExportCache(storeChain, key);
    if (entry) {
      logExportMetrics({
        ...meta,
        cache: entry.source,
        cacheKey: shortKey,
        ...(ageMs !== null ? { cacheAgeMs: ageMs } : {}),
        queueWaitMs: 0,
        durationMs: Date.now() - started,
        chromiumAcquireMs: 0,
        bytes: entry.bytes,
        ok: true,
      });
      return {
        cache: entry.source,
        key,
        entry,
        ...(entry.buffer ? { body: entry.buffer } : {}),
        ...(entry.filePath ? { filePath: entry.filePath } : {}),
        filename: entry.filename,
        mime: entry.mime,
        bytes: entry.bytes,
        ageMs,
      };
    }
  }

  const rendered = await render();
  const bytes =
    typeof rendered.body === 'string'
      ? Buffer.byteLength(rendered.body, 'utf8')
      : rendered.body.byteLength;

  if (cachingEnabled) {
    // Fire-and-await so tests can observe post-render state deterministically,
    // but individual store failures are swallowed inside populateExportCache.
    await populateExportCache(storeChain, {
      key,
      body: rendered.body,
      mime: rendered.mime,
      filename: rendered.filename,
      format: descriptor.keyInput.format,
    });
  }

  return {
    cache: 'miss',
    key,
    body: rendered.body,
    filename: rendered.filename,
    mime: rendered.mime,
    bytes,
  };
}

/**
 * Convenience: build a cache descriptor from an input tuple. The `format`
 * strings match the ones in `ExportCacheFormat` — call sites keep their
 * existing literal types.
 */
export function exportCacheDescriptor(input: {
  projectId: string;
  sourceRelPath: string;
  sourceMtimeMs: number;
  format: ExportCacheFormat;
  deck: boolean;
  slideIndex?: number;
  filename: string;
  mime: string;
}): ExportCacheDescriptor {
  const keyInput: ExportCacheKeyInput = {
    projectId: input.projectId,
    entryFile: input.sourceRelPath,
    mtimeMs: input.sourceMtimeMs,
    format: input.format,
    deck: input.deck,
    ...(typeof input.slideIndex === 'number' ? { slideIndex: input.slideIndex } : {}),
  };
  return {
    keyInput,
    filename: input.filename,
    mime: input.mime,
  };
}
