// Plugin-local SKILL.md loader (Stage A of plugin-driven-flow-plan).
//
// Plugins that declare `od.context.skills[{ path: './SKILL.md' }]` ship
// their own skill body inside their plugin folder. Those files never
// register against the global skills registry, so the
// `composeSystemPrompt` skill slot would otherwise be empty.
//
// This module is the lone reader of plugin-local SKILL.md files. It
// stays separate from `apply.ts` because apply.ts is intentionally pure
// (no filesystem reads) — the daemon calls this loader during prompt
// composition, not during snapshot apply.
//
// The returned record mirrors the shape `composeDaemonSystemPrompt`
// already consumes for global skills (`body`, `name`, `dir`) so the
// override is a drop-in.

import path from 'node:path';
import { promises as fsp } from 'node:fs';
import type { InstalledPluginRecord } from '@open-design/contracts';
import {
  appendTemplateVisualKit,
  extractTemplateVisualKitFromHtml,
  pickPluginPreviewHtmlPath,
  readSkillFrontmatterDescription,
} from '@open-design/contracts';
import { pickFirstLocalSkillPath } from './apply.js';

export interface PluginLocalSkill {
  body: string;
  name: string;
  // Absolute directory containing the SKILL.md — used by
  // `stageActiveSkill` to copy companion files into the project cwd.
  dir: string;
  // Relative path inside the plugin folder, kept for debugging /
  // logging. Always normalised (no leading './').
  relpath: string;
}

export async function loadPluginLocalSkill(
  plugin: InstalledPluginRecord,
): Promise<PluginLocalSkill | null> {
  const manifest = plugin.manifest;
  const relpath = pickFirstLocalSkillPath(manifest);
  if (!relpath) return null;
  const safeRel = stripLeadingDotSlash(relpath);
  // Guard against path traversal — the manifest is trusted but we still
  // refuse `..` escapes so a bad plugin author can't reach outside its
  // own fsPath.
  if (safeRel.split('/').some((segment) => segment === '..')) return null;
  const abs = path.join(plugin.fsPath, safeRel);
  let raw: string;
  try {
    raw = await fsp.readFile(abs, 'utf8');
  } catch {
    return null;
  }
  const bodyOnly = stripFrontmatter(raw).trim();
  if (!bodyOnly) return null;
  // Recovery hint: several bundled deck templates (Hermes cyber terminal,
  // Graphify dark graph, zhangzara biennale, etc.) put the actual visual
  // specification — palette hex codes, typography, motif language — in the
  // frontmatter `description` field. The body under the frontmatter is
  // meta-instructions ('read master skill, copy from templates folder')
  // that the model cannot follow at runtime because those companion files
  // are not mounted into the project workspace. Stripping the frontmatter
  // therefore stripped the ONLY authoritative visual spec the model gets
  // for those templates → deck came back looking generic even though the
  // template body was 'loaded'. Prepend the frontmatter description /
  // manifest description so the visual contract survives.
  const name = (manifest.title ?? manifest.name ?? plugin.id).toString();
  let body = withFrontmatterDescriptionHeader(bodyOnly, raw, manifest);
  // BYOK / API-mode cannot Read companion files. Attach a compact visual kit
  // from example.html so selected Zhangzara templates keep cream/pastel
  // tokens instead of collapsing to the Active design system look.
  const previewRel = pickPluginPreviewHtmlPath(manifest);
  if (previewRel && previewRel !== safeRel) {
    try {
      const previewAbs = path.join(plugin.fsPath, previewRel);
      const previewHtml = await fsp.readFile(previewAbs, 'utf8');
      body = appendTemplateVisualKit(
        body,
        extractTemplateVisualKitFromHtml(previewHtml, { title: name }),
      );
    } catch {
      // Best-effort — SKILL.md visual summary still applies.
    }
  }
  return {
    body,
    name,
    dir: path.dirname(abs),
    relpath: safeRel,
  };
}

function stripLeadingDotSlash(value: string): string {
  return value.startsWith('./') ? value.slice(2) : value;
}

// Mirrors the loader inside `atom-bodies.ts`. Kept duplicated here on
// purpose: atom-bodies is the lone reader for atom SKILL.md, and we do
// not want to grow a cross-file import surface for one regex.
function stripFrontmatter(raw: string): string {
  if (!raw.startsWith('---')) return raw;
  const closeIdx = raw.indexOf('\n---', 3);
  if (closeIdx === -1) return raw;
  const after = raw.slice(closeIdx + 4);
  return after.replace(/^\r?\n/, '');
}

/**
 * If the SKILL.md frontmatter (or the plugin manifest, as a fallback)
 * carries a rich `description`, prepend it to the body as a `## Visual
 * summary` block. Idempotent: if the body already contains that summary
 * (author-authored, or a prior invocation persisted it), we leave the
 * body alone.
 *
 * Motivation: bundled deck templates put the concrete visual spec in the
 * frontmatter and reserve the body for cross-file authoring instructions.
 * Without this, the composer feeds the model only the instructions and
 * loses the palette / typography / motif contract entirely.
 */
function withFrontmatterDescriptionHeader(
  bodyOnly: string,
  raw: string,
  manifest: InstalledPluginRecord['manifest'],
): string {
  const description = readSkillFrontmatterDescription(raw)
    ?? (typeof manifest?.description === 'string' ? manifest.description.trim() : '');
  if (!description) return bodyOnly;
  if (bodyOnly.includes(description)) return bodyOnly;
  const summary = [
    '## Visual summary (from template frontmatter)',
    '',
    description,
  ].join('\n');
  return `${summary}\n\n${bodyOnly}`;
}
