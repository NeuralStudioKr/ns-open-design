/**
 * Canvas→Slide explicit-template path: ask the **daemon** to Clone the
 * selected template's example.html and content-swap Source headings into
 * `deck.html`.
 *
 * Clone ownership is server-side (plugin FS read + project write). The FE only
 * triggers the endpoint — BYOK Messages API has no Clone tool for the model.
 */

import { fetchProjectFileText } from '../providers/registry';
import { getProject } from '../state/projects';
import { fetchTeamverDaemon } from './teamverDaemonHeaders';

export type SeedTemplateClonedDeckResult =
  | {
      ok: true;
      fileName: 'deck.html';
      slideCount: number;
      templateId: string;
      /** True when HTTP failed/ambiguous but an already-seeded deck was kept. */
      recoveredExisting?: boolean;
      /** True when daemon kept a filled deck instead of reseeding LOOK. */
      preservedFilled?: boolean;
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

function asSeededTemplateId(...candidates: unknown[]): string {
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return 'unknown';
}

/**
 * If deck.html was already written by a prior successful Clone (or the HTTP
 * response was lost after write), prefer keeping that deck over model fallback.
 *
 * Authority (any one is enough, when deck.html also exists):
 * 1. `deck.html.artifact.json` metadata.templateClonedDeckSeeded
 *    (ignored when templateCloneContentFilled is already true)
 * 2. project metadata.templateClonedDeckSeeded
 *    (ignored when templateCloneContentFilled is already true)
 */
export async function recoverExistingTemplateClonedDeck(
  projectId: string,
): Promise<Extract<SeedTemplateClonedDeckResult, { ok: true }> | null> {
  const id = projectId.trim();
  if (!id) return null;

  let deckExists = false;
  try {
    const deckHtml = await fetchProjectFileText(id, 'deck.html', { cache: 'no-store' });
    deckExists = Boolean(deckHtml && deckHtml.trim().length > 200);
  } catch {
    deckExists = false;
  }
  if (!deckExists) return null;

  try {
    const text = await fetchProjectFileText(id, 'deck.html.artifact.json', {
      cache: 'no-store',
    });
    if (text?.trim()) {
      const json = JSON.parse(text) as {
        sourceSkillId?: unknown;
        metadata?: {
          templateClonedDeckSeeded?: unknown;
          templateCloneContentFilled?: unknown;
          selectedDeckTemplateId?: unknown;
        };
      };
      if (json?.metadata?.templateCloneContentFilled === true) {
        return null;
      }
      if (json?.metadata?.templateClonedDeckSeeded === true) {
        return {
          ok: true,
          fileName: 'deck.html',
          slideCount: 1,
          templateId: asSeededTemplateId(
            json.metadata?.selectedDeckTemplateId,
            json.sourceSkillId,
          ),
          recoveredExisting: true,
        };
      }
    }
  } catch {
    /* fall through to project metadata */
  }

  try {
    const project = await getProject(id);
    const meta = project?.metadata as
      | {
          templateClonedDeckSeeded?: unknown;
          templateCloneContentFilled?: unknown;
          selectedDeckTemplateId?: unknown;
        }
      | undefined;
    if (meta?.templateCloneContentFilled === true) {
      return null;
    }
    if (meta?.templateClonedDeckSeeded === true) {
      return {
        ok: true,
        fileName: 'deck.html',
        slideCount: 1,
        templateId: asSeededTemplateId(meta.selectedDeckTemplateId),
        recoveredExisting: true,
      };
    }
  } catch {
    /* ignore */
  }

  return null;
}

/**
 * Trigger daemon `POST /api/projects/:id/template-clone-deck`.
 * On ambiguous failure, recover an already-seeded deck instead of model fallback.
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

  const recover = async (): Promise<SeedTemplateClonedDeckResult | null> => {
    return recoverExistingTemplateClonedDeck(projectId);
  };

  const body = JSON.stringify({
    pluginId,
    templateTitle: options.templateTitle ?? null,
    sourceBrief: options.sourceBrief ?? null,
    userInstruction: options.userInstruction ?? null,
    deckTitle: options.deckTitle ?? null,
    slideCountHint: options.slideCountHint ?? null,
  });

  const attempt = async (): Promise<SeedTemplateClonedDeckResult> => {
    const resp = await fetchTeamverDaemon(
      `/api/projects/${encodeURIComponent(projectId)}/template-clone-deck`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      },
    );
    if (!resp.ok) {
      let message = `Template clone failed (${resp.status})`;
      let reason: Extract<SeedTemplateClonedDeckResult, { ok: false }>['reason'] =
        resp.status === 404 ? 'missing_preview' : 'clone_failed';
      try {
        const json = (await resp.json()) as { error?: string; code?: string; message?: string };
        message = json.message || json.error || message;
        const code = (json.code || '').toLowerCase();
        if (code.includes('missing_plugin')) reason = 'missing_plugin';
        else if (code.includes('missing_preview')) reason = 'missing_preview';
        else if (code.includes('write')) reason = 'write_failed';
        else if (code.includes('clone')) reason = 'clone_failed';
      } catch {
        /* keep defaults */
      }
      return { ok: false, reason, message };
    }
    const json = (await resp.json()) as {
      ok?: boolean;
      fileName?: string;
      slideCount?: number;
      templateId?: string;
      preservedFilled?: boolean;
    };
    if (!json?.ok || json.fileName !== 'deck.html') {
      return {
        ok: false,
        reason: 'clone_failed',
        message: 'Daemon template clone returned an unexpected payload',
      };
    }
    return {
      ok: true,
      fileName: 'deck.html',
      slideCount: typeof json.slideCount === 'number' ? json.slideCount : 1,
      templateId: typeof json.templateId === 'string' ? json.templateId : pluginId,
      ...(json.preservedFilled === true ? { preservedFilled: true } : {}),
    };
  };

  try {
    let result = await attempt();
    // One retry for transient daemon/plugin-register races (missing_plugin on
    // a cold HA pod that still has the bundled folder).
    if (
      !result.ok
      && (result.reason === 'missing_plugin' || result.reason === 'fetch_failed')
    ) {
      result = await attempt();
    }
    if (result.ok) return result;
    const recovered = await recover();
    if (recovered) return recovered;
    return result;
  } catch (err) {
    try {
      const retried = await attempt();
      if (retried.ok) return retried;
    } catch {
      /* fall through */
    }
    const recovered = await recover();
    if (recovered) return recovered;
    return {
      ok: false,
      reason: 'fetch_failed',
      message: err instanceof Error ? err.message : 'Network error while cloning template',
    };
  }
}
