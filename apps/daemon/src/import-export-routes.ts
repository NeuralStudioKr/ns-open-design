import type { Express } from 'express';
import {
  PROJECT_EXPORT_MANIFEST_SCHEMA,
  injectDeckHtmlExportViewportScript,
  patchArtifactDeckPrintCss,
} from '@open-design/contracts';
import fs from 'node:fs';
import nodePath from 'node:path';
import JSZip from 'jszip';
import type { RouteDeps } from './server-context.js';
import {
  InlineAssetsLimitError,
  MAX_INLINE_OWNER_BYTES,
  inlineRelativeAssets,
  type InlineAssetReader,
} from './inline-assets.js';
import { sandboxImportedProjectRootUnavailableReason } from './sandbox-mode.js';
import { parseOrchestratorWorkspace } from './workspace-contract.js';
import type { ProjectStorageAccessHooks } from './storage/lazy-project-materialization.js';
import { isTeamverDesignManaged } from './teamver-project-access.js';
import {
  buildDeckHtmlExportScreenCss,
  buildDeckHtmlExportStaticRevealScript,
  isHeadlessChromiumUnavailableExportError,
  renderHeadlessHtmlSnapshot,
  renderHeadlessDeckImages,
  renderHeadlessEditablePptx,
  renderHeadlessImage,
  renderHeadlessPdf,
  type HeadlessImageFormat,
} from './headless-export.js';
import { buildScreenshotPptx } from './deck-export.js';
import { ExportQueueFullError } from './export-runtime.js';
import {
  claimExportDownload,
  completeExportDownload,
  releaseExportDownloadClaim,
  storeExportDownload,
  wantsTicketDelivery,
} from './export-download-store.js';
import {
  exportCacheDescriptor,
  runCachedExport,
  type ExportCacheOutcome,
} from './export-cache-runtime.js';

export interface RegisterImportRoutesDeps extends RouteDeps<'db' | 'http' | 'uploads' | 'node' | 'ids' | 'paths' | 'imports' | 'auth' | 'projectStore' | 'conversations' | 'projectFiles' | 'validation'> {
  projectStorageHooks?: ProjectStorageAccessHooks | null;
}

function setAttachmentHeaders(res: { setHeader(name: string, value: string): void }, contentType: string, filename: string): void {
  const safeName = filename.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '_') || 'artifact';
  res.setHeader('Content-Type', contentType);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
  );
}

/**
 * Accept the "cache bypass" toggle from either a query string (`?fresh=1`)
 * or a body flag (`{"fresh":true}`). Templates that ship a new render
 * pipeline (e.g. Guizang WebGL rasterize fix) can otherwise be pinned to
 * a bad cached artifact until the cache-version env bump reaches prod.
 */
/**
 * Extract the FE-provided artifact HTML from an export request body.
 *
 * When the FE ships its current in-memory HTML snapshot alongside the export
 * request, the daemon renders it directly and skips reading from local
 * scratch (see `buildDesktopPdfExportInput`). This makes PDF/HTML/ZIP/image
 * exports resilient to `teamver_project_s3_prefix_required` — a transient
 * `design-api /access` failure or an evicted-scratch state no longer blocks
 * the download. The middleware also uses this signal to unconditionally
 * soft-continue on `/export/*` and `/archive*` routes.
 */
export function readInlineHtmlFromBody(
  body: Record<string, unknown> | undefined | null,
): string | null {
  if (!body || typeof body !== 'object') return null;
  const raw = (body as Record<string, unknown>)['html'];
  if (typeof raw !== 'string') return null;
  return raw.trim().length > 0 ? raw : null;
}

function wantsFreshExport(req: {
  query?: Record<string, unknown>;
  body?: Record<string, unknown> | undefined;
}): boolean {
  const qs = req.query;
  if (qs && typeof qs === 'object') {
    const raw = qs['fresh'];
    if (raw === '1' || raw === 'true' || raw === true) return true;
  }
  const body = req.body;
  if (body && typeof body === 'object') {
    const raw = (body as Record<string, unknown>)['fresh'];
    if (raw === true || raw === '1' || raw === 'true') return true;
  }
  return false;
}

async function respondExportPayload(
  res: {
    status(code: number): { json(body: unknown): void };
    send(body: Buffer): void;
    setHeader(name: string, value: string): void;
    headersSent: boolean;
    on(event: 'error' | 'close', cb: (err?: unknown) => void): unknown;
  },
  options: {
    projectId: string;
    /** Present on cache miss OR memo hit — full bytes in RAM. */
    body?: Buffer | string;
    /**
     * Present on local/S3 cache hit. Stream directly to the client without
     * copying the file into RAM. Ticket-delivery keeps the same file
     * (ownsFile=false) so the cache retains eviction ownership.
     */
    sourceFilePath?: string;
    filename: string;
    mime: string;
    bytes: number;
    cache?: string;
    ticket: boolean;
  },
): Promise<void> {
  if (options.ticket) {
    const entry = await storeExportDownload({
      projectId: options.projectId,
      ...(options.sourceFilePath
        ? { sourceFilePath: options.sourceFilePath }
        : { body: options.body! }),
      bytes: options.bytes,
      filename: options.filename,
      mime: options.mime,
    });
    res.status(201).json({
      delivery: 'ticket',
      downloadUrl: entry.url,
      filename: entry.filename,
      mime: entry.mime,
      bytes: entry.bytes,
      sizeBytes: entry.bytes,
      ...(options.cache ? { cache: options.cache } : {}),
      expiresAt: new Date(entry.expiresAt).toISOString(),
    });
    return;
  }
  setAttachmentHeaders(res, options.mime, options.filename);
  if (options.sourceFilePath) {
    await new Promise<void>((resolve, reject) => {
      const stream = fs.createReadStream(options.sourceFilePath!);
      stream.on('error', reject);
      // `res` implements Writable — cast to unknown to avoid pulling in
      // express types at this layer.
      stream.pipe(res as unknown as NodeJS.WritableStream);
      stream.on('end', () => resolve());
      // If the client closed the connection first, resolve so the caller's
      // try/finally can proceed. The stream will emit 'close' cleanly.
      (res as unknown as NodeJS.EventEmitter).on('close', () => resolve());
    });
    return;
  }
  res.send(typeof options.body === 'string' ? Buffer.from(options.body, 'utf8') : options.body!);
}

function outcomeAsRespondPayload(
  outcome: ExportCacheOutcome,
): {
  body?: Buffer | string;
  sourceFilePath?: string;
  filename: string;
  mime: string;
  bytes: number;
  cache: string;
} {
  return {
    ...(outcome.filePath ? { sourceFilePath: outcome.filePath } : {}),
    ...(outcome.body !== undefined ? { body: outcome.body } : {}),
    filename: outcome.filename,
    mime: outcome.mime,
    bytes: outcome.bytes,
    cache: outcome.cache,
  };
}

function handleExportRouteError(
  res: { setHeader(name: string, value: string): void },
  sendApiError: (
    res: { setHeader(name: string, value: string): void },
    status: number,
    code: string,
    message: string,
  ) => void,
  routeLabel: string,
  projectId: string,
  err: unknown,
): void {
  if (err instanceof ExportQueueFullError) {
    res.setHeader('Retry-After', '15');
    sendApiError(res, 503, err.code, err.message);
    return;
  }
  const reason = String((err as Error)?.message || err);
  if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'ENOENT') {
    sendApiError(res, 404, 'FILE_NOT_FOUND', reason);
    return;
  }
  // Distinct code for the "no working Chromium binary" case lets the FE
  // trigger the browser-print fallback without regex-sniffing the
  // message. Also collapse the Playwright call log to a compact reason
  // so the toast/HUD is readable.
  if (isHeadlessChromiumUnavailableExportError(err)) {
    console.warn(`[${routeLabel}] chromium unavailable`, { projectId, reason });
    sendApiError(
      res,
      503,
      'HEADLESS_CHROMIUM_UNAVAILABLE',
      'headless Chromium unavailable — falling back to browser print',
    );
    return;
  }
  console.warn(`[${routeLabel}] failed`, { projectId, reason });
  sendApiError(res, 500, 'EXPORT_FAILED', reason);
}

