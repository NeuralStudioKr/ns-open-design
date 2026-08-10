import type { InstalledPluginRecord, PluginManifest } from '@open-design/contracts';
import {
  appendTemplateVisualKit,
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
  const url = `/api/plugins/${encodeURIComponent(pluginId)}/asset/${encodeURIComponent(relpath)}`;
  // Teamver embed: plugin-asset routes go through the daemon proxy that
  // demands X-Teamver-* identity headers; a plain fetch() returns 401.
  const resp = isTeamverEmbedMode()
    ? await fetchTeamverDaemon(url, { skipEmbedAuthRecovery: true })
    : await fetch(url);
  if (!resp.ok) return null;
  return resp.text();
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
    // Pull concrete CSS tokens / fonts from example.html so BYOK compose
    // can match Daisy Days (cream + Fredoka + chunky borders) instead of
    // inventing a sparse dark Neutral Modern look from the design system.
    const previewPath = pickPluginPreviewHtmlPath(manifest);
    if (previewPath && previewPath !== relpath) {
      try {
        const previewHtml = await fetchPluginAssetText(plugin.id, previewPath);
        if (previewHtml) {
          body = appendTemplateVisualKit(
            body,
            extractTemplateVisualKitFromHtml(previewHtml, { title: name }),
          );
        }
      } catch {
        // Preview kit is best-effort; SKILL.md visual summary still helps.
      }
    }
    return { body, name };
  } catch {
    return null;
  }
}
