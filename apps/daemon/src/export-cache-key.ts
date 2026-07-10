/**
 * Export cache key SSOT — see docs-teamver/34 §20.1.
 *
 * Any storage adapter (memo / local / S3) MUST derive keys via
 * `computeExportCacheKey`. Colliding parameters would cause tenant leakage,
 * so `projectId` is included and the input file name is normalized before
 * hashing to prevent leading-slash / dedup drift.
 *
 * `codeVersion` (env `OD_EXPORT_CACHE_VERSION`) is a manual switch: bump it
 * whenever the daemon changes its renderer output for the same source file
 * (e.g. different Chromium flags, different inline-assets rules) to force
 * misses without touching every source file's mtime.
 */
import crypto from 'node:crypto';

export type ExportCacheFormat = 'pdf' | 'html' | 'zip' | 'png' | 'jpeg' | 'webp';

export type ExportCacheKeyInput = {
  projectId: string;
  entryFile: string;
  mtimeMs: number;
  format: ExportCacheFormat;
  deck: boolean;
  slideIndex?: number;
  codeVersion?: string;
};

export function normalizeEntryFile(fileName: string): string {
  const trimmed = String(fileName ?? '').replace(/^\/+/, '');
  return trimmed.replace(/\/{2,}/g, '/');
}

export function currentExportCodeVersion(): string {
  const raw = (process.env.OD_EXPORT_CACHE_VERSION ?? '').trim();
  return raw.length > 0 ? raw : 'v5';
}

export function computeExportCacheKey(input: ExportCacheKeyInput): string {
  const slidePart =
    typeof input.slideIndex === 'number' && Number.isFinite(input.slideIndex)
      ? `slide=${Math.max(0, Math.floor(input.slideIndex))}`
      : 'slide=-';
  const parts = [
    String(input.projectId ?? ''),
    normalizeEntryFile(input.entryFile),
    String(Math.max(0, Math.floor(input.mtimeMs))),
    input.format,
    input.deck ? 'deck' : 'flat',
    slidePart,
    input.codeVersion ?? currentExportCodeVersion(),
  ];
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex');
}

/** Log-safe prefix (never emit full key to shared logs). */
export function shortCacheKeyPrefix(key: string): string {
  return key.slice(0, 12);
}
