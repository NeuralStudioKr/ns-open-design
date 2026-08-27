import http from 'node:http';
import nodePath from 'node:path';
import { registerLocalExportCache } from './export-cache-runtime.js';
import { renderExportJobOutcome } from './export-job-runner.js';
import {
  serializeExportCacheOutcome,
  type ExportWorkerRenderRequest,
  type ExportWorkerRenderResponse,
} from './export-worker-protocol.js';

const DEFAULT_PORT = 7460;
const DEFAULT_MAX_BODY_BYTES = 32 * 1024 * 1024;

function parsePositiveIntEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = (process.env[name] ?? '').trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function workerPort(): number {
  return parsePositiveIntEnv('OD_EXPORT_WORKER_PORT', DEFAULT_PORT, 1024, 65_535);
}

function maxBodyBytes(): number {
  return parsePositiveIntEnv(
    'OD_EXPORT_WORKER_MAX_BODY_BYTES',
    DEFAULT_MAX_BODY_BYTES,
    1024 * 1024,
    128 * 1024 * 1024,
  );
}

function cacheDir(): string {
  const override = (process.env.OD_EXPORT_CACHE_DIR ?? '').trim();
  if (override) return override;
  return nodePath.join((process.env.OD_DATA_DIR ?? '/app/.od').trim(), '.od-export-cache');
}

function readRequestBody(req: http.IncomingMessage): Promise<string> {
  const maxBytes = maxBodyBytes();
  return new Promise((resolve, reject) => {
    let total = 0;
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => {
      total += Buffer.byteLength(chunk, 'utf8');
      if (total > maxBytes) {
        req.destroy(new Error(`export worker request body exceeds ${maxBytes} bytes`));
        return;
      }
      body += chunk;
    });
    req.once('error', reject);
    req.once('end', () => resolve(body));
  });
}

function writeJson(
  res: http.ServerResponse,
  status: number,
  body: Record<string, unknown>,
): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(json, 'utf8'),
    'Cache-Control': 'no-store',
  });
  res.end(json);
}

function authorized(req: http.IncomingMessage): boolean {
  const token = (
    (process.env.OD_EXPORT_WORKER_TOKEN ?? '').trim()
    || (process.env.OD_API_TOKEN ?? '').trim()
  );
  if (!token) return false;
  return req.headers.authorization === `Bearer ${token}`;
}

async function handleRender(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  if (!authorized(req)) {
    writeJson(res, 401, { ok: false, error: { message: 'unauthorized' } });
    return;
  }
  try {
    const input = JSON.parse(await readRequestBody(req)) as ExportWorkerRenderRequest;
    const outcome = await renderExportJobOutcome(input.request, {
      renderContext: (projectId) => ({
        daemonUrl: input.context.daemonUrl,
        projectId,
        projectsRoot: input.context.projectsRoot,
      }),
      prepareOffloadPayload: async () => ({}),
    });
    const response: ExportWorkerRenderResponse = {
      ok: true,
      outcome: serializeExportCacheOutcome(outcome),
    };
    writeJson(res, 200, response);
  } catch (err: unknown) {
    const response: ExportWorkerRenderResponse = {
      ok: false,
      error: {
        message: String((err as Error)?.message || err),
        ...((err as Error)?.name ? { name: (err as Error).name } : {}),
        ...((err as Error)?.stack ? { stack: (err as Error).stack } : {}),
      },
    };
    writeJson(res, 500, response);
  }
}

registerLocalExportCache(cacheDir());

const server = http.createServer((req, res) => {
  void (async () => {
    if (req.method === 'GET' && req.url === '/health') {
      writeJson(res, 200, {
        ok: true,
        service: 'export-worker',
        dedicated: true,
      });
      return;
    }
    if (req.method === 'POST' && req.url === '/render') {
      await handleRender(req, res);
      return;
    }
    writeJson(res, 404, { ok: false, error: { message: 'not found' } });
  })().catch((err: unknown) => {
    writeJson(res, 500, { ok: false, error: { message: String((err as Error)?.message || err) } });
  });
});

server.listen(workerPort(), '0.0.0.0', () => {
  console.info(JSON.stringify({
    metric: 'od_export_worker_ready',
    port: workerPort(),
    cacheDir: cacheDir(),
  }));
});
