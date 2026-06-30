import path from 'node:path';

import type { DesktopExportPdfInput } from '@open-design/sidecar-proto';

import { readProjectFile } from './projects.js';

export interface BuildDesktopPdfExportInputOptions {
  daemonUrl: string;
  deck?: boolean;
  fileName: string;
  projectId: string;
  projectsRoot: string;
  title?: string;
}

export async function buildDesktopPdfExportInput(
  options: BuildDesktopPdfExportInputOptions,
): Promise<DesktopExportPdfInput> {
  const file = await readProjectFile(options.projectsRoot, options.projectId, options.fileName);
  const source = await resolveRenderableHtmlSource({
    html: file.buffer.toString('utf8'),
    fileName: options.fileName,
    projectId: options.projectId,
    projectsRoot: options.projectsRoot,
  });
  const title = displayTitle(options.title, options.fileName);
  return {
    baseHref: rawBaseHref(options.daemonUrl, options.projectId, source.fileName),
    deck: options.deck === true,
    defaultFilename: `${safeFilename(title, 'artifact')}.pdf`,
    html: source.html,
    title,
  };
}

async function resolveRenderableHtmlSource(options: {
  fileName: string;
  html: string;
  projectId: string;
  projectsRoot: string;
}): Promise<{ fileName: string; html: string }> {
  if (!isViteDevHtmlEntry(options.html)) {
    return { fileName: options.fileName, html: options.html };
  }
  const ownerDir = path.posix.dirname(options.fileName.replace(/^\/+/, ''));
  const distFileName = ownerDir === '.' ? 'dist/index.html' : `${ownerDir}/dist/index.html`;
  try {
    const dist = await readProjectFile(options.projectsRoot, options.projectId, distFileName);
    return {
      fileName: distFileName,
      html: rewriteViteDistRootAssetUrls(dist.buffer.toString('utf8')),
    };
  } catch {
    return { fileName: options.fileName, html: options.html };
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
  const slug = (name || fallback)
    .replace(/[^\w.\-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || fallback;
}