function injectExportSnippetIntoHead(html: string, snippet: string): string {
  if (!snippet) return html;
  if (/<\/head\s*>/i.test(html)) {
    return html.replace(/<\/head\s*>/i, `${snippet}</head>`);
  }
  if (/<html(?:\s[^>]*)?>/i.test(html)) {
    return html.replace(/<html(?:\s[^>]*)?>/i, (match) => `${match}<head>${snippet}</head>`);
  }
  return `${snippet}${html}`;
}

function injectExportSnippetBeforeBodyClose(html: string, snippet: string): string {
  if (!snippet) return html;
  if (/<\/body\s*>/i.test(html)) {
    return html.replace(/<\/body\s*>/i, `${snippet}</body>`);
  }
  return `${html}${snippet}`;
}

export function buildStaticHtmlExportFallback(input: { html: string; deck?: boolean }): string {
  if (input.deck !== true) return input.html;
  const cleaned = patchArtifactDeckPrintCss(input.html);
  const style = `<style data-teamver-static-html-export-fallback>
html, body {
  margin: 0 !important;
  scrollbar-width: none !important;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}
*::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
${buildDeckHtmlExportScreenCss()}
</style>`;
  const revealScript = `<script data-od-html-export-reveal>${buildDeckHtmlExportStaticRevealScript()}</script>`;
  const withHead = injectExportSnippetIntoHead(cleaned, style);
  const withReveal = injectExportSnippetBeforeBodyClose(withHead, revealScript);
  return injectDeckHtmlExportViewportScript(withReveal);
}

export { isHeadlessChromiumUnavailableExportError } from './headless-export.js';

