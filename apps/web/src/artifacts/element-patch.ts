/**
 * `<artifact type="element-patch">` — element-scoped deck edit contract.
 *
 * Comment edits target a single pinned element. The model should emit
 * structured patches that map directly to `ManualEditPatch` instead of
 * rewriting whole `<section class="slide">` blocks (deck-patch). The client
 * applies each patch with `applyManualEditPatch` — no slide-level merge guard.
 *
 * Wire format:
 *
 *   <artifact type="element-patch" identifier="deck">
 *     <patch target-id="headline" slide-index="2" kind="set-text">New title</patch>
 *     <patch target-id="headline" slide-index="2" kind="set-style">{"fontSize":"32px","fontWeight":"700"}</patch>
 *     <patch target-id="headline" slide-index="2" kind="set-outer-html"><h1 style="...">New</h1></patch>
 *   </artifact>
 *
 * `target-id` must match the comment's `elementId` / selector ids.
 * `slide-index` is 0-based, matching `<attached-preview-comments>`.
 */

import type { ManualEditPatch } from '../edit-mode/types';
import { applyManualEditPatch } from '../edit-mode/source-patches';

export type ElementPatchOp = ManualEditPatch & {
  slideIndex: number;
};

export type ParseElementPatchResult =
  | { ok: true; patches: ElementPatchOp[] }
  | { ok: false; reason: string };

const PATCH_TAG_RE = /<patch\b([^>]*)>([\s\S]*?)<\/patch>/gi;

const SUPPORTED_KINDS = new Set([
  'set-text',
  'set-style',
  'set-outer-html',
  'set-link',
  'set-image',
  'set-attributes',
  'remove-element',
]);

export function isElementPatchArtifactType(artifactType: string | null | undefined): boolean {
  const trimmed = String(artifactType ?? '').trim().toLowerCase();
  return trimmed === 'element-patch';
}

export type ElementPatchCoerceHint = {
  targetId: string;
  slideIndex: number;
};

/**
 * Recover `<patch>` blocks (or plain replacement text) when the streaming
 * parser captured an empty element-patch artifact body but the assistant
 * turn still contains patch-shaped output elsewhere.
 */
