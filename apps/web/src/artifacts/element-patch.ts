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
import {
  applyManualEditPatchMutation,
  coerceManualEditStyleRecord,
  extractIdentityFromAttrSelectorId,
  isEphemeralGeneratedPathId,
  parseManualEditSource,
  resolveManualEditTargetReference,
  sanitizeManualEditDocumentInPlace,
  serializeManualEditSource,
  type ManualEditMergeTargetHint,
  type ManualEditSourceScope,
} from '../edit-mode/source-patches';
import { attachmentMergeHint, scopedCommentElementIds } from '../edit-mode/scoped-deck-patch';
import type { ChatCommentAttachment } from '../types';

export type ElementPatchOp = ManualEditPatch & {
  slideIndex: number;
};

export type ParseElementPatchResult =
  | { ok: true; patches: ElementPatchOp[] }
  | { ok: false; reason: string };

/**
 * Opening-tag attr region that allows `>` inside quoted values.
 * Comment elementIds are often CSS paths like `dom:body > section:nth-of-type(1) > h1`,
 * so a naive `[^>]*` cut truncates `target-id` and drops `slide-index`.
 */
const PATCH_OPEN_ATTRS_RE = String.raw`(?:[^>"']|"[^"]*"|'[^']*')*`;
const LOOSE_PATCH_TAG_RE = new RegExp(
  String.raw`<patch\b${PATCH_OPEN_ATTRS_RE}>[\s\S]*?</patch>`,
  'gi',
);
const PATCH_OPEN_RE = /<patch\b/gi;

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
 * parser captured an empty / junk element-patch artifact body but the
 * assistant turn still contains patch-shaped output elsewhere.
 *
 * Non-empty junk (prose, truncated `<pa`) must NOT block salvage — otherwise
 * a well-formed `<patch>` in raw assistant text is ignored and apply fails.
 */