export function registerImportRoutes(app: Express, ctx: RegisterImportRoutesDeps) {
  const { db } = ctx;
  const { sendApiError } = ctx.http;
  const { importUpload } = ctx.uploads;
  const { fs, path } = ctx.node;
  const { randomId } = ctx.ids;
  const { PROJECTS_DIR, RUNTIME_DATA_DIR_CANONICAL } = ctx.paths;
  const { importClaudeDesignZip, projectDir, detectEntryFile } = ctx.imports;
  const {
    consumedImportNonces,
    desktopAuthSecret,
    isDesktopAuthGateActive,
    pruneExpiredImportNonces,
    verifyDesktopImportToken,
  } = ctx.auth;
  const { getProject, insertProject, updateProject } = ctx.projectStore;
  const { insertConversation } = ctx.conversations;
  const { setTabs } = ctx.projectFiles;
  const { validateProjectDesignSystemId } = ctx.validation;
  app.post(
    '/api/import/claude-design',
    importUpload.single('file'),
    async (req, res) => {
      try {
        if (!req.file)
          return res.status(400).json({ error: 'zip file required' });
        const originalName =
          req.file.originalname || 'Claude Design export.zip';
        if (!/\.zip$/i.test(originalName)) {
          fs.promises.unlink(req.file.path).catch(() => {});
          return res.status(400).json({ error: 'expected a .zip file' });
        }
        const id = randomId();
        const now = Date.now();
        const baseName =
          originalName.replace(/\.zip$/i, '').trim() || 'Claude Design import';
        const imported = await importClaudeDesignZip(
          req.file.path,
          projectDir(PROJECTS_DIR, id),
        );
        fs.promises.unlink(req.file.path).catch(() => {});

        const project = insertProject(db, {
          id,
          name: baseName,
          skillId: null,
          designSystemId: null,
          pendingPrompt: `Imported from Claude Design ZIP: ${originalName}. Continue editing ${imported.entryFile}.`,
          metadata: {
            kind: 'prototype',
            importedFrom: 'claude-design',
            entryFile: imported.entryFile,
            sourceFileName: originalName,
          },
          createdAt: now,
          updatedAt: now,
        });
        const cid = randomId();
        insertConversation(db, {
          id: cid,
          projectId: id,
          title: 'Imported Claude Design project',
          createdAt: now,
          updatedAt: now,
        });
        setTabs(db, id, [imported.entryFile], imported.entryFile);
        if (ctx.projectStorageHooks) {
          void ctx.projectStorageHooks.persistAfterMutation(req, id);
        }
        res.json({
          project,
          conversationId: cid,
          entryFile: imported.entryFile,
          files: imported.files,
        });
      } catch (err: any) {
        if (req.file?.path) fs.promises.unlink(req.file.path).catch(() => {});
        res.status(400).json({ error: String(err) });
      }
    },
  );

  // Import an existing local folder as a project. The user picks a folder
  // and OD works inside it directly: every write goes to metadata.baseDir.
  // No copy, no shadow tree — the user owns the workspace and is
  // responsible for their own version control (git, time machine, etc.),
  // mirroring how Cursor / Claude Code / Aider behave.
  // Replace an existing project's working directory in-place. Mirrors
  // the same trust-gate, realpath, and data-dir checks as folder import,
  // but updates metadata.baseDir on an existing project record.
  app.post('/api/projects/:id/working-dir', async (req, res) => {
    try {
      if (isTeamverDesignManaged()) {
        return sendApiError(
          res,
          400,
          'WORKING_DIR_UNAVAILABLE',
          'local working directory changes are not available in Teamver embed mode',
        );
      }
      const projectId = req.params.id;
      const existing = getProject(db, projectId);
      if (!existing) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
      }
      const { baseDir, orchestratorWorkspace } = req.body || {};
      if (typeof baseDir !== 'string' || !baseDir.trim()) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'baseDir required');
      }
      const parsedOrchestratorWorkspace =
        parseOrchestratorWorkspace(orchestratorWorkspace);
      if (!parsedOrchestratorWorkspace.ok) {
        return sendApiError(
          res,
          400,
          'BAD_REQUEST',
          parsedOrchestratorWorkspace.message,
        );
      }
      const normalizedOrchestratorWorkspace = parsedOrchestratorWorkspace.value;
      let trustedPickerImport = false;
      if (isDesktopAuthGateActive()) {
        const secret = desktopAuthSecret();
        if (secret == null) {
          return sendApiError(
            res,
            503,
            'DESKTOP_AUTH_PENDING',
            'desktop auth required but secret not yet registered',
            {
              details: { hint: 'restart desktop or wait for sidecar registration' },
              retryable: true,
            },
          );
        }
        const headerValue = req.get('x-od-desktop-import-token');
        const token = typeof headerValue === 'string' ? headerValue : '';
        const now = Date.now();
        pruneExpiredImportNonces(now);
        const verification = verifyDesktopImportToken(
          secret,
          baseDir,
          token,
          now,
          consumedImportNonces,
        );
        if (!verification.ok) {
          return sendApiError(
            res,
            403,
            'FORBIDDEN',
            'desktop import token rejected',
            { details: { reason: verification.reason } },
          );
        }
        consumedImportNonces.set(verification.nonce, verification.exp);
        trustedPickerImport = true;
      }

      const trimmedInput = baseDir.trim();
      if (!path.isAbsolute(path.normalize(trimmedInput))) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'baseDir must be absolute');
      }
      let normalizedPath: string;
      try {
        normalizedPath = await fs.promises.realpath(trimmedInput);
      } catch {
        return sendApiError(res, 400, 'BAD_REQUEST', 'folder not found');
      }
      let dirStat;
      try {
        dirStat = await fs.promises.lstat(normalizedPath);
      } catch {
        return sendApiError(res, 400, 'BAD_REQUEST', 'folder not found');
      }
      if (!dirStat.isDirectory()) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'path must be a directory');
      }
      if (path.parse(normalizedPath).root === normalizedPath) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'cannot point at the filesystem root');
      }
      if (
        normalizedPath === RUNTIME_DATA_DIR_CANONICAL ||
        normalizedPath.startsWith(RUNTIME_DATA_DIR_CANONICAL + path.sep)
      ) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'cannot point at the data directory');
      }
      const sandboxReason = normalizedOrchestratorWorkspace
        ? null
        : sandboxImportedProjectRootUnavailableReason(normalizedPath);
      if (sandboxReason) {
        return sendApiError(res, 400, 'BAD_REQUEST', sandboxReason);
      }

      const entryFile = await detectEntryFile(normalizedPath);
      const existingMeta = existing.metadata ?? {};
      const { orchestratorWorkspace: _existingOrchestratorWorkspace, ...preservedMeta } =
        existingMeta;
      const nextMeta = {
        ...preservedMeta,
        kind: existingMeta.kind ?? 'prototype',
        baseDir: normalizedPath,
        importedFrom: 'folder' as const,
        entryFile,
        ...(normalizedOrchestratorWorkspace
          ? { orchestratorWorkspace: normalizedOrchestratorWorkspace }
          : {}),
        ...(trustedPickerImport ? { fromTrustedPicker: true as const } : {}),
      };
      const updated = updateProject(db, projectId, { metadata: nextMeta });
      if (!updated) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
      }
      // Folder imports should land on Design Files so users can choose from
      // the imported folder's artifacts. Persist an empty saved tab state so
      // ProjectView does not auto-open the detected primary file on hydration.
      setTabs(db, projectId, [], null);
      /** @type {import('@open-design/contracts').ReplaceProjectWorkingDirResponse} */
      const body = { project: updated, baseDir: normalizedPath, entryFile };
      res.json(body);
    } catch (err: any) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err?.message || err));
    }
  });

  app.post('/api/import/folder', async (req, res) => {
    try {
      if (isTeamverDesignManaged()) {
        return sendApiError(
          res,
          400,
          'FOLDER_IMPORT_UNAVAILABLE',
          'folder import is not available in Teamver embed mode',
        );
      }
      const { baseDir, name, skillId, designSystemId, orchestratorWorkspace } = req.body || {};
      if (typeof baseDir !== 'string' || !baseDir.trim()) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'baseDir required');
      }
      const parsedOrchestratorWorkspace =
        parseOrchestratorWorkspace(orchestratorWorkspace);
      if (!parsedOrchestratorWorkspace.ok) {
        return sendApiError(
          res,
          400,
          'BAD_REQUEST',
          parsedOrchestratorWorkspace.message,
        );
      }
      const normalizedOrchestratorWorkspace = parsedOrchestratorWorkspace.value;
      let trustedPickerImport = false;
      if (isDesktopAuthGateActive()) {
        const secret = desktopAuthSecret();
        if (secret == null) {
          return sendApiError(
            res,
            503,
            'DESKTOP_AUTH_PENDING',
            'desktop auth required but secret not yet registered',
            {
              details: { hint: 'restart desktop or wait for sidecar registration' },
              retryable: true,
            },
          );
        }
        const headerValue = req.get('x-od-desktop-import-token');
        const token = typeof headerValue === 'string' ? headerValue : '';
        const now = Date.now();
        pruneExpiredImportNonces(now);
        const verification = verifyDesktopImportToken(
          secret,
          baseDir,
          token,
          now,
          consumedImportNonces,
        );
        if (!verification.ok) {
          return sendApiError(
            res,
            403,
            'FORBIDDEN',
            'desktop import token rejected',
            { details: { reason: verification.reason } },
          );
        }
        consumedImportNonces.set(verification.nonce, verification.exp);
        trustedPickerImport = true;
      }
      const trimmedInput = baseDir.trim();
      if (!path.isAbsolute(path.normalize(trimmedInput))) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'baseDir must be absolute');
      }
      // Resolve symlinks once at import and persist the canonical path.
      // Without this, a user-controlled symlink (e.g. ~/sneaky → /etc) at
      // baseDir would let writeProjectFile escape the project sandbox at
      // every later call: resolveSafe checks the *literal* baseDir, but
      // the OS follows the symlink at write time. realpath() collapses
      // the chain so the stored baseDir == what the kernel will write to.
      let normalizedPath: string;
      try {
        normalizedPath = await fs.promises.realpath(trimmedInput);
      } catch {
        return sendApiError(res, 400, 'BAD_REQUEST', 'folder not found');
      }
      // realpath resolved → lstat the canonical path to ensure it's a
      // real directory, not another symlink (defense-in-depth).
      let dirStat;
      try {
        dirStat = await fs.promises.lstat(normalizedPath);
      } catch {
        return sendApiError(res, 400, 'BAD_REQUEST', 'folder not found');
      }
      if (!dirStat.isDirectory()) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'path must be a directory');
      }
      if (path.parse(normalizedPath).root === normalizedPath) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'cannot import the filesystem root');
      }
      // Prevent importing the data directory into itself (post-realpath so
      // a symlink pointing into RUNTIME_DATA_DIR is also caught). Compare
      // against the canonical alias because `normalizedPath` is the import
      // folder's realpath; on macOS the data dir at /var/... resolves to
      // /private/var/... and would never start-with the user-shaped path.
      if (
        normalizedPath === RUNTIME_DATA_DIR_CANONICAL ||
        normalizedPath.startsWith(RUNTIME_DATA_DIR_CANONICAL + path.sep)
      ) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'cannot import the data directory');
      }
      const sandboxReason = normalizedOrchestratorWorkspace
        ? null
        : sandboxImportedProjectRootUnavailableReason(normalizedPath);
      if (sandboxReason) {
        return sendApiError(res, 400, 'BAD_REQUEST', sandboxReason);
      }

      const id = randomId();
      const now = Date.now();
      const projectName =
        typeof name === 'string' && name.trim()
          ? name.trim()
          : path.basename(normalizedPath);
      const entryFile = await detectEntryFile(normalizedPath);
      const designSystemValidation = await validateProjectDesignSystemId(designSystemId);
      if (!designSystemValidation.ok) {
        return sendApiError(
          res,
          400,
          designSystemValidation.code,
          designSystemValidation.message,
        );
      }
      const project = insertProject(db, {
        id,
        name: projectName,
        skillId: skillId ?? null,
        designSystemId: designSystemValidation.id,
        pendingPrompt: null,
        metadata: {
          kind: 'prototype',
          baseDir: normalizedPath,
          importedFrom: 'folder',
          entryFile,
          ...(normalizedOrchestratorWorkspace
            ? { orchestratorWorkspace: normalizedOrchestratorWorkspace }
            : {}),
          ...(trustedPickerImport ? { fromTrustedPicker: true as const } : {}),
        },
        createdAt: now,
        updatedAt: now,
      });

      const cid = randomId();
      insertConversation(db, {
        id: cid,
        projectId: id,
        title: `Imported from ${projectName}`,
        createdAt: now,
        updatedAt: now,
      });
      // Folder imports should land on Design Files so users can choose from
      // the imported folder's artifacts. Persist an empty saved tab state so
      // ProjectView does not auto-open the detected primary file on hydration.
      setTabs(db, id, [], null);
      /** @type {import('@open-design/contracts').ImportFolderResponse} */
      const body = { project, conversationId: cid, entryFile };
      res.json(body);
    } catch (err: any) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err?.message || err));
    }
  });

}

