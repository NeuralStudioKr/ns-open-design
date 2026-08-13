/**
 * Canvas→Slide explicit-template path: clone plugin `example.html` on the FE
 * (BYOK has no Clone tool) and content-swap Source headings into `deck.html`.
 *
 * When this succeeds, callers should skip model structure generation so the
 * seeded template look is not overwritten by a Neutral regenerate.
 */

import {
  buildTemplateClonedDeckHtml,
  pickPluginPreviewHtmlPath,
  resolveTemplateCloneSlideCountHint,
  type TemplateCloneSlideContent,
} from '@open-design/contracts';

import { createArtifactManifest } from '../artifacts/manifest';
import { extractSlideOutlineItems } from '../artifacts/emergency-deck';
import {
  fetchPluginAssetText,
  writeProjectTextFileDetailed,
} from '../providers/registry';
import { getInstalledPlugin } from '../state/projects';

export type SeedTemplateClonedDeckResult =
  | {
      ok: true;
      fileName: 'deck.html';
      slideCount: number;
      templateId: string;
    }
  | {
      ok: false;
      reason:
        | 'missing_plugin'
        | 'missing_preview'
        | 'fetch_failed'
        | 'clone_failed'
        | 'write_failed';
      message: string;
    };

function outlineSlidesFromBrief(
  sourceBrief: string | null | undefined,
  userInstruction: string | null | undefined,
  deckTitle: string | null | undefined,
): TemplateCloneSlideContent[] {
  const outlineText = [sourceBrief ?? '', userInstruction ?? ''].filter(Boolean).join('\n\n');
  const fromOutline = extractSlideOutlineItems(outlineText).map((slide) => ({
    title: slide.title,
    body: slide.body,
  }));
  if (fromOutline.length >= 1) return fromOutline;
  const title = deckTitle?.trim();
  if (title) return [{ title }];
  return [];
}

/**
 * Fetch the selected template preview HTML, content-swap Source outline into
 * its slide shells, and persist `refs/template-base.html` + `deck.html`.
 */
export async function seedTemplateClonedDeck(options: {
  projectId: string;
  pluginId: string;
  templateTitle?: string | null;
  sourceBrief?: string | null;
  userInstruction?: string | null;
  deckTitle?: string | null;
  slideCountHint?: string | number | null;
}): Promise<SeedTemplateClonedDeckResult> {
  const projectId = options.projectId.trim();
  const pluginId = options.pluginId.trim();
  if (!projectId || !pluginId) {
    return { ok: false, reason: 'missing_plugin', message: 'Missing project or plugin id' };
  }

  const plugin = await getInstalledPlugin(pluginId, {
    includeHidden: true,
    bypassSlideOnlyCatalogFilter: true,
  });
  if (!plugin) {
    return { ok: false, reason: 'missing_plugin', message: `Plugin not found: ${pluginId}` };
  }

  const previewPath = pickPluginPreviewHtmlPath(plugin.manifest) ?? 'example.html';
  const previewHtml = await fetchPluginAssetText(pluginId, previewPath);
  if (!previewHtml?.trim()) {
    return {
      ok: false,
      reason: 'fetch_failed',
      message: `Could not fetch template preview (${previewPath})`,
    };
  }

  const slides = outlineSlidesFromBrief(
    options.sourceBrief,
    options.userInstruction,
    options.deckTitle ?? options.templateTitle,
  );
  const countHint = resolveTemplateCloneSlideCountHint(options.slideCountHint);
  const cloned = buildTemplateClonedDeckHtml(previewHtml, slides, {
    title: options.deckTitle?.trim() || options.templateTitle?.trim() || slides[0]?.title,
    maxSlides: countHint ?? Math.max(slides.length, 6),
  });
  if (!cloned) {
    return {
      ok: false,
      reason: 'clone_failed',
      message: 'Template preview has no slide shells to clone',
    };
  }

  // Best-effort raw base for debugging / later refine turns.
  try {
    await writeProjectTextFileDetailed(
      projectId,
      'refs/template-base.html',
      previewHtml,
    );
  } catch {
    /* non-fatal */
  }

  const manifest = createArtifactManifest({
    entry: 'deck.html',
    title: options.templateTitle?.trim() || 'deck',
    preferDeck: true,
    sourceSkillId: pluginId,
    metadata: {
      identifier: 'deck',
      artifactType: 'deck',
      templateClonedDeckSeeded: true,
      selectedDeckTemplateId: pluginId,
      ...(options.templateTitle?.trim()
        ? { selectedDeckTemplateTitle: options.templateTitle.trim() }
        : {}),
    },
  });

  const written = await writeProjectTextFileDetailed(projectId, 'deck.html', cloned, {
    artifactManifest: manifest,
  });
  if (!written.ok) {
    return {
      ok: false,
      reason: 'write_failed',
      message: written.message || 'Failed to write deck.html',
    };
  }

  const slideCount = (cloned.match(/<section\b[^>]*\bslide\b/gi) ?? []).length
    || (cloned.match(/<div\b[^>]*\bclass\s*=\s*["'][^"']*\bslide\b/gi) ?? []).length
    || slides.length
    || 1;

  return {
    ok: true,
    fileName: 'deck.html',
    slideCount,
    templateId: pluginId,
  };
}
