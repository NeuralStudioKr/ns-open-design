import crypto from 'node:crypto';

export type ExportJobFormat = 'pdf' | 'html' | 'zip' | 'image' | 'pptx';
export type ExportJobStatus = 'queued' | 'running' | 'ready' | 'failed';

export type ExportJobError = {
  code: string;
  message: string;
};

export type ExportJobResult = {
  downloadUrl: string;
  filename: string;
  mime: string;
  bytes: number;
  cache?: string;
  deliveryMode?: 'stream' | 'redirect';
  offloadStatus?: string;
  offloadReason?: string;
  expiresAt?: number;
};

export type ExportJobSnapshot = {
  id: string;
  projectId: string;
  format: ExportJobFormat;
  status: ExportJobStatus;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  startedAt?: number;
  completedAt?: number;
  result?: ExportJobResult;
  error?: ExportJobError;
};

type ExportJobEntry = ExportJobSnapshot;
type ExportJobListener = (snapshot: ExportJobSnapshot) => void;

export class ExportJobStoreFullError extends Error {
  readonly code = 'EXPORT_JOB_STORE_FULL';

  constructor(message = 'export job queue is full — retry shortly') {
    super(message);
    this.name = 'ExportJobStoreFullError';
  }
}

const jobs = new Map<string, ExportJobEntry>();
const listeners = new Map<string, Set<ExportJobListener>>();

const EXPORT_JOB_ID_RE = /^[a-f0-9]{32}$/i;

function parseEnvInt(name: string, fallback: number, min: number, max: number): number {
  const raw = (process.env[name] ?? '').trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

export function isExportAsyncJobsEnabled(): boolean {
  return (process.env.OD_EXPORT_ASYNC_JOBS_ENABLED ?? '').trim() === '1';
}

export function exportJobTtlMs(): number {
  return parseEnvInt('OD_EXPORT_JOB_TTL_SEC', 900, 60, 86_400) * 1000;
}

export function exportJobMaxEntries(): number {
  return parseEnvInt('OD_EXPORT_JOB_MAX_ENTRIES', 128, 8, 1024);
}

function normalizeJobId(jobId: string): string | null {
  const trimmed = jobId.trim();
  return EXPORT_JOB_ID_RE.test(trimmed) ? trimmed : null;
}

function snapshot(entry: ExportJobEntry): ExportJobSnapshot {
  return {
    id: entry.id,
    projectId: entry.projectId,
    format: entry.format,
    status: entry.status,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    expiresAt: entry.expiresAt,
    ...(entry.startedAt !== undefined ? { startedAt: entry.startedAt } : {}),
    ...(entry.completedAt !== undefined ? { completedAt: entry.completedAt } : {}),
    ...(entry.result ? { result: { ...entry.result } } : {}),
    ...(entry.error ? { error: { ...entry.error } } : {}),
  };
}

function listenerKey(projectId: string, jobId: string): string {
  return `${projectId}:${jobId}`;
}

function notifyExportJobListeners(entry: ExportJobEntry): void {
  const current = snapshot(entry);
  const projectListeners = listeners.get(listenerKey(entry.projectId, entry.id));
  if (!projectListeners || projectListeners.size === 0) return;
  for (const listener of projectListeners) {
    try {
      listener(current);
    } catch {
      // Listener failures must not affect export job state transitions.
    }
  }
}

function purgeExpiredExportJobs(now = Date.now()): void {
  for (const [jobId, entry] of jobs) {
    if (entry.expiresAt <= now) jobs.delete(jobId);
  }
}

export function createExportJob(input: {
  projectId: string;
  format: ExportJobFormat;
  now?: number;
}): ExportJobSnapshot {
  const now = input.now ?? Date.now();
  purgeExpiredExportJobs(now);
  if (jobs.size >= exportJobMaxEntries()) {
    throw new ExportJobStoreFullError();
  }
  const id = crypto.randomBytes(16).toString('hex');
  const entry: ExportJobEntry = {
    id,
    projectId: input.projectId,
    format: input.format,
    status: 'queued',
    createdAt: now,
    updatedAt: now,
    expiresAt: now + exportJobTtlMs(),
  };
  jobs.set(id, entry);
  notifyExportJobListeners(entry);
  return snapshot(entry);
}

export function markExportJobRunning(
  projectId: string,
  jobId: string,
  now = Date.now(),
): ExportJobSnapshot | null {
  const entry = resolveExportJobEntry(projectId, jobId, now);
  if (!entry) return null;
  if (entry.status !== 'queued') return snapshot(entry);
  entry.status = 'running';
  entry.startedAt = now;
  entry.updatedAt = now;
  notifyExportJobListeners(entry);
  return snapshot(entry);
}

export function completeExportJob(
  projectId: string,
  jobId: string,
  result: ExportJobResult,
  now = Date.now(),
): ExportJobSnapshot | null {
  const entry = resolveExportJobEntry(projectId, jobId, now);
  if (!entry) return null;
  entry.status = 'ready';
  entry.result = { ...result };
  delete entry.error;
  entry.completedAt = now;
  entry.updatedAt = now;
  notifyExportJobListeners(entry);
  return snapshot(entry);
}

export function failExportJob(
  projectId: string,
  jobId: string,
  error: ExportJobError,
  now = Date.now(),
): ExportJobSnapshot | null {
  const entry = resolveExportJobEntry(projectId, jobId, now);
  if (!entry) return null;
  entry.status = 'failed';
  entry.error = { ...error };
  delete entry.result;
  entry.completedAt = now;
  entry.updatedAt = now;
  notifyExportJobListeners(entry);
  return snapshot(entry);
}

function resolveExportJobEntry(
  projectId: string,
  jobId: string,
  now = Date.now(),
): ExportJobEntry | null {
  purgeExpiredExportJobs(now);
  const normalized = normalizeJobId(jobId);
  if (!normalized) return null;
  const entry = jobs.get(normalized);
  if (!entry || entry.projectId !== projectId) return null;
  return entry;
}

export function resolveExportJob(
  projectId: string,
  jobId: string,
  now = Date.now(),
): ExportJobSnapshot | null {
  const entry = resolveExportJobEntry(projectId, jobId, now);
  return entry ? snapshot(entry) : null;
}

export function subscribeExportJob(
  projectId: string,
  jobId: string,
  listener: ExportJobListener,
): () => void {
  const key = listenerKey(projectId, jobId);
  let bucket = listeners.get(key);
  if (!bucket) {
    bucket = new Set();
    listeners.set(key, bucket);
  }
  bucket.add(listener);
  return () => {
    const current = listeners.get(key);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) listeners.delete(key);
  };
}

/** @internal vitest */
export function clearExportJobsForTests(): void {
  jobs.clear();
  listeners.clear();
}
