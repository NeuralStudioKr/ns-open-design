import JSZip from 'jszip';
import {
  buildStandaloneDeckHtmlDocument,
  healDeckHtmlForStandaloneExport,
} from '@open-design/contracts';

import { buildScreenshotPptx } from './deck-export.js';
import {
  isHeadlessChromiumUnavailableExportError,
  renderHeadlessDeckImages,
  renderHeadlessEditablePptx,
  renderHeadlessHtmlSnapshot,
  renderHeadlessImage,
  renderHeadlessPdf,
  type HeadlessImageFormat,
} from './headless-export.js';
import {
  buildDesktopPdfExportInput,
  type BuiltDesktopPdfExport,
} from './pdf-export.js';
import {
  exportCacheDescriptor,
  runCachedExport,
  type ExportCacheOutcome,
} from './export-cache-runtime.js';

const DECK_LAYOUT_RENDER_CACHE_VERSION = 'deck-layout-preview-parity-v5';
const DECK_IMAGE_RENDER_CACHE_VERSION = `${DECK_LAYOUT_RENDER_CACHE_VERSION}:image-v3`;
const DECK_PPTX_EDITABLE_RENDER_CACHE_VERSION = `${DECK_LAYOUT_RENDER_CACHE_VERSION}:pptx-editable-dom-v4`;
const DECK_PPTX_SCREEN_RENDER_CACHE_VERSION = `${DECK_LAYOUT_RENDER_CACHE_VERSION}:pptx-screen-ooxml-v5`;

export type ExportRenderServiceContext = {
  daemonUrl: string;
  projectId: string;
  projectsRoot: string;
  prepareBuilt?: (built: BuiltDesktopPdfExport, req: ExportRenderRequest) => Promise<void>;
};

export type ExportRenderRequest = {
  fileName: string;
  title?: string;
  deck?: boolean;
  inlineHtml?: string | null;
  inlineHtmlPrepareMode?: 'standalone' | 'preview';
  fresh?: boolean;
  templateId?: string | null;
};

export type ImageExportRenderRequest = ExportRenderRequest & {
  format?: unknown;
  slideIndex?: unknown;
  width?: unknown;
  height?: unknown;
};

export type PptxExportRenderRequest = ExportRenderRequest & {
  editable?: unknown;
};

async function buildExportInput(
  ctx: ExportRenderServiceContext,
  req: ExportRenderRequest,
): Promise<BuiltDesktopPdfExport> {
  const built = await buildDesktopPdfExportInput({
    daemonUrl: ctx.daemonUrl,
    deck: req.deck === true,
    fileName: req.fileName,
    projectId: ctx.projectId,
    projectsRoot: ctx.projectsRoot,
    ...(typeof req.title === 'string' ? { title: req.title } : {}),
    ...(req.inlineHtml ? { inlineHtml: req.inlineHtml } : {}),
    ...(req.inlineHtmlPrepareMode ? { inlineHtmlPrepareMode: req.inlineHtmlPrepareMode } : {}),
  });
  await ctx.prepareBuilt?.(built, req);
  return built;
}

function baseExportFilename(built: BuiltDesktopPdfExport): string {
  return built.input.defaultFilename.replace(/\.pdf$/i, '') || 'artifact';
}

export function buildStaticHtmlExportFallback(input: { html: string; deck?: boolean }): string {
  if (input.deck !== true) return healDeckHtmlForStandaloneExport(input.html);
  return buildStandaloneDeckHtmlDocument(input.html);
}

export async function renderPdfExportOutcome(
  ctx: ExportRenderServiceContext,
  req: ExportRenderRequest,
): Promise<{ built: BuiltDesktopPdfExport; outcome: ExportCacheOutcome }> {
  const built = await buildExportInput(ctx, req);
  const outcome = await runCachedExport(
    { format: 'pdf', deck: req.deck === true, projectId: ctx.projectId },
    exportCacheDescriptor({
      projectId: ctx.projectId,
      sourceRelPath: built.source.relPath,
      sourceMtimeMs: built.source.mtimeMs,
      format: 'pdf',
      deck: req.deck === true,
      ...(req.deck === true ? { codeVersion: `${DECK_LAYOUT_RENDER_CACHE_VERSION}:pdf-v1` } : {}),
      filename: built.input.defaultFilename,
      mime: 'application/pdf',
    }),
    async () => {
      const pdf = await renderHeadlessPdf(
        { input: built.input },
        { projectId: ctx.projectId },
      );
      return {
        body: pdf,
        filename: built.input.defaultFilename,
        mime: 'application/pdf',
      };
    },
    { fresh: req.fresh === true },
  );
  return { built, outcome };
}

