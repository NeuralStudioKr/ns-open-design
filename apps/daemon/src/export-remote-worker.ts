import type { ExportCacheOutcome } from './export-cache-runtime.js';
import type {
  ExportJobRunnerDeps,
  ExportJobRunnerRequest,
} from './export-job-runner.js';
import {
  deserializeExportCacheOutcome,
  type ExportWorkerRenderRequest,
  type ExportWorkerRenderResponse,
} from './export-worker-protocol.js';

const DEFAULT_TIMEOUT_MS = 120_000;

function parsePositiveIntEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = (process.env[name] ?? '').trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

export function isRemoteExportWorkerEnabled(): boolean {
  return (process.env.OD_EXPORT_WORKER_ENABLED ?? '').trim() === '1'
    && Boolean((process.env.OD_EXPORT_WORKER_BASE_URL ?? '').trim());
}

function workerBaseUrl(): string {
  return (process.env.OD_EXPORT_WORKER_BASE_URL ?? '').trim().replace(/\/+$/, '');
}

function workerToken(): string {
  return (
    (process.env.OD_EXPORT_WORKER_TOKEN ?? '').trim()
    || (process.env.OD_API_TOKEN ?? '').trim()
  );
}

function workerTimeoutMs(): number {
  return parsePositiveIntEnv('OD_EXPORT_WORKER_TIMEOUT_MS', DEFAULT_TIMEOUT_MS, 10_000, 600_000);
}

export async function renderExportJobWithRemoteWorker(
  request: ExportJobRunnerRequest,
  deps: ExportJobRunnerDeps,
): Promise<ExportCacheOutcome> {
  const baseUrl = workerBaseUrl();
  const token = workerToken();
  if (!baseUrl || !token) {
    throw new Error('remote export worker is enabled but base URL or token is missing');
  }
  const context = deps.renderContext(request.projectId);
  const payload: ExportWorkerRenderRequest = {
    request,
    context: {
      daemonUrl: (process.env.OD_EXPORT_WORKER_DAEMON_URL ?? '').trim() || context.daemonUrl,
      projectsRoot: context.projectsRoot,
    },
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), workerTimeoutMs());
  try {
    const response = await fetch(`${baseUrl}/render`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const body = await response.json() as ExportWorkerRenderResponse;
    if (!response.ok || !body.ok) {
      const message = body.ok
        ? `remote export worker returned ${response.status}`
        : body.error.message;
      throw new Error(message);
    }
    return deserializeExportCacheOutcome(body.outcome);
  } finally {
    clearTimeout(timeout);
  }
}
