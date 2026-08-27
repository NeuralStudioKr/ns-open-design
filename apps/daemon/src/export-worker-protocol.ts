import type { ExportCacheOutcome } from './export-cache-runtime.js';
import type { ExportJobRunnerRequest } from './export-job-runner.js';

export type ExportWorkerRenderRequest = {
  request: ExportJobRunnerRequest;
  context: {
    daemonUrl: string;
    projectsRoot: string;
  };
};

export type SerializedExportCacheOutcome = Omit<ExportCacheOutcome, 'body' | 'entry'> & {
  bodyBase64?: string;
  bodyText?: string;
};

export type ExportWorkerRenderResponse = {
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

export function serializeExportCacheOutcome(outcome: ExportCacheOutcome): SerializedExportCacheOutcome {
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

export function deserializeExportCacheOutcome(serialized: SerializedExportCacheOutcome): ExportCacheOutcome {
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
