/**
 * Canvas→Slide explicit-template path: ask the **daemon** to Clone the
 * selected template's example.html and content-swap Source headings into
 * `deck.html`.
 *
 * Clone ownership is server-side (plugin FS read + project write). The FE only
 * triggers the endpoint — BYOK Messages API has no Clone tool for the model.
 */

import { fetchTeamverDaemon } from './teamverDaemonHeaders';

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

/**
 * Trigger daemon `POST /api/projects/:id/template-clone-deck`.
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

  try {
    const resp = await fetchTeamverDaemon(
      `/api/projects/${encodeURIComponent(projectId)}/template-clone-deck`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pluginId,
          templateTitle: options.templateTitle ?? null,
          sourceBrief: options.sourceBrief ?? null,
          userInstruction: options.userInstruction ?? null,
          deckTitle: options.deckTitle ?? null,
          slideCountHint: options.slideCountHint ?? null,
        }),
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
    };
  } catch (err) {
    return {
      ok: false,
      reason: 'fetch_failed',
      message: err instanceof Error ? err.message : 'Network error while cloning template',
    };
  }
}
