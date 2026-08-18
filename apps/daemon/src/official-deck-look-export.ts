import { promises as fsp } from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import {
  extractOfficialDeckLookAssets,
  firstOfficialDeckTemplateId,
  listLocalStylesheetHrefs,
  mergeOfficialDeckLookCss,
  pickPluginPreviewHtmlPath,
  resolveSiblingAssetPath,
} from '@open-design/contracts';

import { resolveInstalledPlugin } from './plugins/registry.js';
import { readSelectedDeckTemplateFromMetadata } from './prompts/selected-deck-template.js';

type SqliteDb = Database.Database;

async function readPluginText(rootDir: string, relpath: string): Promise<string | null> {
  const safeRel = relpath.trim().replace(/^\.\/+/, '').replace(/^\/+/, '');
  if (!safeRel || safeRel.split(/[\\/]/).some((segment) => segment === '..')) return null;
  const root = path.resolve(rootDir);
  const resolved = path.resolve(root, safeRel);
  const rootWithSep = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (resolved !== root && !resolved.startsWith(rootWithSep)) return null;
  try {
    return await fsp.readFile(resolved, 'utf8');
  } catch {
    return null;
  }
}

export async function loadOfficialDeckLookSource(
  db: SqliteDb,
  pluginId: string,
): Promise<string | null> {
  const id = String(pluginId ?? '').trim();
  if (!id) return null;
  const plugin = resolveInstalledPlugin(db, id);
  if (!plugin?.fsPath) return null;
  const previewPath = pickPluginPreviewHtmlPath(plugin.manifest) ?? 'example.html';
  const html = await readPluginText(plugin.fsPath, previewPath);
  if (!html?.trim()) return null;

  const supplemental: string[] = [];
  for (const href of listLocalStylesheetHrefs(html).slice(0, 3)) {
    const assetPath = resolveSiblingAssetPath(previewPath, href);
    if (!assetPath) continue;
    const css = await readPluginText(plugin.fsPath, assetPath);
    if (css?.trim()) supplemental.push(css);
  }
  if (supplemental.length === 0) return html;
  return `${html}\n<style data-od-kit-supplemental>\n${supplemental.join('\n')}\n</style>`;
}

export async function mergeOfficialTemplateLookForExport(input: {
  db: SqliteDb;
  html: string;
  metadata?: unknown;
  templateId?: string | null;
}): Promise<string> {
  const html = String(input.html ?? '');
  if (!html.trim()) return html;
  const metadata =
    input.metadata && typeof input.metadata === 'object'
      ? (input.metadata as Record<string, unknown>)
      : null;
  const fromBody = String(input.templateId ?? '').trim();
  const fromMeta = readSelectedDeckTemplateFromMetadata(metadata)?.id;
  const skillIds = Array.isArray(metadata?.skillIds) ? metadata.skillIds : [];
  const context = metadata?.context && typeof metadata.context === 'object'
    ? (metadata.context as Record<string, unknown>)
    : null;
  const contextSkillIds = Array.isArray(context?.skillIds) ? context.skillIds : [];
  const pluginId = firstOfficialDeckTemplateId(fromBody, fromMeta, skillIds, contextSkillIds) ?? '';
  if (!pluginId) return html;
  const official = await loadOfficialDeckLookSource(input.db, pluginId);
  if (!official) return html;
  return mergeOfficialDeckLookCss(html, extractOfficialDeckLookAssets(official));
}
