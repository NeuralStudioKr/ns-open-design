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
  attrsLookLikeDeckOrTemplateSlideHost,
  buildTemplateClonedDeckHtml,
  looksLikeLeftoverTemplateDemoDeck,
  looksLikeTemplateCloneServiceIntroBrief,
  pickPluginPreviewHtmlPath,
  resolveTemplateCloneSlideCountHint,
  resolveTemplateCloneSlidesForDeterministicFill,
  sanitizeTemplateCloneDeckTitle,
  TEMPLATE_CLONE_SERVICE_INTRO_DEFAULT_SLIDES,
} from '@open-design/contracts';

import { ArtifactPublicationBlockedError } from './artifact-publication-guard.js';
import { ArtifactRegressionError } from './artifact-stub-guard.js';
import { resolveInstalledPlugin } from './plugins/registry.js';

type SqliteDb = Database.Database;

export type TemplateCloneDeckResult =
  | {
      ok: true;
      fileName: 'deck.html';
      slideCount: number;
      templateId: string;
      previewPath: string;
      /** Existing filled deck.html was kept; FE must not re-stamp LOOK seed. */
      preservedFilled?: boolean;
      /** True when the clone endpoint also marked content fill as complete. */
      contentFilled?: boolean;
    }
  | {
      ok: false;
      reason:
        | 'missing_plugin'
        | 'missing_preview'
        | 'clone_failed'
        | 'write_failed'
        | 'artifact_regression'
        | 'artifact_publication_blocked';
      message: string;
      status: number;
    };

export type TemplateCloneDeckContentFillMode = 'prompt-fill' | 'deterministic-fill';

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
  const plugin = resolveInstalledPlugin(db, pluginId);
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
  const sections = (html.match(/<section\b[^>]*>/gi) ?? []).filter((open) =>
    attrsLookLikeDeckOrTemplateSlideHost(open),
  ).length;
  if (sections > 0) return sections;
  const divs = (html.match(/<div\b[^>]*>/gi) ?? []).filter((open) =>
    attrsLookLikeDeckOrTemplateSlideHost(open),
  ).length;
  return divs || 1;
}

function asMetadataRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
}

function manifestMetadata(artifactManifest: unknown): Record<string, unknown> | null {
  const manifest = asMetadataRecord(artifactManifest);
  return asMetadataRecord(manifest?.metadata) ?? manifest;
}

function readMetaFlag(
  ...sources: Array<unknown>
): { filled: boolean } {
  let filled = false;
  for (const source of sources) {
    const rec = asMetadataRecord(source);
    const nested = manifestMetadata(source);
    for (const candidate of [rec, nested]) {
      if (candidate?.templateCloneContentFilled === true) filled = true;
    }
  }
  return { filled };
}

/** Empty project stub / Neutral placeholder — Clone must still replace these. */
export function isNeutralDeckStubHtml(html: string): boolean {
  const trimmed = html.trim();
  if (!trimmed || trimmed.length > 4000) return false;
  if (trimmed.includes('data-od-official-look-css') || trimmed.includes('od-official-deck-look')) {
    return false;
  }
  const slideOpens = (trimmed.match(/<(?:section|div)\b[^>]*>/gi) ?? [])
    .filter((open) => attrsLookLikeDeckOrTemplateSlideHost(open));
  const hasPlaceholderKo =
    trimmed.includes('슬라이드 제목') && trimmed.includes('내용을 입력하세요');
  const hasNeutralPalette =
    /#0f172a|#1e293b|#111827|#c96442/i.test(trimmed)
    && !/#f5f0e6|#fff8f0|#0d1b2a/i.test(trimmed);
  return hasPlaceholderKo || (slideOpens.length <= 1 && (hasNeutralPalette || trimmed.length < 1200));
}

function extractDeckComparableText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function deckComparableTextLooksLikeSameClone(existing: string, incoming: string): boolean {
  const a = extractDeckComparableText(existing);
  const b = extractDeckComparableText(incoming);
  if (!a || !b) return false;
  if (a === b) return true;
  const wordsA = new Set(a.split(' ').filter((word) => word.length > 2));
  const wordsB = new Set(b.split(' ').filter((word) => word.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return false;
  let shared = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) shared += 1;
  }
  const union = wordsA.size + wordsB.size - shared;
  return union > 0 && shared / union >= 0.62;
}

/**
 * A successful content-fill already occupies deck.html. A late or retry Clone
 * must not replace that filled deck with the official example.html LOOK seed —
 * that is the "generated deck reverted to the template default" bug.
 *
 * Neutral stubs and missing files still get cloned. Identical bytes are a no-op
 * (caller may rewrite). A leftover `templateClonedDeckSeeded` stamp is not
 * enough to overwrite: compare visible text so a stale seed flag cannot clobber fill.
 */
