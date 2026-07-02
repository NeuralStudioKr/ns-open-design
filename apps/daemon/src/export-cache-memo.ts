/**
 * In-process (RAM) export cache — see docs-teamver/34 §20.2.
 *
 * Insertion-ordered Map + TTL + entry-size cap + total-bytes cap. Covers the
 * "HTML → ZIP" and "publish + local download" bursts where the same rendered
 * bytes are requested within a short window.
 *
 * All ENV knobs read once per operation so tests / restarts pick up updates
 * without process restart.
 */
import type {
  ExportCacheEntry,
  ExportCachePutInput,
  ExportCacheStore,
  ExportCacheStoreMetrics,
} from './export-cache-store.js';

const DEFAULT_TTL_SEC = 120;
const DEFAULT_MAX_ENTRIES = 32;
const DEFAULT_MAX_ENTRY_BYTES = 32 * 1024 * 1024;
const DEFAULT_MAX_TOTAL_BYTES = 256 * 1024 * 1024;

function parseIntEnv(name: string, fallback: number, min: number): number {
  const raw = (process.env[name] ?? '').trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.floor(parsed));
}

function memoEnabled(): boolean {
  const raw = (process.env.OD_EXPORT_CACHE_MEMO_ENABLED ?? '').trim().toLowerCase();
  if (!raw) return true;
  return !['0', 'false', 'off', 'no'].includes(raw);
}

function memoTtlMs(): number {
  return parseIntEnv('OD_EXPORT_CACHE_MEMO_TTL_SEC', DEFAULT_TTL_SEC, 1) * 1000;
}

function memoMaxEntries(): number {
  return parseIntEnv('OD_EXPORT_CACHE_MEMO_MAX_ENTRIES', DEFAULT_MAX_ENTRIES, 1);
}

// Minimums are intentionally 1 byte so operators can tune caps down aggressively
// (e.g. RAM-tight staging). Runtime defaults above stay generous.
function memoMaxEntryBytes(): number {
  return parseIntEnv('OD_EXPORT_CACHE_MEMO_MAX_ENTRY_BYTES', DEFAULT_MAX_ENTRY_BYTES, 1);
}

function memoMaxTotalBytes(): number {
  return parseIntEnv(
    'OD_EXPORT_CACHE_MEMO_MAX_TOTAL_BYTES',
    DEFAULT_MAX_TOTAL_BYTES,
    1,
  );
}

type MemoEntry = {
  key: string;
  buffer: Buffer;
  mime: string;
  filename: string;
  bytes: number;
  storedAt: number;
  expiresAt: number;
  format: ExportCachePutInput['format'];
};

export class MemoExportCacheStore implements ExportCacheStore {
  readonly name = 'memo';

  // JS Map preserves insertion order — we treat re-insertion as touch (LRU).
  private readonly entries = new Map<string, MemoEntry>();
  private totalBytes = 0;

  private purgeExpired(now: number): void {
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(key);
        this.totalBytes = Math.max(0, this.totalBytes - entry.bytes);
      }
    }
  }

  private evictUntilFits(newBytes: number): void {
    const maxEntries = memoMaxEntries();
    const maxTotal = memoMaxTotalBytes();
    while (this.entries.size + 1 > maxEntries || this.totalBytes + newBytes > maxTotal) {
      const oldest = this.entries.keys().next();
      if (oldest.done) return;
      const victim = this.entries.get(oldest.value);
      if (!victim) return;
      this.entries.delete(oldest.value);
      this.totalBytes = Math.max(0, this.totalBytes - victim.bytes);
    }
  }

  async get(key: string): Promise<ExportCacheEntry | null> {
    if (!memoEnabled()) return null;
    const now = Date.now();
    this.purgeExpired(now);
    const entry = this.entries.get(key);
    if (!entry) return null;
    // Touch — reinsert to move to LRU tail.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return {
      key: entry.key,
      buffer: entry.buffer,
      mime: entry.mime,
      filename: entry.filename,
      bytes: entry.bytes,
      storedAt: entry.storedAt,
      source: 'hit-memo',
      format: entry.format,
    };
  }

  async put(input: ExportCachePutInput): Promise<ExportCacheEntry | null> {
    if (!memoEnabled()) return null;
    const buffer =
      typeof input.body === 'string' ? Buffer.from(input.body, 'utf8') : input.body;
    const bytes = buffer.byteLength;
    const maxEntry = memoMaxEntryBytes();
    if (bytes > maxEntry) {
      // Too large to memoize — skip silently, still returns null so caller
      // knows this layer didn't take the value.
      return null;
    }
    const now = Date.now();
    this.purgeExpired(now);

    const existing = this.entries.get(input.key);
    if (existing) {
      this.entries.delete(input.key);
      this.totalBytes = Math.max(0, this.totalBytes - existing.bytes);
    }

    this.evictUntilFits(bytes);

    const stored: MemoEntry = {
      key: input.key,
      buffer,
      mime: input.mime,
      filename: input.filename,
      bytes,
      storedAt: now,
      expiresAt: now + memoTtlMs(),
      format: input.format,
    };
    this.entries.set(input.key, stored);
    this.totalBytes += bytes;
    return {
      key: stored.key,
      buffer: stored.buffer,
      mime: stored.mime,
      filename: stored.filename,
      bytes: stored.bytes,
      storedAt: stored.storedAt,
      source: 'hit-memo',
      format: stored.format,
    };
  }

  async invalidate(key: string): Promise<void> {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.entries.delete(key);
    this.totalBytes = Math.max(0, this.totalBytes - entry.bytes);
  }

  metrics(): ExportCacheStoreMetrics {
    return {
      entries: this.entries.size,
      totalBytes: this.totalBytes,
      maxTotalBytes: memoMaxTotalBytes(),
    };
  }

  async clearForTests(): Promise<void> {
    this.entries.clear();
    this.totalBytes = 0;
  }
}
