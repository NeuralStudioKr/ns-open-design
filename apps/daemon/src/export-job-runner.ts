import { DeckSlideCountLimitError } from './headless-export.js';
import { ExportQueueFullError } from './export-runtime.js';
import {
  completeExportJob,
  failExportJob,
  markExportJobRunning,
  type ExportJobFormat,
  type ExportJobResult,
} from './export-job-store.js';
import {
  renderHtmlExportOutcome,
  renderImageExportOutcome,
  renderPdfExportOutcome,
  renderPptxExportOutcome,
  renderZipExportOutcome,
  type ExportRenderServiceContext,
} from './export-render-service.js';
import { type ExportCacheOutcome } from './export-cache-runtime.js';
import { storeExportDownload } from './export-download-store.js';
import { isExportOffloadRequired } from './export-offload-key.js';

export type ExportJobRunnerRequest = {
  jobId: string;
  projectId: string;
  workspaceId: string | null;
  format: ExportJobFormat;
  fileName: string;
  deck: boolean;
  title?: string;
  inlineHtml?: string;
  inlineHtmlPrepareMode?: 'standalone' | 'preview';
  fresh?: boolean;
  templateId?: string | null;
  image?: {
    format?: unknown;
    slideIndex?: unknown;
    width?: unknown;
    height?: unknown;
  };
  pptx?: {
    editable?: unknown;
  };
};

export type ExportJobOffloadPayload =
  | { offloadEnabled: true; offloadKey?: string; offloadStatus: string; offloadReason?: string }
  | Record<string, never>;

export type ExportJobRenderers = {
  pdf: typeof renderPdfExportOutcome;
  html: typeof renderHtmlExportOutcome;
  zip: typeof renderZipExportOutcome;
  image: typeof renderImageExportOutcome;
  pptx: typeof renderPptxExportOutcome;
};

export type ExportJobRunnerDeps = {
  renderContext: (projectId: string) => ExportRenderServiceContext;
  prepareOffloadPayload: (
    request: ExportJobRunnerRequest,
    outcome: ExportCacheOutcome,
  ) => Promise<ExportJobOffloadPayload>;
  renderOutcome?: (
    request: ExportJobRunnerRequest,
    deps: ExportJobRunnerDeps,
  ) => Promise<ExportCacheOutcome>;
  renderers?: ExportJobRenderers;
  storeDownload?: typeof storeExportDownload;
  isOffloadRequired?: () => boolean;
  logger?: Pick<Console, 'warn'>;
};

export const DEFAULT_EXPORT_JOB_RENDERERS: ExportJobRenderers = {
  pdf: renderPdfExportOutcome,
  html: renderHtmlExportOutcome,
  zip: renderZipExportOutcome,
  image: renderImageExportOutcome,
  pptx: renderPptxExportOutcome,
};

export async function renderExportJobOutcome(
  request: ExportJobRunnerRequest,
  deps: ExportJobRunnerDeps,
): Promise<ExportCacheOutcome> {
  const renderers = deps.renderers ?? DEFAULT_EXPORT_JOB_RENDERERS;
  const baseRequest = {
    fileName: request.fileName,
    deck: request.deck,
    ...(request.title ? { title: request.title } : {}),
    ...(request.inlineHtml ? { inlineHtml: request.inlineHtml } : {}),
    ...(request.inlineHtmlPrepareMode ? { inlineHtmlPrepareMode: request.inlineHtmlPrepareMode } : {}),
    ...(request.fresh ? { fresh: true } : {}),
    ...(request.templateId ? { templateId: request.templateId } : {}),
  };
  if (request.format === 'pdf') {
    return (await renderers.pdf(deps.renderContext(request.projectId), baseRequest)).outcome;
  }
  if (request.format === 'html') {
    return renderers.html(deps.renderContext(request.projectId), baseRequest);
  }
  if (request.format === 'zip') {
    return renderers.zip(deps.renderContext(request.projectId), baseRequest);
  }
  if (request.format === 'image') {
    return renderers.image(deps.renderContext(request.projectId), {
      ...baseRequest,
      format: request.image?.format,
      slideIndex: request.image?.slideIndex,
      width: request.image?.width,
      height: request.image?.height,
    });
  }
  return renderers.pptx(deps.renderContext(request.projectId), {
    ...baseRequest,
    deck: true,
    editable: request.pptx?.editable,
  });
}

