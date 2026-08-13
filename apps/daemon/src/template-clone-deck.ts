/**
 * Server-side Open Design Clone for Teamver Canvas→Slide.
 *
 * BYOK Messages API has no Clone tool. The daemon reads the selected plugin's
 * preview HTML from disk, content-swaps Source headings, and writes deck.html
 * into the project — FE only triggers this endpoint.
 */

import fsp from 'node:fs/promises';
import path from 'node:path';
import type Database from 'better-sqlite3';
import {
  buildTemplateClonedDeckHtml,
  pickPluginPreviewHtmlPath,
  resolveTemplateCloneSlideCountHint,
  resolveTemplateCloneSlidesFromBrief,
} from '@open-design/contracts';

import { getInstalledPlugin } from './plugins/registry.js';

type SqliteDb = Database.Database;

export type TemplateCloneDeckResult =
  | {
      ok: true;
      fileName: 'deck.html';
      slideCount: number;
      templateId: string;
      previewPath: string;
    }
  | {
      ok: false;
      reason:
        | 'missing_plugin'
        | 'missing_preview'
        | 'clone_failed'
        | 'write_failed';
      message: string;
      status: number;
    };

async function readContainedTextFile(
  rootDir: string,
  relpath: string,
): Promise<string | null> {
  const safeRel = relpath.trim().replace(/^\.\/+/, '').replace(/^\/+/, '');
  if (!safeRel || safeRel.includes('\0') || safeRel.split(/[\\/]/).some((s) => s === '..')) {
    return null;
  }
  const root = path.resolve(rootDir);
  const resolved = path.resolve(root, safeRel);
  const rootWithSep = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (resolved !== root && !resolved.startsWith(rootWithSep)) return null;

  // Reject symlink escapes (same policy as plugin asset route).
  try {
    const rootStat = await fsp.lstat(root);
    if (rootStat.isSymbolicLink()) return null;
    let current = root;
    for (const segment of path.relative(root, resolved).split(path.sep).filter(Boolean)) {
      current = path.join(current, segment);
      const stat = await fsp.lstat(current);
      if (stat.isSymbolicLink()) return null;
    }
    const rootReal = await fsp.realpath(root);
    const resolvedReal = await fsp.realpath(resolved);
    const rootRealWithSep = rootReal.endsWith(path.sep) ? rootReal : `${rootReal}${path.sep}`;
    if (resolvedReal !== rootReal && !resolvedReal.startsWith(rootRealWithSep)) {
      return null;
    }
  } catch {
    return null;
  }

  try {
    return await fsp.readFile(resolved, 'utf8');
  } catch {
    return null;
  }
}

async function loadTemplatePreviewHtml(
  db: SqliteDb,
  pluginId: string,
): Promise<{ html: string; previewPath: string; templateId: string; title: string } | null> {
  const plugin = getInstalledPlugin(db, pluginId);
  if (!plugin?.fsPath) return null;
  const previewPath = pickPluginPreviewHtmlPath(plugin.manifest) ?? 'example.html';
  const html = await readContainedTextFile(plugin.fsPath, previewPath);
  if (!html?.trim()) return null;
  const manifest = plugin.manifest as { title?: unknown; name?: unknown };
  const title = (
    (typeof manifest?.title === 'string' && manifest.title)
    || (typeof manifest?.name === 'string' && manifest.name)
    || plugin.title
    || plugin.id
  ).toString();
  return { html, previewPath, templateId: plugin.id, title };
}