export function shouldPreserveFilledDeckOverCloneReseed(
  existingHtml: string,
  incomingClonedHtml: string,
  metadata?: unknown,
  artifactManifest?: unknown,
): boolean {
  const existing = existingHtml.trim();
  const incoming = incomingClonedHtml.trim();
  if (!existing || existing === incoming) return false;
  if (isNeutralDeckStubHtml(existing)) return false;

  const flags = readMetaFlag(metadata, artifactManifest);
  if (flags.filled) return true;
  if (deckComparableTextLooksLikeSameClone(existing, incoming)) return false;
  if (
    looksLikeLeftoverTemplateDemoDeck(existing)
    && !looksLikeLeftoverTemplateDemoDeck(incoming)
  ) {
    return false;
  }
  return true;
}

function buildDeckArtifactManifest(input: {
  pluginId: string;
  templateTitle: string;
  deckTitle?: string | null;
  contentFillMode?: TemplateCloneDeckContentFillMode;
}): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    version: 1,
    kind: 'deck',
    title: sanitizeTemplateCloneDeckTitle(input.deckTitle) || '슬라이드',
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
      ...(input.contentFillMode === 'deterministic-fill'
        ? {
            templateCloneContentFilled: true,
            templateCloneContentFillPending: false,
            templateCloneFillMode: 'deterministic',
          }
        : {}),
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
    options?: {
      overwrite?: boolean;
      artifactManifest?: unknown;
      /** Trusted Clone may replace a larger Neutral/prior deck. */
      skipArtifactStubGuard?: boolean;
      /** Trusted Clone may retain decorative strings that look like pitch markers. */
      skipArtifactPublicationGuard?: boolean;
    },
    metadata?: unknown,
  ) => Promise<unknown>;
  /** Lazily re-register a bundled plugin when the sqlite row is missing. */
  ensureBundledPlugin?: (pluginId: string) => Promise<{ id: string } | null> | { id: string } | null;
  /**
   * After a successful Clone, clear composer seed + stamp durable metadata so
   * FE auto-send / model fallback cannot wipe the seeded deck.
   */
  markTemplateClonedDeckSeeded?: (input: {
    projectId: string;
    pluginId: string;
    templateTitle: string;
    contentFillMode: TemplateCloneDeckContentFillMode;
    /** User prompt to persist in chat (Clone skips model auto-send). */
    userInstruction?: string | null;
    sourceBrief?: string | null;
  }) => void | Promise<void>;
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
    contentFillMode?: TemplateCloneDeckContentFillMode;
  },
): Promise<TemplateCloneDeckResult> {
  const pluginId = String(input.pluginId ?? '').trim();
  const projectId = String(deps.projectId ?? '').trim();
  const contentFillMode: TemplateCloneDeckContentFillMode =
    input.contentFillMode === 'deterministic-fill' ? 'deterministic-fill' : 'prompt-fill';
  if (!pluginId || !projectId) {
    return {
      ok: false,
      reason: 'missing_plugin',
      message: 'pluginId and project id are required',
      status: 400,
    };
  }

  let resolved = resolveInstalledPlugin(deps.db, pluginId);
  if (!resolved && deps.ensureBundledPlugin) {
    // Try raw id then path-stripped / example- aliases — gallery ids often
    // arrive as `open-design/example-html-ppt-…` while bundled folders use
    // bare / example- names.
    const ensureCandidates = new Set<string>([pluginId]);
    const segments = pluginId.split('/').filter(Boolean);
    const bare = (segments[segments.length - 1] ?? pluginId).trim();
    if (bare) {
      ensureCandidates.add(bare);
      if (bare.startsWith('example-')) {
        ensureCandidates.add(bare.slice('example-'.length));
      } else {
        ensureCandidates.add(`example-${bare}`);
      }
    }
    for (const candidate of ensureCandidates) {
      try {
        await deps.ensureBundledPlugin(candidate);
      } catch {
        /* best-effort rehydrate */
      }
      resolved = resolveInstalledPlugin(deps.db, candidate);
      if (resolved) break;
    }
    if (!resolved) {
      resolved = resolveInstalledPlugin(deps.db, pluginId);
    }
  }
  if (!resolved) {
    return {
      ok: false,
      reason: 'missing_plugin',
      message: `Plugin not found: ${pluginId}`,
      status: 404,
    };
  }
  const loaded = await loadTemplatePreviewHtml(deps.db, resolved.id);
  if (!loaded) {
    return {
      ok: false,
      reason: 'missing_preview',
      message: `Template preview not found for ${pluginId}`,
      status: 404,
    };
  }

  const countHint = resolveTemplateCloneSlideCountHint(input.slideCountHint);
  const briefOpts = {
    ...(input.sourceBrief != null ? { sourceBrief: input.sourceBrief } : {}),
    ...(input.userInstruction != null ? { userInstruction: input.userInstruction } : {}),
    // Prefer the user-facing deck/project title over the plugin marketing
    // title ("Html Ppt Zhangzara Daisy Days") when synthesizing free-form.
    deckTitle: sanitizeTemplateCloneDeckTitle(input.deckTitle),
  };
  const briefText = [input.sourceBrief ?? '', input.userInstruction ?? '']
    .filter(Boolean)
    .join('\n\n');
  // 루프425 — LOOK seed (prompt-fill) uses the same dense helper. If MiniMax
  // never runs or fails, the seed is the deliverable — no `…` cards.
  const honorCount = countHint
    ?? (looksLikeTemplateCloneServiceIntroBrief(briefText)
      ? TEMPLATE_CLONE_SERVICE_INTRO_DEFAULT_SLIDES
      : null);
  const slides = resolveTemplateCloneSlidesForDeterministicFill({
    ...briefOpts,
    ...(honorCount != null ? { slideCount: honorCount } : {}),
  });
  const honorSlides = honorCount != null && honorCount <= 10 && slides.length > honorCount
    ? slides.slice(0, honorCount)
    : slides;
  // Content-derived title wins. Never fall back to plugin/template marketing
  // names — those used to land on the cover when the brief was empty.
  const deckTitle =
    sanitizeTemplateCloneDeckTitle(slides[0]?.title)
    || sanitizeTemplateCloneDeckTitle(input.deckTitle)
    || '슬라이드';
  // Honor an explicit count, or the service-intro default of 8. Never pad to
  // the template's demo page count.
  const cloned = buildTemplateClonedDeckHtml(loaded.html, honorSlides, {
    title: deckTitle,
    templateId: loaded.templateId,
    ...(honorCount != null ? { maxSlides: honorCount } : {}),
  });
  if (!cloned) {
    return {
      ok: false,
      reason: 'clone_failed',
      message: 'Template preview has no slide shells to clone',
      status: 422,
    };
  }

  const projectDir = await deps.ensureProject(deps.projectsRoot, projectId, deps.metadata);

  // Do NOT copy the template into project refs/ — users see Design Files.
  // The daemon already reads preview HTML from the plugin install path;
  // only the filled deliverable (deck.html) belongs in the project.

  const templateTitle = input.templateTitle?.trim() || loaded.title;
  try {
    const existing = await fsp.readFile(path.join(projectDir, 'deck.html'), 'utf8');
    let artifactManifest: unknown;
    try {
      artifactManifest = JSON.parse(
        await fsp.readFile(path.join(projectDir, 'deck.html.artifact.json'), 'utf8'),
      );
    } catch {
      artifactManifest = undefined;
    }
    if (shouldPreserveFilledDeckOverCloneReseed(existing, cloned, deps.metadata, artifactManifest)) {
      return {
        ok: true,
        fileName: 'deck.html',
        slideCount: countSlides(existing),
        templateId: loaded.templateId,
        previewPath: loaded.previewPath,
        preservedFilled: true,
        // 루프421 — kept deck is the deliverable. FE must never MiniMax-overwrite.
        contentFilled: true,
      };
    }
  } catch {
    // No existing deck — write the LOOK seed.
  }

  try {
    await deps.writeProjectFile(
      deps.projectsRoot,
      projectId,
      'deck.html',
      cloned,
      {
        overwrite: true,
        // Clone is a trusted server path: reseeding a visual template must not
        // lose to ARTIFACT_REGRESSION when replacing a larger Neutral stub,
        // or to publication-guard false positives on decorative template copy.
        skipArtifactStubGuard: true,
        skipArtifactPublicationGuard: true,
        artifactManifest: buildDeckArtifactManifest({
          pluginId: loaded.templateId,
          templateTitle,
          deckTitle,
          contentFillMode,
        }),
      },
      deps.metadata,
    );
  } catch (err) {
    if (err instanceof ArtifactRegressionError) {
      return {
        ok: false,
        reason: 'artifact_regression',
        message: err.message,
        status: 422,
      };
    }
    if (err instanceof ArtifactPublicationBlockedError) {
      return {
        ok: false,
        reason: 'artifact_publication_blocked',
        message: err.message,
        status: 422,
      };
    }
    return {
      ok: false,
      reason: 'write_failed',
      message: err instanceof Error ? err.message : 'Failed to write deck.html',
      status: 500,
    };
  }

  if (deps.markTemplateClonedDeckSeeded) {
    try {
      await deps.markTemplateClonedDeckSeeded({
        projectId,
        pluginId: loaded.templateId,
        templateTitle,
        contentFillMode,
        userInstruction: input.userInstruction ?? null,
        sourceBrief: input.sourceBrief ?? null,
      });
    } catch (markErr) {
      // Deck bytes are already on disk — do not fail the clone response.
      console.warn(
        '[template-clone-deck] markTemplateClonedDeckSeeded failed',
        markErr,
      );
    }
  }

  return {
    ok: true,
    fileName: 'deck.html',
    slideCount: countSlides(cloned),
    templateId: loaded.templateId,
    previewPath: loaded.previewPath,
    ...(contentFillMode === 'deterministic-fill' ? { contentFilled: true } : {}),
  };
}