function canRedirectToOffloadedObject(offloadPayload: ExportJobOffloadPayload): offloadPayload is {
  offloadEnabled: true;
  offloadKey: string;
  offloadStatus: 'uploaded' | 'hit';
  offloadReason?: string;
} {
  return Boolean(
    'offloadKey' in offloadPayload
      && offloadPayload.offloadKey
      && (offloadPayload.offloadStatus === 'uploaded' || offloadPayload.offloadStatus === 'hit'),
  );
}

export async function runExportJobInBackground(input: {
  request: ExportJobRunnerRequest;
  deps: ExportJobRunnerDeps;
}): Promise<void> {
  const { request, deps } = input;
  const renderOutcome = deps.renderOutcome ?? renderExportJobOutcome;
  const storeDownload = deps.storeDownload ?? storeExportDownload;
  const isOffloadRequired = deps.isOffloadRequired ?? isExportOffloadRequired;
  const logger = deps.logger ?? console;
  const runningJob = markExportJobRunning(request.projectId, request.jobId);
  if (!runningJob) {
    logger.warn('[export/job] skipped missing job', {
      projectId: request.projectId,
      jobId: request.jobId,
      format: request.format,
    });
    return;
  }
  try {
    const outcome = await renderOutcome(request, deps);
    const offloadPayload = await deps.prepareOffloadPayload(request, outcome);
    const canRedirect = canRedirectToOffloadedObject(offloadPayload);
    if (isOffloadRequired() && !canRedirect) {
      failExportJob(request.projectId, request.jobId, {
        code: 'EXPORT_OFFLOAD_UNAVAILABLE',
        message: 'export offload is required but no S3 redirect ticket could be prepared',
      });
      return;
    }
    const ticket = await storeDownload({
      projectId: request.projectId,
      ...(outcome.filePath
        ? { sourceFilePath: outcome.filePath }
        : { body: outcome.body! }),
      bytes: outcome.bytes,
      filename: outcome.filename,
      mime: outcome.mime,
      ...(canRedirect
        ? { deliveryMode: 'redirect' as const, offloadKey: offloadPayload.offloadKey }
        : {}),
      ...('offloadStatus' in offloadPayload && offloadPayload.offloadStatus
        ? { offloadStatus: offloadPayload.offloadStatus }
        : {}),
      ...('offloadReason' in offloadPayload && offloadPayload.offloadReason
        ? { offloadReason: offloadPayload.offloadReason }
        : {}),
    });
    const result: ExportJobResult = {
      downloadUrl: ticket.url,
      filename: ticket.filename,
      mime: ticket.mime,
      bytes: ticket.bytes,
      cache: outcome.cache,
      deliveryMode: ticket.deliveryMode,
      ...(ticket.offloadStatus ? { offloadStatus: ticket.offloadStatus } : {}),
      ...(ticket.offloadReason ? { offloadReason: ticket.offloadReason } : {}),
      expiresAt: ticket.expiresAt,
    };
    completeExportJob(request.projectId, request.jobId, result);
  } catch (err: unknown) {
    const reason = String((err as Error)?.message || err);
    failExportJob(request.projectId, request.jobId, {
      code: err instanceof ExportQueueFullError
        ? err.code
        : err instanceof DeckSlideCountLimitError
          ? err.code
          : 'EXPORT_FAILED',
      message: reason,
    });
    logger.warn('[export/job] failed', {
      projectId: request.projectId,
      jobId: request.jobId,
      format: request.format,
      reason,
    });
  }
}
