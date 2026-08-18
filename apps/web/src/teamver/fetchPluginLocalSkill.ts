import type { InstalledPluginRecord, PluginManifest } from '@open-design/contracts';
import {
  appendTemplateVisualKit,
  extractTemplateVisualKitFromHtml,
  listLocalStylesheetHrefs,
  neutralizeFilesystemCloneWorkflow,
  pickPluginPreviewHtmlPath,
  readSkillFrontmatterDescription,
  resolveSiblingAssetPath,
} from '@open-design/contracts';

import { getInstalledPlugin } from '../state/projects';
import { isTeamverEmbedMode } from './designApiBase';
import { fetchTeamverDaemon } from './teamverDaemonHeaders';

export type PluginLocalSkillSummary = {
  body: string;
  name: string;
};

function pickFirstLocalSkillPath(manifest: PluginManifest | undefined): string | null {
  for (const ref of manifest?.od?.context?.skills ?? []) {
    if (typeof ref?.ref === 'string' && ref.ref.trim().length > 0) continue;
    const rawPath = typeof ref?.path === 'string' ? ref.path.trim() : '';
    if (!rawPath) continue;
    if (
      rawPath.startsWith('./') ||
      rawPath.startsWith('../') ||
      rawPath.includes('/')
    ) {
      const safeRel = rawPath.startsWith('./') ? rawPath.slice(2) : rawPath;
      if (!safeRel.split('/').some((segment) => segment === '..')) {
        return safeRel;
      }
    }
  }
  return null;
}

function stripFrontmatter(raw: string): string {
  if (!raw.startsWith('---')) return raw;
  const closeIdx = raw.indexOf('\n---', 3);
  if (closeIdx === -1) return raw;
  return raw.slice(closeIdx + 4).replace(/^\r?\n/, '');
}

/**
 * Mirror of the daemon-side `withFrontmatterDescriptionHeader` in
 * `apps/daemon/src/plugins/local-skill.ts`. Bundled deck templates
 * (Hermes cyber terminal, Graphify dark graph, Zhangzara, etc.) put the
 * visual spec — palette hex codes, typography, motif — in the frontmatter
 * `description` (often as a YAML `description: |` block scalar). The body
 * under the frontmatter is meta-instructions that reference companion
 * files not mounted at runtime. Without this prepend, BYOK / API-mode
 * compose loses the visual contract for those templates and the deck
 * comes back looking like the default simple-deck.
 */
function withFrontmatterDescriptionHeader(
  bodyOnly: string,
  raw: string,
  manifest: PluginManifest | undefined,
): string {
  const description = readSkillFrontmatterDescription(raw)
    ?? (typeof manifest?.description === 'string' ? manifest.description.trim() : '');
  if (!description) return bodyOnly;
  if (bodyOnly.includes(description)) return bodyOnly;
  return `## Visual summary (from template frontmatter)\n\n${description}\n\n${bodyOnly}`;
}

/** Official example.html (+ sibling CSS) for persist/export look merge. */
export async function fetchPluginPreviewLookSource(
  pluginId: string,
): Promise<string | null> {
  const id = pluginId.trim();
  if (!id) return null;
  const plugin = await getInstalledPlugin(id, {
    includeHidden: true,
    bypassSlideOnlyCatalogFilter: true,
  });
  if (!plugin) return null;
  const previewPath = pickPluginPreviewHtmlPath(plugin.manifest) ?? 'example.html';
  const html = await fetchPluginAssetText(plugin.id, previewPath);
  if (!html?.trim()) return null;
  const supplementalParts: string[] = [];
  for (const href of listLocalStylesheetHrefs(html).slice(0, 3)) {
    const assetPath = resolveSiblingAssetPath(previewPath, href);
    if (!assetPath) continue;
    const css = await fetchPluginAssetText(plugin.id, assetPath);
    if (css?.trim()) supplementalParts.push(css);
  }
  if (supplementalParts.length === 0) return html;
  return `${html}\n<style data-od-kit-supplemental>\n${supplementalParts.join('\n')}\n</style>`;
}

export async function fetchPluginLocalSkill(
  pluginId: string,
): Promise<PluginLocalSkillSummary | null> {
  const id = pluginId.trim();
  if (!id) return null;
  const plugin = await getInstalledPlugin(id, {
    includeHidden: true,
    // Selected-template compose must still load a denylisted-from-picker id
    // if metadata already pins it (or tests / deep links pass one).
    bypassSlideOnlyCatalogFilter: true,
  });
  if (!plugin) return null;
  return readPluginLocalSkillFromRecord(plugin);
}

