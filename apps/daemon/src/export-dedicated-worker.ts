import { spawn } from 'node:child_process';
import nodePath from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ExportCacheOutcome } from './export-cache-runtime.js';
import type {
  ExportJobRunnerDeps,
  ExportJobRunnerRequest,
} from './export-job-runner.js';

type WorkerRenderRequest = {
  request: ExportJobRunnerRequest;
  context: {
    daemonUrl: string;
    projectsRoot: string;
  };
};

type WorkerRenderResponse = {
  ok: true;
  outcome: SerializedExportCacheOutcome;
} | {
  ok: false;
  error: {
    code?: string;
    name?: string;
    message: string;
    stack?: string;
  };
};

type SerializedExportCacheOutcome = Omit<ExportCacheOutcome, 'body' | 'entry'> & {
  bodyBase64?: string;
  bodyText?: string;
};

const DEFAULT_WORKER_TIMEOUT_MS = 120_000;

function parsePositiveIntEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = (process.env[name] ?? '').trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

export function isDedicatedExportWorkerEnabled(): boolean {
  return (process.env.OD_EXPORT_DEDICATED_WORKER_ENABLED ?? '').trim() === '1';
}

function dedicatedWorkerTimeoutMs(): number {
  return parsePositiveIntEnv(
    'OD_EXPORT_DEDICATED_WORKER_TIMEOUT_MS',
    DEFAULT_WORKER_TIMEOUT_MS,
    10_000,
    600_000,
  );
}

function workerScriptPath(): string {
  const here = nodePath.dirname(fileURLToPath(import.meta.url));
  return nodePath.join(here, 'export-worker-child.js');
}

function deserializeOutcome(serialized: SerializedExportCacheOutcome): ExportCacheOutcome {
  const base = { ...serialized };
  delete base.bodyBase64;
  delete base.bodyText;
  if (serialized.bodyBase64 !== undefined) {
    return {
      ...base,
      body: Buffer.from(serialized.bodyBase64, 'base64'),
    } as ExportCacheOutcome;
  }
  if (serialized.bodyText !== undefined) {
    return {
      ...base,
      body: serialized.bodyText,
    } as ExportCacheOutcome;
  }
  return base as ExportCacheOutcome;
}

export async function renderExportJobWithDedicatedWorker(
  request: ExportJobRunnerRequest,
  deps: ExportJobRunnerDeps,
): Promise<ExportCacheOutcome> {
  const context = deps.renderContext(request.projectId);
  const payload: WorkerRenderRequest = {
    request,
    context: {
      daemonUrl: context.daemonUrl,
      projectsRoot: context.projectsRoot,
    },
  };
  const child = spawn(process.execPath, [workerScriptPath()], {
    env: {
      ...process.env,
      OD_EXPORT_WORKER_CHILD: '1',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  const timer = setTimeout(() => {
    child.kill('SIGTERM');
  }, dedicatedWorkerTimeoutMs());
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  child.stdin.end(`${JSON.stringify(payload)}\n`);
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(code));
  }).finally(() => clearTimeout(timer));
  if (exitCode !== 0) {
    throw new Error(`dedicated export worker exited with ${exitCode ?? 'signal'}: ${stderr.trim()}`);
  }
  const responseLine = stdout.trim().split('\n').filter(Boolean).at(-1);
  if (!responseLine) {
    throw new Error(`dedicated export worker produced no response: ${stderr.trim()}`);
  }
  const response = JSON.parse(responseLine) as WorkerRenderResponse;
  if (!response.ok) {
    const err = new Error(response.error.message);
    err.name = response.error.name || 'DedicatedExportWorkerError';
    throw err;
  }
  return deserializeOutcome(response.outcome);
}
