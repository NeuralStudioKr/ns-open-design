import nodePath from 'node:path';
import { registerLocalExportCache } from './export-cache-runtime.js';
import { renderExportJobOutcome, type ExportJobRunnerRequest } from './export-job-runner.js';
import type { ExportCacheOutcome } from './export-cache-runtime.js';

type WorkerRenderRequest = {
  request: ExportJobRunnerRequest;
  context: {
    daemonUrl: string;
    projectsRoot: string;
  };
};

type SerializedExportCacheOutcome = Omit<ExportCacheOutcome, 'body' | 'entry'> & {
  bodyBase64?: string;
  bodyText?: string;
};

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.once('error', reject);
    process.stdin.once('end', () => resolve(data));
  });
}

function serializeOutcome(outcome: ExportCacheOutcome): SerializedExportCacheOutcome {
  const base = { ...outcome };
  delete (base as { body?: unknown }).body;
  delete (base as { entry?: unknown }).entry;
  if ('body' in outcome && outcome.body !== undefined) {
    if (typeof outcome.body === 'string') {
      return { ...base, bodyText: outcome.body } as SerializedExportCacheOutcome;
    }
    return { ...base, bodyBase64: Buffer.from(outcome.body).toString('base64') } as SerializedExportCacheOutcome;
  }
  return base as SerializedExportCacheOutcome;
}

async function main(): Promise<void> {
  const cacheDir = (process.env.OD_EXPORT_CACHE_DIR ?? '').trim()
    || nodePath.join((process.env.OD_DATA_DIR ?? '/app/.od').trim(), '.od-export-cache');
  const stopCacheSweep = registerLocalExportCache(cacheDir);
  try {
    const input = JSON.parse(await readStdin()) as WorkerRenderRequest;
    const outcome = await renderExportJobOutcome(input.request, {
      renderContext: (projectId) => ({
        daemonUrl: input.context.daemonUrl,
        projectId,
        projectsRoot: input.context.projectsRoot,
      }),
      prepareOffloadPayload: async () => ({}),
    });
    process.stdout.write(`${JSON.stringify({ ok: true, outcome: serializeOutcome(outcome) })}\n`);
  } finally {
    stopCacheSweep();
  }
}

main().catch((err: unknown) => {
  process.stdout.write(`${JSON.stringify({
    ok: false,
    error: {
      name: (err as Error)?.name,
      message: String((err as Error)?.message || err),
      stack: (err as Error)?.stack,
    },
  })}\n`);
});