export function salvageElementPatchBody(
  artifactBody: string | null | undefined,
  sourceText?: string | null,
): string | null {
  const body = String(artifactBody ?? '').trim();
  if (body && elementPatchBodyHasParseablePatches(body)) return body;

  const source = String(sourceText ?? '');
  let plainCandidate: string | null = null;
  if (source.trim()) {
    LOOSE_PATCH_TAG_RE.lastIndex = 0;
    const loosePatches = [...source.matchAll(LOOSE_PATCH_TAG_RE)];
    if (loosePatches.length > 0) {
      const joined = loosePatches.map((match) => match[0] ?? '').filter(Boolean).join('\n');
      if (elementPatchBodyHasParseablePatches(joined)) return joined;
    }

    const closedArtifact = source.match(
      /<artifact\b(?:[^>"']|"[^"]*"|'[^']*')*\btype\s*=\s*["']element-patch["'](?:[^>"']|"[^"]*"|'[^']*')*>([\s\S]*?)<\/artifact>/i,
    );
    if (closedArtifact?.[1]?.trim()) {
      const inner = closedArtifact[1].trim();
      if (elementPatchBodyHasParseablePatches(inner)) return inner;
      plainCandidate = inner;
    }

    const openArtifact = source.match(
      /<artifact\b(?:[^>"']|"[^"]*"|'[^']*')*\btype\s*=\s*["']element-patch["'](?:[^>"']|"[^"]*"|'[^']*')*>([\s\S]*)$/i,
    );
    if (openArtifact?.[1]) {
      const tail = openArtifact[1].replace(/<\/artifact>[\s\S]*$/i, '').trim();
      if (tail) {
        if (elementPatchBodyHasParseablePatches(tail)) return tail;
        plainCandidate = plainCandidate ?? tail;
      }
    }
  }

  // Prefer original body, then plain artifact text for coercePlainText…
  return body || plainCandidate;
}

function elementPatchBodyHasParseablePatches(body: string): boolean {
  return parseElementPatch(body).ok;
}

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
  if (!hint) return null;
  const targetId = String(hint.targetId ?? '').trim();
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

/**
 * When the artifact body is empty but the user's visible comment names a
 * quoted replacement, synthesize a set-text patch without another model turn.
 */
export function coerceElementPatchBodyFromUserInstruction(
  instruction: string | null | undefined,
  hints: readonly ElementPatchCoerceHint[],
): string | null {
  const replacement = extractQuotedReplacementFromCommentInstruction(instruction ?? '');
  if (!replacement) return null;
  return coercePlainTextElementPatchBody(replacement, hints);
}

function extractQuotedReplacementFromCommentInstruction(instruction: string): string | null {
  const source = String(instruction ?? '').trim();
  if (!source) return null;
  const quoted = source.match(/['"“”‘’「」『』]([^'"“”‘’「」『』\n]{1,120})['"“”‘’「」『』]/);
  if (quoted?.[1]?.trim()) return quoted[1].trim();
  const toPhrase = source.match(
    /(?:멘트|문구|텍스트|이름|제목)(?:를|을)?\s*['"“”]?([^'"“”\n]{2,80}?)['"“”]?\s*(?:로|으로)/,
  );
  if (toPhrase?.[1]?.trim()) return toPhrase[1].trim();
  return null;
}

export function resolveElementPatchBodyForApply(input: {
  patchBody: string;
  sourceText?: string | null;
  coerceHints?: readonly ElementPatchCoerceHint[];
  instructionText?: string | null;
}): string {
  const salvaged = salvageElementPatchBody(input.patchBody, input.sourceText);
  const candidate = salvaged ?? input.patchBody;
  const coerced = input.coerceHints?.length
    ? (
      coercePlainTextElementPatchBody(candidate, input.coerceHints)
      ?? coerceElementPatchBodyFromUserInstruction(input.instructionText, input.coerceHints)
    )
    : null;
  return coerced ?? candidate;
}

function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'");
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

  for (const block of iteratePatchTags(source)) {
    const attrs = parsePatchAttrs(block.attrsRaw);
    const targetId = attrs['target-id'] || attrs['targetid'] || attrs['data-target-id'] || '';
    const slideIndex = readSlideIndex(attrs['slide-index'] ?? attrs['slideindex'] ?? attrs['data-slide-index']);
    const kind = String(attrs['kind'] ?? '').trim().toLowerCase();
    const bodyText = block.body.trim();

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
  }

  if (patches.length === 0) {
    return { ok: false, reason: 'no <patch> blocks in element-patch body' };
  }
  return { ok: true, patches };
}

function iteratePatchTags(source: string): Array<{ attrsRaw: string; body: string }> {
  const blocks: Array<{ attrsRaw: string; body: string }> = [];
  PATCH_OPEN_RE.lastIndex = 0;
  let openMatch: RegExpExecArray | null = PATCH_OPEN_RE.exec(source);
  while (openMatch) {
    const attrStart = openMatch.index + openMatch[0].length;
    const attrEnd = findPatchTagEnd(source, attrStart);
    if (attrEnd < 0) break;
    const attrsRaw = source.slice(attrStart, attrEnd).trim();
    const bodyStart = attrEnd + 1;
    const closeMatch = /<\/patch>/i.exec(source.slice(bodyStart));
    if (!closeMatch || closeMatch.index == null) break;
    const body = source.slice(bodyStart, bodyStart + closeMatch.index);
    blocks.push({ attrsRaw, body });
    PATCH_OPEN_RE.lastIndex = bodyStart + closeMatch.index + closeMatch[0].length;
    openMatch = PATCH_OPEN_RE.exec(source);
  }
  return blocks;
}

function findPatchTagEnd(source: string, start: number): number {
  let quote: '"' | "'" | null = null;
  let unquotedDomPath = false;
  for (let index = start; index < source.length; index += 1) {
    const ch = source[index];
    if (!ch) break;
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      unquotedDomPath = false;
      continue;
    }
    // Unquoted `target-id=dom:body > section…` — `>` is a CSS combinator,
    // not the end of the opening tag.
    const prefix = source.slice(start, index + 1);
    if (!unquotedDomPath && /(?:^|\s)target-id\s*=\s*dom:$/i.test(prefix)) {
      unquotedDomPath = true;
      continue;
    }
    if (unquotedDomPath) {
      if (ch === '>') continue;
      if (/\s/.test(ch)) {
        if (/^\s+(?:slide-index|kind|data-[\w-]+)\s*=/i.test(source.slice(index))) {
          unquotedDomPath = false;
        }
        continue;
      }
    }
    if (ch === '>') return index;
  }
  return -1;
}

function parsePatchAttrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let match: RegExpExecArray | null = re.exec(raw);
  while (match) {
    const key = (match[1] ?? '').trim().toLowerCase();
    const value = decodeXmlEntities((match[2] ?? match[3] ?? match[4] ?? '').trim());
    if (key) out[key] = value;
    match = re.exec(raw);
  }
  // Unquoted `target-id=dom:body > section…` truncates at the first space
  // under the generic attr regex even when slide-index parsed correctly.
  const targetId = out['target-id'] || out['targetid'] || '';
  if (
    targetId.startsWith('dom:')
    && !targetId.includes('>')
    && /\btarget-id\s*=\s*dom:\S+\s*>/i.test(raw)
  ) {
    const recovered = recoverUnquotedDomTargetAttrs(raw);
    if (recovered) Object.assign(out, recovered);
  }
  return out;
}

function recoverUnquotedDomTargetAttrs(raw: string): Record<string, string> | null {
  const match = /\btarget-id\s*=\s*(dom:\S+(?:\s*>\s*[^\s>]+(?:\([^)]*\))?)+)\s+(?=slide-index\s*=|kind\s*=|data-[\w-]+\s*=)/i.exec(
    raw,
  );
  if (!match?.[1]) return null;
  const out: Record<string, string> = {
    'target-id': decodeXmlEntities(match[1].trim()),
  };
  const slide = /\bslide-index\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/i.exec(raw);
  const slideRaw = (slide?.[1] ?? slide?.[2] ?? slide?.[3] ?? '').trim();
  if (slideRaw) out['slide-index'] = slideRaw;
  const kind = /\bkind\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/i.exec(raw);
  const kindRaw = (kind?.[1] ?? kind?.[2] ?? kind?.[3] ?? '').trim();
  if (kindRaw) out.kind = kindRaw;
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
      if (!styles) return null;
      const coerced = coerceManualEditStyleRecord(styles);
      return Object.keys(coerced).length > 0
        ? { id: targetId, kind: 'set-style', styles: coerced }
        : null;
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
  targetHints?: readonly ElementPatchTargetHint[];
  commentAttachments?: readonly ChatCommentAttachment[];
  instructionText?: string;
}