export async function renderImageExportOutcome(
  ctx: ExportRenderServiceContext,
  req: ImageExportRenderRequest,
): Promise<ExportCacheOutcome> {
  const imageFormat: HeadlessImageFormat =
    req.format === 'jpeg' || req.format === 'jpg'
      ? 'jpeg'
      : req.format === 'webp'
        ? 'webp'
        : 'png';
  const cacheFormat: 'png' | 'jpeg' | 'webp' = imageFormat;
  const built = await buildExportInput(ctx, req);
  const extension =
    imageFormat === 'jpeg' ? 'jpg' : imageFormat === 'webp' ? 'webp' : 'png';
  const base = baseExportFilename(built);
  const mime =
    imageFormat === 'jpeg'
      ? 'image/jpeg'
      : imageFormat === 'webp'
        ? 'image/webp'
        : 'image/png';
  return runCachedExport(
    { format: 'image', deck: req.deck === true, projectId: ctx.projectId },
    exportCacheDescriptor({
      projectId: ctx.projectId,
      sourceRelPath: built.source.relPath,
      sourceMtimeMs: built.source.mtimeMs,
      format: cacheFormat,
      deck: req.deck === true,
      ...(typeof req.slideIndex === 'number' ? { slideIndex: req.slideIndex } : {}),
      ...(req.deck === true ? { codeVersion: DECK_IMAGE_RENDER_CACHE_VERSION } : {}),
      filename: `${base}.${extension}`,
      mime,
    }),
    async () => {
      const image = await renderHeadlessImage(
        {
          input: built.input,
          imageFormat,
          ...(typeof req.slideIndex === 'number' ? { slideIndex: req.slideIndex } : {}),
          ...(typeof req.width === 'number' ? { width: req.width } : {}),
          ...(typeof req.height === 'number' ? { height: req.height } : {}),
        },
        { projectId: ctx.projectId },
      );
      return { body: image, filename: `${base}.${extension}`, mime };
    },
    { fresh: req.fresh === true },
  );
}

export async function renderPptxExportOutcome(
  ctx: ExportRenderServiceContext,
  req: PptxExportRenderRequest,
): Promise<ExportCacheOutcome> {
  const built = await buildExportInput(ctx, { ...req, deck: true });
  const base = baseExportFilename(built);
  const filename = `${base}.pptx`;
  const mime = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  const editable = req.editable !== false;
  return runCachedExport(
    { format: 'pptx', deck: true, projectId: ctx.projectId },
    exportCacheDescriptor({
      projectId: ctx.projectId,
      sourceRelPath: built.source.relPath,
      sourceMtimeMs: built.source.mtimeMs,
      format: 'pptx',
      deck: true,
      codeVersion: editable
        ? DECK_PPTX_EDITABLE_RENDER_CACHE_VERSION
        : DECK_PPTX_SCREEN_RENDER_CACHE_VERSION,
      filename,
      mime,
    }),
    async () => {
      if (editable) {
        const pptx = await renderHeadlessEditablePptx(
          { input: built.input },
          { projectId: ctx.projectId },
        );
        return { body: pptx, filename, mime };
      }
      const rendered = await renderHeadlessDeckImages(
        { input: built.input, imageFormat: 'png' },
        { projectId: ctx.projectId },
      );
      const pptx = await buildScreenshotPptx(rendered.images, {
        title: built.input.title,
        aspect: rendered.aspect,
      });
      return { body: pptx, filename, mime };
    },
    { fresh: req.fresh === true },
  );
}

export async function renderHtmlExportOutcome(
  ctx: ExportRenderServiceContext,
  req: ExportRenderRequest,
): Promise<ExportCacheOutcome> {
  const built = await buildExportInput(ctx, req);
  const base = baseExportFilename(built);
  return runCachedExport(
    { format: 'html', deck: req.deck === true, projectId: ctx.projectId },
    exportCacheDescriptor({
      projectId: ctx.projectId,
      sourceRelPath: built.source.relPath,
      sourceMtimeMs: built.source.mtimeMs,
      format: 'html',
      deck: req.deck === true,
      ...(req.deck === true ? { codeVersion: `${DECK_LAYOUT_RENDER_CACHE_VERSION}:html-v1` } : {}),
      filename: `${base}.html`,
      mime: 'text/html; charset=utf-8',
    }),
    async () => {
      let html: string;
      try {
        html = await renderHeadlessHtmlSnapshot(
          { input: built.input },
          { projectId: ctx.projectId },
        );
      } catch (err) {
        if (!isHeadlessChromiumUnavailableExportError(err)) throw err;
        console.warn('[export/html] headless Chromium unavailable; serving static HTML fallback', {
          projectId: ctx.projectId,
          fileName: req.fileName,
        });
        html = buildStaticHtmlExportFallback(built.input);
      }
      return {
        body: html,
        filename: `${base}.html`,
        mime: 'text/html; charset=utf-8',
      };
    },
    { fresh: req.fresh === true },
  );
}

export async function renderZipExportOutcome(
  ctx: ExportRenderServiceContext,
  req: ExportRenderRequest,
): Promise<ExportCacheOutcome> {
  const built = await buildExportInput(ctx, req);
  const base = baseExportFilename(built);
  return runCachedExport(
    { format: 'zip', deck: req.deck === true, projectId: ctx.projectId },
    exportCacheDescriptor({
      projectId: ctx.projectId,
      sourceRelPath: built.source.relPath,
      sourceMtimeMs: built.source.mtimeMs,
      format: 'zip',
      deck: req.deck === true,
      ...(req.deck === true ? { codeVersion: `${DECK_LAYOUT_RENDER_CACHE_VERSION}:zip-v1` } : {}),
      filename: `${base}.zip`,
      mime: 'application/zip',
    }),
    async () => {
      let html: string;
      try {
        html = await renderHeadlessHtmlSnapshot(
          { input: built.input },
          { projectId: ctx.projectId, format: 'zip' },
        );
      } catch (err) {
        if (!isHeadlessChromiumUnavailableExportError(err)) throw err;
        console.warn('[export/zip] headless Chromium unavailable; packaging static HTML fallback', {
          projectId: ctx.projectId,
          fileName: req.fileName,
        });
        html = buildStaticHtmlExportFallback(built.input);
      }
      const zip = new JSZip();
      zip.file('index.html', html, { date: new Date(0), binary: false });
      const buffer = await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });
      return { body: buffer, filename: `${base}.zip`, mime: 'application/zip' };
    },
    { fresh: req.fresh === true },
  );
}
