import crypto from 'node:crypto';
import path from 'node:path';

import type { DesktopExportPdfInput } from '@open-design/sidecar-proto';
import { repairArtifactDocumentHead } from '@open-design/contracts';

import { readProjectFile } from './projects.js';

export interface BuildDesktopPdfExportInputOptions {
  daemonUrl: string;
  deck?: boolean;
  fileName: string;
  projectId: string;
  projectsRoot: string;
  title?: string;
  /**
   * FE-provided artifact HTML. When present the daemon renders this body
   * directly and skips reading from local scratch — the export path no longer
   * depends on tenant S3 prefix resolution or scratch materialization state,
   * so a transient `teamver_project_s3_prefix_required` on `/access` cannot
   * gate PDF/HTML/ZIP/image downloads. Cache key uses the content hash
   * instead of file mtime so identical inline bodies still deduplicate.
   */
  inlineHtml?: string;
}

/**
 * `source` carries the file the daemon actually renders (Vite dist fallback
 * resolved) plus its stat mtime. The daemon's export cache key uses these
 * values so a source edit invalidates the cached artifact automatically —
 * see docs-teamver/34 §20.1.
 *
 * Wrapper shape keeps `input` sidecar-proto compatible: `DesktopExportPdfInput`
 * is normalized with `assertKnownKeys`, so we MUST NOT leak `source.*` onto
 * the input object handed to the desktop process.
 */
export type BuiltDesktopPdfExport = {
  input: DesktopExportPdfInput;
  source: {
    relPath: string;
    mtimeMs: number;
  };
};

export async function buildDesktopPdfExportInput(
  options: BuildDesktopPdfExportInputOptions,
): Promise<BuiltDesktopPdfExport> {
  const inline = typeof options.inlineHtml === 'string' ? options.inlineHtml : '';
  const useInline = inline.trim().length > 0;
  const normalizedInline = useInline ? repairArtifactDocumentHead(inline) : '';
  const source = useInline
    ? await resolveRenderableHtmlSource({
        html: normalizedInline,
        fileName: options.fileName,
        fileMtimeMs: inlineHtmlPseudoMtime(normalizedInline),
        projectId: options.projectId,
        projectsRoot: options.projectsRoot,
        allowVersionedDistLookup: false,
      })
    : await (async () => {
        const file = await readProjectFile(
          options.projectsRoot,
          options.projectId,
          options.fileName,
        );
        return resolveRenderableHtmlSource({
          html: file.buffer.toString('utf8'),
          fileName: options.fileName,
          fileMtimeMs: file.mtime,
          projectId: options.projectId,
          projectsRoot: options.projectsRoot,
          allowVersionedDistLookup: true,
        });
      })();
  const title = displayTitle(options.title, options.fileName);
  return {
    input: {
      baseHref: rawBaseHref(options.daemonUrl, options.projectId, source.fileName),
      deck: options.deck === true,
      defaultFilename: `${safeFilename(title, 'artifact')}.pdf`,
      html: source.html,
      title,
    },
    source: {
      relPath: source.fileName,
      mtimeMs: source.mtimeMs,
    },
  };
}

/**
 * Deterministic ≤48-bit integer derived from the inline HTML — feeds the
 * cache-key `mtimeMs` slot so identical FE bodies hit the same cache entry
 * while different bodies invalidate it.
 *
 * 48 bits stays well under `Number.MAX_SAFE_INTEGER` (2^53 - 1), so the
 * value round-trips through `String(Math.floor(...))` in
 * `computeExportCacheKey` without IEEE-754 rounding.  Collision odds at
 * this width are negligible for realistic export volumes and the SHA-256
 * distribution is uniform, so different bodies still map to different
 * cache entries with overwhelming probability.
 */
function inlineHtmlPseudoMtime(html: string): number {
  return crypto.createHash('sha256').update(html).digest().readUIntBE(0, 6);
}

async function resolveRenderableHtmlSource(options: {
  fileName: string;
  html: string;
  fileMtimeMs: number;
  projectId: string;
  projectsRoot: string;
  /**
   * Inline HTML paths must not shell out to scratch/S3 for a `dist/index.html`
   * fallback — that reintroduces the tenant resolution the inline path is
   * meant to bypass. Only enable when reading from disk in the first place.
   */
  allowVersionedDistLookup: boolean;
}): Promise<{ fileName: string; html: string; mtimeMs: number }> {
  if (!isViteDevHtmlEntry(options.html) || !options.allowVersionedDistLookup) {
    return {
      fileName: options.fileName,
      html: options.html,
      mtimeMs: options.fileMtimeMs,
    };
  }
  const ownerDir = path.posix.dirname(options.fileName.replace(/^\/+/, ''));
  const distFileName = ownerDir === '.' ? 'dist/index.html' : `${ownerDir}/dist/index.html`;
  try {
    const dist = await readProjectFile(options.projectsRoot, options.projectId, distFileName);
    return {
      fileName: distFileName,
      html: rewriteViteDistRootAssetUrls(dist.buffer.toString('utf8')),
      mtimeMs: dist.mtime,
    };
  } catch {
    return {
      fileName: options.fileName,
      html: options.html,
      mtimeMs: options.fileMtimeMs,
    };
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

function displayTitle(title: string | undefined, fileName: string): string {
  if (typeof title === 'string' && title.trim().length > 0) return title.trim();
  const base = path.posix.basename(fileName);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base || 'artifact';
}

function rawBaseHref(daemonUrl: string, projectId: string, fileName: string): string {
  const dir = path.posix.dirname(fileName.replace(/^\/+/, ''));
  const safeProjectId = encodeURIComponent(projectId);
  const rawBase = `${daemonUrl.replace(/\/+$/, '')}/api/projects/${safeProjectId}/raw/`;
  if (!dir || dir === '.') return rawBase;
  return `${rawBase}${encodePathSegments(dir)}/`;
}

function encodePathSegments(value: string): string {
  return value
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function safeFilename(name: string, fallback: string): string {
  const trimmed = (name || fallback).trim();
  if (!trimmed) return fallback;
  const cleaned = trimmed
    .replace(/[/\\?%*:|"<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/-+/g, '-')
    .replace(/^[-\s]+|[-\s]+$/g, '')
    .trim()
    .slice(0, 120);
  if (!cleaned || !/[\p{L}\p{N}]/u.test(cleaned)) return fallback;
  return cleaned;
}
