import type { InstalledPluginRecord, PluginManifest } from '@open-design/contracts';
import {
  appendTemplateScaffold,
  appendTemplateVisualKit,
  extractTemplateScaffoldFromHtml,
  extractTemplateVisualKitFromHtml,
  pickPluginPreviewHtmlPath,
  readSkillFrontmatterDescription,
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
    let body = withFrontmatterDescriptionHeader(bodyOnly, raw, manifest);
    // Prefer a CONTENT-SWAP scaffold from example.html (real CSS/SVG shells,
    // text replace only). Fall back to the compact visual kit when scaffold
    // extraction fails — BYOK cannot Read example.html at runtime.
    const previewPath = pickPluginPreviewHtmlPath(manifest);
    if (previewPath && previewPath !== relpath) {
      try {
        const previewHtml = await fetchPluginAssetText(plugin.id, previewPath);
        if (previewHtml) {
          const scaffold = extractTemplateScaffoldFromHtml(previewHtml, { title: name });
          if (scaffold) {
            body = appendTemplateScaffold(body, scaffold);
          } else {
            body = appendTemplateVisualKit(
              body,
              extractTemplateVisualKitFromHtml(previewHtml, { title: name }),
            );
          }
        }
      } catch {
        // Preview kit/scaffold is best-effort; SKILL.md visual summary still helps.
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