export interface RegisterProjectExportRoutesDeps extends RouteDeps<'db' | 'http' | 'paths' | 'projectStore' | 'exports' | 'projectFiles' | 'validation'> {}

export function registerProjectExportRoutes(app: Express, ctx: RegisterProjectExportRoutesDeps) {
  const { db } = ctx;
  const { sendApiError } = ctx.http;
  const { PROJECTS_DIR } = ctx.paths;
  const { getProject } = ctx.projectStore;
  const { listFiles, readProjectFile, resolveProjectFilePath } = ctx.projectFiles;
  const { isSafeId } = ctx.validation;
  const {
    buildProjectArchive,
    buildBatchArchive,
    buildDesktopPdfExportInput,
    desktopPdfExporter,
    daemonUrlRef,
    sanitizeArchiveFilename,
  } = ctx.exports;
  // Streams a ZIP of the project's on-disk tree so the "Download as .zip"
  // share menu can hand the user the actual files they uploaded — e.g. the
  // imported `ui-design/` folder — instead of a one-file snapshot of the
  // rendered HTML. `root` scopes the archive to a subdirectory; without
  // it, the whole project is packed.
  app.get('/api/projects/:id/archive', async (req, res) => {
    try {
      const root = typeof req.query?.root === 'string' ? req.query.root : '';
      const project = getProject(db, req.params.id);
      const { buffer, baseName } = await buildProjectArchive(
        PROJECTS_DIR,
        req.params.id,
        root,
        project?.metadata,
      );
      const fallbackName = project?.name || req.params.id;
      const fileSlug = sanitizeArchiveFilename(baseName || fallbackName) || 'project';
      const filename = `${fileSlug}.zip`;
      // RFC 5987 dance: legacy `filename=` carries an ASCII fallback, while
      // `filename*=UTF-8''…` lets modern browsers pick up project names
      // with non-ASCII characters (accents, CJK, etc.) without mojibake.
      const asciiFallback =
        filename.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '_') || 'project.zip';
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      );
      res.send(buffer);
    } catch (err: any) {
      const code = err && err.code;
      const status = code === 'ENOENT' || code === 'ENOTDIR' ? 404 : 400;
      sendApiError(
        res,
        status,
        status === 404 ? 'FILE_NOT_FOUND' : 'BAD_REQUEST',
        String(err?.message || err),
      );
    }
  });

  // Batch archive: accepts a list of file names and returns a ZIP of just
  // those files. Used by the Design Files panel multi-select download.
  app.post('/api/projects/:id/archive/batch', async (req, res) => {
    try {
      const { files } = req.body || {};
      if (!Array.isArray(files) || files.length === 0) {
        sendApiError(res, 400, 'BAD_REQUEST', 'files must be a non-empty array');
        return;
      }
      const project = getProject(db, req.params.id);
      const { buffer } = await buildBatchArchive(
        PROJECTS_DIR,
        req.params.id,
        files,
        project?.metadata,
      );
      const fileSlug = sanitizeArchiveFilename(project?.name || req.params.id) || 'project';
      const filename = `${fileSlug}.zip`;
      const asciiFallback =
        filename.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '_') || 'project.zip';
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      );
      res.send(buffer);
    } catch (err: any) {
      const code = err && err.code;
      const status = code === 'ENOENT' ? 404 : 400;
      sendApiError(
        res,
        status,
        status === 404 ? 'FILE_NOT_FOUND' : 'BAD_REQUEST',
        String(err?.message || err),
      );
    }
  });

  app.get('/api/projects/:id/export/manifest', async (req, res) => {
    try {
      if (!isSafeId(req.params.id)) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'invalid project id');
      }
      const project = getProject(db, req.params.id);
      if (!project) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
      }
      const files = await listFiles(PROJECTS_DIR, req.params.id, {
        metadata: project.metadata,
      });
      /** @type {import('@open-design/contracts').ProjectExportManifestResponse} */
      const body = buildProjectExportManifestResponse({
        project,
        projectId: req.params.id,
        files,
      });
      res.json(body);
    } catch (err: any) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err?.message || err));
    }
  });

  app.get('/api/projects/:id/export/downloads/:token', async (req, res) => {
    try {
      if (!isSafeId(req.params.id)) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'invalid project id');
      }
      const entry = claimExportDownload(req.params.id, req.params.token);
      if (!entry) {
        return sendApiError(res, 404, 'EXPORT_DOWNLOAD_NOT_FOUND', 'export download not found or expired');
      }
      setAttachmentHeaders(res, entry.mime, entry.filename);
      const stream = fs.createReadStream(entry.filePath);
      let finished = false;
      stream.on('error', () => {
        releaseExportDownloadClaim(req.params.token);
        if (!res.headersSent) {
          sendApiError(res, 500, 'EXPORT_FAILED', 'export download stream failed');
        }
      });
      stream.on('end', () => {
        finished = true;
        void completeExportDownload(req.params.token);
      });
      res.on('close', () => {
        if (!finished) releaseExportDownloadClaim(req.params.token);
      });
      stream.pipe(res);
    } catch (err: unknown) {
      sendApiError(res, 500, 'INTERNAL_ERROR', String((err as Error)?.message || err));
    }
  });

  app.post('/api/projects/:id/export/pdf', async (req, res) => {
    try {
      const { fileName, title, deck } = req.body || {};
      if (typeof fileName !== 'string' || fileName.length === 0) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'fileName required');
      }
      const ticket = wantsTicketDelivery(req.body);
      const inlineHtml = readInlineHtmlFromBody(req.body);
      const built = await buildDesktopPdfExportInput({
        daemonUrl: daemonUrlRef.current,
        deck: deck === true,
        fileName,
        projectId: req.params.id,
        projectsRoot: PROJECTS_DIR,
        title: typeof title === 'string' ? title : undefined,
        ...(inlineHtml ? { inlineHtml } : {}),
      });
      if (typeof desktopPdfExporter === 'function') {
        const result = await desktopPdfExporter(built.input);
        res.json(result);
        return;
      }
      const outcome = await runCachedExport(
        { format: 'pdf', deck: deck === true, projectId: req.params.id },
        exportCacheDescriptor({
          projectId: req.params.id,
          sourceRelPath: built.source.relPath,
          sourceMtimeMs: built.source.mtimeMs,
          format: 'pdf',
          deck: deck === true,
          filename: built.input.defaultFilename,
          mime: 'application/pdf',
        }),
        async () => {
          const pdf = await renderHeadlessPdf(
            { input: built.input },
            { projectId: req.params.id },
          );
          return {
            body: pdf,
            filename: built.input.defaultFilename,
            mime: 'application/pdf',
          };
        },
        { fresh: wantsFreshExport(req) },
      );
      await respondExportPayload(res, { projectId: req.params.id, ...outcomeAsRespondPayload(outcome), ticket });
    } catch (err: unknown) {
      handleExportRouteError(res, sendApiError, 'export/pdf', req.params.id, err);
    }
  });

  app.post('/api/projects/:id/export/image', async (req, res) => {
    try {
      const { fileName, title, deck, format, slideIndex } = req.body || {};
      if (typeof fileName !== 'string' || fileName.length === 0) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'fileName required');
      }
      const ticket = wantsTicketDelivery(req.body);
      const imageFormat: HeadlessImageFormat =
        format === 'jpeg' || format === 'jpg'
          ? 'jpeg'
          : format === 'webp'
            ? 'webp'
            : 'png';
      const cacheFormat: 'png' | 'jpeg' | 'webp' = imageFormat;
      const inlineHtml = readInlineHtmlFromBody(req.body);
      const built = await buildDesktopPdfExportInput({
        daemonUrl: daemonUrlRef.current,
        deck: deck === true,
        fileName,
        projectId: req.params.id,
        projectsRoot: PROJECTS_DIR,
        title: typeof title === 'string' ? title : undefined,
        ...(inlineHtml ? { inlineHtml } : {}),
      });
      const extension =
        imageFormat === 'jpeg' ? 'jpg' : imageFormat === 'webp' ? 'webp' : 'png';
      const base = built.input.defaultFilename.replace(/\.pdf$/i, '') || 'artifact';
      const mime =
        imageFormat === 'jpeg'
          ? 'image/jpeg'
          : imageFormat === 'webp'
            ? 'image/webp'
            : 'image/png';
      const outcome = await runCachedExport(
        { format: 'image', deck: deck === true, projectId: req.params.id },
        exportCacheDescriptor({
          projectId: req.params.id,
          sourceRelPath: built.source.relPath,
          sourceMtimeMs: built.source.mtimeMs,
          format: cacheFormat,
          deck: deck === true,
          ...(typeof slideIndex === 'number' ? { slideIndex } : {}),
          ...(deck === true ? { codeVersion: 'deck-screenshot-screen-v2' } : {}),
          filename: `${base}.${extension}`,
          mime,
        }),
        async () => {
          const imageOptions = {
            input: built.input,
            imageFormat,
            ...(typeof slideIndex === 'number' ? { slideIndex } : {}),
          };
          const image = await renderHeadlessImage(imageOptions, { projectId: req.params.id });
          return { body: image, filename: `${base}.${extension}`, mime };
        },
        { fresh: wantsFreshExport(req) },
      );
      await respondExportPayload(res, { projectId: req.params.id, ...outcomeAsRespondPayload(outcome), ticket });
    } catch (err: unknown) {
      handleExportRouteError(res, sendApiError, 'export/image', req.params.id, err);
    }
  });

  app.post('/api/projects/:id/export/pptx', async (req, res) => {
    try {
      const { fileName, title, deck } = req.body || {};
      if (typeof fileName !== 'string' || fileName.length === 0) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'fileName required');
      }
      if (deck !== true) {
        return sendApiError(res, 422, 'NO_SLIDES', 'PPTX export requires a slide deck');
      }
      const ticket = wantsTicketDelivery(req.body);
      const inlineHtml = readInlineHtmlFromBody(req.body);
      const built = await buildDesktopPdfExportInput({
        daemonUrl: daemonUrlRef.current,
        deck: true,
        fileName,
        projectId: req.params.id,
        projectsRoot: PROJECTS_DIR,
        title: typeof title === 'string' ? title : undefined,
        ...(inlineHtml ? { inlineHtml } : {}),
      });
      const base = built.input.defaultFilename.replace(/\.pdf$/i, '') || 'artifact';
      const filename = `${base}.pptx`;
      const mime = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
      const editable = req.body?.editable === true;
      const outcome = await runCachedExport(
        { format: 'pptx', deck: true, projectId: req.params.id },
        exportCacheDescriptor({
          projectId: req.params.id,
          sourceRelPath: built.source.relPath,
          sourceMtimeMs: built.source.mtimeMs,
          format: 'pptx',
          deck: true,
          codeVersion: editable ? 'pptx-editable-dom-v2' : 'pptx-screen-ooxml-v4',
          filename,
          mime,
        }),
        async () => {
          if (editable) {
            const pptx = await renderHeadlessEditablePptx(
              { input: built.input },
              { projectId: req.params.id },
            );
            return { body: pptx, filename, mime };
          }
          const rendered = await renderHeadlessDeckImages(
            { input: built.input, imageFormat: 'png' },
            { projectId: req.params.id },
          );
          const pptx = await buildScreenshotPptx(rendered.images, {
            title: built.input.title,
            aspect: rendered.aspect,
          });
          return { body: pptx, filename, mime };
        },
        { fresh: wantsFreshExport(req) },
      );
      await respondExportPayload(res, { projectId: req.params.id, ...outcomeAsRespondPayload(outcome), ticket });
    } catch (err: unknown) {
      if (String((err as Error)?.message || err).toLowerCase().includes('no slides')) {
        return sendApiError(res, 422, 'NO_SLIDES', 'PPTX export requires at least one slide');
      }
      handleExportRouteError(res, sendApiError, 'export/pptx', req.params.id, err);
    }
  });

  app.post('/api/projects/:id/export/html', async (req, res) => {
    try {
      const { fileName, title, deck } = req.body || {};
      if (typeof fileName !== 'string' || fileName.length === 0) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'fileName required');
      }
      const ticket = wantsTicketDelivery(req.body);
      const inlineHtml = readInlineHtmlFromBody(req.body);
      const built = await buildDesktopPdfExportInput({
        daemonUrl: daemonUrlRef.current,
        deck: deck === true,
        fileName,
        projectId: req.params.id,
        projectsRoot: PROJECTS_DIR,
        title: typeof title === 'string' ? title : undefined,
        ...(inlineHtml ? { inlineHtml } : {}),
      });
      const base = built.input.defaultFilename.replace(/\.pdf$/i, '') || 'artifact';
      const outcome = await runCachedExport(
        { format: 'html', deck: deck === true, projectId: req.params.id },
        exportCacheDescriptor({
          projectId: req.params.id,
          sourceRelPath: built.source.relPath,
          sourceMtimeMs: built.source.mtimeMs,
          format: 'html',
          deck: deck === true,
          filename: `${base}.html`,
          mime: 'text/html; charset=utf-8',
        }),
        async () => {
          let html: string;
          try {
            html = await renderHeadlessHtmlSnapshot(
              { input: built.input },
              { projectId: req.params.id },
            );
          } catch (err) {
            if (!isHeadlessChromiumUnavailableExportError(err)) throw err;
            console.warn('[export/html] headless Chromium unavailable; serving static HTML fallback', {
              projectId: req.params.id,
              fileName,
            });
            html = buildStaticHtmlExportFallback(built.input);
          }
          return {
            body: html,
            filename: `${base}.html`,
            mime: 'text/html; charset=utf-8',
          };
        },
        { fresh: wantsFreshExport(req) },
      );
      await respondExportPayload(res, { projectId: req.params.id, ...outcomeAsRespondPayload(outcome), ticket });
    } catch (err: unknown) {
      handleExportRouteError(res, sendApiError, 'export/html', req.params.id, err);
    }
  });

  app.post('/api/projects/:id/export/zip', async (req, res) => {
    try {
      const { fileName, title, deck } = req.body || {};
      if (typeof fileName !== 'string' || fileName.length === 0) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'fileName required');
      }
      const ticket = wantsTicketDelivery(req.body);
      const inlineHtml = readInlineHtmlFromBody(req.body);
      const built = await buildDesktopPdfExportInput({
        daemonUrl: daemonUrlRef.current,
        deck: deck === true,
        fileName,
        projectId: req.params.id,
        projectsRoot: PROJECTS_DIR,
        title: typeof title === 'string' ? title : undefined,
        ...(inlineHtml ? { inlineHtml } : {}),
      });
      const base = built.input.defaultFilename.replace(/\.pdf$/i, '') || 'artifact';
      const outcome = await runCachedExport(
        { format: 'zip', deck: deck === true, projectId: req.params.id },
        exportCacheDescriptor({
          projectId: req.params.id,
          sourceRelPath: built.source.relPath,
          sourceMtimeMs: built.source.mtimeMs,
          format: 'zip',
          deck: deck === true,
          filename: `${base}.zip`,
          mime: 'application/zip',
        }),
        async () => {
          let html: string;
          try {
            html = await renderHeadlessHtmlSnapshot(
              { input: built.input },
              { projectId: req.params.id, format: 'zip' },
            );
          } catch (err) {
            if (!isHeadlessChromiumUnavailableExportError(err)) throw err;
            console.warn('[export/zip] headless Chromium unavailable; packaging static HTML fallback', {
              projectId: req.params.id,
              fileName,
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
        { fresh: wantsFreshExport(req) },
      );
      await respondExportPayload(res, { projectId: req.params.id, ...outcomeAsRespondPayload(outcome), ticket });
    } catch (err: unknown) {
      handleExportRouteError(res, sendApiError, 'export/zip', req.params.id, err);
    }
  });

  // Export endpoint: serves an HTML body with every same-project
  // top-level `<link rel=stylesheet>` / `<script src>` inlined.
  // Counterpart to GET /api/projects/:id/raw/* — that route stays
  // URL-load (one request per asset; FileViewer's default since
  // PR #384). This route exists for explicit "Inline top-level
  // CSS/JS" exports + the screenshot path where the headless browser
  // fetches the response and renders it.
  //
  // Scope is intentionally narrow: only `<link rel=stylesheet>` and
  // `<script src>` are rewritten. `<img src>`, CSS `url(...)` refs,
  // `@import`, ES module imports, font sources, and similar remain
  // external in the response — see the docstring on
  // `apps/daemon/src/inline-assets.ts` for the full not-rewritten list
  // and rationale. A fully offline "self-contained" export with image
  // and font bundling would be a follow-up issue.
  //
  // Null-origin (sandboxed iframe srcdoc) callers are intentionally
  // NOT supported — the only consumers are the daemon UI (same-origin)
  // and server-side screenshot tooling (no Origin header). The
  // response also carries `Content-Security-Policy: sandbox
  // allow-scripts` so top-level browser navigation (no Origin header,
  // would otherwise pass the daemon middleware) cannot escalate to
  // daemon-origin privileges through script execution.
  //
  // See nexu-io/open-design#368 and the architecture lock at
  // https://github.com/nexu-io/open-design/issues/368#issuecomment-4366243218.
  app.get('/api/projects/:id/export/*splat', async (req, res) => {
    try {
      if (!isSafeId(req.params.id)) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'invalid project id');
      }

      const inlineRaw =
        typeof req.query.inline === 'string' ? req.query.inline.trim().toLowerCase() : '';
      if (!['1', 'true', 'yes', 'on'].includes(inlineRaw)) {
        return sendApiError(
          res,
          400,
          'BAD_REQUEST',
          "query parameter 'inline=1' is required",
        );
      }

      const project = getProject(db, req.params.id);
      const splatParam = (req.params as { splat?: string | string[] }).splat;
      const relPath = Array.isArray(splatParam) ? splatParam.join('/') : String(splatParam ?? '');

      // PR #1312 round-5 (lefarcen P2): stat the owner file BEFORE
      // readProjectFile so a 100 MiB owner HTML is rejected after a
      // cheap stat() call, not after a 100 MiB readFile() into memory.
      // The size check + mime check both run pre-buffer here, mirroring
      // the sibling-asset stat-then-read contract round 4 already
      // applied via AssetHandle. Size fires before mime so an oversize
      // non-HTML file returns 413 (not 415) — that ordering is the
      // observable Red→Green for this round.
      //
      // The helper's ownerBytes check (inline-assets.ts:127-133) stays
      // as defense-in-depth: it still catches direct in-process callers
      // that skip the route and any future drift in the size reported
      // by stat vs the bytes actually returned by readFile.
      let ownerMeta;
      try {
        ownerMeta = await resolveProjectFilePath(
          PROJECTS_DIR,
          req.params.id,
          relPath,
          project?.metadata,
        );
      } catch (err: any) {
        const status = err && err.code === 'ENOENT' ? 404 : 400;
        return sendApiError(
          res,
          status,
          status === 404 ? 'FILE_NOT_FOUND' : 'BAD_REQUEST',
          String(err),
        );
      }

      if (ownerMeta.size > MAX_INLINE_OWNER_BYTES) {
        return sendApiError(
          res,
          413,
          'PAYLOAD_TOO_LARGE',
          `owner html ${ownerMeta.size} bytes exceeds MAX_INLINE_OWNER_BYTES ${MAX_INLINE_OWNER_BYTES}`,
        );
      }

      if (!ownerMeta.mime.startsWith('text/html')) {
        return sendApiError(
          res,
          415,
          'UNSUPPORTED_MEDIA_TYPE',
          'export endpoint only supports HTML files',
        );
      }

      let file;
      try {
        file = await readProjectFile(PROJECTS_DIR, req.params.id, relPath, project?.metadata);
      } catch (err: any) {
        const status = err && err.code === 'ENOENT' ? 404 : 400;
        return sendApiError(
          res,
          status,
          status === 404 ? 'FILE_NOT_FOUND' : 'BAD_REQUEST',
          String(err),
        );
      }

      // PR #1312 round-4 (lefarcen P2): stat first, then read. This
      // lets the helper short-circuit on maxAssetBytes / maxTotalBytes
      // BEFORE the buffer is materialized into memory. A 100 MiB
      // sibling file is rejected after the cheap stat call, not after
      // a 100 MiB readFile.
      const fileReader: InlineAssetReader = async (sibling) => {
        let meta;
        try {
          meta = await resolveProjectFilePath(
            PROJECTS_DIR,
            req.params.id,
            sibling,
            project?.metadata,
          );
        } catch {
          return null;
        }
        return {
          size: meta.size,
          read: async () => {
            try {
              const siblingFile = await readProjectFile(
                PROJECTS_DIR,
                req.params.id,
                sibling,
                project?.metadata,
              );
              return siblingFile.buffer.toString('utf8');
            } catch {
              return null;
            }
          },
        };
      };

      const exportSource = await resolveHtmlExportSource({
        projectId: req.params.id,
        projectsRoot: PROJECTS_DIR,
        relPath,
        html: file.buffer.toString('utf8'),
        metadata: project?.metadata,
        readProjectFile,
        resolveProjectFilePath,
      });
      const rendered = await inlineRelativeAssets(
        exportSource.html,
        exportSource.relPath,
        fileReader,
      );
      // PR #1312 round-2 (lefarcen P2): top-level browser navigation to
      // this URL sends no Origin header, so the /api middleware lets it
      // through. Without a CSP, any JS in the exported document would
      // run at daemon origin with access to /api/, cookies, localStorage,
      // etc. `sandbox allow-scripts` treats the response like a sandboxed
      // iframe with an opaque origin — scripts execute (that's the point
      // of inlining JS for screenshot tooling), but cannot read cookies,
      // hit /api/, or escalate to daemon-origin privileges.
      res.setHeader('Content-Security-Policy', 'sandbox allow-scripts');
      res.type('text/html').send(rendered);
    } catch (err: any) {
      // PR #1312 round-3 (lefarcen P2): the inliner's cap-enforcement
      // throws InlineAssetsLimitError when the owner HTML, candidate
      // count, or assembled output exceeds the module-level limits.
      // Map every such throw to a 413 PAYLOAD_TOO_LARGE envelope so
      // callers see a structured error rather than a generic 400.
      if (err instanceof InlineAssetsLimitError || err?.name === 'InlineAssetsLimitError') {
        return sendApiError(res, 413, 'PAYLOAD_TOO_LARGE', String(err));
      }
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

}

async function resolveHtmlExportSource({
  projectId,
  projectsRoot,
  relPath,
  html,
  metadata,
  readProjectFile,
  resolveProjectFilePath,
}: {
  projectId: string;
  projectsRoot: string;
  relPath: string;
  html: string;
  metadata: unknown;
  readProjectFile: (projectsRoot: string, projectId: string, relPath: string, metadata?: unknown) => Promise<{ buffer: Buffer }>;
  resolveProjectFilePath: (projectsRoot: string, projectId: string, relPath: string, metadata?: unknown) => Promise<{ size: number; mime: string }>;
}): Promise<{ html: string; relPath: string }> {
  if (!isViteDevHtmlEntry(html)) return { html, relPath };

  const ownerDir = nodePath.posix.dirname(relPath);
  const distRelPath = ownerDir === '.' ? 'dist/index.html' : `${ownerDir}/dist/index.html`;
  try {
    const distMeta = await resolveProjectFilePath(projectsRoot, projectId, distRelPath, metadata);
    if (distMeta.size > MAX_INLINE_OWNER_BYTES || !distMeta.mime.startsWith('text/html')) {
      return { html, relPath };
    }
    const distFile = await readProjectFile(projectsRoot, projectId, distRelPath, metadata);
    return {
      html: rewriteViteDistRootAssetUrls(distFile.buffer.toString('utf8')),
      relPath: distRelPath,
    };
  } catch {
    return { html, relPath };
  }
}

function isViteDevHtmlEntry(html: string): boolean {
  return /<script\b[^>]*\btype\s*=\s*["']module["'][^>]*\bsrc\s*=\s*["']\/src\/[^"']+["'][^>]*>\s*<\/script>/i.test(html);
}

function rewriteViteDistRootAssetUrls(html: string): string {
  return html.replace(
    /\b(href|src)\s*=\s*(["'])\/assets\//gi,
    (_match, attr: string, quote: string) => `${attr}=${quote}assets/`,
  );
}

function buildProjectExportManifestResponse({
  project,
  projectId,
  files,
}: {
  project: any;
  projectId: string;
  files: any[];
}) {
  const sortedFiles = [...files].sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const filesByName = new Map(sortedFiles.map((file) => [file.name, file]));
  const reasons = new Map<string, Set<string>>();
  const supportingNames = new Set<string>();
  const artifactNames = new Set<string>();
  const artifacts = [];

  const note = (name: unknown, reason: string) => {
    if (typeof name !== 'string' || !filesByName.has(name)) return;
    if (!reasons.has(name)) reasons.set(name, new Set());
    reasons.get(name)?.add(reason);
  };

  for (const file of sortedFiles) {
    const manifest = file.artifactManifest && typeof file.artifactManifest === 'object'
      ? file.artifactManifest
      : null;
    if (!manifest) continue;
    if (isInferredArtifactManifest(manifest)) continue;
    artifactNames.add(file.name);
    note(file.name, 'artifact-manifest');

    const artifactSupporting = new Set<string>();
    const addManifestRef = (
      ref: unknown,
      reason: string,
      options: { allowProjectRootFallback?: boolean; preferProjectRoot?: boolean } = {},
    ) => {
      const ownerRelative = normalizeManifestProjectRef(ref, file.name);
      const projectRoot = normalizeManifestProjectRootRef(ref);
      const candidates = options.preferProjectRoot
        ? [projectRoot, ownerRelative]
        : [
            ownerRelative,
            ...(options.allowProjectRootFallback ? [projectRoot] : []),
          ];
      const normalized = candidates.find((candidate) => candidate && filesByName.has(candidate));
      if (!normalized) return;
      if (normalized === file.name) return;
      supportingNames.add(normalized);
      artifactSupporting.add(normalized);
      note(normalized, reason);
    };
    addManifestRef(manifest.entry, 'artifact-entry', { preferProjectRoot: true });
    if (typeof manifest.primary === 'string') {
      addManifestRef(manifest.primary, 'artifact-primary', { preferProjectRoot: true });
    }
    if (Array.isArray(manifest.supportingFiles)) {
      for (const ref of manifest.supportingFiles) {
        addManifestRef(ref, 'artifact-supporting-file', { allowProjectRootFallback: true });
      }
    }

    artifacts.push({
      file: file.name,
      title: typeof manifest.title === 'string' && manifest.title.trim()
        ? manifest.title
        : file.name,
      kind: typeof manifest.kind === 'string' ? manifest.kind : (file.artifactKind ?? null),
      renderer: typeof manifest.renderer === 'string' ? manifest.renderer : null,
      status: typeof manifest.status === 'string' ? manifest.status : null,
      exports: Array.isArray(manifest.exports)
        ? manifest.exports.filter((value: unknown): value is string => typeof value === 'string')
        : [],
      supportingFiles: Array.from(artifactSupporting).sort((a, b) => a.localeCompare(b)),
      updatedAt: typeof manifest.updatedAt === 'string' ? manifest.updatedAt : null,
    });
  }

  const entryFile = chooseExportManifestEntryFile(project, sortedFiles, filesByName);
  note(entryFile, 'project-entry-file');

  return {
    schema: PROJECT_EXPORT_MANIFEST_SCHEMA,
    projectId,
    projectName: typeof project?.name === 'string' ? project.name : null,
    generatedAt: new Date().toISOString(),
    entryFile,
    files: sortedFiles.map((file) => ({
      ...file,
      included: true,
      role: roleForExportManifestFile(file, {
        entryFile,
        artifactNames,
        supportingNames,
      }),
      reasons: Array.from(reasons.get(file.name) ?? ['visible-project-file']).sort((a, b) => a.localeCompare(b)),
    })),
    artifacts,
  };
}

function isInferredArtifactManifest(manifest: any): boolean {
  return manifest?.metadata &&
    typeof manifest.metadata === 'object' &&
    manifest.metadata.inferred === true;
}

function chooseExportManifestEntryFile(
  project: any,
  files: any[],
  filesByName: Map<string, any>,
): string | null {
  const metadataEntry = typeof project?.metadata?.entryFile === 'string'
    ? project.metadata.entryFile
    : null;
  if (metadataEntry && filesByName.has(metadataEntry)) return metadataEntry;
  for (const file of files) {
    const manifest = file.artifactManifest;
    if (!manifest || typeof manifest !== 'object') continue;
    if (isInferredArtifactManifest(manifest)) continue;
    if (manifest.primary === true) return file.name;
    if (typeof manifest.primary === 'string') {
      const rootPrimary = normalizeManifestProjectRootRef(manifest.primary);
      if (rootPrimary && filesByName.has(rootPrimary)) return rootPrimary;
      const ownerRelativePrimary = normalizeManifestProjectRef(manifest.primary, file.name);
      if (ownerRelativePrimary && filesByName.has(ownerRelativePrimary)) return ownerRelativePrimary;
    }
    const rootEntry = normalizeManifestProjectRootRef(manifest.entry);
    if (rootEntry && filesByName.has(rootEntry)) return rootEntry;
    const ownerRelativeEntry = normalizeManifestProjectRef(manifest.entry, file.name);
    if (ownerRelativeEntry && filesByName.has(ownerRelativeEntry)) return ownerRelativeEntry;
  }
  return files.find((file) => /(^|\/)index\.html?$/i.test(file.name))?.name
    ?? files.find((file) => file.kind === 'html')?.name
    ?? files[0]?.name
    ?? null;
}

function normalizeManifestProjectRootRef(ref: unknown): string | null {
  return normalizeManifestProjectRef(ref, '');
}

function normalizeManifestProjectRef(ref: unknown, ownerFile: string): string | null {
  if (typeof ref !== 'string' || !ref.trim()) return null;
  const value = ref.trim();
  if (value.includes('\0') || value.startsWith('/')) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null;
  const ownerDir = nodePath.posix.dirname(ownerFile);
  const joined = ownerDir === '.' ? value : `${ownerDir}/${value}`;
  const normalized = nodePath.posix.normalize(joined).replace(/^\.\//, '');
  if (!normalized || normalized === '.' || normalized.startsWith('../')) return null;
  if (normalized.split('/').some((segment) => segment === '..' || segment === '.')) return null;
  return normalized;
}

function roleForExportManifestFile(
  file: any,
  refs: {
    entryFile: string | null;
    artifactNames: Set<string>;
    supportingNames: Set<string>;
  },
) {
  if (file.name === refs.entryFile) return 'entry';
  if (refs.artifactNames.has(file.name)) return 'artifact';
  if (refs.supportingNames.has(file.name)) return 'supporting';
  if (file.kind === 'image' || file.kind === 'video' || file.kind === 'audio') return 'asset';
  if (file.kind === 'code' || file.kind === 'text') return 'source';
  return 'other';
}

export interface RegisterFinalizeRoutesDeps extends RouteDeps<'db' | 'http' | 'paths' | 'projectStore' | 'validation' | 'finalize'> {}

export function registerFinalizeRoutes(app: Express, ctx: RegisterFinalizeRoutesDeps) {
  const { db } = ctx;
  const { sendApiError } = ctx.http;
  const { PROJECTS_DIR, DESIGN_SYSTEMS_DIR } = ctx.paths;
  const { getProject } = ctx.projectStore;
  const { isSafeId, validateExternalApiBaseUrl } = ctx.validation;
  const {
    defaultBaseUrlForFinalizeProtocol,
    finalizeDesignPackage,
    FinalizePackageLockedError,
    FinalizeUpstreamError,
    isFinalizeProviderProtocol,
    redactSecrets,
  } = ctx.finalize;
  app.post('/api/projects/:id/finalize/:provider', async (req, res) => {
    const { apiKey, baseUrl, model, maxTokens, apiVersion, protocol: bodyProtocol } = req.body || {};
    try {
      // Centralized path-traversal guard. `isSafeId` (apps/daemon/src/projects.ts)
      // rejects pure-dot ids (`.`, `..`, etc.) which would otherwise pass
      // the char-class regex and resolve to the parent directory under
      // path.join. Express decodes percent-encoded `%2e%2e` to `..` before
      // we see it, so this check covers both URL-supplied and stored-row
      // attack vectors.
      if (!isSafeId(req.params.id)) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'invalid project id');
      }

      const protocol = req.params.provider;
      if (!isFinalizeProviderProtocol(protocol)) {
        return sendApiError(
          res,
          400,
          'BAD_REQUEST',
          'provider must be one of anthropic|openai|azure|google|ollama',
        );
      }
      if (bodyProtocol !== undefined && bodyProtocol !== protocol) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'body protocol must match route provider');
      }

      if (typeof apiKey !== 'string' || !apiKey.trim()) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'apiKey is required');
      }
      if (typeof model !== 'string' || !model.trim()) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'model is required');
      }
      let effectiveBaseUrl = defaultBaseUrlForFinalizeProtocol(protocol);
      if (baseUrl !== undefined) {
        if (typeof baseUrl !== 'string' || !baseUrl.trim()) {
          return sendApiError(res, 400, 'BAD_REQUEST', 'baseUrl must be a non-empty string when provided');
        }
        effectiveBaseUrl = baseUrl.trim();
      }
      if (!effectiveBaseUrl) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'baseUrl is required for this provider');
      }
      const validated = await validateExternalApiBaseUrl(effectiveBaseUrl);
      if (validated.error) {
        return sendApiError(
          res,
          validated.forbidden ? 403 : 400,
          validated.forbidden ? 'FORBIDDEN' : 'BAD_REQUEST',
          validated.error,
        );
      }
      if (maxTokens !== undefined && (typeof maxTokens !== 'number' || maxTokens <= 0)) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'maxTokens must be a positive number when provided');
      }
      if (apiVersion !== undefined && typeof apiVersion !== 'string') {
        return sendApiError(res, 400, 'BAD_REQUEST', 'apiVersion must be a string when provided');
      }

      const project = getProject(db, req.params.id);
      if (!project) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
      }

      const finalizeAbort = new AbortController();
      const abortFromRequest = (): void => {
        if (!finalizeAbort.signal.aborted) finalizeAbort.abort();
      };
      res.on('close', abortFromRequest);

      let result;
      try {
        result = await finalizeDesignPackage(
          db,
          PROJECTS_DIR,
          DESIGN_SYSTEMS_DIR,
          req.params.id,
          {
            protocol,
            apiKey,
            baseUrl: effectiveBaseUrl,
            model,
            maxTokens,
            ...(typeof apiVersion === 'string' && apiVersion.trim()
              ? { apiVersion: apiVersion.trim() }
              : {}),
            signal: finalizeAbort.signal,
          },
        );
      } finally {
        res.off('close', abortFromRequest);
      }
      res.json(result);
    } catch (err: any) {
      // Concurrent finalize - the lockfile was already held by another
      // call. Caller can retry after a short wait; not a client error.
      // Maps to the shared CONFLICT code per @lefarcen P2 on PR #832.
      if (err instanceof FinalizePackageLockedError) {
        return sendApiError(res, 409, 'CONFLICT', err.message);
      }

      // Upstream provider error - status-aware mapping using shared
      // ApiErrorCode values. Run the raw upstream body through
      // redactSecrets so the API key cannot leak even if the provider
      // echoes the inbound headers. Codes per @lefarcen P2 on PR #832:
      // 401 -> UNAUTHORIZED, 429 -> RATE_LIMITED, others -> UPSTREAM_UNAVAILABLE.
      if (err instanceof FinalizeUpstreamError) {
        const safeDetails = redactSecrets(err.rawText || '', [apiKey]);
        const init = safeDetails ? { details: safeDetails } : {};
        if (err.status === 401) {
          return sendApiError(res, 401, 'UNAUTHORIZED', err.message, init);
        }
        if (err.status === 429) {
          return sendApiError(res, 429, 'RATE_LIMITED', err.message, init);
        }
        return sendApiError(res, 502, 'UPSTREAM_UNAVAILABLE', err.message, init);
      }

      // The blocking call hit our 120s AbortController timeout - or the
      // caller passed an already-aborted signal. Either way, surface as
      // 503 with the shared UPSTREAM_UNAVAILABLE code (no dedicated
      // TIMEOUT code in the contracts ApiErrorCode union).
      const errName =
        err && typeof err === 'object' && 'name' in err ? (err as { name?: unknown }).name : '';
      if (errName === 'AbortError') {
        return sendApiError(res, 503, 'UPSTREAM_UNAVAILABLE', 'finalize timed out');
      }

      // Unexpected runtime failure (file IO, db access, prompt build).
      // Log via console.error per the daemon convention; client sees a
      // generic 500 with the shared INTERNAL_ERROR code. Run the message
      // through redactSecrets defensively.
      console.error('[finalize]', err);
      const safeMsg = redactSecrets(String(err?.message || err), [apiKey]);
      return sendApiError(res, 500, 'INTERNAL_ERROR', safeMsg);
    }
  });

}