function countSlides(html: string): number {
  return (html.match(/<section\b[^>]*\bslide\b/gi) ?? []).length
    || (html.match(/<div\b[^>]*\bclass\s*=\s*["'][^"']*\bslide\b/gi) ?? []).length
    || 1;
}

function buildDeckArtifactManifest(input: {
  pluginId: string;
  templateTitle: string;
}): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    version: 1,
    kind: 'deck',
    title: input.templateTitle || 'deck',
    entry: 'deck.html',
    renderer: 'deck-html',
    status: 'complete',
    exports: ['html', 'pdf', 'pptx', 'zip'],
    primary: true,
    createdAt: now,
    updatedAt: now,
    sourceSkillId: input.pluginId,
    metadata: {
      identifier: 'deck',
      artifactType: 'deck',
      templateClonedDeckSeeded: true,
      selectedDeckTemplateId: input.pluginId,
      ...(input.templateTitle
        ? { selectedDeckTemplateTitle: input.templateTitle }
        : {}),
    },
  };
}

export type SeedTemplateClonedDeckOnServerDeps = {
  db: SqliteDb;
  projectsRoot: string;
  projectId: string;
  metadata?: unknown;
  ensureProject: (
    projectsRoot: string,
    projectId: string,
    metadata?: unknown,
  ) => Promise<string> | string;
  writeProjectFile: (
    projectsRoot: string,
    projectId: string,
    name: string,
    body: string | Buffer,
    options?: { overwrite?: boolean; artifactManifest?: unknown },
    metadata?: unknown,
  ) => Promise<unknown>;
};

/**
 * Clone selected template preview HTML into the project as deck.html.
 */
export async function seedTemplateClonedDeckOnServer(
  deps: SeedTemplateClonedDeckOnServerDeps,
  input: {
    pluginId: string;
    templateTitle?: string | null;
    sourceBrief?: string | null;
    userInstruction?: string | null;
    deckTitle?: string | null;
    slideCountHint?: string | number | null;
  },
): Promise<TemplateCloneDeckResult> {
  const pluginId = String(input.pluginId ?? '').trim();
  const projectId = String(deps.projectId ?? '').trim();
  if (!pluginId || !projectId) {
    return {
      ok: false,
      reason: 'missing_plugin',
      message: 'pluginId and project id are required',
      status: 400,
    };
  }

  if (!getInstalledPlugin(deps.db, pluginId)) {
    return {
      ok: false,
      reason: 'missing_plugin',
      message: `Plugin not found: ${pluginId}`,
      status: 404,
    };
  }
  const loaded = await loadTemplatePreviewHtml(deps.db, pluginId);
  if (!loaded) {
    return {
      ok: false,
      reason: 'missing_preview',
      message: `Template preview not found for ${pluginId}`,
      status: 404,
    };
  }

  const slides = resolveTemplateCloneSlidesFromBrief({
    ...(input.sourceBrief != null ? { sourceBrief: input.sourceBrief } : {}),
    ...(input.userInstruction != null ? { userInstruction: input.userInstruction } : {}),
    deckTitle: input.deckTitle ?? input.templateTitle ?? loaded.title,
  });
  const countHint = resolveTemplateCloneSlideCountHint(input.slideCountHint);
  const deckTitle =
    input.deckTitle?.trim()
    || input.templateTitle?.trim()
    || slides[0]?.title
    || loaded.title;
  const cloned = buildTemplateClonedDeckHtml(loaded.html, slides, {
    title: deckTitle,
    maxSlides: countHint ?? Math.max(slides.length, 6),
  });
  if (!cloned) {
    return {
      ok: false,
      reason: 'clone_failed',
      message: 'Template preview has no slide shells to clone',
      status: 422,
    };
  }

  await deps.ensureProject(deps.projectsRoot, projectId, deps.metadata);

  try {
    await deps.writeProjectFile(
      deps.projectsRoot,
      projectId,
      'refs/template-base.html',
      loaded.html,
      { overwrite: true },
      deps.metadata,
    );
  } catch {
    /* best-effort base copy */
  }

  const templateTitle = input.templateTitle?.trim() || loaded.title;
  try {
    await deps.writeProjectFile(
      deps.projectsRoot,
      projectId,
      'deck.html',
      cloned,
      {
        overwrite: true,
        artifactManifest: buildDeckArtifactManifest({
          pluginId: loaded.templateId,
          templateTitle,
        }),
      },
      deps.metadata,
    );
  } catch (err) {
    return {
      ok: false,
      reason: 'write_failed',
      message: err instanceof Error ? err.message : 'Failed to write deck.html',
      status: 500,
    };
  }

  return {
    ok: true,
    fileName: 'deck.html',
    slideCount: countSlides(cloned),
    templateId: loaded.templateId,
    previewPath: loaded.previewPath,
  };
}
