import crypto from 'node:crypto';
import path from 'node:path';

import type { DesktopExportPdfInput } from '@open-design/sidecar-proto';
import { healDeckHtmlForStandaloneExport } from '@open-design/contracts';

import { listFiles, readProjectFile } from './projects.js';

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
  const normalizedInline = useInline ? healDeckHtmlForStandaloneExport(inline) : '';
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
        const healed = healDeckHtmlForStandaloneExport(file.buffer.toString('utf8'));
        return resolveRenderableHtmlSource({
          html: healed,
          fileName: options.fileName,
          fileMtimeMs: file.mtime,
          projectId: options.projectId,
          projectsRoot: options.projectsRoot,
          allowVersionedDistLookup: true,
        });
      })();
  // Inline `<img src>` (+ CSS `url(...)`) images from local scratch so headless
  // Chromium never has to fetch `/raw/` (which in Teamver-managed mode requires
  // `X-Teamver-*` identity headers Chromium cannot mint). Falls back to leaving
  // the relative src alone when the file is truly missing on disk / S3, so
  // Chromium's own base-href fetch still gets a last-chance retry.
  const inlinedHtml = await inlineProjectImagesFromScratch({
    html: source.html,
    projectId: options.projectId,
    projectsRoot: options.projectsRoot,
  });
  const title = displayTitle(options.title, options.fileName);
  return {
    input: {
      baseHref: rawBaseHref(options.daemonUrl, options.projectId, source.fileName),
      deck: options.deck === true,
      defaultFilename: `${safeFilename(title, 'artifact')}.pdf`,
      html: inlinedHtml,
      title,
    },
    source: {
      relPath: source.fileName,
      mtimeMs: source.mtimeMs,
    },
  };
}

const INLINE_IMAGE_EXT_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
};

const INLINE_IMAGE_MAX_BYTES = 4 * 1024 * 1024;
/** Cap so a pathological deck cannot spawn hundreds of point-get reads. */
const INLINE_IMAGE_MAX_UNIQUE = 32;

function imageMimeForRelpath(relpath: string): string | null {
  const dot = relpath.lastIndexOf('.');
  if (dot < 0) return null;
  return INLINE_IMAGE_EXT_MIME[relpath.slice(dot).toLowerCase()] ?? null;
}

/**
 * Inline every image reference the export HTML can resolve to a local project
 * file. Runs on the daemon side ahead of Chromium so subresource fetches
 * inside headless Chromium never need to carry Teamver identity headers to
 * `/raw/`. Preserves the relative `<img src>` when the file cannot be read so
 * Chromium can still attempt a live fetch (last resort).
 *
 * Reused by the FE live-preview / `/raw` HTML routes so the browser inside the
 * `srcdoc` iframe never has to make a subresource GET for `refs/drive/…` and
 * Hangul filenames — a single byte-form mismatch in the `<img src>` used to
 * degrade the preview into alt-only text (see the Aug 7 image-attachment
 * regression audit).
 */
export async function inlineProjectImagesFromScratch(options: {
  html: string;
  projectId: string;
  projectsRoot: string;
  metadata?: unknown;
}): Promise<string> {
  const paths = collectRelativeProjectAssetPaths(options.html);
  if (paths.length === 0) return options.html;
  const dataByPath = new Map<string, string>();
  let basenameFallback: BasenameFallback | null = null;
  const missingBasenames: string[] = [];
  await Promise.all(
    paths.slice(0, INLINE_IMAGE_MAX_UNIQUE).map(async (relpath) => {
      const mime = imageMimeForRelpath(relpath);
      if (!mime) return;
      try {
        const file = await readProjectFile(
          options.projectsRoot,
          options.projectId,
          relpath,
          options.metadata,
        );
        if (!file.buffer || file.buffer.length === 0) return;
        if (file.buffer.length > INLINE_IMAGE_MAX_BYTES) return;
        dataByPath.set(relpath, `data:${mime};base64,${file.buffer.toString('base64')}`);
      } catch {
        // Missing / ENOENT / permission — queue a basename-suffix fallback.
        // Models occasionally emit `<img src="민들레.png">` (bare) or
        // `<img src="refs/drive/민들레.png">` (right dir, wrong-cased name)
        // when the on-disk file is `refs/drive/msh9rso1-민들레.png`; without
        // this the preview regresses to alt-only text (broken image icon +
        // filename). We match by basename below so a wrong parent dir does
        // not block the recovery.
        missingBasenames.push(relpath);
      }
    }),
  );
  if (missingBasenames.length > 0) {
    basenameFallback = await loadBasenameFallback(options).catch(() => null);
    if (basenameFallback) {
      await Promise.all(
        missingBasenames.map(async (relpath) => {
          const mime = imageMimeForRelpath(relpath);
          if (!mime) return;
          const resolved = basenameFallback!.resolve(relpath);
          if (!resolved) return;
          try {
            const file = await readProjectFile(
              options.projectsRoot,
              options.projectId,
              resolved,
              options.metadata,
            );
            if (!file.buffer || file.buffer.length === 0) return;
            if (file.buffer.length > INLINE_IMAGE_MAX_BYTES) return;
            dataByPath.set(relpath, `data:${mime};base64,${file.buffer.toString('base64')}`);
          } catch {
            // Give up silently — same as the primary attempt.
          }
        }),
      );
    }
  }
  if (dataByPath.size === 0) return options.html;
  return rewriteRelativeImageSrcs(options.html, dataByPath);
}