async function fetchPluginAssetText(pluginId: string, relpath: string): Promise<string | null> {
  const safeRelpath = relpath.trim().replace(/^\.\/+/, '').replace(/^\/+/, '');
  if (!safeRelpath || safeRelpath.split('/').some((segment) => segment === '..')) return null;
  const url = `/api/plugins/${encodeURIComponent(pluginId)}/asset/${encodeURIComponent(safeRelpath)}`;
  // Teamver embed: plugin-asset routes go through the daemon proxy that
  // demands X-Teamver-* identity headers; a plain fetch() returns 401.
  const attempt = async (): Promise<Response> => (
    isTeamverEmbedMode()
      ? await fetchTeamverDaemon(url, {
          skipEmbedAuthRecovery: true,
          skipTeamverWorkspaceHeaders: true,
        })
      : await fetch(url)
  );
  const fallbackPlainFetch = async (): Promise<Response | null> => {
    if (!isTeamverEmbedMode()) return null;
    try {
      return await fetch(url);
    } catch {
      return null;
    }
  };
  try {
    let resp = await attempt();
    // Plugin assets are not project/workspace scoped. If the embed daemon
    // wrapper is unavailable in local/test or a sibling node rejects the
    // auth-decorated request, fall back to a plain same-origin asset fetch
    // instead of silently dropping the selected template kit.
    if (!resp.ok && (resp.status === 401 || resp.status >= 500)) {
      resp = (await fallbackPlainFetch()) ?? resp;
    }
    // One retry on transient 5xx / network flaps — kit miss makes Daisy Days
    // fall back to Neutral-looking decks even when the template was selected.
    if (resp.status >= 500) {
      await new Promise((resolve) => setTimeout(resolve, 120));
      resp = await attempt();
      if (!resp.ok && (resp.status === 401 || resp.status >= 500)) {
        resp = (await fallbackPlainFetch()) ?? resp;
      }
    }
    if (!resp.ok) return null;
    return resp.text();
  } catch {
    try {
      await new Promise((resolve) => setTimeout(resolve, 120));
      let retry = await attempt();
      if (!retry.ok && (retry.status === 401 || retry.status >= 500)) {
        retry = (await fallbackPlainFetch()) ?? retry;
      }
      if (!retry.ok) return null;
      return retry.text();
    } catch {
      const plain = await fallbackPlainFetch();
      if (plain?.ok) return plain.text();
      return null;
    }
  }
}

export async function readPluginLocalSkillFromRecord(
  plugin: InstalledPluginRecord,
): Promise<PluginLocalSkillSummary | null> {
  const relpath = pickFirstLocalSkillPath(plugin.manifest);
  if (!relpath) return null;
  try {
    const raw = await fetchPluginAssetText(plugin.id, relpath);
    if (raw == null) return null;
    const bodyOnly = stripFrontmatter(raw).trim();
    if (!bodyOnly) return null;
    const manifest = plugin.manifest;
    const name = (manifest?.title ?? manifest?.name ?? plugin.id).toString();
    let body = neutralizeFilesystemCloneWorkflow(
      withFrontmatterDescriptionHeader(bodyOnly, raw, manifest),
    );
    // Token-safe template apply:
    // Inject the compact visual kit only (~2.7k tokens for Daisy Days). The kit
    // already includes a lightweight "Template scaffold map" (slide classes /
    // roles / deco cues) so the model can content-swap without pasting a
    // multi‑KB example.html HTML dump into the system prompt.
    //
    // Do NOT append extractTemplateScaffoldFromHtml() here by default — a
    // 12KB HTML scaffold + kit ≈ 5k input tokens and also invites the model to
    // burn output tokens rewriting the whole document (truncation risk).
    const previewPath = pickPluginPreviewHtmlPath(manifest);
    if (previewPath && previewPath !== relpath) {
      try {
        const previewHtml = await fetchPluginAssetText(plugin.id, previewPath);
        if (previewHtml) {
          const supplementalParts: string[] = [];
          for (const href of listLocalStylesheetHrefs(previewHtml).slice(0, 3)) {
            try {
              const assetPath = resolveSiblingAssetPath(previewPath, href);
              if (!assetPath) continue;
              const css = await fetchPluginAssetText(plugin.id, assetPath);
              if (css) supplementalParts.push(css);
            } catch {
              // Best-effort sibling CSS (Pin-and-Paper assets/styles.css, etc.).
            }
          }
          body = appendTemplateVisualKit(
            body,
            extractTemplateVisualKitFromHtml(previewHtml, {
              title: name,
              ...(supplementalParts.length > 0
                ? { supplementalCss: supplementalParts.join('\n') }
                : {}),
            }),
          );
        }
      } catch {
        // Preview kit is best-effort; SKILL.md visual summary still helps.
      }
    }
    return { body, name };
  } catch (err) {
    console.warn(
      '[fetchPluginLocalSkill] failed to read plugin-local skill:',
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