export type ElementPatchTargetHint = ManualEditMergeTargetHint & {
  targetIds: readonly string[];
  slideIndex?: number;
};

export type ApplyElementPatchResult =
  | { ok: true; html: string; appliedCount: number; sanitized?: boolean }
  | { ok: false; reason: string };

export function applyElementPatches(options: ApplyElementPatchOptions): ApplyElementPatchResult {
  const allowedSlides = options.allowedSlideIndexes
    ? new Set(options.allowedSlideIndexes.filter((index) => Number.isInteger(index) && index >= 0))
    : null;
  const allowedTargets = options.allowedTargetIds
    ? new Set(options.allowedTargetIds.map((id) => String(id || '').trim()).filter(Boolean))
    : null;

  const html = options.currentHtml;
  const doc = parseManualEditSource(html);
  if (!doc) {
    return { ok: false, reason: 'Could not parse current deck HTML.' };
  }
  let appliedCount = 0;
  const normalizedPatches = normalizeElementPatchTargetsForApply({
    currentHtml: html,
    patches: options.patches,
    commentAttachments: options.commentAttachments,
    instructionText: options.instructionText,
    parsedDoc: doc,
  });

  for (let index = 0; index < normalizedPatches.length; index += 1) {
    const patch = normalizedPatches[index]!;
    const originalPatch = options.patches[index];
    if (allowedSlides && !allowedSlides.has(patch.slideIndex)) {
      return {
        ok: false,
        reason: `element-patch targets slideIndex ${patch.slideIndex} outside comment scope`,
      };
    }
    const targetId = 'id' in patch ? String(patch.id || '').trim() : '';
    const originalTargetId = originalPatch && 'id' in originalPatch
      ? String(originalPatch.id || '').trim()
      : '';
    const allowedIdList = allowedTargets ? [...allowedTargets] : [];
    if (
      allowedTargets
      && allowedTargets.size > 0
      && targetId
      && !commentTargetIdsInclude(targetId, allowedIdList)
      && !(originalTargetId && commentTargetIdsInclude(originalTargetId, allowedIdList))
    ) {
      return {
        ok: false,
        reason: `element-patch targets ${targetId} outside attached comment scope`,
      };
    }

    const { slideIndex, ...manualEdit } = patch;
    const targetHint = findElementPatchTargetHint(options.targetHints, targetId, slideIndex);
    const mergeHint = elementPatchMergeHintForPatch(
      patch,
      options.commentAttachments,
      options.instructionText,
    );
    const hint = mergeHint ?? (targetHint ? { ...targetHint, id: targetId } : undefined);
    const scope: ManualEditSourceScope = targetHint
      ? { slideIndex, targetHint }
      : { slideIndex };
    let result = applyManualEditPatchMutation(doc, manualEdit, scope, hint);
    if (!result.ok) {
      const salvaged = retryManualEditPatchMutationWithHintResolution(
        doc,
        html,
        manualEdit,
        scope,
        hint,
      );
      if (!salvaged.ok) {
        return { ok: false, reason: result.error ?? `failed to apply ${manualEdit.kind} on ${targetId}` };
      }
      appliedCount += 1;
      continue;
    }
    appliedCount += 1;
  }

  // Fold terminal scrub into the live Document (FileViewer parity) so ProjectView
  // can skip a second full-deck sanitize parse on the element-patch success path.
  sanitizeManualEditDocumentInPlace(doc);
  return {
    ok: true,
    html: serializeManualEditSource(doc, html),
    appliedCount,
    sanitized: true,
  };
}