interface BasenameFallback {
  resolve(basename: string): string | null;
}

/**
 * Build a case-insensitive, Unicode-tolerant lookup from image basenames to
 * their on-disk project-relative paths. Used only when the primary
 * `readProjectFile` pass ENOENTs for basename-only `<img src>` refs.
 */
async function loadBasenameFallback(options: {
  projectId: string;
  projectsRoot: string;
  metadata?: unknown;
}): Promise<BasenameFallback | null> {
  let files: Array<{ path?: string; name?: string; kind?: string }>;
  try {
    files = await listFiles(options.projectsRoot, options.projectId, {
      metadata: options.metadata,
    });
  } catch {
    return null;
  }
  // Newest-first (listFiles sorts by mtime desc) so recent uploads win any
  // basename-suffix contest.
  const byLowerBase = new Map<string, string>();
  const bySuffixBase = new Map<string, string>();
  for (const entry of files) {
    const relpath = String(entry?.path ?? entry?.name ?? '').trim();
    if (!relpath || !imageMimeForRelpath(relpath)) continue;
    const base = relpath.split('/').pop() || relpath;
    const lower = base.toLowerCase();
    if (!byLowerBase.has(lower)) byLowerBase.set(lower, relpath);
    // Suffix key: strip the `msXXXX-` id prefix (or any leading token followed
    // by `-`) so a model-emitted `민들레.png` maps to `msh9rso1-민들레.png` on
    // disk. Only files at the project root or under a single-level dir compete.
    const stripped = base.replace(/^[a-z0-9]{4,12}-/i, '');
    if (stripped && stripped !== base) {
      const suffixKey = stripped.toLowerCase();
      if (!bySuffixBase.has(suffixKey)) bySuffixBase.set(suffixKey, relpath);
    }
  }
  if (byLowerBase.size === 0 && bySuffixBase.size === 0) return null;
  const resolveOne = (requested: string): string | null => {
    const trimmed = String(requested || '').trim();
    if (!trimmed) return null;
    // The caller may pass either a bare basename ("민들레.png") or a nested
    // path ("refs/drive/민들레.png") when the on-disk file lives under a
    // different parent. Reduce to basename before matching so we recover the
    // real file either way.
    const basename = trimmed.split('/').pop() || trimmed;
    const nfc = safeNormalize(basename, 'NFC');
    const nfd = safeNormalize(basename, 'NFD');
    const candidates = [basename, nfc, nfd];
    for (const cand of candidates) {
      if (!cand) continue;
      const lower = cand.toLowerCase();
      const exact = byLowerBase.get(lower);
      if (exact) return exact;
    }
    for (const cand of candidates) {
      if (!cand) continue;
      const suffix = bySuffixBase.get(cand.toLowerCase());
      if (suffix) return suffix;
    }
    return null;
  };
  return { resolve: resolveOne };
}

function safeNormalize(value: string, form: 'NFC' | 'NFD'): string {
  try {
    return value.normalize(form);
  } catch {
    return value;
  }
}

