import type { ExportCacheOutcome } from './export-cache-runtime.js';
import type {
  ExportJobRunnerDeps,
  ExportJobRunnerRequest,
} from './export-job-runner.js';
import { renderExportJobOutcome } from './export-job-runner.js';
import {
  deserializeExportCacheOutcome,
  type ExportWorkerRenderRequest,
  type ExportWorkerRenderResponse,
} from './export-worker-protocol.js';

const DEFAULT_TIMEOUT_MS = 120_000;

class RemoteExportWorkerError extends Error {
  readonly code?: string;

  constructor(message: string, options: { code?: string; name?: string } = {}) {
    super(message);
    this.name = options.name || 'RemoteExportWorkerError';
    if (options.code) this.code = options.code;
  }
}

class RemoteExportWorkerUnavailableError extends Error {
  readonly code = 'EXPORT_WORKER_UNAVAILABLE';

  constructor(message: string) {
    super(message);
    this.name = 'RemoteExportWorkerUnavailableError';
  }
}

class RemoteExportWorkerAuthError extends RemoteExportWorkerError {
  constructor(message: string) {
    super(message, { code: 'EXPORT_WORKER_UNAUTHORIZED', name: 'RemoteExportWorkerAuthError' });
  }
}

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

function remoteWorkerFallbackEnabled(): boolean {
  const raw = (process.env.OD_EXPORT_WORKER_FALLBACK_ENABLED ?? '').trim().toLowerCase();
  return !['0', 'false', 'off', 'no'].includes(raw);
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
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/render`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (err: unknown) {
      throw new RemoteExportWorkerUnavailableError(String((err as Error)?.message || err));
    }
    let body: ExportWorkerRenderResponse;
    try {
      body = await response.json() as ExportWorkerRenderResponse;
    } catch (err: unknown) {
      throw new RemoteExportWorkerUnavailableError(
        `remote export worker returned non-json response ${response.status}: ${String((err as Error)?.message || err)}`,
      );
    }
    if (!response.ok || !body.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new RemoteExportWorkerAuthError(
          body.ok ? `remote export worker returned ${response.status}` : body.error.message,
        );
      }
      if (!body.ok && body.error.code) {
        throw new RemoteExportWorkerError(body.error.message, {
          code: body.error.code,
          ...(body.error.name ? { name: body.error.name } : {}),
        });
      }
      throw new RemoteExportWorkerUnavailableError(
        body.ok
          ? `remote export worker returned ${response.status}`
          : body.error.message,
      );
    }
    return deserializeExportCacheOutcome(body.outcome);
  } finally {
    clearTimeout(timeout);
  }
}

export async function renderExportJobWithRemoteWorkerFallback(
  request: ExportJobRunnerRequest,
  deps: ExportJobRunnerDeps,
): Promise<ExportCacheOutcome> {
  try {
    return await renderExportJobWithRemoteWorker(request, deps);
  } catch (err: unknown) {
    if (err instanceof RemoteExportWorkerUnavailableError && remoteWorkerFallbackEnabled()) {
      console.warn('[export/worker] unavailable; falling back to daemon in-process render', {
        projectId: request.projectId,
        format: request.format,
        reason: err.message,
      });
      return renderExportJobOutcome(request, deps);
    }
    throw err;
  }
}