function manualEditTargetId(patch: ManualEditPatch): string {
  return 'id' in patch ? String(patch.id || '').trim() : '';
}

function elementPatchTargetId(patch: ElementPatchOp): string {
  return 'id' in patch ? String(patch.id || '').trim() : '';
}

function retryManualEditPatchMutationWithHintResolution(
  doc: Document,
  html: string,
  manualEdit: ManualEditPatch,
  scope: ManualEditSourceScope,
  hint: ManualEditMergeTargetHint | undefined,
): { ok: true } | { ok: false; error: string } {
  if (!hint) return { ok: false, error: 'no merge hint' };
  const targetId = manualEditTargetId(manualEdit);
  const resolved =
    resolveManualEditTargetReference(html, targetId, scope, hint, doc)
    ?? resolveManualEditTargetReference(html, '', scope, hint, doc);
  if (!resolved) return { ok: false, error: 'hint target unresolved' };
  if (!('id' in manualEdit)) {
    return { ok: false, error: 'patch has no target id' };
  }
  return applyManualEditPatchMutation(
    doc,
    { ...manualEdit, id: resolved },
    scope,
    hint,
  );
}

function findElementPatchTargetHint(
  hints: readonly ElementPatchTargetHint[] | undefined,
  targetId: string,
  slideIndex: number,
): ElementPatchTargetHint | undefined {
  if (!hints?.length) return undefined;
  const normalizedTarget = String(targetId || '').trim();
  for (const hint of hints) {
    if (
      typeof hint.slideIndex === 'number' &&
      Number.isInteger(hint.slideIndex) &&
      hint.slideIndex >= 0 &&
      hint.slideIndex !== slideIndex
    ) {
      continue;
    }
    const ids = hint.targetIds.map((id) => String(id || '').trim()).filter(Boolean);
    if (ids.includes(normalizedTarget)) return hint;
  }
  return hints.length === 1 ? hints[0] : undefined;
}

