import type { FileRevision, FileRevisionSource } from '@open-design/contracts';

/** Sources where rapid successive pushes may merge into the current head revision. */
export const FILE_REVISION_COALESCABLE_SOURCES = new Set<FileRevisionSource>([
  'manual_edit',
  'inspect',
]);

export function resolveFileRevisionCoalesceWindowMs(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.OD_FILE_REVISION_COALESCE_WINDOW_MS;
  if (raw == null || raw.trim() === '') return 30_000;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 30_000;
  return Math.min(parsed, 5 * 60_000);
}

export function shouldCoalesceRevisionPush(
  head: FileRevision,
  input: {
    source: FileRevisionSource;
    now?: number;
  },
  windowMs: number,
): boolean {
  if (windowMs <= 0) return false;
  if (!FILE_REVISION_COALESCABLE_SOURCES.has(input.source)) return false;
  if (head.source !== input.source) return false;
  if (head.source === 'import' || head.source === 'restore') return false;
  if (head.sequence <= 1) return false;
  const now = input.now ?? Date.now();
  return now - head.createdAt <= windowMs;
}
