import type { InstalledPluginRecord, PluginManifest } from '@open-design/contracts';

import { getInstalledPlugin } from '../state/projects';

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

export async function fetchPluginLocalSkill(
  pluginId: string,
): Promise<PluginLocalSkillSummary | null> {
  const id = pluginId.trim();
  if (!id) return null;
  const plugin = await getInstalledPlugin(id, { includeHidden: true });
  if (!plugin) return null;
  return readPluginLocalSkillFromRecord(plugin);
}

export async function readPluginLocalSkillFromRecord(
  plugin: InstalledPluginRecord,
): Promise<PluginLocalSkillSummary | null> {
  const relpath = pickFirstLocalSkillPath(plugin.manifest);
  if (!relpath) return null;
  try {
    const resp = await fetch(
      `/api/plugins/${encodeURIComponent(plugin.id)}/asset/${encodeURIComponent(relpath)}`,
    );
    if (!resp.ok) return null;
    const raw = await resp.text();
    const body = stripFrontmatter(raw).trim();
    if (!body) return null;
    const manifest = plugin.manifest;
    const name = (manifest?.title ?? manifest?.name ?? plugin.id).toString();
    return { body, name };
  } catch {
    return null;
  }
}