function commentTargetIdsInclude(patchId: string, candidateIds: readonly string[]): boolean {
  const normalized = String(patchId || '').trim();
  if (!normalized) return false;
  if (candidateIds.includes(normalized)) return true;
  const extracted = extractIdentityFromAttrSelectorId(normalized);
  if (extracted && candidateIds.includes(extracted)) return true;
  for (const candidate of candidateIds) {
    const fromCandidate = extractIdentityFromAttrSelectorId(candidate);
    if (!fromCandidate) continue;
    if (fromCandidate === normalized || (extracted != null && fromCandidate === extracted)) {
      return true;
    }
  }
  return false;
}

function findCommentAttachmentForPatch(
  patch: ElementPatchOp,
  commentAttachments: readonly ChatCommentAttachment[] | undefined,
): ChatCommentAttachment | undefined {
  if (!commentAttachments?.length) return undefined;
  const patchId = elementPatchTargetId(patch);
  const exact = commentAttachments.find((attachment) => {
    if (
      typeof attachment.slideIndex === 'number'
      && Number.isInteger(attachment.slideIndex)
      && attachment.slideIndex !== patch.slideIndex
    ) {
      return false;
    }
    return commentTargetIdsInclude(patchId, scopedCommentElementIds(attachment));
  });
  if (exact) return exact;

  const onSlide = commentAttachments.filter(
    (attachment) => attachment.slideIndex === patch.slideIndex,
  );
  if (onSlide.length === 1) return onSlide[0];
  if (commentAttachments.length === 1) return commentAttachments[0];
  return undefined;
}

function elementPatchMergeHintForPatch(
  patch: ElementPatchOp,
  commentAttachments: readonly ChatCommentAttachment[] | undefined,
  instructionText?: string,
): ManualEditMergeTargetHint | undefined {
  const attachment = findCommentAttachmentForPatch(patch, commentAttachments);
  if (!attachment) return undefined;
  const patchId = elementPatchTargetId(patch);
  return {
    id: patchId,
    ...attachmentMergeHint(attachment, instructionText),
  };
}

export function normalizeElementPatchTargetsForApply(input: {
  currentHtml: string;
  patches: readonly ElementPatchOp[];
  commentAttachments?: readonly ChatCommentAttachment[];
  instructionText?: string;
  parsedDoc?: Document | null;
}): ElementPatchOp[] {
  if (!input.commentAttachments?.length) return [...input.patches];
  const parsedDoc = input.parsedDoc ?? parseManualEditSource(input.currentHtml);

  return input.patches.map((patch) => {
    const hint = elementPatchMergeHintForPatch(
      patch,
      input.commentAttachments,
      input.instructionText,
    );
    const scope = { slideIndex: patch.slideIndex };
    const patchId = elementPatchTargetId(patch);
    const resolved = resolveManualEditTargetReference(
      input.currentHtml,
      patchId,
      scope,
      hint,
      parsedDoc,
    );
    if (resolved && resolved !== patchId) {
      // Never replace a structural `path-N` id with `dom:[data-od-id="path-N"]`
      // — that attr exists only in the preview srcdoc, not on disk.
      const resolvedIdentity = extractIdentityFromAttrSelectorId(resolved);
      if (
        isEphemeralGeneratedPathId(patchId)
        && (
          resolved.startsWith('dom:[')
          || (resolvedIdentity != null && isEphemeralGeneratedPathId(resolvedIdentity))
        )
      ) {
        return patch;
      }
      return { ...patch, id: resolved };
    }

    const attachment = findCommentAttachmentForPatch(patch, input.commentAttachments);
    const elementId = String(attachment?.elementId || '').trim();
    if (elementId && elementId !== patchId) {
      const byElementId = resolveManualEditTargetReference(
        input.currentHtml,
        elementId,
        scope,
        hint,
        parsedDoc,
      );
      if (byElementId) {
        return { ...patch, id: byElementId };
      }
    }

    return patch;
  });
}