function rewriteRelativeImageSrcs(
  html: string,
  dataByPath: ReadonlyMap<string, string>,
): string {
  const resolveDataForAttr = (rawValue: string): string | null => {
    const trimmed = String(rawValue || '').trim();
    if (!trimmed) return null;
    if (/^(?:https?:|data:|blob:|mailto:|tel:|#)/i.test(trimmed)) return null;
    if (trimmed.startsWith('//')) return null;
    const cleaned = trimmed.split(/[?#]/u, 1)[0]?.trim() ?? '';
    if (!cleaned || cleaned.includes('..')) return null;
    let normalized = cleaned.replace(/\\/g, '/');
    if (normalized.startsWith('/')) {
      if (normalized.startsWith('/api/')) return null;
      normalized = normalized.replace(/^\/+/, '');
    }
    normalized = normalized.replace(/^\.\//, '');
    if (dataByPath.has(normalized)) return dataByPath.get(normalized) ?? null;
    // Percent-encoded variants (`msh…-%EC%84%9C%EB%B9%99…`) — decode once.
    if (/%[0-9A-Fa-f]{2}/.test(normalized)) {
      try {
        const decoded = decodeURIComponent(normalized);
        if (dataByPath.has(decoded)) return dataByPath.get(decoded) ?? null;
      } catch {
        // Leave the encoded form as-is.
      }
    }
    return null;
  };

  let out = html.replace(
    /(<img\b[^>]*?\bsrc\s*=\s*)(["'])([^"']+)\2/gi,
    (full, prefix: string, quote: string, rawSrc: string) => {
      const dataUrl = resolveDataForAttr(rawSrc);
      if (!dataUrl) return full;
      // Also drop srcset — it would re-fetch the original relative URL.
      return `${prefix}${quote}${dataUrl}${quote}`;
    },
  );
  // Drop srcset when the sibling src was rewritten to a data URI.
  out = out.replace(
    /(<img\b[^>]*?\bsrc\s*=\s*)(["'])(data:image\/[^"']+)\2([^>]*?)\bsrcset\s*=\s*(["'])[^"']*\5/gi,
    (_full, prefix: string, quote: string, dataUrl: string, mid: string, _sq: string) =>
      `${prefix}${quote}${dataUrl}${quote}${mid}`,
  );
  // CSS url(...) rewrites.
  out = out.replace(
    /(url\(\s*)(['"]?)([^'")]+)\2(\s*\))/gi,
    (full, prefix: string, quote: string, rawSrc: string, suffix: string) => {
      const dataUrl = resolveDataForAttr(rawSrc);
      if (!dataUrl) return full;
      return `${prefix}${quote}${dataUrl}${quote}${suffix}`;
    },
  );
  return out;
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
      html: healDeckHtmlForStandaloneExport(options.html),
      mtimeMs: options.fileMtimeMs,
    };
  }
  const ownerDir = path.posix.dirname(options.fileName.replace(/^\/+/, ''));
  const distFileName = ownerDir === '.' ? 'dist/index.html' : `${ownerDir}/dist/index.html`;
  try {
    const dist = await readProjectFile(options.projectsRoot, options.projectId, distFileName);
    return {
      fileName: distFileName,
      html: healDeckHtmlForStandaloneExport(
        rewriteViteDistRootAssetUrls(dist.buffer.toString('utf8')),
      ),
      mtimeMs: dist.mtime,
    };
  } catch {
    return {
      fileName: options.fileName,
      html: healDeckHtmlForStandaloneExport(options.html),
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

/**
 * Collect project-relative asset paths referenced by export HTML so the
 * daemon can point-get them into scratch before Chromium loads
 * `/api/projects/:id/raw/…`. Inline-HTML export intentionally skips full
 * sync-down (S3-prefix-free), but Drive/composer images under `refs/drive/`
 * still need to be local for HTML/PDF/PPTX rendering.
 */
export function collectRelativeProjectAssetPaths(html: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (raw: string | undefined) => {
    const value = String(raw || '').trim();
    if (!value) return;
    if (/^(?:https?:|data:|blob:|mailto:|tel:|#)/i.test(value)) return;
    if (value.startsWith('//')) return;
    // Drop query/hash — scratch paths are plain relpaths.
    const cleaned = value.split(/[?#]/u, 1)[0]?.trim() ?? '';
    if (!cleaned || cleaned.includes('..')) return;
    let normalized = cleaned.replace(/\\/g, '/');
    // Models sometimes emit `/refs/drive/…` — accept a single leading slash
    // but never daemon `/api/…` routes.
    if (normalized.startsWith('/')) {
      if (normalized.startsWith('/api/')) return;
      normalized = normalized.replace(/^\/+/, '');
    }
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    out.push(normalized);
  };
  const attrRe = /\s(?:src|href)\s*=\s*(["'])([^"']+)\1/gi;
  let match: RegExpExecArray | null;
  while ((match = attrRe.exec(html)) !== null) {
    push(match[2]);
  }
  const cssUrlRe = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
  while ((match = cssUrlRe.exec(html)) !== null) {
    push(match[2]);
  }
  // Cap — pathological docs must not fan out hundreds of S3 GETs.
  return out.slice(0, 48);
}

export async function warmExportRelativeAssets(options: {
  html: string;
  projectId: string;
  ensureFileAvailable?:
    | ((projectId: string, relpath: string) => Promise<boolean>)
    | null;
}): Promise<string[]> {
  const ensure = options.ensureFileAvailable;
  if (!ensure) return [];
  const paths = collectRelativeProjectAssetPaths(options.html);
  if (paths.length === 0) return [];
  const warmed: string[] = [];
  await Promise.all(
    paths.map(async (relpath) => {
      try {
        const ok = await ensure(options.projectId, relpath);
        if (ok) warmed.push(relpath);
      } catch {
        // Soft-fail — Chromium /raw/ may still succeed if sync-down already
        // populated scratch, and missing deleted assets must not abort export.
      }
    }),
  );
  return warmed;
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