export function salvageElementPatchBody(
  artifactBody: string | null | undefined,
  sourceText?: string | null,
): string | null {
  const body = String(artifactBody ?? '').trim();
  if (body) return body;

  const source = String(sourceText ?? '');
  if (!source.trim()) return null;

  const loosePatches = [...source.matchAll(/<patch\b[^>]*>[\s\S]*?<\/patch>/gi)];
  if (loosePatches.length > 0) {
    return loosePatches.map((match) => match[0] ?? '').filter(Boolean).join('\n');
  }

  const closedArtifact = source.match(
    /<artifact\b[^>]*\btype\s*=\s*["']element-patch["'][^>]*>([\s\S]*?)<\/artifact>/i,
  );
  if (closedArtifact?.[1]?.trim()) {
    return closedArtifact[1].trim();
  }

  const openArtifact = source.match(
    /<artifact\b[^>]*\btype\s*=\s*["']element-patch["'][^>]*>([\s\S]*)$/i,
  );
  if (openArtifact?.[1]) {
    const tail = openArtifact[1].replace(/<\/artifact>[\s\S]*$/i, '').trim();
    if (tail) return tail;
  }

  return null;
}

/**
 * When the model puts only replacement prose inside the element-patch
 * wrapper (no `<patch>` tag), wrap it as a single scoped set-text patch.
 */
export function coercePlainTextElementPatchBody(
  body: string,
  hints: readonly ElementPatchCoerceHint[],
): string | null {
  const trimmed = String(body ?? '').trim();
  if (!trimmed) return null;
  if (/<patch\b/i.test(trimmed) || /<section\b/i.test(trimmed) || /<!doctype/i.test(trimmed)) {
    return null;
  }
  if (hints.length !== 1) return null;
  const hint = hints[0];
  const targetId = String(hint?.targetId ?? '').trim();
  if (!targetId) return null;
  if (typeof hint.slideIndex !== 'number' || !Number.isInteger(hint.slideIndex) || hint.slideIndex < 0) {
    return null;
  }
  return [
    `<patch target-id="${escapeXmlAttr(targetId)}" slide-index="${hint.slideIndex}" kind="set-text">`,
    escapeXmlText(trimmed),
    '</patch>',
  ].join('');
}

export function resolveElementPatchBodyForApply(input: {
  patchBody: string;
  sourceText?: string | null;
  coerceHints?: readonly ElementPatchCoerceHint[];
}): string {
  const salvaged = salvageElementPatchBody(input.patchBody, input.sourceText);
  const candidate = salvaged ?? input.patchBody;
  const coerced = input.coerceHints?.length
    ? coercePlainTextElementPatchBody(candidate, input.coerceHints)
    : null;
  return coerced ?? candidate;
}

function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function escapeXmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function parseElementPatch(body: string): ParseElementPatchResult {
  const patches: ElementPatchOp[] = [];
  const source = String(body ?? '');
  if (!source.trim()) {
    return { ok: false, reason: 'empty element-patch body' };
  }

  PATCH_TAG_RE.lastIndex = 0;
  let match: RegExpExecArray | null = PATCH_TAG_RE.exec(source);
  while (match) {
    const attrs = parsePatchAttrs(match[1] ?? '');
    const targetId = attrs['target-id'] || attrs['targetid'] || attrs['data-target-id'] || '';
    const slideIndex = readSlideIndex(attrs['slide-index'] ?? attrs['slideindex'] ?? attrs['data-slide-index']);
    const kind = String(attrs['kind'] ?? '').trim().toLowerCase();
    const bodyText = (match[2] ?? '').trim();

    if (!targetId) {
      return { ok: false, reason: 'element-patch <patch> missing target-id attribute' };
    }
    if (slideIndex == null) {
      return { ok: false, reason: `element-patch <patch> missing slide-index for target ${targetId}` };
    }
    if (!SUPPORTED_KINDS.has(kind)) {
      return { ok: false, reason: `element-patch uses unsupported kind "${kind}"` };
    }

    const manualEdit = parsePatchBody(targetId, kind, bodyText);
    if (!manualEdit) {
      return { ok: false, reason: `element-patch could not parse ${kind} body for target ${targetId}` };
    }

    patches.push({ ...manualEdit, slideIndex });
    match = PATCH_TAG_RE.exec(source);
  }

  if (patches.length === 0) {
    return { ok: false, reason: 'no <patch> blocks in element-patch body' };
  }
  return { ok: true, patches };
}

function parsePatchAttrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let match: RegExpExecArray | null = re.exec(raw);
  while (match) {
    const key = (match[1] ?? '').trim().toLowerCase();
    const value = (match[2] ?? match[3] ?? match[4] ?? '').trim();
    if (key) out[key] = value;
    match = re.exec(raw);
  }
  return out;
}

function readSlideIndex(raw: string | undefined): number | null {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return null;
  return parsed;
}

function parsePatchBody(
  targetId: string,
  kind: string,
  body: string,
): ManualEditPatch | null {
  switch (kind) {
    case 'set-text':
      return body ? { id: targetId, kind: 'set-text', value: body } : null;
    case 'set-outer-html':
      return body ? { id: targetId, kind: 'set-outer-html', html: body } : null;
    case 'remove-element':
      return { id: targetId, kind: 'remove-element' };
    case 'set-style': {
      const styles = parseJsonObject(body);
      return styles ? { id: targetId, kind: 'set-style', styles } : null;
    }
    case 'set-attributes': {
      const attributes = parseJsonObject(body);
      return attributes
        ? {
            id: targetId,
            kind: 'set-attributes',
            attributes: Object.fromEntries(
              Object.entries(attributes).map(([key, value]) => [key, String(value)]),
            ),
          }
        : null;
    }
    case 'set-link': {
      const parsed = parseJsonObject(body) as { text?: string; href?: string } | null;
      if (!parsed || typeof parsed.href !== 'string') return null;
      return {
        id: targetId,
        kind: 'set-link',
        text: String(parsed.text ?? ''),
        href: parsed.href,
      };
    }
    case 'set-image': {
      const parsed = parseJsonObject(body) as { src?: string; alt?: string } | null;
      if (!parsed || typeof parsed.src !== 'string') return null;
      return {
        id: targetId,
        kind: 'set-image',
        src: parsed.src,
        alt: String(parsed.alt ?? ''),
      };
    }
    default:
      return null;
  }
}

function parseJsonObject(body: string): Record<string, unknown> | null {
  const trimmed = body.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export interface ApplyElementPatchOptions {
  currentHtml: string;
  patches: readonly ElementPatchOp[];
  allowedSlideIndexes?: readonly number[];
  allowedTargetIds?: readonly string[];
}

export type ApplyElementPatchResult =
  | { ok: true; html: string; appliedCount: number }
  | { ok: false; reason: string };

export function applyElementPatches(options: ApplyElementPatchOptions): ApplyElementPatchResult {
  const allowedSlides = options.allowedSlideIndexes
    ? new Set(options.allowedSlideIndexes.filter((index) => Number.isInteger(index) && index >= 0))
    : null;
  const allowedTargets = options.allowedTargetIds
    ? new Set(options.allowedTargetIds.map((id) => String(id || '').trim()).filter(Boolean))
    : null;

  let html = options.currentHtml;
  let appliedCount = 0;

  for (const patch of options.patches) {
    if (allowedSlides && !allowedSlides.has(patch.slideIndex)) {
      return {
        ok: false,
        reason: `element-patch targets slideIndex ${patch.slideIndex} outside comment scope`,
      };
    }
    const targetId = 'id' in patch ? String(patch.id || '').trim() : '';
    if (allowedTargets && allowedTargets.size > 0 && targetId && !allowedTargets.has(targetId)) {
      return {
        ok: false,
        reason: `element-patch targets ${targetId} outside attached comment scope`,
      };
    }

    const { slideIndex, ...manualEdit } = patch;
    const result = applyManualEditPatch(html, manualEdit, { slideIndex });
    if (!result.ok) {
      return { ok: false, reason: result.error ?? `failed to apply ${manualEdit.kind} on ${targetId}` };
    }
    html = result.source;
    appliedCount += 1;
  }

  return { ok: true, html, appliedCount };
}
