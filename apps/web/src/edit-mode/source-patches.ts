import { emptyManualEditStyles, MANUAL_EDIT_STYLE_PROPS, type ManualEditFields, type ManualEditPatch, type ManualEditStyles } from './types';

export interface ManualEditPatchResult {
  ok: boolean;
  source: string;
  error?: string;
  /** When `captureTargetSnapshot` is set, styles/outerHtml after mutate (skip re-parse). */
  targetSnapshot?: {
    fields: import('./types').ManualEditFields;
    styles: import('./types').ManualEditStyles;
    attributes: Record<string, string>;
    outerHtml: string;
  };
  /** When `captureTargetSnapshots` is set on a batch apply. */
  targetSnapshots?: Record<string, ManualEditPatchResult['targetSnapshot'] & object>;
}

export type ManualEditMaskTargetsResult =
  | { ok: true; source: string; maskedCount: number }
  | { ok: false; source: string; reason: string };

export type ManualEditMergeTargetsResult =
  | { ok: true; source: string; replacedCount: number; changedCount: number }
  | { ok: false; source: string; reason: string };

export interface ManualEditMergeTargetHint {
  id?: string;
  currentText?: string;
  instructionText?: string;
  htmlHint?: string;
  /** Captured CSS selector from the comment click (may be absolute or slide-relative). */
  selector?: string;
}

export interface ManualEditSourceScope {
  /** Zero-based deck slide index. When present, element lookup is limited to that slide. */
  slideIndex?: number;
  /** Optional comment-capture fallback when preview DOM paths do not exist in source. */
  targetHint?: ManualEditMergeTargetHint;
}

type ManualEditLookupRoot = (ParentNode & Element) | Document;

export interface ApplyManualEditPatchOptions {
  /** Sanitize the live document before serialize (avoids a second full parse). */
  sanitize?: boolean;
  /** Capture target styles/outerHtml from the live Document before serialize. */
  captureTargetSnapshot?: boolean;
  /**
   * After a multi-patch batch, capture a snapshot per patched id from the live
   * Document (FileViewer batch reconcile — skip N× re-parse).
   */
  captureTargetSnapshots?: boolean;
  /**
   * Pre-parsed Document (e.g. from style-diff). Mutated in place — caller must
   * not reuse after apply. Skips a second full-deck parse on the apply path.
   */
  parsedDoc?: Document | null;
}

/**
 * Apply one patch. Prefer `applyManualEditPatches` when multiple ops share a deck
 * so the document is parsed/serialized once.
 */
export function applyManualEditPatch(
  source: string,
  patch: ManualEditPatch,
  scope: ManualEditSourceScope = {},
  hint?: ManualEditMergeTargetHint,
  options?: ApplyManualEditPatchOptions,
): ManualEditPatchResult {
  if (patch.kind === 'set-full-source') {
    // Undo / snapshot restore — still run the same tree sanitize so a
    // mistaken or untrusted full-source payload cannot reintroduce script.
    return { ok: true, source: sanitizeManualEditFullSource(patch.source) };
  }

  const doc = options?.parsedDoc ?? parseSource(source);
  if (!doc) return { ok: false, source, error: 'Could not parse source.' };

  const mutated = mutateManualEditPatch(doc, patch, scope, hint);
  if (!mutated.ok) return { ok: false, source, error: mutated.error };
  if (options?.sanitize && isManualEditFullHtmlDocument(source)) {
    sanitizeManualEditDocumentInPlace(doc);
  }
  const targetSnapshot = options?.captureTargetSnapshot && 'id' in patch
    ? readManualEditTargetSnapshotFromDoc(doc, patch.id, scope)
    : undefined;
  return { ok: true, source: serializeSource(doc, source), targetSnapshot };
}

export type ManualEditPatchApplyItem = {
  patch: ManualEditPatch;
  scope?: ManualEditSourceScope;
  hint?: ManualEditMergeTargetHint;
};

/**
 * Apply many patches against one parsed document (element-patch multi-op hot path).
 */
export function applyManualEditPatches(
  source: string,
  items: readonly ManualEditPatchApplyItem[],
  options?: ApplyManualEditPatchOptions,
): ManualEditPatchResult & { appliedCount: number } {
  if (items.length === 0) return { ok: true, source, appliedCount: 0 };
  if (items.length === 1 && items[0]!.patch.kind === 'set-full-source') {
    const single = applyManualEditPatch(source, items[0]!.patch);
    return { ...single, appliedCount: single.ok ? 1 : 0 };
  }

  const doc = options?.parsedDoc ?? parseSource(source);
  if (!doc) return { ok: false, source, error: 'Could not parse source.', appliedCount: 0 };

  let appliedCount = 0;
  for (const item of items) {
    if (item.patch.kind === 'set-full-source') {
      return {
        ok: false,
        source,
        error: 'set-full-source is not supported inside a multi-patch batch.',
        appliedCount,
      };
    }
    const mutated = mutateManualEditPatch(doc, item.patch, item.scope ?? {}, item.hint);
    if (!mutated.ok) {
      return { ok: false, source, error: mutated.error, appliedCount };
    }
    appliedCount += 1;
  }
  if (options?.sanitize && isManualEditFullHtmlDocument(source)) {
    sanitizeManualEditDocumentInPlace(doc);
  }
  let targetSnapshots: ManualEditPatchResult['targetSnapshots'];
  if (options?.captureTargetSnapshots) {
    targetSnapshots = {};
    for (const item of items) {
      if (!('id' in item.patch)) continue;
      targetSnapshots[item.patch.id] = readManualEditTargetSnapshotFromDoc(
        doc,
        item.patch.id,
        item.scope ?? {},
      );
    }
  }
  return { ok: true, source: serializeSource(doc, source), appliedCount, targetSnapshots };
}

/** Mutate `doc` in place. Caller owns parse/serialize (element-patch batch). */
export function applyManualEditPatchMutation(
  doc: Document,
  patch: ManualEditPatch,
  scope: ManualEditSourceScope = {},
  hint?: ManualEditMergeTargetHint,
): { ok: true } | { ok: false; error: string } {
  return mutateManualEditPatch(doc, patch, scope, hint);
}

/** Mutate `doc` in place. Caller owns parse/serialize. */
function mutateManualEditPatch(
  doc: Document,
  patch: ManualEditPatch,
  scope: ManualEditSourceScope = {},
  hint?: ManualEditMergeTargetHint,
): { ok: true } | { ok: false; error: string } {
  if (patch.kind === 'set-full-source') {
    return { ok: false, error: 'set-full-source cannot mutate an existing document.' };
  }

  if (patch.kind === 'set-token') {
    if (!isSafeCssTokenName(patch.token) || !isSafeCssTokenValue(patch.value)) {
      return { ok: false, error: 'CSS token name or value is not allowed.' };
    }
    const changed = setCssToken(doc, patch.token, patch.value);
    return changed
      ? { ok: true }
      : { ok: false, error: `Token not found: ${patch.token}` };
  }

  const effectiveHint = hint ?? scope.targetHint;
  let el = findEditableElement(doc, patch.id, scope, effectiveHint);
  if (!el) return { ok: false, error: `Target not found: ${patch.id}` };

  const hostTag = el.tagName.toLowerCase();
  if (
    isManualEditLockedHostTag(hostTag)
    && (
      patch.kind === 'set-text'
      || patch.kind === 'set-style'
      || patch.kind === 'set-attributes'
      || patch.kind === 'set-link'
      || patch.kind === 'set-image'
    )
  ) {
    // Executable hosts must not receive text/attr/style mutation (set-text
    // would write into <script> via innerHTML; set-attributes can re-enable
    // inert scripts by clearing type=).
    return {
      ok: false,
      error: `Edits of kind ${patch.kind} are not allowed on <${hostTag}> elements.`,
    };
  }

  if (patch.kind === 'set-text') {
    if (hasElementChildren(el) && !patch.flattenNestedMarkup) {
      // Page-level / wrapper pins resolve to a container with nested
      // `<span>`/`<strong>` markup. Prefer the comment hint leaf, then the
      // dominant text leaf under the pinned element — wiping the whole
      // container with textContent would destroy structure, but rejecting
      // with "Use the HTML tab" breaks Teamver comment edits.
      const leaf =
        (effectiveHint ? findLeafTextTargetByHint(doc, scope, effectiveHint) : null)
        ?? findPrimaryLeafTextTarget(el, effectiveHint);
      if (leaf) {
        if (leaf !== el && el.contains(leaf)) {
          // Drop leftover sibling text ("… <strong>X</strong> trailing") so a
          // full-label rewrite does not leave stale copy beside the leaf.
          for (const node of Array.from(el.childNodes)) {
            if (node.nodeType === 3 && (node.textContent || '').trim()) {
              node.textContent = '';
            }
          }
        }
        el = leaf;
      } else if (onlyHasIgnorableInlineMarkup(el)) {
        // Headings/labels that only use `<br>` (or empty wrappers) for line
        // breaks have no leaf element to patch. Write plain text, mapping
        // committed `\n` back to `<br>` so intentional wraps survive.
        applyManualEditPlainText(el, patch.value);
        return { ok: true };
      } else if (containsOnlyInlineTextFormatting(el)) {
        // Ambiguous inline siblings (e.g. `<span>Alpha</span><span>Beta</span>`,
        // gradient + label wrappers). The wrapper is a plain text container
        // and the user has explicitly asked to change its text — replace
        // innerHTML with the escaped value. This wipes inline formatting
        // spans but keeps the edit unblocked, matching upstream v2's
        // `set-inner-html` fallback.
        applyManualEditPlainText(el, patch.value);
        return { ok: true };
      } else {
        return { ok: false, error: 'This element contains nested markup. Use the HTML tab instead.' };
      }
    }
    applyManualEditPlainText(el, patch.value);
  } else if (patch.kind === 'set-link') {
    const linkTag = el.tagName.toLowerCase();
    // Do not retarget <link>/<base>/SVG resource hosts via the link editor.
    if (linkTag !== 'a' && linkTag !== 'area') {
      return { ok: false, error: 'Link edits are only allowed on <a> / <area> elements.' };
    }
    if (hasElementChildren(el)) {
      const currentText = manualEditElementToPlainText(el);
      if (patch.text === currentText) {
        // Href-only edit on a formatted link — safe to keep the markup.
        // Compare without trim so space-only label edits still rewrite text.
      } else if (containsOnlyInlineTextFormatting(el)) {
        applyManualEditPlainText(el, patch.text);
      } else {
        return { ok: false, error: 'This link contains nested markup. Use the HTML tab to change its label.' };
      }
    } else {
      applyManualEditPlainText(el, patch.text);
    }
    if (!isSafeManualEditUrl(patch.href)) {
      return { ok: false, error: 'Link href uses a disallowed URL scheme.' };
    }
    el.setAttribute('href', patch.href);
  } else if (patch.kind === 'set-image') {
    const imageTag = el.tagName.toLowerCase();
    // Do not retarget <script>/<iframe>/etc. that happen to share an edit id.
    if (imageTag !== 'img') {
      return { ok: false, error: 'Image edits are only allowed on <img> elements.' };
    }
    if (!isSafeManualEditUrl(patch.src)) {
      return { ok: false, error: 'Image src uses a disallowed URL scheme.' };
    }
    el.setAttribute('src', patch.src);
    el.setAttribute('alt', patch.alt);
  } else if (patch.kind === 'set-style') {
    setInlineStyles(el as HTMLElement, patch.styles);
  } else if (patch.kind === 'set-attributes') {
    const attrResult = setAttributes(el, patch.attributes);
    if (attrResult.attempted > 0 && attrResult.applied === 0) {
      return {
        ok: false,
        error: 'None of the requested attributes could be applied.',
      };
    }
  } else if (patch.kind === 'set-outer-html') {
    const replaced = replaceOuterHtml(doc, el, patch.html);
    if (!replaced.ok) {
      return {
        ok: false,
        error: 'error' in replaced ? replaced.error : 'Could not replace element HTML.',
      };
    }
  } else if (patch.kind === 'remove-element') {
    if (!el.parentElement) {
      return { ok: false, error: 'Cannot remove the root element.' };
    }
    if (el.parentElement === doc.body && doc.body.children.length === 1) {
      return { ok: false, error: 'Cannot remove the last element in the document.' };
    }
    el.remove();
  }

  return { ok: true };
}

export type ManualEditTargetSnapshot = {
  fields: ManualEditFields;
  styles: ManualEditStyles;
  attributes: Record<string, string>;
  outerHtml: string;
};

function readManualEditFieldsFromElement(el: Element): ManualEditFields {
  const kind = inferKind(el);
  if (kind === 'link') {
    return {
      text: manualEditElementToPlainText(el),
      href: el.getAttribute('href') ?? '',
    };
  }
  if (kind === 'image') {
    return {
      src: el.getAttribute('src') ?? '',
      alt: el.getAttribute('alt') ?? '',
    };
  }
  return { text: manualEditElementToPlainText(el) };
}

function readManualEditStylesFromElement(el: Element): ManualEditStyles {
  const style = (el as HTMLElement).style;
  return MANUAL_EDIT_STYLE_PROPS.reduce<ManualEditStyles>((acc, key) => {
    acc[key] = (style[key as unknown as keyof CSSStyleDeclaration] as string | undefined) ?? '';
    return acc;
  }, {} as ManualEditStyles);
}

function readManualEditAttributesFromElement(el: Element): Record<string, string> {
  const attrs: Record<string, string> = {};
  Array.from(el.attributes).forEach((attr) => {
    if (attr.name === 'data-od-runtime-id') return;
    attrs[attr.name] = attr.value;
  });
  return attrs;
}

function readManualEditTargetSnapshotFromDoc(
  doc: Document,
  id: string,
  scope: ManualEditSourceScope = {},
): ManualEditTargetSnapshot {
  const el = findEditableElement(doc, id, scope);
  if (!el) {
    return {
      fields: {},
      styles: emptyManualEditStyles(),
      attributes: {},
      outerHtml: '',
    };
  }
  return {
    fields: readManualEditFieldsFromElement(el),
    styles: readManualEditStylesFromElement(el),
    attributes: readManualEditAttributesFromElement(el),
    outerHtml: el.outerHTML,
  };
}

/** One parse → fields/styles/attrs/outerHtml (FileViewer selection hot path). */
export function readManualEditTargetSnapshot(
  source: string,
  id: string,
  scope: ManualEditSourceScope = {},
  parsedDoc?: Document | null,
): ManualEditTargetSnapshot {
  const doc = parsedDoc !== undefined ? parsedDoc : parseSource(source);
  if (!doc) {
    return {
      fields: {},
      styles: emptyManualEditStyles(),
      attributes: {},
      outerHtml: '',
    };
  }
  return readManualEditTargetSnapshotFromDoc(doc, id, scope);
}

export function readManualEditFields(
  source: string,
  id: string,
  scope: ManualEditSourceScope = {},
): ManualEditFields {
  return readManualEditTargetSnapshot(source, id, scope).fields;
}

export function readManualEditStyles(
  source: string,
  id: string,
  scope: ManualEditSourceScope = {},
  parsedDoc?: Document | null,
): ManualEditStyles {
  if (parsedDoc) {
    return readManualEditTargetSnapshotFromDoc(parsedDoc, id, scope).styles;
  }
  return readManualEditTargetSnapshot(source, id, scope).styles;
}

export function readManualEditAttributes(
  source: string,
  id: string,
  scope: ManualEditSourceScope = {},
): Record<string, string> {
  return readManualEditTargetSnapshot(source, id, scope).attributes;
}

export function readManualEditOuterHtml(
  source: string,
  id: string,
  scope: ManualEditSourceScope = {},
): string {
  return readManualEditTargetSnapshot(source, id, scope).outerHtml;
}

/**
 * Preview srcdoc annotates unlabeled nodes with generated `path-N` ids.
 * Those attributes are NOT persisted to deck.html — only the structural
 * child-index walk (`findElementByPath`) can resolve them on disk.
 */
export function isEphemeralGeneratedPathId(id: string | null | undefined): boolean {
  return /^path-\d+(?:-\d+)*$/.test(String(id || '').trim());
}

/** Synthetic id for region-only draw marks — not persisted on disk. */
export function isSyntheticVisualMarkTargetId(id: string | null | undefined): boolean {
  return /^visual-mark-/i.test(String(id || '').trim());
}

export function elementPatchReasonTargetsSyntheticVisualMark(reason: string): boolean {
  const match = /^Target not found:\s*(.+)$/i.exec(String(reason || '').trim());
  return match ? isSyntheticVisualMarkTargetId(match[1]) : false;
}


/** Pull `path-4` out of `dom:[data-od-id="path-4"]` / `[data-od-id="path-4"]`. */
export function extractIdentityFromAttrSelectorId(idOrSelector: string): string | null {
  const raw = String(idOrSelector || '').trim();
  const selector = raw.startsWith('dom:') ? raw.slice('dom:'.length).trim() : raw;
  const match = /^\[(data-od-id|data-screen-label|data-od-runtime-id|data-od-source-path|id)\s*=\s*(?:"([^"]+)"|'([^']+)')\]$/i.exec(
    selector,
  );
  const value = (match?.[2] ?? match?.[3] ?? '').trim();
  return value || null;
}

export function resolveManualEditTargetReference(
  source: string,
  id: string,
  scope: ManualEditSourceScope = {},
  hint?: ManualEditMergeTargetHint,
  /** Reuse a parsed document to avoid N× DOMParser on multi-op element-patch. */
  parsedDoc?: Document | null,
): string | null {
  const doc = parsedDoc ?? parseSource(source);
  if (!doc) return null;
  const normalizedId = String(id || '').trim();
  const root = findScopedRoot(doc, scope);
  if (!root) return null;
  const target = normalizedId
    ? findEditableElement(doc, normalizedId, scope, hint)
    : hint
      ? findEditableElementBySelector(doc, root, hint.selector, scope) ?? findElementByHint(doc, scope, hint)
      : null;
  if (!target) return null;
  const attrOdId = (target.getAttribute('data-od-id') || '').trim();
  const stableId = (
    attrOdId ||
    target.getAttribute('data-od-runtime-id') ||
    target.getAttribute('data-od-source-path') ||
    target.getAttribute('data-screen-label') ||
    ''
  ).trim();
  // Prefer durable attrs. path-N is acceptable only when it is literally
  // present on the on-disk element we resolved — never invent
  // `dom:[data-od-id="path-N"]` from a preview-only hint selector.
  if (stableId) {
    if (!isEphemeralGeneratedPathId(stableId)) return stableId;
    if (attrOdId === stableId) return stableId;
  }

  const pathId =
    (isEphemeralGeneratedPathId(normalizedId) ? normalizedId : null)
    ?? (() => {
      const extracted = extractIdentityFromAttrSelectorId(normalizedId);
      return extracted && isEphemeralGeneratedPathId(extracted) ? extracted : null;
    })()
    ?? (() => {
      const fromHint = extractIdentityFromAttrSelectorId(String(hint?.selector || ''));
      return fromHint && isEphemeralGeneratedPathId(fromHint) ? fromHint : null;
    })();
  if (pathId && findElementByScopedPath(doc, root, pathId)) return pathId;

  const selector = String(hint?.selector || '').trim();
  if (selector) {
    const fromSelector = extractIdentityFromAttrSelectorId(selector);
    if (fromSelector && isEphemeralGeneratedPathId(fromSelector)) {
      // Only keep path-N when the disk element actually carries it.
      if (attrOdId === fromSelector) return fromSelector;
      if (findElementByScopedPath(doc, root, fromSelector)) return fromSelector;
    } else if (!fromSelector || !isEphemeralGeneratedPathId(fromSelector)) {
      return selector.startsWith('dom:') ? selector : `dom:${selector}`;
    }
  }
  return pathId || normalizedId || null;
}

export function maskManualEditTargets(
  source: string,
  ids: readonly string[],
  scope: ManualEditSourceScope = {},
  hints: readonly ManualEditMergeTargetHint[] = [],
): ManualEditMaskTargetsResult {
  const doc = parseSource(source);
  if (!doc) return { ok: false, source, reason: 'Could not parse source.' };
  const maskedCount = maskManualEditTargetsOnDocument(doc, ids, scope, hints);
  if (maskedCount === 0) {
    return { ok: false, source, reason: 'No targets found to mask.' };
  }
  return {
    ok: true,
    source: serializeSource(doc, source),
    maskedCount,
  };
}

/** Mask targets on an already-parsed document (full-deck guard multi-attachment). */
export function maskManualEditTargetsOnDocument(
  doc: Document,
  ids: readonly string[],
  scope: ManualEditSourceScope = {},
  hints: readonly ManualEditMergeTargetHint[] = [],
  startIndex = 0,
): number {
  const targets = new Set<Element>();
  for (const id of ids) {
    const normalized = String(id || '').trim();
    if (!normalized) continue;
    // Accept per-id hints so the full-deck guard's target masking
    // benefits from the same hint fallback the scoped merge uses.
    const hint = hints.find((candidate) => String(candidate.id || '').trim() === normalized);
    const target = findEditableElement(doc, normalized, scope, hint);
    if (target) targets.add(target);
  }
  if (targets.size === 0) return 0;
  let index = startIndex;
  for (const target of targets) {
    target.replaceWith(doc.createComment(`od-masked-comment-target:${index}`));
    index += 1;
  }
  return targets.size;
}

export function mergeManualEditTargetsFromSource(
  currentSource: string,
  nextSource: string,
  ids: readonly string[],
  scope: ManualEditSourceScope = {},
  hints: readonly ManualEditMergeTargetHint[] = [],
  parsedDocs?: { current?: Document | null; next?: Document | null },
): ManualEditMergeTargetsResult {
  const currentDoc = parsedDocs?.current ?? parseSource(currentSource);
  const nextDoc = parsedDocs?.next ?? parseSource(nextSource);
  if (!currentDoc || !nextDoc) {
    return { ok: false, source: currentSource, reason: 'Could not parse source.' };
  }
  const normalizedIds = [...new Set(
    ids
      .map((id) => String(id || '').trim())
      .filter(Boolean),
  )];
  if (normalizedIds.length === 0) {
    return { ok: false, source: currentSource, reason: 'No target ids supplied.' };
  }

  let replacedCount = 0;
  let changedCount = 0;
  for (const id of normalizedIds) {
    const hint = hints.find((candidate) => String(candidate.id || '').trim() === id);
    // Pass hint to BOTH lookups so a click id that misses the disk
    // source's current structure (e.g. deck was resaved between click
    // and merge, or the model dropped `data-od-id` on the last turn)
    // still resolves via captured text / html hint. Symmetric with the
    // nextDoc `findReplacementCandidateByTextHint` fallback below.
    const currentTarget = findEditableElement(currentDoc, id, scope, hint);
    const nextTarget = currentTarget
      ? findEditableElement(nextDoc, id, scope, hint)
        ?? findEquivalentElementByScopedPosition(currentDoc, nextDoc, currentTarget, scope)
        ?? findReplacementCandidateByTextHint(nextDoc, currentTarget, scope, hint)
        ?? (hint ? findElementByHint(nextDoc, scope, hint) : null)
      : null;
    if (!currentTarget || !nextTarget) continue;
    if (isUnsafeManualEditReplacementRoot(nextTarget)) continue;
    const currentOuter = currentTarget.outerHTML;
    const nextOuter = nextTarget.outerHTML;
    const replacement = currentDoc.importNode(nextTarget, true);
    if (!finalizeManualEditReplacement(currentTarget, replacement)) continue;
    currentTarget.replaceWith(replacement);
    replacedCount += 1;
    if (currentOuter !== nextOuter) changedCount += 1;
  }

  if (replacedCount === 0) {
    return { ok: false, source: currentSource, reason: 'No matching targets found to merge.' };
  }
  if (changedCount === 0) {
    return { ok: false, source: currentSource, reason: 'Selected targets were unchanged.' };
  }
  return {
    ok: true,
    source: serializeSource(currentDoc, currentSource),
    replacedCount,
    changedCount,
  };
}

/**
 * Copy a target element's outer HTML from the model's patched deck onto the
 * current deck when structural id lookup fails but the semantic target can
 * still be resolved via captured comment hints. This is the last-resort salvage
 * for deck-patch responses — it never rewrites the whole slide unless the
 * graft itself is the only change on that slide.
 */
export function graftPatchedTargetElementFromSource(
  currentSource: string,
  patchedSource: string,
  targetId: string,
  scope: ManualEditSourceScope = {},
  hint?: ManualEditMergeTargetHint,
  parsedDocs?: { current?: Document | null; patched?: Document | null },
): ManualEditPatchResult {
  const currentDoc = parsedDocs?.current ?? parseSource(currentSource);
  const patchedDoc = parsedDocs?.patched ?? parseSource(patchedSource);
  if (!currentDoc || !patchedDoc) {
    return { ok: false, source: currentSource, error: 'Could not parse source.' };
  }

  const currentTarget = findEditableElement(currentDoc, targetId, scope, hint);
  if (!currentTarget) {
    return { ok: false, source: currentSource, error: `Target not found in current deck: ${targetId}` };
  }

  const patchedTarget =
    findEditableElement(patchedDoc, targetId, scope, hint)
    ?? findReplacementCandidateByTextHint(patchedDoc, currentTarget, scope, hint)
    ?? (hint ? findElementByHint(patchedDoc, scope, hint) : null);
  if (!patchedTarget) {
    return { ok: false, source: currentSource, error: `Target not found in patched deck: ${targetId}` };
  }

  if (currentTarget.outerHTML === patchedTarget.outerHTML) {
    return { ok: false, source: currentSource, error: 'Selected targets were unchanged.' };
  }
  if (isUnsafeManualEditReplacementRoot(patchedTarget)) {
    return { ok: false, source: currentSource, error: 'Replacement root element is not allowed.' };
  }

  const replacement = currentDoc.importNode(patchedTarget, true);
  if (!finalizeManualEditReplacement(currentTarget, replacement)) {
    return { ok: false, source: currentSource, error: 'Replacement root element is not allowed.' };
  }
  currentTarget.replaceWith(replacement);
  return { ok: true, source: serializeSource(currentDoc, currentSource) };
}

function parseSource(source: string): Document | null {
  if (typeof DOMParser !== 'undefined') {
    return new DOMParser().parseFromString(source, 'text/html');
  }
  if (typeof document !== 'undefined') {
    const doc = document.implementation.createHTMLDocument('');
    doc.documentElement.innerHTML = source;
    return doc;
  }
  return null;
}

/** Shared parse for multi-attachment mask / element-patch batch helpers. */
export function parseManualEditSource(source: string): Document | null {
  return parseSource(source);
}

function serializeSource(doc: Document, originalSource: string): string {
  if (!isManualEditFullHtmlDocument(originalSource)) return doc.body.innerHTML;
  return `<!doctype html>\n${doc.documentElement.outerHTML}`;
}

export function serializeManualEditSource(doc: Document, originalSource: string): string {
  return serializeSource(doc, originalSource);
}

export function isManualEditFullHtmlDocument(source: string): boolean {
  const normalized = firstSourceToken(source).slice(0, 32).toLowerCase();
  return normalized.startsWith('<!doctype') || normalized.startsWith('<html');
}

function firstSourceToken(source: string): string {
  let rest = source.trimStart();
  while (rest.startsWith('<!--') || rest.startsWith('<?')) {
    const close = rest.startsWith('<!--') ? '-->' : '?>';
    const end = rest.indexOf(close);
    if (end === -1) return rest;
    rest = rest.slice(end + close.length).trimStart();
  }
  return rest;
}

function inferKind(el: Element): 'text' | 'link' | 'image' | 'container' {
  const explicit = el.getAttribute('data-od-edit');
  if (explicit === 'text' || explicit === 'link' || explicit === 'image' || explicit === 'container') return explicit;
  const tag = el.tagName.toLowerCase();
  if (tag === 'a') return 'link';
  if (tag === 'img' || tag === 'svg') return 'image';
  if (['section', 'main', 'nav', 'div', 'article', 'header', 'footer'].includes(tag)) return 'container';
  return 'text';
}

function elementMatchesManualEditId(el: Element, id: string): boolean {
  const normalized = String(id || '').trim();
  if (!normalized) return false;
  return (
    el.getAttribute('data-od-id') === normalized
    || el.getAttribute('data-screen-label') === normalized
    || el.getAttribute('data-od-runtime-id') === normalized
    || el.getAttribute('data-od-source-path') === normalized
    || el.getAttribute('id') === normalized
  );
}

function findEditableElementByIdentity(
  root: ManualEditLookupRoot,
  id: string,
): Element | null {
  const normalized = String(id || '').trim();
  if (!normalized) return null;
  // Page-level comments pin the slide section itself (`data-screen-label="01 Cover"`).
  // `querySelector` only matches descendants, so check the scoped root first.
  if (root.nodeType !== 9 && elementMatchesManualEditId(root as Element, normalized)) {
    return root as Element;
  }
  const escaped = cssQuotedAttrValue(normalized);
  return (
    root.querySelector(`[data-od-id="${escaped}"]`)
    ?? root.querySelector(`[data-screen-label="${escaped}"]`)
    ?? root.querySelector(`[data-od-runtime-id="${escaped}"]`)
    ?? root.querySelector(`[data-od-source-path="${escaped}"]`)
    ?? root.querySelector(`[id="${escaped}"]`)
  );
}

function findEditableElement(
  doc: Document,
  id: string,
  scope: ManualEditSourceScope = {},
  hint?: ManualEditMergeTargetHint,
): Element | null {
  const root = findScopedRoot(doc, scope);
  if (!root) return null;
  if (id === '__body__') return root.nodeType === 9 ? (root as Document).body : root as Element;
  if (
    isSyntheticVisualMarkTargetId(id)
    && typeof scope.slideIndex === 'number'
    && Number.isFinite(scope.slideIndex)
    && scope.slideIndex >= 0
  ) {
    const slideRoot = root.nodeType === 9 ? findScopedRoot(doc, scope) : root;
    if (slideRoot) {
      if (hint) {
        const scopedRoot = slideRoot.nodeType === 9 ? slideRoot as Document : slideRoot as Element;
        const bySelector = findEditableElementBySelector(
          doc,
          scopedRoot,
          hint.selector,
          scope,
        );
        if (bySelector) return bySelector;
        const byHint = findElementByHint(doc, scope, hint);
        if (byHint) return byHint;
      }
      return slideRoot.nodeType === 9 ? (slideRoot as Document).body : slideRoot as Element;
    }
  }
  const domFallback = findElementByDomSelector(doc, root, id, scope);
  if (domFallback) return domFallback;
  const identityFromAttr = extractIdentityFromAttrSelectorId(id);
  const structural =
    findEditableElementByIdentity(root, id)
    ?? (identityFromAttr
      ? findEditableElementByIdentity(root, identityFromAttr)
        ?? findElementByScopedPath(doc, root, identityFromAttr)
      : null)
    ?? findElementByScopedPath(doc, root, id);
  if (structural) return structural;
  if (hint) {
    const bySelector = findEditableElementBySelector(doc, root, hint.selector, scope);
    if (bySelector) return bySelector;
    return findElementByHint(doc, scope, hint);
  }
  return null;
}

function findEditableElementBySelector(
  doc: Document,
  root: ManualEditLookupRoot,
  selector: string | undefined,
  scope: ManualEditSourceScope = {},
): Element | null {
  const trimmed = String(selector || '').trim();
  if (!trimmed || /[<{}]/.test(trimmed)) return null;
  const byDom = findElementByDomSelector(doc, root, `dom:${trimmed}`, scope);
  if (byDom) return byDom;
  if (trimmed.startsWith('body > ')) return null;
  const rootElement = root.nodeType === 9 ? doc.body : root as Element;
  try {
    // Attribute selectors for the slide root itself (page pin).
    if (root.nodeType !== 9 && rootElement.matches(trimmed)) {
      return rootElement;
    }
    const scoped = rootElement.querySelector(trimmed);
    if (
      scoped
      && scoped !== rootElement
      && scoped !== doc.body
      && scoped !== doc.documentElement
    ) {
      return scoped;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * When a comment pins a container/slide, set-text should apply to a leaf
 * text node identified by the capture hint — not wipe nested markup.
 */
function findLeafTextTargetByHint(
  doc: Document,
  scope: ManualEditSourceScope,
  hint: ManualEditMergeTargetHint,
): Element | null {
  const byHint = findElementByHint(doc, scope, hint);
  if (byHint && !hasElementChildren(byHint)) return byHint;
  // Hint matched a wrapper (`<h1><span>…</span></h1>` / `<p><strong>…`):
  // search leaves under that wrapper first before scanning the whole slide.
  if (byHint && hasElementChildren(byHint)) {
    const nested = findPrimaryLeafTextTarget(byHint, hint);
    if (nested) return nested;
  }
  const hintText = normalizeTextForCandidate(hint.currentText || '');
  if (!hintText) return null;
  const root = findScopedRoot(doc, scope);
  if (!root) return null;
  const rootElement = root.nodeType === 9 ? doc.body : root as Element;
  return pickBestLeafTextTarget(rootElement, hint);
}

/**
 * Dominant leaf text target under a pinned container. Used when comment
 * hints are missing/weak but the element clearly has one primary label
 * leaf (gradient span, bold name, etc.).
 */
function findPrimaryLeafTextTarget(
  container: Element,
  hint?: ManualEditMergeTargetHint,
): Element | null {
  return pickBestLeafTextTarget(container, hint);
}

function pickBestLeafTextTarget(
  rootElement: Element,
  hint?: ManualEditMergeTargetHint,
): Element | null {
  const hintText = normalizeTextForCandidate(hint?.currentText || '');
  const hintedTag = /^<\s*([a-z][a-z0-9-]*)\b/i.exec(hint?.htmlHint ?? '')?.[1]?.toLowerCase();
  const candidates = Array.from(rootElement.querySelectorAll('*')).filter(
    (candidate) => !hasElementChildren(candidate) && isReasonableTextReplacementCandidate(candidate),
  );
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0]!;

  const parentText = normalizeTextForCandidate(rootElement.textContent || '');

  // No hint + multiple leaves: only auto-pick a clear primary label
  // (e.g. one gradient span holding most of the heading). Sibling labels
  // of similar weight stay rejected so we do not rewrite the wrong one.
  if (!hintText) {
    const ranked = candidates
      .map((candidate) => ({
        candidate,
        len: normalizeTextForCandidate(candidate.textContent || '').length,
      }))
      .filter((entry) => entry.len > 0)
      .sort((a, b) => b.len - a.len);
    const top = ranked[0];
    if (!top) return null;
    const secondLen = ranked[1]?.len ?? 0;
    const clearWinner =
      (parentText.length > 0 && top.len >= Math.ceil(parentText.length * 0.7))
      || (top.len >= Math.max(2, secondLen * 2));
    return clearWinner ? top.candidate : null;
  }

  let best: { element: Element; score: number; length: number } | null = null;
  for (const candidate of candidates) {
    const text = normalizeTextForCandidate(candidate.textContent || '');
    if (!text) continue;
    let score = text.length;
    if (hintedTag && candidate.tagName.toLowerCase() === hintedTag) score += 50;
    if (text === hintText) score += 200;
    else if (hintText.length >= 4 && (text.includes(hintText) || hintText.includes(text))) {
      score += 40;
    }
    if (parentText) {
      if (text === parentText) score += 120;
      else if (parentText.includes(text)) score += Math.min(60, text.length);
    }
    if (score < 80) continue;
    const length = text.length;
    if (!best || score > best.score || (score === best.score && length < best.length)) {
      best = { element: candidate, score, length };
    }
  }
  return best?.element ?? null;
}

export function mergeManualEditTargetByHint(
  currentSource: string,
  nextSource: string,
  scope: ManualEditSourceScope = {},
  hint: ManualEditMergeTargetHint,
  parsedDocs?: { current?: Document | null; next?: Document | null },
): ManualEditMergeTargetsResult {
  const currentDoc = parsedDocs?.current ?? parseSource(currentSource);
  const nextDoc = parsedDocs?.next ?? parseSource(nextSource);
  if (!currentDoc || !nextDoc) {
    return { ok: false, source: currentSource, reason: 'Could not parse source.' };
  }

  const currentTarget =
    findEditableElementBySelector(currentDoc, findScopedRoot(currentDoc, scope) ?? currentDoc, hint.selector, scope)
    ?? findElementByHint(currentDoc, scope, hint);
  if (!currentTarget) {
    return { ok: false, source: currentSource, reason: 'No matching targets found to merge.' };
  }

  const nextTarget =
    findEditableElementBySelector(nextDoc, findScopedRoot(nextDoc, scope) ?? nextDoc, hint.selector, scope)
    ?? findReplacementCandidateByTextHint(nextDoc, currentTarget, scope, hint)
    ?? findElementByHint(nextDoc, scope, hint);
  if (!nextTarget) {
    return { ok: false, source: currentSource, reason: 'No matching targets found to merge.' };
  }

  const currentOuter = currentTarget.outerHTML;
  const nextOuter = nextTarget.outerHTML;
  if (currentOuter === nextOuter) {
    return { ok: false, source: currentSource, reason: 'Selected targets were unchanged.' };
  }
  if (isUnsafeManualEditReplacementRoot(nextTarget)) {
    return { ok: false, source: currentSource, reason: 'Replacement root element is not allowed.' };
  }

  const replacement = currentDoc.importNode(nextTarget, true);
  if (!finalizeManualEditReplacement(currentTarget, replacement)) {
    return { ok: false, source: currentSource, reason: 'Replacement root element is not allowed.' };
  }
  currentTarget.replaceWith(replacement);
  return {
    ok: true,
    source: serializeSource(currentDoc, currentSource),
    replacedCount: 1,
    changedCount: 1,
  };
}

/** Read visible text from the pinned comment target inside a scoped slide. */
export function readScopedCommentTargetText(
  html: string,
  scope: ManualEditSourceScope,
  hint: ManualEditMergeTargetHint & { elementId?: string },
  parsedDoc?: Document | null,
): string | null {
  const doc = parsedDoc ?? parseSource(html);
  if (!doc) return null;
  const id = String(hint.elementId || hint.id || '').trim();
  const el = id
    ? findEditableElement(doc, id, scope, hint)
    : findElementByHint(doc, scope, hint);
  if (!el) return null;
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Locate an editable target by its captured text / html hint when
 * structural queries (data-od-id, data-od-source-path, path-N) miss.
 *
 * The comment payload always carries `currentText` and `htmlHint` for
 * the picked element. When the deck was resaved with a slightly
 * different structure between click and merge (e.g. the model dropped
 * `data-od-id` or rearranged children), that text signature is still a
 * reliable way to find the same element inside the target slide. We
 * score candidate elements by:
 *   - textContent normalized equal to the hint text (+200)
 *   - textContent includes the hint text as substring (+80)
 *   - tag matches the hint's opening tag (+50)
 * and require score ≥ 80 so a bare tag match alone does not steal the
 * pick. The intent is a symmetric fallback to
 * `findReplacementCandidateByTextHint` — same signal-driven matching,
 * but scoped to the current-source lookup instead of the model output.
 */
function findElementByHint(
  doc: Document,
  scope: ManualEditSourceScope,
  hint: ManualEditMergeTargetHint,
): Element | null {
  const root = findScopedRoot(doc, scope);
  if (!root) return null;
  const rootElement = root.nodeType === 9 ? doc.body : root as Element;
  const hintText = normalizeTextForCandidate(hint.currentText || '');
  const hintedTag = /^<\s*([a-z][a-z0-9-]*)\b/i.exec(hint.htmlHint ?? '')?.[1]?.toLowerCase();
  if (!hintText && !hintedTag) return null;
  const candidates = Array.from(rootElement.querySelectorAll('*'))
    .filter((candidate) => isReasonableTextReplacementCandidate(candidate));
  let best: { element: Element; score: number; length: number } | null = null;
  for (const candidate of candidates) {
    const text = normalizeTextForCandidate(candidate.textContent || '');
    if (!text) continue;
    let score = 0;
    if (hintedTag && candidate.tagName.toLowerCase() === hintedTag) score += 50;
    if (hintText && text === hintText) score += 200;
    else if (hintText && text.includes(hintText) && hintText.length >= 4) {
      // Short substring hits (`"OK"`) used to score 80 alone and latch the
      // shortest containing node. Require a longer hint; tag+substring can
      // still clear the threshold.
      score += 40;
    }
    if (score <= 0) continue;
    const length = text.length;
    if (!best || score > best.score || (score === best.score && length < best.length)) {
      best = { element: candidate, score, length };
    }
  }
  return best && best.score >= 80 ? best.element : null;
}

/**
 * Resolve the DOM subtree that a `slideIndex`-scoped lookup should
 * search within. Priority:
 *   1. Explicit `[data-slide-index="N"]` — the compact-deck contract.
 *   2. Top-level `<section class="slide">` children of `<body>` /
 *      `.deck` / `.deck-stage` / `.deck-shell` /
 *      `#od-stacked-deck-stage`, mirroring the preview iframe's
 *      `slides()` selector so click-time slide index and disk-side
 *      lookup agree even on decks nested under a wrapper `<div class="deck">`.
 *   3. Legacy fallback: `.slide, [data-slide], [data-screen-label], section`
 *      in document order — mixed selector, used only when nothing
 *      structural matched. Nested `<section>` blocks inside slides
 *      shift indices here (rare on our decks), so keep it last.
 */
function findScopedRoot(doc: Document, scope: ManualEditSourceScope): ManualEditLookupRoot | null {
  const slideIndex = scope.slideIndex;
  if (!(typeof slideIndex === 'number' && Number.isFinite(slideIndex) && slideIndex >= 0)) return doc;
  const index = Math.floor(slideIndex);
  const explicit = doc.querySelector(`[data-slide-index="${index}"]`);
  if (explicit) return explicit;
  const structured = doc.querySelectorAll(
    '.deck > .slide, .deck-stage > .slide, .deck-shell > .slide, #od-stacked-deck-stage > .slide, body > .slide, body > section.slide, body > section[class~="slide"]',
  );
  if (structured.length > 0) return structured.item(index) ?? null;
  const anySlide = doc.querySelectorAll('.slide');
  if (anySlide.length > 0) return anySlide.item(index) ?? null;
  const slides = Array.from(doc.querySelectorAll('.slide, [data-slide], [data-screen-label], section'));
  return slides[index] ?? null;
}

function findEquivalentElementByScopedPosition(
  currentDoc: Document,
  nextDoc: Document,
  currentTarget: Element,
  scope: ManualEditSourceScope,
): Element | null {
  const currentRoot = findScopedRoot(currentDoc, scope);
  const nextRoot = findScopedRoot(nextDoc, scope);
  if (!currentRoot || !nextRoot) return null;
  const currentRootElement = currentRoot.nodeType === 9 ? currentDoc.body : currentRoot as Element;
  const nextRootElement = nextRoot.nodeType === 9 ? nextDoc.body : nextRoot as Element;
  if (!currentRootElement.contains(currentTarget)) return null;
  if (currentTarget === currentRootElement) return nextRootElement;
  const path: number[] = [];
  let cursor: Element | null = currentTarget;
  while (cursor && cursor !== currentRootElement) {
    const parent: Element | null = cursor.parentElement;
    if (!parent) return null;
    const index = Array.from(parent.children).indexOf(cursor);
    if (index < 0) return null;
    path.unshift(index);
    cursor = parent;
  }
  let nextCursor: Element | null = nextRootElement;
  for (const index of path) {
    const child: Element | null = nextCursor.children.item(index);
    nextCursor = child;
    if (!nextCursor) return null;
  }
  // Sibling inserts shift child indexes — reject tag mismatches so text-hint
  // fallback can recover instead of stamping identity onto the wrong node.
  if (nextCursor.tagName.toLowerCase() !== currentTarget.tagName.toLowerCase()) {
    return null;
  }
  return nextCursor;
}

const MANUAL_EDIT_IDENTITY_ATTRS = [
  'data-od-id',
  'data-od-runtime-id',
  'data-od-source-path',
  'data-od-edit',
  'data-od-label',
  'data-slide-index',
  'data-screen-label',
] as const;

function preserveManualEditIdentityAttributes(currentTarget: Element, replacement: Element): void {
  // Always force current identity / slide-scope attrs onto the replacement.
  // Models often emit wrong data-slide-index / data-screen-label; filling only
  // when omitted let those wrong values win and break page-level lookup.
  // When the current target has no durable id (path-only pins), strip any
  // minted identity attrs so the model cannot steal future lookups.
  for (const attr of MANUAL_EDIT_IDENTITY_ATTRS) {
    const currentValue = currentTarget.getAttribute(attr);
    if (currentValue) {
      replacement.setAttribute(attr, currentValue);
    } else {
      replacement.removeAttribute(attr);
    }
  }
}

/** Nested identity attrs collide with live querySelector targets — drop them. */
function stripDescendantManualEditIdentityAttributes(root: Element): void {
  for (const el of Array.from(root.querySelectorAll('*'))) {
    for (const attr of MANUAL_EDIT_IDENTITY_ATTRS) {
      el.removeAttribute(attr);
    }
  }
}

/** Tags that must never persist from model set-outer-html / merge trees. */
const MANUAL_EDIT_DANGEROUS_REPLACEMENT_TAGS = new Set([
  'script',
  'iframe',
  'object',
  'embed',
  'base',
  'link',
  'meta',
  'noscript',
  'template',
  // Nested <style> bypasses sibling-salvage @import scrub — drop from trees.
  'style',
  // Legacy SVG / HTML executable hosts.
  'handler',
  'applet',
  'frame',
  'frameset',
  // SVG discard can delete sanitized content after persist.
  'discard',
  // Modern / chrome embed hosts.
  'fencedframe',
  'portal',
  'webview',
  // Legacy raw-text hosts that corrupt serialization.
  'plaintext',
  'xmp',
  // HTML islands that can host interactive markup after attr scrub.
  'foreignobject',
  'annotation-xml',
]);

const MANUAL_EDIT_SMIL_ANIM_TAGS = new Set([
  'set',
  'animate',
  'animatetransform',
  'animatemotion',
  'animatecolor',
]);

/** Local name for `svg:animate` / namespaced tags (HTML/XML parsers). */
function manualEditLocalTagName(tag: string): string {
  const lower = String(tag || '').toLowerCase();
  const idx = lower.lastIndexOf(':');
  return idx >= 0 ? lower.slice(idx + 1) : lower;
}

/** Hosts that must not receive set-text / set-style / set-attributes mutation. */
function isManualEditLockedHostTag(tag: string): boolean {
  const lower = String(tag || '').toLowerCase();
  const local = manualEditLocalTagName(lower);
  return (
    MANUAL_EDIT_DANGEROUS_REPLACEMENT_TAGS.has(lower)
    || MANUAL_EDIT_DANGEROUS_REPLACEMENT_TAGS.has(local)
    || MANUAL_EDIT_NO_URL_MUTATION_TAGS.has(lower)
    || MANUAL_EDIT_NO_URL_MUTATION_TAGS.has(local)
    // SMIL nodes assign attrs via attributeName+to — block direct mutation.
    || MANUAL_EDIT_SMIL_ANIM_TAGS.has(local)
  );
}

/**
 * Scrub event-handler, style, and URL attrs on a single element (no child walk).
 * Shared by tree sanitize and full-document html/head/body hosts.
 */
function sanitizeManualEditElementAttrs(el: Element): void {
  const tag = el.tagName.toLowerCase();
  for (const attr of Array.from(el.attributes)) {
    const lower = attr.name.toLowerCase();
    if (
      lower.startsWith('on')
      || lower === 'srcdoc'
      || lower === 'behavior'
      || lower === 'http-equiv'
    ) {
      el.removeAttribute(attr.name);
      continue;
    }
    if (lower === 'style') {
      const scrubbed = scrubUnsafeInlineStyleAttr(attr.value);
      if (!scrubbed) el.removeAttribute(attr.name);
      else if (scrubbed !== attr.value) el.setAttribute(attr.name, scrubbed);
      continue;
    }
    if (MANUAL_EDIT_CSS_URL_PRESENTATION_ATTRS.has(lower)) {
      const normalized = normalizeCssForSafetyScan(attr.value);
      const scrubbed = scrubUnsafeCssFunctions(normalized).trim();
      if (
        !scrubbed
        || !isSafeManualEditPresentationCssValue(scrubbed, { alreadyNormalized: true })
      ) {
        el.removeAttribute(attr.name);
      } else if (scrubbed !== attr.value) {
        el.setAttribute(attr.name, scrubbed);
      }
      continue;
    }
    if (
      MANUAL_EDIT_SVG_FRAGMENT_ONLY_TAGS.has(tag)
      && (lower === 'href' || lower === 'xlink:href')
      && !isSafeManualEditSvgResourceRef(attr.value)
    ) {
      el.removeAttribute(attr.name);
      continue;
    }
    if (
      (MANUAL_EDIT_URL_ATTRS.has(lower) || lower === 'srcset' || lower === 'values')
      && !isSafeManualEditUrlAttrValue(lower, attr.value)
    ) {
      el.removeAttribute(attr.name);
    }
  }
}

/** Scrub a <style> host in-place; return false when it should be removed. */
function scrubManualEditStyleElement(el: Element): boolean {
  sanitizeManualEditElementAttrs(el);
  const text = scrubSalvagedStyleText(el.textContent ?? '');
  if (!text) return false;
  el.textContent = text;
  return true;
}

/** Strip executable chrome tags, event handlers, and unsafe URL attrs. */
function sanitizeManualEditReplacementTree(root: Element): void {
  const toRemove: Element[] = [];
  const walk = (el: Element): void => {
    const tag = el.tagName.toLowerCase();
    // Nested slide <style> must survive comment "make it stand out" edits —
    // scrub like head/body style hosts instead of dropping the whole node.
    if (el !== root && tag === 'style') {
      if (!scrubManualEditStyleElement(el)) toRemove.push(el);
      return;
    }
    if (el !== root && MANUAL_EDIT_DANGEROUS_REPLACEMENT_TAGS.has(tag)) {
      toRemove.push(el);
      return;
    }
    // SMIL can assign on* / style / href via attributeName + to/values without on* attrs.
    // Use local name so `svg:animate` is treated like `animate`.
    if (MANUAL_EDIT_SMIL_ANIM_TAGS.has(manualEditLocalTagName(tag))) {
      const smilAttr = (
        el.getAttribute('attributeName')
        || el.getAttribute('attributename')
        || ''
      ).trim().toLowerCase();
      if (
        smilAttr.startsWith('on')
        || smilAttr === 'srcdoc'
        || smilAttr === 'content'
        || smilAttr === 'behavior'
        || smilAttr === 'http-equiv'
      ) {
        // srcdoc/content/behavior/http-equiv can carry HTML/script/HTC/refresh
        // payloads via to=/values= — drop the SMIL node (parity with HTML attrs).
        toRemove.push(el);
        return;
      }
      if (smilAttr === 'style') {
        for (const key of ['to', 'from', 'by', 'values'] as const) {
          const raw = el.getAttribute(key);
          if (raw == null) continue;
          const scrubbed = scrubUnsafeInlineStyleAttr(raw);
          if (!scrubbed) el.removeAttribute(key);
          else if (scrubbed !== raw) el.setAttribute(key, scrubbed);
        }
        if (!['to', 'from', 'by', 'values'].some((key) => el.hasAttribute(key))) {
          toRemove.push(el);
          return;
        }
      }
      if (MANUAL_EDIT_CSS_URL_PRESENTATION_ATTRS.has(smilAttr)) {
        // Same scrub-then-isSafe pipeline as presentation attrs (not boolean-only).
        for (const key of ['to', 'from', 'by', 'values'] as const) {
          const raw = el.getAttribute(key);
          if (raw == null) continue;
          if (key === 'values') {
            const pieces = String(raw).split(';');
            let dropped = false;
            const nextPieces: string[] = [];
            for (const piece of pieces) {
              const trimmed = piece.trim();
              if (!trimmed) {
                nextPieces.push('');
                continue;
              }
              const scrubbed = scrubUnsafeCssFunctions(
                normalizeCssForSafetyScan(trimmed),
              ).trim();
              if (
                !scrubbed
                || !isSafeManualEditPresentationCssValue(scrubbed, { alreadyNormalized: true })
              ) {
                dropped = true;
                break;
              }
              nextPieces.push(scrubbed);
            }
            if (dropped) el.removeAttribute(key);
            else el.setAttribute(key, nextPieces.join(';'));
            continue;
          }
          const scrubbed = scrubUnsafeCssFunctions(
            normalizeCssForSafetyScan(raw),
          ).trim();
          if (
            !scrubbed
            || !isSafeManualEditPresentationCssValue(scrubbed, { alreadyNormalized: true })
          ) {
            el.removeAttribute(key);
          } else if (scrubbed !== raw) {
            el.setAttribute(key, scrubbed);
          }
        }
        if (!['to', 'from', 'by', 'values'].some((key) => el.hasAttribute(key))) {
          toRemove.push(el);
          return;
        }
      }
      if (MANUAL_EDIT_SMIL_NAV_ATTR_NAMES.has(smilAttr)) {
        for (const key of ['to', 'from', 'by', 'values'] as const) {
          const raw = el.getAttribute(key);
          if (raw == null) continue;
          const pieces = key === 'values' ? String(raw).split(';') : [raw];
          const unsafe = pieces.some((piece) => {
            const trimmed = piece.trim();
            if (!trimmed) return false;
            return !isSafeManualEditSmilNavValue(smilAttr, trimmed);
          });
          if (unsafe) el.removeAttribute(key);
        }
        if (!['to', 'from', 'by', 'values'].some((key) => el.hasAttribute(key))) {
          toRemove.push(el);
          return;
        }
      }
    }
    sanitizeManualEditElementAttrs(el);
    for (const child of Array.from(el.children)) walk(child);
  };
  walk(root);
  for (const el of toRemove) el.remove();
}

function finalizeManualEditReplacement(currentTarget: Element, replacement: Element): boolean {
  // Merge/graft can promote a model `<script data-od-id>` into the root;
  // tree sanitize only strips nested dangerous tags.
  if (isUnsafeManualEditReplacementRoot(replacement)) return false;
  preserveManualEditIdentityAttributes(currentTarget, replacement);
  stripDescendantManualEditIdentityAttributes(replacement);
  sanitizeManualEditReplacementTree(replacement);
  return true;
}

/**
 * Sanitize a slide/fragment HTML string with the same rules as set-outer-html
 * replacements — used by scoped slide-level merge fallbacks that skip finalize.
 */
export function sanitizeManualEditHtmlFragment(
  html: string,
  /** Reuse one empty host Document across multi-mark graft/repair batches. */
  hostDoc?: Document | null,
): string {
  const source = String(html || '');
  const trimmed = source.trim();
  if (!trimmed) return source;
  const doc = hostDoc ?? parseSource('<!doctype html><html><body></body></html>');
  // Fail closed: never return raw fragment HTML when the parser is unavailable.
  if (!doc?.body) return failClosedScrubHtmlWithoutParser(trimmed);
  const template = doc.createElement('template');
  template.innerHTML = trimmed;
  for (const root of Array.from(template.content.children)) {
    const tag = root.tagName.toLowerCase();
    if (tag === 'style') {
      if (!scrubManualEditStyleElement(root)) root.remove();
      continue;
    }
    if (MANUAL_EDIT_DANGEROUS_REPLACEMENT_TAGS.has(tag)) {
      root.remove();
      continue;
    }
    sanitizeManualEditReplacementTree(root);
  }
  return Array.from(template.content.childNodes)
    .map((node) => {
      if (node.nodeType === 1) return (node as Element).outerHTML;
      return node.textContent || '';
    })
    .join('');
}

/** True when a set-outer-html candidate must never become the replacement root. */
function isUnsafeManualEditReplacementRoot(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (MANUAL_EDIT_DANGEROUS_REPLACEMENT_TAGS.has(tag)) return true;
  if (NON_CONTENT_REPLACEMENT_TAGS.has(el.tagName)) return true;
  return false;
}

/**
 * Sanitize a full HTML document (set-full-source / undo snapshots) with the
 * same dangerous-tag / attr / SMIL rules as fragment replacements.
 */
/**
 * Last-resort scrub when DOMParser/document are unavailable (node tests /
 * workers). Prefer the DOM walk above; this only strips obvious executable
 * surface so we never pass raw HTML through unchanged.
 */
function failClosedScrubHtmlWithoutParser(raw: string): string {
  // Align with MANUAL_EDIT_DANGEROUS_REPLACEMENT_TAGS (+ annotation-xml) and
  // neutralize common URL-scheme smuggling when DOMParser is unavailable.
  const dangerous = [
    'script', 'iframe', 'object', 'embed', 'base', 'link', 'meta', 'noscript',
    'template', 'style', 'handler', 'applet', 'frame', 'frameset', 'discard',
    'fencedframe', 'portal', 'webview', 'plaintext', 'xmp', 'foreignobject',
    'annotation-xml',
  ].join('|');
  // Decode entities first so &#106;avascript: / &colon; cannot bypass scheme scrub.
  const text = decodeHtmlCharacterReferences(String(raw || ''));
  // Align navigable/legacy URL attrs with MANUAL_EDIT_URL_ATTRS, including SMIL
  // to/from/by/values (DOM walk already scrubs these; fail-closed must match).
  const urlAttrs = [
    'href', 'src', 'xlink:href', 'action', 'formaction', 'poster', 'cite', 'ping',
    'background', 'dynsrc', 'lowsrc', 'srcset', 'imagesrcset', 'longdesc',
    'manifest', 'codebase', 'classid', 'archive', 'usemap', 'data',
    'to', 'from', 'by', 'values',
  ].join('|');
  const smil = 'animate|animatemotion|animatetransform|set|animatecolor';
  // Optional XML/SVG namespace prefix (`svg:animate`) — local-name only misses these.
  const smilTag = `(?:[\\w.-]+:)?(?:${smil})`;
  // Align with MANUAL_EDIT_CSS_URL_PRESENTATION_ATTRS (DOM walk scrubs these).
  const presentationAttrs = [
    'filter', 'fill', 'stroke', 'clip-path', 'clippath', 'mask', 'cursor',
    'marker', 'marker-start', 'marker-mid', 'marker-end', 'color-profile',
  ].join('|');
  return text
    .replace(new RegExp(`<(?:${dangerous})\\b[\\s\\S]*?<\\/(?:${dangerous})\\s*>`, 'gi'), '')
    .replace(new RegExp(`<(?:${dangerous})\\b[^>]*\\/?>`, 'gi'), '')
    // SMIL animation nodes can navigate via to/from/by/values without a DOM walk.
    .replace(new RegExp(`<${smilTag}\\b[\\s\\S]*?<\\/${smilTag}\\s*>`, 'gi'), '')
    .replace(new RegExp(`<${smilTag}\\b[^>]*\\/?>`, 'gi'), '')
    .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
    .replace(/\ssrcdoc\s*=\s*(['"]).*?\1/gi, '')
    // Unquoted srcdoc=… (DOM walk removes the attr; fail-closed must too).
    .replace(/\ssrcdoc\s*=\s*[^\s>]+/gi, '')
    // IE/HTC behavior + meta http-equiv (DOM walk removes these attrs).
    .replace(/\sbehavior\s*=\s*(['"]).*?\1/gi, '')
    .replace(/\sbehavior\s*=\s*[^\s>]+/gi, '')
    .replace(/\shttp-equiv\s*=\s*(['"]).*?\1/gi, '')
    .replace(/\shttp-equiv\s*=\s*[^\s>]+/gi, '')
    // Inline style can carry expression()/url(javascript:) without a DOM walk.
    .replace(/\sstyle\s*=\s*(['"])[\s\S]*?\1/gi, '')
    .replace(/\sstyle\s*=\s*[^\s>]+/gi, '')
    // SVG presentation attrs — same gate as DOM isSafeManualEditPresentationCssValue
    // (normalize/escape, bare data|blob, url/var/expression, image-set/element/-moz-binding).
    .replace(
      new RegExp(
        `\\s(?:${presentationAttrs})\\s*=\\s*(['"])([\\s\\S]*?)\\1`,
        'gi',
      ),
      (full, _quote: string, value: string) => (
        isSafeManualEditPresentationCssValue(value) ? full : ''
      ),
    )
    .replace(
      new RegExp(
        `\\s(?:${presentationAttrs})\\s*=\\s*([^\\s>]+)`,
        'gi',
      ),
      (full, value: string) => (
        isSafeManualEditPresentationCssValue(value) ? full : ''
      ),
    )
    // Navigable URL attrs — same gate as DOM isSafeManualEditUrlAttrValue
    // (ZWSP/soft-hyphen compact, data MIME allow-list, srcset/ping token rules).
    .replace(
      new RegExp(
        `\\s(${urlAttrs})\\s*=\\s*(['"])([\\s\\S]*?)\\2`,
        'gi',
      ),
      (full, attr: string, _quote: string, value: string) => (
        isSafeManualEditUrlAttrValue(attr, value) ? full : ''
      ),
    )
    .replace(
      new RegExp(
        `\\s(${urlAttrs})\\s*=\\s*([^\\s>]+)`,
        'gi',
      ),
      (full, attr: string, value: string) => (
        isSafeManualEditUrlAttrValue(attr, value) ? full : ''
      ),
    )
    // Protocol-relative residual — isSafeManualEditUrl allows //cdn… media.
    .replace(
      new RegExp(
        `\\s(?:${urlAttrs})\\s*=\\s*(['"])\\s*//[\\s\\S]*?\\1`,
        'gi',
      ),
      '',
    )
    .replace(
      new RegExp(
        `\\s(?:${urlAttrs})\\s*=\\s*//[^\\s>]*`,
        'gi',
      ),
      '',
    )
    // Backslash-authority on general URL attrs (DOM: isSafeManualEditUrl).
    .replace(
      new RegExp(
        `\\s(?:${urlAttrs})\\s*=\\s*(['"])[\\s\\S]*?\\\\[\\s\\S]*?\\1`,
        'gi',
      ),
      '',
    )
    .replace(
      new RegExp(
        `\\s(?:${urlAttrs})\\s*=\\s*[^\\s>]*\\\\[^\\s>]*`,
        'gi',
      ),
      '',
    )
    // Form navigators + ping — absolute/proto residual (SMIL to/from/by/values
    // already gated by isSafeManualEditUrlAttrValue above; do not treat CSS
    // paints like `color:red` as URL schemes in failClosed).
    .replace(
      /\s(?:action|formaction|ping)\s*=\s*(['"])\s*(?:(?:https?|javascript|vbscript|data|blob|file|about|filesystem|chrome(?:-extension)?|moz-extension|resource|view-source|ms-appx(?:-web)?)\s*:|\/\/)[\s\S]*?\1/gi,
      '',
    )
    .replace(
      /\s(?:action|formaction|ping)\s*=\s*(?:(?:https?|javascript|vbscript|data|blob|file|about|filesystem|chrome(?:-extension)?|moz-extension|resource|view-source|ms-appx(?:-web)?)\s*:|\/\/)[^\s>]*/gi,
      '',
    )
    .replace(
      /\s(?:action|formaction|ping|to|from|by|values)\s*=\s*(['"])[\s\S]*?\\[\s\S]*?\1/gi,
      '',
    )
    .replace(
      /\s(?:action|formaction|ping|to|from|by|values)\s*=\s*[^\s>]*\\[^\s>]*/gi,
      '',
    )
    // Multi-token URL lists — drop attr when ANY candidate matches the deny list
    // (prefix-of-whole-value misses `srcset="/ok.png, javascript:…"`).
    // Include `values` again for defense-in-depth: isSafe is primary, but
    // comma/whitespace-smuggled schemes must not survive failClosed. CSS paints
    // like `color:red` do not match this scheme list.
    .replace(
      /\s(?:srcset|imagesrcset|archive|values)\s*=\s*(['"])[\s\S]*?(?:javascript|vbscript|blob\s*:|file\s*:|data\s*:|about\s*:|filesystem\s*:|chrome(?:-extension)?\s*:|moz-extension\s*:|resource\s*:|view-source\s*:|ms-appx(?:-web)?\s*:|\/\/)[\s\S]*?\1/gi,
      '',
    )
    .replace(
      /\s(?:srcset|imagesrcset|archive|values)\s*=\s*[^\s>]*(?:javascript|vbscript|blob\s*:|file\s*:|data\s*:|about\s*:|filesystem\s*:|chrome(?:-extension)?\s*:|moz-extension\s*:|resource\s*:|view-source\s*:|ms-appx(?:-web)?\s*:|\/\/)[^\s>]*/gi,
      '',
    )
    // Multi-token ping — drop when ANY whitespace token is absolute/proto/\\.
    // (DOM: isSafeManualEditUrlAttrValue('ping') per-token relative-only.)
    .replace(
      /\sping\s*=\s*(['"])[\s\S]*?(?:\s(?:[a-z][a-z0-9+.-]*\s*:|\/\/)|\\)[\s\S]*?\1/gi,
      '',
    )
    .replace(
      /\sping\s*=\s*[^\s>]*(?:\s(?:[a-z][a-z0-9+.-]*\s*:|\/\/)|\\)[^\s>]*/gi,
      '',
    )
    // SVG paint/resource tags — fail closed to same-document #fragment only
    // (DOM: MANUAL_EDIT_SVG_FRAGMENT_ONLY_TAGS + isSafeManualEditSvgResourceRef).
    // Absolute https://… / path / backslash survive generic URL-attr deny above.
    .replace(
      new RegExp(
        `(<(?:${[
          'use', 'image', 'feimage', 'mpath', 'textpath', 'pattern',
          'lineargradient', 'radialgradient', 'filter',
          'animate', 'animatemotion', 'animatetransform', 'animatecolor', 'set',
          'cursor', 'font-face-uri', 'altglyph', 'glyphref', 'tref', 'color-profile',
        ].join('|')})\\b[^>]*?)\\s(?:href|xlink:href)\\s*=\\s*(['"])(?!#[^\\\\/:'"]*)[\\s\\S]*?\\2`,
        'gi',
      ),
      '$1',
    )
    .replace(
      new RegExp(
        `(<(?:${[
          'use', 'image', 'feimage', 'mpath', 'textpath', 'pattern',
          'lineargradient', 'radialgradient', 'filter',
          'animate', 'animatemotion', 'animatetransform', 'animatecolor', 'set',
          'cursor', 'font-face-uri', 'altglyph', 'glyphref', 'tref', 'color-profile',
        ].join('|')})\\b[^>]*?)\\s(?:href|xlink:href)\\s*=\\s*(?!['"]|#)[^\\s>]*`,
        'gi',
      ),
      '$1',
    )
    // Unsafe #fragments (`#/x`, `#foo:bar`) — DOM isSafeManualEditSvgResourceRef.
    .replace(
      new RegExp(
        `(<(?:${[
          'use', 'image', 'feimage', 'mpath', 'textpath', 'pattern',
          'lineargradient', 'radialgradient', 'filter',
          'animate', 'animatemotion', 'animatetransform', 'animatecolor', 'set',
          'cursor', 'font-face-uri', 'altglyph', 'glyphref', 'tref', 'color-profile',
        ].join('|')})\\b[^>]*?)\\s(?:href|xlink:href)\\s*=\\s*(['"])#[^'"]*[\\\\/][^'"]*\\2`,
        'gi',
      ),
      '$1',
    )
    .replace(
      new RegExp(
        `(<(?:${[
          'use', 'image', 'feimage', 'mpath', 'textpath', 'pattern',
          'lineargradient', 'radialgradient', 'filter',
          'animate', 'animatemotion', 'animatetransform', 'animatecolor', 'set',
          'cursor', 'font-face-uri', 'altglyph', 'glyphref', 'tref', 'color-profile',
        ].join('|')})\\b[^>]*?)\\s(?:href|xlink:href)\\s*=\\s*(['"])#[a-z][a-z0-9+.-]*:[^'"]*\\2`,
        'gi',
      ),
      '$1',
    )
    // usemap — same-document #fragment only (DOM isSafeManualEditSvgResourceRef).
    .replace(
      /\susemap\s*=\s*(['"])(?!#[^\\/:'"]*)[\s\S]*?\1/gi,
      '',
    )
    .replace(
      /\susemap\s*=\s*(?!['"]|#)[^\s>]*/gi,
      '',
    )
    .replace(
      /\susemap\s*=\s*(['"])#[^'"]*[\\/][^'"]*\1/gi,
      '',
    )
    .replace(
      /\susemap\s*=\s*(['"])#[a-z][a-z0-9+.-]*:[^'"]*\1/gi,
      '',
    )
    // Unquoted unsafe usemap fragments (`usemap=#/x`, `usemap=#foo:bar`).
    .replace(
      /\susemap\s*=\s*#[^\s>]*[\\/][^\s>]*/gi,
      '',
    )
    .replace(
      /\susemap\s*=\s*#[a-z][a-z0-9+.-]*:[^\s>]*/gi,
      '',
    )
    // Unquoted unsafe SVG href/xlink:href fragments (parity with quoted strips).
    .replace(
      new RegExp(
        `(<(?:${[
          'use', 'image', 'feimage', 'mpath', 'textpath', 'pattern',
          'lineargradient', 'radialgradient', 'filter',
          'animate', 'animatemotion', 'animatetransform', 'animatecolor', 'set',
          'cursor', 'font-face-uri', 'altglyph', 'glyphref', 'tref', 'color-profile',
        ].join('|')})\\b[^>]*?)\\s(?:href|xlink:href)\\s*=\\s*#[^\\s>]*[\\\\/][^\\s>]*`,
        'gi',
      ),
      '$1',
    )
    .replace(
      new RegExp(
        `(<(?:${[
          'use', 'image', 'feimage', 'mpath', 'textpath', 'pattern',
          'lineargradient', 'radialgradient', 'filter',
          'animate', 'animatemotion', 'animatetransform', 'animatecolor', 'set',
          'cursor', 'font-face-uri', 'altglyph', 'glyphref', 'tref', 'color-profile',
        ].join('|')})\\b[^>]*?)\\s(?:href|xlink:href)\\s*=\\s*#[a-z][a-z0-9+.-]*:[^\\s>]*`,
        'gi',
      ),
      '$1',
    );
}

/** In-place full-document scrub — shared by sanitizeFullSource and apply options. */
export function sanitizeManualEditDocumentInPlace(doc: Document): void {
  if (doc.documentElement) sanitizeManualEditElementAttrs(doc.documentElement);
  if (doc.head) sanitizeManualEditElementAttrs(doc.head);
  if (doc.body) sanitizeManualEditElementAttrs(doc.body);
  const scrubHostChildren = (host: Element | null): void => {
    if (!host) return;
    for (const child of Array.from(host.children)) {
      const tag = child.tagName.toLowerCase();
      if (MANUAL_EDIT_DANGEROUS_REPLACEMENT_TAGS.has(tag) && tag !== 'style') {
        child.remove();
        continue;
      }
      if (tag === 'style') {
        if (!scrubManualEditStyleElement(child)) child.remove();
        continue;
      }
      sanitizeManualEditReplacementTree(child);
    }
  };
  scrubHostChildren(doc.head);
  scrubHostChildren(doc.body);
}

export function sanitizeManualEditFullSource(source: string): string {
  const raw = String(source || '');
  if (!raw.trim()) return raw;
  const doc = parseSource(raw);
  // Fail closed: never re-persist unsanitized HTML when the parser is unavailable.
  if (!doc) return failClosedScrubHtmlWithoutParser(raw);
  sanitizeManualEditDocumentInPlace(doc);
  return serializeSource(doc, raw);
}

function findReplacementCandidateByTextHint(
  nextDoc: Document,
  currentTarget: Element,
  scope: ManualEditSourceScope,
  hint: ManualEditMergeTargetHint | undefined,
): Element | null {
  const root = findScopedRoot(nextDoc, scope);
  if (!root) return null;
  const rootElement = root.nodeType === 9 ? nextDoc.body : root as Element;
  const currentText = normalizeTextForCandidate(hint?.currentText || currentTarget.textContent || '');
  const instructionTerms = extractLikelyReplacementTerms(hint?.instructionText || '');
  const currentTokens = significantTextTokens(currentText);
  const candidates = Array.from(rootElement.querySelectorAll('*'))
    .filter((candidate) => isReasonableTextReplacementCandidate(candidate));
  let best: { element: Element; score: number; length: number } | null = null;
  for (const candidate of candidates) {
    const text = normalizeTextForCandidate(candidate.textContent || '');
    if (!text) continue;
    let score = 0;
    const candidateTag = candidate.tagName.toLowerCase();
    const currentTag = currentTarget.tagName.toLowerCase();
    const hintedTag = /^<\s*([a-z][a-z0-9-]*)\b/i.exec(hint?.htmlHint ?? '')?.[1]?.toLowerCase();
    const tagAgrees = candidateTag === currentTag || (Boolean(hintedTag) && candidateTag === hintedTag);
    if (candidateTag === currentTag) score += 25;
    for (const term of instructionTerms) {
      // Short UI labels ("Done"/"Save") used to award +120 across tags and
      // hijack merge onto buttons — require tag agreement for the full boost.
      if (!term || !text.includes(term)) continue;
      score += tagAgrees ? 120 : 20;
    }
    for (const token of currentTokens) {
      if (text.includes(token)) score += 12;
    }
    if (hintedTag && candidateTag === hintedTag) score += 12;
    if (score <= 0) continue;
    const length = text.length;
    if (!best || score > best.score || (score === best.score && length < best.length)) {
      best = { element: candidate, score, length };
    }
  }
  return best && best.score >= 60 ? best.element : null;
}

function isReasonableTextReplacementCandidate(element: Element): boolean {
  const tag = element.tagName.toLowerCase();
  if (['html', 'head', 'body', 'style', 'script', 'svg', 'section'].includes(tag)) return false;
  const text = normalizeTextForCandidate(element.textContent || '');
  if (!text || text.length > 240) return false;
  const childTextElements = Array.from(element.children)
    .filter((child) => !['style', 'script', 'svg'].includes(child.tagName.toLowerCase()))
    .filter((child) => normalizeTextForCandidate(child.textContent || '').length > 0);
  return childTextElements.length <= 1;
}

/**
 * Instruction replacement terms used for merge scoring.
 * Drop short ASCII UI labels ("OK"/"Done"/"Save"/"Next") that hijack merges,
 * while keeping short Hangul/CJK names like "김강사".
 */
function isUsableInstructionTerm(term: string): boolean {
  if (!term) return false;
  if (/[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF\u4E00-\u9FFF]/.test(term)) {
    return term.length >= 2;
  }
  // ASCII-only: require longer phrases so "Done"/"Save"/"Submit" stay out.
  return term.length >= 8;
}

function extractLikelyReplacementTerms(text: string): string[] {
  const terms = new Set<string>();
  const source = String(text || '');
  for (const match of source.matchAll(/['"“”‘’「」『』]([^'"“”‘’「」『』\n]{1,80})['"“”‘’「」『』]/g)) {
    const term = normalizeTextForCandidate(match[1] || '');
    if (isUsableInstructionTerm(term)) terms.add(term);
  }
  for (const match of source.matchAll(/(?:이름|제목|텍스트|문구|내용)[^\n]{0,20}?(?:은|는|을|를)\s*([가-힣A-Za-z0-9 _.-]{2,40}?)(?:\s*(?:이야|야|로|으로|입니다|다|\.|$))/g)) {
    const term = normalizeTextForCandidate(match[1] || '');
    if (isUsableInstructionTerm(term)) terms.add(term);
  }
  return [...terms];
}

function significantTextTokens(text: string): string[] {
  return [...new Set(
    text
      .split(/[^가-힣A-Za-z0-9]+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2 && token.length <= 24),
  )].slice(0, 6);
}

function normalizeTextForCandidate(text: string): string {
  // Comment captures truncate with a literal `...` suffix (trimContextText /
  // trimHtmlHint). Strip that ellipsis so hint matching still works against
  // the full on-disk text.
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(?:\u2026|\.{3})$/, '')
    .trim();
}

function findElementByDomSelector(
  doc: Document,
  root: ManualEditLookupRoot,
  id: string,
  scope: ManualEditSourceScope = {},
): Element | null {
  if (!id.startsWith('dom:')) return null;
  const selector = id.slice('dom:'.length).trim();
  if (!selector || /[<{}]/.test(selector)) return null;
  // `dom:[data-od-id="path-4"]` — unwrap to identity / structural path walk.
  // Preview injects path-N as data-od-id; saved HTML usually lacks the attr.
  const identity = extractIdentityFromAttrSelectorId(id);
  if (identity) {
    const byIdentity =
      findEditableElementByIdentity(root, identity)
      ?? findElementByScopedPath(doc, root, identity);
    if (byIdentity) return byIdentity;
  }
  if (selector.startsWith('body > ')) {
    const byPath = findElementByDomSelectorPath(doc, root, selector);
    if (byPath) return byPath;
    // Preview click paths often include wrappers (e.g. `<div class="deck">`)
    // that the on-disk HTML may omit / rearrange. When lookup is slide-scoped,
    // resolve the path relative to that slide so inner nth-of-type segments
    // still find the pinned element.
    if (root.nodeType !== 9) {
      const relative = findElementByDomSelectorPathRelativeToRoot(root as Element, selector);
      if (relative) return relative;
    }
  }
  const rootElement = root.nodeType === 9 ? null : root as Element;
  if (rootElement && selector.startsWith('body > ')) {
    const relative = parseAbsoluteDomSlideSelector(selector);
    if (
      relative
      && typeof scope.slideIndex === 'number'
      && Number.isInteger(scope.slideIndex)
      && scope.slideIndex === relative.slideIndex
    ) {
      const byRelative = queryDomSelectorWithinRoot(rootElement, doc, relative.suffix);
      if (byRelative) return byRelative;
    }
  }
  if (rootElement && !selector.startsWith('body > ')) {
    const scopedEl = queryDomSelectorWithinRoot(rootElement, doc, selector);
    if (scopedEl) return scopedEl;
  }
  if (!selector.startsWith('body > ')) return null;
  const byPath = findElementByDomSelectorPath(doc, root, selector);
  if (byPath) return byPath;
  let el: Element | null = null;
  try {
    el = doc.querySelector(selector);
  } catch {
    return null;
  }
  if (!el || el === doc.body || el === doc.documentElement) return null;
  if (root.nodeType === 9) return el;
  return (root as Element).contains(el) ? el : null;
}

type DomNthSegment = { tag: string; ordinal: number };

function parseDomNthSegment(segment: string): DomNthSegment | null {
  const match = /^([a-z][a-z0-9-]*):nth-of-type\(([1-9][0-9]*)\)$/i.exec(segment.trim());
  if (!match) return null;
  const tagRaw = match[1];
  const ordinalRaw = match[2];
  if (tagRaw === undefined || ordinalRaw === undefined) return null;
  return { tag: tagRaw.toLowerCase(), ordinal: Number(ordinalRaw) };
}

function parseDomBodyPathSegments(selector: string): string[] {
  const trimmed = selector.trim();
  const bodyPath = trimmed.startsWith('body > ')
    ? trimmed.slice('body > '.length)
    : trimmed;
  return bodyPath
    .split(' > ')
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function queryDomSelectorWithinRoot(
  rootElement: Element,
  doc: Document,
  selector: string,
): Element | null {
  let scopedEl: Element | null = null;
  try {
    scopedEl = rootElement.querySelector(selector);
  } catch {
    return null;
  }
  if (!scopedEl || scopedEl === rootElement || scopedEl === doc.body || scopedEl === doc.documentElement) {
    return null;
  }
  return scopedEl;
}

/**
 * Preview iframes often wrap slides in an extra `body > div > section` shell.
 * Saved deck HTML is usually `body > section.slide` directly. When lookup is
 * scoped to the matching slide, strip the absolute `body > … > section:nth-of-type(N)`
 * prefix and resolve the remainder inside that slide.
 */
function parseAbsoluteDomSlideSelector(
  selector: string,
): { suffix: string; slideIndex: number } | null {
  const trimmed = String(selector || '').trim();
  if (!trimmed.startsWith('body > ')) return null;
  const match = trimmed.match(
    /^body\s*>\s*(?:.+?\s*>\s*)*section(?::nth-of-type\((\d+)\)|(?:\.[a-z0-9_-]+)*)?\s*>\s*(.+)$/i,
  );
  const ordinal = match?.[1];
  const suffix = match?.[2]?.trim();
  if (!ordinal || !suffix) return null;
  const slideIndex = Number(ordinal) - 1;
  if (!Number.isInteger(slideIndex) || slideIndex < 0) return null;
  return { suffix, slideIndex };
}

function walkDomNthTypePath(start: Element, segments: readonly string[]): Element | null {
  let current: Element | null = start;
  for (const segment of segments) {
    const parsed = parseDomNthSegment(segment);
    if (!parsed || !current) return null;
    let seen = 0;
    let next: Element | null = null;
    for (const child of Array.from(current.children)) {
      if (child.tagName.toLowerCase() !== parsed.tag) continue;
      seen += 1;
      if (seen === parsed.ordinal) {
        next = child;
        break;
      }
    }
    current = next;
  }
  return current;
}

function elementMatchesDomNthSegment(el: Element, segment: string): boolean {
  const parsed = parseDomNthSegment(segment);
  if (!parsed) return false;
  if (el.tagName.toLowerCase() !== parsed.tag) return false;
  const parent = el.parentElement;
  if (!parent) return true;
  let seen = 0;
  for (const child of Array.from(parent.children)) {
    if (child.tagName.toLowerCase() !== parsed.tag) continue;
    seen += 1;
    if (child === el) return seen === parsed.ordinal;
  }
  return false;
}

function findElementByDomSelectorPath(
  doc: Document,
  root: ManualEditLookupRoot,
  selector: string,
): Element | null {
  const segments = parseDomBodyPathSegments(selector);
  if (segments.length === 0 || !doc.body) return null;
  const current = walkDomNthTypePath(doc.body, segments);
  if (!current || current === doc.body || current === doc.documentElement) return null;
  if (root.nodeType === 9) return current;
  return (root as Element).contains(current) ? current : null;
}

/**
 * Resolve a preview `body > …` path against a slide-scoped root when the
 * absolute walk misses (wrapper drift between iframe DOM and saved HTML).
 *
 * Only anchors when a path segment identifies the scoped root itself, then
 * walks the remaining interior segments. Blind suffix walks are rejected —
 * otherwise `… > p:nth-of-type(1)` would match the first `<p>` on the wrong
 * slide.
 */
function findElementByDomSelectorPathRelativeToRoot(
  root: Element,
  selector: string,
): Element | null {
  const segments = parseDomBodyPathSegments(selector);
  if (segments.length === 0) return null;

  for (let start = 0; start < segments.length; start += 1) {
    const head = segments[start];
    if (!head || !elementMatchesDomNthSegment(root, head)) continue;
    const rest = segments.slice(start + 1);
    if (rest.length === 0) continue;
    const fromRoot = walkDomNthTypePath(root, rest);
    if (
      fromRoot
      && fromRoot !== root
      && root.contains(fromRoot)
    ) {
      return fromRoot;
    }
  }
  return null;
}

function findElementByPath(root: ManualEditLookupRoot, id: string): Element | null {
  if (!id.startsWith('path-')) return null;
  const indexes = id
    .slice('path-'.length)
    .split('-')
    .map((part) => Number(part));
  if (indexes.some((index) => !Number.isInteger(index) || index < 0)) return null;
  let current: Element | null = root.nodeType === 9 ? (root as Document).body : root as Element;
  for (const index of indexes) {
    current = current?.children.item(index) ?? null;
    if (!current) return null;
  }
  return current;
}

function findElementByScopedPath(
  doc: Document,
  root: ManualEditLookupRoot,
  id: string,
): Element | null {
  if (!id.startsWith('path-')) return null;
  if (root.nodeType === 9) return findElementByPath(root, id);

  const rootElement = root as Element;
  const absoluteTarget = findElementByPath(doc, id);
  if (absoluteTarget) {
    return rootElement === absoluteTarget || rootElement.contains(absoluteTarget)
      ? absoluteTarget
      : null;
  }

  return findElementByPath(root, id);
}

function hasElementChildren(el: Element): boolean {
  return Array.from(el.children).some((child) => child.nodeType === 1);
}

/** True when nested elements are only line breaks / empty wrappers — safe to flatten. */
export function onlyHasIgnorableInlineMarkup(el: Element): boolean {
  for (const child of Array.from(el.children)) {
    if (child.nodeType !== 1) continue;
    const tag = child.tagName.toLowerCase();
    if (tag === 'br' || tag === 'wbr') continue;
    const text = normalizeTextForCandidate(child.textContent || '');
    if (!text && !hasElementChildren(child)) continue;
    return false;
  }
  return true;
}

const MANUAL_EDIT_INLINE_TEXT_TAGS = new Set([
  'span', 'em', 'strong', 'b', 'i', 'u', 'mark', 'small',
  'sub', 'sup', 'br', 'a', 'abbr', 'cite', 'code', 'kbd', 'samp',
  'time', 'var', 's', 'q', 'dfn', 'del', 'ins',
  'wbr', 'bdi', 'bdo',
]);

const MANUAL_EDIT_INLINE_WRAPPER_TAGS = new Set([
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'span', 'a', 'button', 'label', 'li',
  'strong', 'em', 'b', 'i', 'u', 'mark', 'small',
  'div', 'dt', 'dd', 'figcaption', 'summary',
  'cite', 'blockquote', 'q',
]);

/** Shallow text stacks under a wrapper: `<div>a</div><div>b</div>` / `<p>…</p>`. */
const MANUAL_EDIT_TEXT_LEAF_CONTAINER_TAGS = new Set(['div', 'p']);

/**
 * True when `el` is a text-shaped wrapper (heading, paragraph, list item,
 * label, small `<div>`) whose children only carry inline formatting. Used to
 * decide whether a `set-text` patch may destructively replace inner HTML with
 * the escaped user text — safer than blocking the edit outright, but not so
 * aggressive that we would wipe block layout (`ul`, `table`, `section`, etc.).
 *
 * Also accepts one level of text-leaf `div`/`p` children (common in Teamver
 * decks for multi-line labels). Deeper block nests and real layout containers
 * still reject so callers fall through to the HTML tab.
 */
export function containsOnlyInlineTextFormatting(el: Element): boolean {
  const tag = el.tagName?.toLowerCase() ?? '';
  if (!MANUAL_EDIT_INLINE_WRAPPER_TAGS.has(tag)) return false;
  return Array.from(el.children).every(childIsInlineTextFormatting);
}

function childIsInlineTextFormatting(child: Element): boolean {
  const tag = child.tagName?.toLowerCase() ?? '';
  if (MANUAL_EDIT_INLINE_TEXT_TAGS.has(tag)) {
    if (child.children.length === 0) return true;
    return Array.from(child.children).every(childIsInlineTextFormatting);
  }
  // Shallow text-leaf containers: allow `<div>line</div>` / `<p><span>x</span></p>`
  // under a wrapper, but do not recurse into further block containers.
  if (MANUAL_EDIT_TEXT_LEAF_CONTAINER_TAGS.has(tag)) {
    return Array.from(child.children).every((grand) => {
      const grandTag = grand.tagName?.toLowerCase() ?? '';
      if (!MANUAL_EDIT_INLINE_TEXT_TAGS.has(grandTag)) return false;
      if (grand.children.length === 0) return true;
      return Array.from(grand.children).every(childIsInlineTextFormatting);
    });
  }
  return false;
}

/** Escape user-provided text before writing it into an element's innerHTML. */
export function escapeManualEditText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Encode spaces that CSS `white-space: normal` would collapse after a freeze
 * remount: leading/trailing spaces on each line, and 2nd+ spaces in a run.
 * Single internal word spaces stay as regular `" "` (already visible).
 */
export function encodeManualEditSignificantSpaces(escapedLine: string): string {
  if (!escapedLine) return escapedLine;
  let out = escapedLine.replace(/ {2,}/g, (run) => ` ${'&nbsp;'.repeat(run.length - 1)}`);
  out = out.replace(/^( +)/, (run) => '&nbsp;'.repeat(run.length));
  out = out.replace(/( +)$/, (run) => '&nbsp;'.repeat(run.length));
  return out;
}

/**
 * Escape plain text and map newlines / significant spaces so manual-edit
 * commits survive freeze remount under normal CSS whitespace collapsing.
 */
export function manualEditPlainTextToHtml(value: string): string {
  const normalized = escapeManualEditText(String(value ?? ''))
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
  return normalized
    .split('\n')
    .map((line) => encodeManualEditSignificantSpaces(line))
    .join('<br>');
}

/**
 * Read committed manual-edit plain text back from an element: keep spaces
 * (including `&nbsp;`), map `<br>` → `\n`, and never trim.
 */
export function manualEditElementToPlainText(el: Element): string {
  let out = '';
  const walk = (node: Node): void => {
    if (node.nodeType === 3) {
      out += (node.nodeValue || '').replace(/\u00a0/g, ' ');
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = ((node as Element).tagName || '').toLowerCase();
    if (tag === 'br') {
      out += '\n';
      return;
    }
    for (const child of Array.from(node.childNodes)) walk(child);
  };
  walk(el);
  return out.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/** Write committed plain text onto an element, preserving `\n` / spaces. */
export function applyManualEditPlainText(el: Element, value: string): void {
  el.innerHTML = manualEditPlainTextToHtml(String(value ?? ''));
}

/**
 * Models often emit numeric CSS JSON (`{"fontSize":32}`). Coerce to CSS
 * strings so set-style does not silently removeProperty on non-strings.
 */
const MANUAL_EDIT_UNITLESS_STYLE_PROPS = new Set([
  'fontWeight',
  'opacity',
  'lineHeight',
  'zIndex',
  'flex',
  'flexGrow',
  'flexShrink',
  'order',
]);

export function coerceManualEditStyleValue(name: string, value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return '';
    // Reject declaration breakout / markup before CSSOM setProperty.
    if (/[;{}<>\n\r]/.test(trimmed)) return null;
    // Models often emit unitless length strings (`"32"`). Append px so
    // setProperty does not silently ignore invalid CSS lengths.
    if (
      !MANUAL_EDIT_UNITLESS_STYLE_PROPS.has(name)
      && /^-?\d+(\.\d+)?$/.test(trimmed)
    ) {
      return `${trimmed}px`;
    }
    return trimmed;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (MANUAL_EDIT_UNITLESS_STYLE_PROPS.has(name)) return String(value);
    return `${value}px`;
  }
  return null;
}

export function coerceManualEditStyleRecord(
  styles: Record<string, unknown> | Partial<ManualEditStyles> | null | undefined,
): Partial<ManualEditStyles> {
  const out: Partial<ManualEditStyles> = {};
  if (!styles) return out;
  const allowed = new Set<string>(MANUAL_EDIT_STYLE_PROPS as readonly string[]);
  for (const [name, value] of Object.entries(styles)) {
    if (!allowed.has(name)) continue;
    const coerced = coerceManualEditStyleValue(name, value);
    if (coerced == null) continue;
    out[name as keyof ManualEditStyles] = coerced;
  }
  return out;
}

function syncSvgDimensionAttributes(el: HTMLElement, styles: Partial<ManualEditStyles>): void {
  if (el.tagName.toLowerCase() !== 'svg') return;
  const syncAttr = (key: 'width' | 'height') => {
    if (!Object.prototype.hasOwnProperty.call(styles, key)) return;
    const coerced = coerceManualEditStyleValue(key, styles[key]);
    if (coerced == null || String(coerced).trim() === '') {
      el.removeAttribute(key);
      return;
    }
    const trimmed = String(coerced).trim();
    const pxMatch = /^(-?\d+(?:\.\d+)?)px$/i.exec(trimmed);
    if (pxMatch) el.setAttribute(key, pxMatch[1]);
  };
  syncAttr('width');
  syncAttr('height');
}

/** Host preview + bridge preview share SVG width/height attribute sync. */
export function syncSvgDimensionAttributesFromStyles(
  el: HTMLElement,
  styles: Partial<ManualEditStyles>,
): void {
  syncSvgDimensionAttributes(el, styles);
}

/** Mirror wrapper width/height onto a lone svg/img child (persist + tests). */
export function syncGraphicChildDimensionsFromStyles(
  el: HTMLElement,
  styles: Partial<ManualEditStyles>,
): void {
  const tag = el.tagName.toLowerCase();
  if (tag !== 'div' && tag !== 'section' && tag !== 'article') return;
  if (
    !Object.prototype.hasOwnProperty.call(styles, 'width')
    && !Object.prototype.hasOwnProperty.call(styles, 'height')
  ) {
    return;
  }
  if (el.children.length !== 1) return;
  const child = el.children[0] as HTMLElement;
  const childTag = child.tagName.toLowerCase();
  if (childTag !== 'svg' && childTag !== 'img') return;
  const childStyles: Partial<ManualEditStyles> = { display: 'block', maxWidth: 'none', maxHeight: 'none' };
  if (Object.prototype.hasOwnProperty.call(styles, 'width')) childStyles.width = styles.width;
  if (Object.prototype.hasOwnProperty.call(styles, 'height')) childStyles.height = styles.height;
  setInlineStyles(child, childStyles);
}

function setInlineStyles(el: HTMLElement, styles: Partial<ManualEditStyles>): void {
  const coerced = coerceManualEditStyleRecord(styles as Record<string, unknown>);
  for (const [name, value] of Object.entries(coerced)) {
    const cssName = camelToKebab(name);
    if (typeof value !== 'string' || value.trim() === '') {
      el.style.removeProperty(cssName);
      continue;
    }
    // Match live preview (`!important`) so brand-kit / artifact CSS rules
    // cannot silently win after freeze remount drops postMessage styles.
    try {
      el.style.setProperty(cssName, value.trim(), 'important');
    } catch {
      // Invalid CSSOM values must not throw out of applyManualEditPatch.
    }
  }
  syncSvgDimensionAttributes(el, styles);
  syncGraphicChildDimensionsFromStyles(el, styles);
}

function setAttributes(
  el: Element,
  attributes: Record<string, string>,
): { attempted: number; applied: number } {
  // Keep identity / slide-scope attrs aligned with set-outer-html preservation.
  const protectedAttrs = new Set([
    'data-od-id',
    'data-od-edit',
    'data-od-label',
    'data-od-runtime-id',
    'data-od-source-path',
    'data-slide-index',
    'data-screen-label',
  ]);
  const tag = el.tagName.toLowerCase();
  const entries = Object.entries(attributes);
  // Deny all attr mutation on executable / chrome hosts — including empty
  // values that would remove `type` from an inert <script type="application/json">.
  if (isManualEditLockedHostTag(tag)) {
    return { attempted: entries.length, applied: 0 };
  }
  let applied = 0;
  for (const [name, value] of entries) {
    // Attribute names are case-insensitive in HTML; protect via lowercase.
    const lower = name.toLowerCase();
    if (!isSafeAttributeName(name) || protectedAttrs.has(lower)) continue;
    if (value.trim() === '') {
      el.removeAttribute(name);
      applied += 1;
      continue;
    }
    if (MANUAL_EDIT_CSS_URL_PRESENTATION_ATTRS.has(lower)) {
      const scrubbed = scrubUnsafeCssFunctions(normalizeCssForSafetyScan(value)).trim();
      if (
        !scrubbed
        || !isSafeManualEditPresentationCssValue(scrubbed, { alreadyNormalized: true })
      ) {
        continue;
      }
      el.setAttribute(name, scrubbed);
      applied += 1;
      continue;
    }
    if (
      MANUAL_EDIT_SVG_FRAGMENT_ONLY_TAGS.has(tag)
      && (lower === 'href' || lower === 'xlink:href')
      && !isSafeManualEditSvgResourceRef(value)
    ) {
      continue;
    }
    // Block dangerous URL schemes on navigable / embeddable attrs.
    if (
      (MANUAL_EDIT_URL_ATTRS.has(lower) || lower === 'srcset')
      && !isSafeManualEditUrlAttrValue(lower, value)
    ) {
      continue;
    }
    el.setAttribute(name, value);
    applied += 1;
  }
  return { attempted: entries.length, applied };
}

function replaceOuterHtml(doc: Document, el: Element, html: string): { ok: true } | { ok: false; error: string } {
  const template = doc.createElement('template');
  template.innerHTML = html.trim();
  // Models often emit set-outer-html bodies with sibling roots
  // (`<style>…</style><h1>…</h1>`, badge + title, etc.). Strict
  // "exactly one root" rejected those as deck_patch_merge_failed even
  // when a clear primary replacement was present — salvage first.
  const styleSiblings = Array.from(template.content.children).filter(
    (candidate) => candidate.tagName === 'STYLE',
  );
  const next = resolveSingleRootReplacementElement(doc, el, template);
  if (!next) {
    return { ok: false, error: 'Replacement HTML must contain exactly one root element.' };
  }
  if (!finalizeManualEditReplacement(el, next)) {
    return { ok: false, error: 'Replacement root element is not allowed.' };
  }
  el.replaceWith(next);
  // Style siblings were dropped by single-root salvage — keep their rules
  // so "make it stand out" edits that ship class + <style> still paint.
  // Deduplicate by text so repeated comment edits do not accumulate clones.
  const styleHost = doc.head ?? doc.documentElement ?? doc.body;
  if (styleHost) {
    for (const style of styleSiblings) {
      if (next === style || next.contains(style)) continue;
      // Drop @import (incl. CSS escapes/comments) and unsafe url()/expression.
      const text = scrubSalvagedStyleText(style.textContent ?? '');
      if (!text) continue;
      if (
        Array.from(styleHost.querySelectorAll('style')).some(
          (existing) => (existing.textContent ?? '').trim() === text,
        )
      ) {
        continue;
      }
      // Recreate a clean <style> so onload/onerror attrs cannot ride salvage.
      const clean = doc.createElement('style');
      clean.textContent = text;
      styleHost.appendChild(clean);
    }
  }
  return { ok: true };
}

const NON_CONTENT_REPLACEMENT_TAGS = new Set([
  'STYLE',
  'SCRIPT',
  'LINK',
  'META',
  'NOSCRIPT',
  'TEMPLATE',
  'BASE',
  'IFRAME',
  'OBJECT',
  'EMBED',
  'HANDLER',
  'APPLET',
  'FRAME',
  'FRAMESET',
  'DISCARD',
  'FENCEDFRAME',
  'PORTAL',
  'WEBVIEW',
  'PLAINTEXT',
  'XMP',
  'FOREIGNOBJECT',
  'ANNOTATION-XML',
]);

/**
 * Pick / synthesize a single root element for `set-outer-html`.
 * Preference: identity match → unique same tag (ignoring style/script) →
 * unique content root → best text overlap among same-tag → text-only wrap.
 */
function resolveSingleRootReplacementElement(
  doc: Document,
  el: Element,
  template: HTMLTemplateElement,
): Element | null {
  const elements = Array.from(template.content.children);
  if (elements.length === 1) {
    const only = elements[0]!;
    // Lone script/meta/base/etc. must not become the replacement root.
    if (NON_CONTENT_REPLACEMENT_TAGS.has(only.tagName)) return null;
    if (MANUAL_EDIT_DANGEROUS_REPLACEMENT_TAGS.has(only.tagName.toLowerCase())) return null;
    return only;
  }

  if (elements.length === 0) {
    const text = (template.content.textContent ?? '').trim();
    if (!text) return null;
    const wrapper = doc.createElement(el.tagName.toLowerCase());
    copyPreservableManualEditAttributes(el, wrapper);
    wrapper.textContent = text;
    return wrapper;
  }

  const odId = (el.getAttribute('data-od-id') || '').trim();
  if (odId) {
    const direct = elements.find((candidate) => candidate.getAttribute('data-od-id') === odId);
    // Identity match must not promote script/iframe/meta into the root —
    // sanitize only strips nested dangerous tags (el !== root).
    if (direct && !isUnsafeManualEditReplacementRoot(direct)) return direct;
    const escaped = cssQuotedAttrValue(odId);
    for (const candidate of elements) {
      try {
        const nested = candidate.querySelector(`[data-od-id="${escaped}"]`);
        if (nested && !isUnsafeManualEditReplacementRoot(nested)) return nested;
      } catch {
        // Invalid selector characters — fall through.
      }
    }
  }

  const contentRoots = elements.filter(
    (candidate) => !isUnsafeManualEditReplacementRoot(candidate),
  );
  const pool = contentRoots.length > 0 ? contentRoots : elements.filter(
    (candidate) => !isUnsafeManualEditReplacementRoot(candidate),
  );
  if (pool.length === 0) return null;

  const sameTag = pool.filter((candidate) => candidate.tagName === el.tagName);
  if (sameTag.length === 1) return sameTag[0]!;
  if (sameTag.length > 1) {
    const currentText = (el.textContent ?? '').trim();
    if (currentText) {
      let best: Element | null = null;
      let bestScore = -1;
      for (const candidate of sameTag) {
        const score = replacementTextOverlapScore(currentText, (candidate.textContent ?? '').trim());
        if (score > bestScore) {
          bestScore = score;
          best = candidate;
        }
      }
      if (best && bestScore > 0) return best;
    }
    return sameTag[0]!;
  }

  if (pool.length === 1) return pool[0]!;

  // Model emitted sibling content roots with no tag/id match — wrap them
  // as children of a clone of the original element so the edit still
  // lands on the pinned target instead of failing the whole comment turn.
  const wrapper = doc.createElement(el.tagName.toLowerCase());
  copyPreservableManualEditAttributes(el, wrapper);
  for (const node of Array.from(template.content.childNodes)) {
    if (node.nodeType === 1 && NON_CONTENT_REPLACEMENT_TAGS.has((node as Element).tagName)) {
      continue;
    }
    wrapper.appendChild(doc.importNode(node, true));
  }
  if (!wrapper.hasChildNodes()) return null;
  return wrapper;
}

function copyPreservableManualEditAttributes(from: Element, to: Element): void {
  for (const name of ['data-od-id', 'data-od-edit', 'data-od-label', 'class', 'style'] as const) {
    const value = from.getAttribute(name);
    if (value != null && value !== '' && !to.hasAttribute(name)) {
      to.setAttribute(name, value);
    }
  }
}

function replacementTextOverlapScore(current: string, next: string): number {
  if (!current || !next) return 0;
  if (current === next) return current.length + 1000;
  if (next.includes(current) || current.includes(next)) {
    return Math.min(current.length, next.length);
  }
  const currentTokens = current.toLowerCase().split(/\s+/).filter(Boolean);
  const nextLower = next.toLowerCase();
  let hits = 0;
  for (const token of currentTokens) {
    if (token.length >= 2 && nextLower.includes(token)) hits += token.length;
  }
  return hits;
}

/** Custom-property names only — plain props like `color` are not tokens. */
function isSafeCssTokenName(token: string): boolean {
  return /^--[a-zA-Z_][\w-]*$/.test(String(token || ''));
}

/** Reject CSS declaration / rule breakout and remote/script urls in set-token. */
function isSafeCssTokenValue(value: string): boolean {
  const trimmed = String(value || '').trim();
  if (!trimmed) return false;
  if (/[;{}]/.test(trimmed)) return false;
  if (/<\/?style/i.test(trimmed)) return false;
  if (/@/.test(trimmed)) return false;
  // Decode CSS hex escapes so `\75rl(` / `\65xpression(` cannot bypass denies.
  const normalized = normalizeCssForSafetyScan(trimmed);
  if (/\burl\s*\(/i.test(normalized)) return false;
  // CSS Images string forms are peer URL carriers to url().
  if (/\b(?:-webkit-)?image(?:-set)?\s*\(/i.test(normalized)) return false;
  if (/\belement\s*\(/i.test(normalized)) return false;
  if (/\bexpression\s*\(/i.test(normalized)) return false;
  if (/-moz-binding/i.test(normalized)) return false;
  if (/\bbehavior\s*:/i.test(normalized)) return false;
  // Bare scheme strings (not only inside url()).
  if (containsUnsafeEmbeddedCssOrScheme(normalized, { alreadyNormalized: true })) return false;
  if (/(?:javascript|vbscript|data):/i.test(normalized)) return false;
  return true;
}

/**
 * Normalize CSS enough to defeat comment / hex-escape @import smuggling
 * (hex-escaped "@import", comment-split import) before salvage scrubbing.
 */
/** Normalize CSS enough to defeat comment / hex-escape smuggling before scans. */
export function normalizeCssForSafetyScan(css: string): string {
  let text = String(css || '');
  text = text.replace(/\/\*[\s\S]*?\*\//g, '');
  // CSS string line continuations: "java\<newline>script:" → "javascript:"
  // Must run before hex/char escape decode so scheme scanners see the join.
  text = text.replace(/\\(?:\r\n|[\n\r\f])/g, '');
  text = text.replace(/\\([0-9a-fA-F]{1,6})(\r\n|[ \t\r\n\f])?/g, (_match, hex: string) => {
    const code = Number.parseInt(hex, 16);
    if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return '';
    try {
      return String.fromCodePoint(code);
    } catch {
      return '';
    }
  });
  text = text.replace(/\\(.)/g, '$1');
  return text;
}

/**
 * Strip a block/semicolon at-rule with quote-aware brace matching so
 * `suffix:"}"` cannot truncate `@counter-style` / `@font-face` / `@page`.
 */
function stripCssAtRule(css: string, ruleName: string): string {
  const lower = css.toLowerCase();
  const needle = `@${ruleName.toLowerCase()}`;
  let out = '';
  let cursor = 0;
  while (cursor < css.length) {
    const idx = lower.indexOf(needle, cursor);
    if (idx < 0) {
      out += css.slice(cursor);
      break;
    }
    // Ident boundary after the rule name (`@page` vs `@pages`).
    const afterName = idx + needle.length;
    if (afterName < css.length && /[\w-]/.test(css[afterName]!)) {
      out += css.slice(cursor, afterName);
      cursor = afterName;
      continue;
    }
    out += css.slice(cursor, idx);
    let i = afterName;
    while (i < css.length && /[\s\r\n\f]/.test(css[i]!)) i += 1;
    // Prelude until `{` or `;` (for `@page` margin shorthands without block).
    let quote: '"' | "'" | null = null;
    while (i < css.length) {
      const ch = css[i]!;
      if (quote) {
        if (ch === '\\') {
          i += 2;
          continue;
        }
        if (ch === quote) quote = null;
        i += 1;
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        i += 1;
        continue;
      }
      if (ch === ';') {
        i += 1;
        break;
      }
      if (ch === '{') {
        let depth = 1;
        i += 1;
        while (i < css.length && depth > 0) {
          const inner = css[i]!;
          if (quote) {
            if (inner === '\\') {
              i += 2;
              continue;
            }
            if (inner === quote) quote = null;
            i += 1;
            continue;
          }
          if (inner === '"' || inner === "'") {
            quote = inner;
            i += 1;
            continue;
          }
          if (inner === '{') depth += 1;
          else if (inner === '}') depth -= 1;
          i += 1;
        }
        break;
      }
      i += 1;
    }
    cursor = i;
  }
  return out;
}

/** Strip @import / @namespace / @font-face / @counter-style / @page from salvaged style text. */
function stripDangerousCssAtRules(css: string): string {
  let text = normalizeCssForSafetyScan(css)
    .replace(/@import\b[^;]*;?/gi, '')
    .replace(/@namespace\b[^;]*;?/gi, '');
  // Remote symbols / page backgrounds — same fetch class as @font-face.
  for (const rule of ['font-face', 'counter-style', 'page'] as const) {
    text = stripCssAtRule(text, rule);
  }
  text = text.trim();
  // Fail closed if a dangerous at-rule survived a truncated strip.
  if (/@(?:font-face|counter-style|page)\b/i.test(text)) return '';
  return text;
}

/**
 * CSS properties that may load remote paint/resources via url()/image().
 * Shared by non-fragment drop and var() fail-closed scrub.
 * Intentionally excludes background/background-image (slide imagery).
 */
const MANUAL_EDIT_CSS_RESOURCE_PROP_PATTERN = [
  '(?:-webkit-)?(?:backdrop-)?filter',
  '(?:-webkit-)?(?:clip-path|mask(?:-image)?|fill|stroke|cursor|marker(?:-(?:start|mid|end))?)',
  '(?:-webkit-)?border-image(?:-source)?',
  'mask-border(?:-source)?',
  '-webkit-mask-box-image(?:-source)?',
  '-webkit-box-reflect',
  'shape-outside',
  'offset-path',
  'list-style(?:-image)?',
].join('|');

/** Hoisted so every style attr/block does not recompile the huge alternation. */
const MANUAL_EDIT_CSS_RESOURCE_DECL_RE = new RegExp(
  `(^|[;{])(\\s*)(?<![\\w-])(${MANUAL_EDIT_CSS_RESOURCE_PROP_PATTERN})\\s*:\\s*([^;{}]*)`,
  'gi',
);
const MANUAL_EDIT_CSS_RESOURCE_VAR_RE = new RegExp(
  `(^|[;{])(\\s*)(?<![\\w-])(${MANUAL_EDIT_CSS_RESOURCE_PROP_PATTERN})\\s*:\\s*([^;{}]*\\bvar\\s*\\([^;{}]*)`,
  'gi',
);

/** Presentation attrs that accept CSS `url()` and need the same scrub as style. */
const MANUAL_EDIT_CSS_URL_PRESENTATION_ATTRS = new Set([
  'filter',
  'fill',
  'stroke',
  'clip-path',
  'clippath',
  'mask',
  'cursor',
  'marker',
  'marker-start',
  'marker-mid',
  'marker-end',
  'color-profile',
]);

/** SVG paint-server / resource tags restricted to same-document `#fragment` refs. */
const MANUAL_EDIT_SVG_FRAGMENT_ONLY_TAGS = new Set([
  'use',
  'image',
  'feimage',
  'mpath',
  'textpath',
  'pattern',
  'lineargradient',
  'radialgradient',
  'filter',
  // animate*/set href targets a paint/element server — keep same-document only.
  'animate',
  'animatemotion',
  'animatetransform',
  'animatecolor',
  'set',
  // Legacy SVG external-resource tags.
  'cursor',
  'font-face-uri',
  'altglyph',
  'glyphref',
  'tref',
  'color-profile',
]);

/** SMIL attributeName values that assign navigable/resource URLs. */
const MANUAL_EDIT_SMIL_NAV_ATTR_NAMES = new Set([
  'href',
  'xlink:href',
  'src',
  'action',
  'formaction',
  'poster',
  'cite',
  'ping',
  // Align with MANUAL_EDIT_URL_ATTRS — SMIL can retarget these via to/values.
  'background',
  'dynsrc',
  'lowsrc',
  'srcset',
  'imagesrcset',
  'longdesc',
  'manifest',
  'codebase',
  'classid',
  'archive',
  'usemap',
  'data',
]);

/** Tags whose URL attrs must not be mutated via set-attributes (chrome/exec). */
const MANUAL_EDIT_NO_URL_MUTATION_TAGS = new Set([
  'script',
  'iframe',
  'object',
  'embed',
  'base',
  'link',
  'meta',
  // Legacy / SVG executable hosts — same class as dangerous replacement tags.
  'frame',
  'frameset',
  'applet',
  'handler',
  'discard',
  // Modern / chrome embed hosts.
  'fencedframe',
  'portal',
  'webview',
]);

function isForbiddenCssUrlScheme(value: string): boolean {
  const compact = compactManualEditUrlForSchemeCheck(decodeHtmlCharacterReferences(value));
  return (
    compact.startsWith('javascript:')
    || compact.startsWith('vbscript:')
    || compact.startsWith('data:')
  );
}

/** Drop javascript/vbscript/data urls, image()/image-set strings, and expression(). */
function scrubUnsafeCssFunctions(css: string): string {
  let text = String(css || '');
  // Quote-aware rewrites — regex `[^)]*` truncates on `)` inside SVG/data URLs.
  text = rewriteCssUrlFunctions(text);
  text = rewriteCssImageFunctions(text);
  text = rewriteCssFunctionCalls(text, 'expression', 'initial');
  // Firefox element() can sample arbitrary document regions into paint.
  text = rewriteCssFunctionCalls(text, 'element', 'none');
  text = text.replace(/-moz-binding\s*:[^;]*/gi, '');
  // IE/HTC binding — same threat class as -moz-binding (incl. mid-rule).
  text = text.replace(/\bbehavior\s*:[^;}]*/gi, '');
  // Legacy Opera CSS link bindings (javascript: outside url()).
  text = text.replace(/-o-link(?:-source)?\s*:[^;}]*/gi, '');
  // SVG/CSS paint & resource properties — remote url()/image() can fetch
  // attacker content into preview. Keep same-document #fragment only.
  // Declaration-level match so `filter: blur(2px) url(https://…)` is dropped,
  // and `(?<![-\w])` avoids mangling `background-filter` / `--hero-filter`.
  // Intentionally does NOT touch background/background-image (slide imagery).
  text = dropCssDeclsWithNonFragmentResource(text);
  // Resource props using var() cannot be proven fragment-safe (custom props
  // may stash remote url()). Keep --bg:url(https) for slide imagery intact.
  MANUAL_EDIT_CSS_RESOURCE_VAR_RE.lastIndex = 0;
  text = text.replace(MANUAL_EDIT_CSS_RESOURCE_VAR_RE, '$1$2');
  return text;
}

/**
 * Drop whole CSS declarations whose value embeds a non-fragment url(...)/image(...).
 */
function dropCssDeclsWithNonFragmentResource(css: string): string {
  MANUAL_EDIT_CSS_RESOURCE_DECL_RE.lastIndex = 0;
  return String(css || '').replace(
    MANUAL_EDIT_CSS_RESOURCE_DECL_RE,
    (match, prefix: string, ws: string, _prop: string, value: string) => {
      const hasUrl = /\burl\s*\(/i.test(value);
      const hasImageFn = /\b(?:-webkit-)?image(?:-set)?\s*\(/i.test(value);
      if (!hasUrl && !hasImageFn) return match;
      if (
        (hasUrl && cssDeclarationHasNonFragmentUrl(value))
        || (hasImageFn && cssDeclarationHasNonFragmentImageFn(value))
      ) {
        return prefix === '{' ? `{${ws}` : prefix === ';' ? `;${ws}` : ws;
      }
      return match;
    },
  );
}

/** True when a CSS declaration value contains url(...) that is not #fragment. */
function cssDeclarationHasNonFragmentUrl(value: string): boolean {
  const text = String(value || '');
  if (!/\burl\s*\(/i.test(text)) return false;
  const inners = extractCssUrlInners(text);
  // Fail closed if url( is present but nothing parseable was extracted.
  if (inners.length === 0) return true;
  return inners.some((inner) => !isSafeManualEditSvgResourceRef(inner));
}

/** True when image()/image-set() embeds a non-fragment resource URL. */
function cssDeclarationHasNonFragmentImageFn(value: string): boolean {
  const text = String(value || '');
  if (!/\b(?:-webkit-)?image(?:-set)?\s*\(/i.test(text)) return false;
  const inners = extractCssImageFunctionUrlInners(text);
  // Fail closed if image( is present but nothing parseable was extracted.
  if (inners.length === 0) return true;
  return inners.some((inner) => !isSafeManualEditSvgResourceRef(inner));
}

function scrubSalvagedStyleText(css: string): string {
  // stripDangerousCssAtRules already normalizes for safety scan.
  const scrubbed = scrubUnsafeCssFunctions(stripDangerousCssAtRules(css)).trim();
  // Fail closed if scheme text still survives after declaration scrubs.
  if (containsUnsafeEmbeddedCssOrScheme(scrubbed, { alreadyNormalized: true })) return '';
  return scrubbed;
}

function scrubUnsafeInlineStyleAttr(value: string): string {
  // Match salvage path: defeat CSS escapes/comments before url()/expression scrub.
  const normalized = normalizeCssForSafetyScan(String(value || ''));
  const scrubbed = scrubUnsafeCssFunctions(normalized).trim().replace(/^;+|;+$/g, '').trim();
  // If anything still looks like a scriptable url, drop the whole attr.
  if (containsUnsafeEmbeddedCssOrScheme(scrubbed, { alreadyNormalized: true })) return '';
  if (/\bexpression\s*\(/i.test(scrubbed)) return '';
  if (/-moz-binding/i.test(scrubbed)) return '';
  if (/\bbehavior\s*:/i.test(scrubbed)) return '';
  return scrubbed;
}

/** SVG resource refs may only point at same-document fragments (#id). */
function isSafeManualEditSvgResourceRef(value: string): boolean {
  const trimmed = String(value || '').trim();
  if (!trimmed) return true;
  if (!trimmed.startsWith('#')) return false;
  // Reject `#foo:bar` / scheme-like fragments.
  if (/[\\/]/.test(trimmed) || /^#[a-z][a-z0-9+.-]*:/i.test(trimmed)) return false;
  return true;
}

/**
 * SVG presentation attr / SMIL CSS values: plain paints OK; every url(...) must
 * be a same-document #fragment (remote SVG paint servers are blocked).
 * Pass `alreadyNormalized` when the caller already ran `normalizeCssForSafetyScan`.
 */
function isSafeManualEditPresentationCssValue(
  value: string,
  options?: { alreadyNormalized?: boolean },
): boolean {
  const normalized = options?.alreadyNormalized
    ? String(value || '').trim()
    : normalizeCssForSafetyScan(String(value || '')).trim();
  if (!normalized) return true;
  // Bare scheme as the whole presentation value (`fill="data:image/svg+xml,…"`).
  if (/^(?:javascript|vbscript|data|blob)\s*:/i.test(normalized)) return false;
  // image-set / element / -moz-binding are never safe paint-server values.
  if (/\b(?:-webkit-)?image-set\s*\(/i.test(normalized)) return false;
  if (/\belement\s*\(/i.test(normalized)) return false;
  if (/-moz-binding/i.test(normalized)) return false;
  if (containsUnsafeEmbeddedCssOrScheme(normalized, { alreadyNormalized: true })) return false;
  // var() can hide remote url() via custom props — fail closed for paint attrs.
  if (/\bvar\s*\(/i.test(normalized)) return false;
  if (cssDeclarationHasNonFragmentUrl(normalized)) return false;
  if (cssDeclarationHasNonFragmentImageFn(normalized)) return false;
  return true;
}

/**
 * Find the next CSS function call named `funcName` (e.g. "url", "image-set")
 * starting at `from`. Pass `lowerHaystack` to avoid re-lowercasing large CSS
 * on every call (hot path inside rewrite loops).
 */
function findNextCssFunctionCall(
  text: string,
  funcName: string,
  from = 0,
  lowerHaystack?: string,
): { start: number; end: number; args: string } | null {
  const lower = lowerHaystack ?? text.toLowerCase();
  const needle = `${funcName.toLowerCase()}(`;
  let search = from;
  while (search < text.length) {
    const idx = lower.indexOf(needle, search);
    if (idx < 0) return null;
    // Require a CSS ident boundary so `mask-image(` is not matched as `image(`.
    if (idx > 0 && /[\w-]/.test(text[idx - 1]!)) {
      search = idx + 1;
      continue;
    }
    let i = idx + needle.length;
    let depth = 1;
    let quote: '"' | "'" | null = null;
    while (i < text.length && depth > 0) {
      const ch = text[i]!;
      if (quote) {
        if (ch === '\\') {
          i += 2;
          continue;
        }
        if (ch === quote) quote = null;
        i += 1;
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        i += 1;
        continue;
      }
      if (ch === '(') depth += 1;
      else if (ch === ')') depth -= 1;
      i += 1;
    }
    if (depth !== 0) return null;
    return {
      start: idx,
      end: i,
      args: text.slice(idx + needle.length, i - 1),
    };
  }
  return null;
}

/** Earliest match among several function names (longest names should be listed first). */
function findNextCssFunctionCallNamed(
  text: string,
  names: readonly string[],
  from: number,
  lowerHaystack: string,
): { start: number; end: number; args: string } | null {
  let best: { start: number; end: number; args: string } | null = null;
  for (const name of names) {
    const call = findNextCssFunctionCall(text, name, from, lowerHaystack);
    if (call && (!best || call.start < best.start)) best = call;
  }
  return best;
}

/** Rewrite every quote-aware call of `funcName` to `replacement`. */
function rewriteCssFunctionCalls(
  css: string,
  funcName: string,
  replacement: string,
): string {
  const text = String(css || '');
  const lower = text.toLowerCase();
  let out = '';
  let cursor = 0;
  while (cursor < text.length) {
    const call = findNextCssFunctionCall(text, funcName, cursor, lower);
    if (!call) {
      out += text.slice(cursor);
      break;
    }
    out += text.slice(cursor, call.start);
    out += replacement;
    cursor = call.end;
  }
  return out;
}

/** Rewrite url(...) with forbidden schemes to url() using quote-aware scans. */
function rewriteCssUrlFunctions(css: string): string {
  const text = String(css || '');
  const lower = text.toLowerCase();
  let out = '';
  let cursor = 0;
  while (cursor < text.length) {
    const call = findNextCssFunctionCall(text, 'url', cursor, lower);
    if (!call) {
      out += text.slice(cursor);
      break;
    }
    out += text.slice(cursor, call.start);
    const inner = call.args.trim().replace(/^(['"])([\s\S]*)\1$/, '$2');
    out += isForbiddenCssUrlScheme(inner) ? 'url()' : text.slice(call.start, call.end);
    cursor = call.end;
  }
  return out;
}

const MANUAL_EDIT_CSS_IMAGE_FN_NAMES = [
  '-webkit-image-set',
  'image-set',
  'image',
] as const;

/**
 * Rewrite image()/image-set()/-webkit-image-set() calls that embed forbidden
 * schemes to `none`. Single left-to-right pass (avoids 3× full rescans).
 */
function rewriteCssImageFunctions(css: string): string {
  const text = String(css || '');
  const lower = text.toLowerCase();
  let out = '';
  let cursor = 0;
  while (cursor < text.length) {
    const call = findNextCssFunctionCallNamed(
      text,
      MANUAL_EDIT_CSS_IMAGE_FN_NAMES,
      cursor,
      lower,
    );
    if (!call) {
      out += text.slice(cursor);
      break;
    }
    out += text.slice(cursor, call.start);
    const urls = extractUrlCandidatesFromCssFunctionArgs(call.args);
    const unsafe = urls.some((u) => isForbiddenCssUrlScheme(u))
      || /(?:javascript|vbscript|data):/i.test(normalizeCssForSafetyScan(call.args));
    out += unsafe ? 'none' : text.slice(call.start, call.end);
    cursor = call.end;
  }
  return out;
}

/** Pull quoted strings and url() inners from image()/image-set() args. */
function extractUrlCandidatesFromCssFunctionArgs(args: string): string[] {
  const text = String(args || '');
  const out: string[] = [];
  for (const inner of extractCssUrlInners(text)) out.push(inner);
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === '"' || ch === "'") {
      const q = ch;
      i += 1;
      let end = i;
      while (end < text.length) {
        if (text[end] === '\\') {
          end += 2;
          continue;
        }
        if (text[end] === q) break;
        end += 1;
      }
      const inner = text.slice(i, end).trim();
      if (inner) out.push(inner);
      i = end < text.length ? end + 1 : end;
      continue;
    }
    i += 1;
  }
  return out;
}

/** Quote-aware extraction of url(...) inner texts from a CSS value. */
function extractCssUrlInners(value: string): string[] {
  const text = String(value || '');
  const lower = text.toLowerCase();
  const out: string[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const call = findNextCssFunctionCall(text, 'url', cursor, lower);
    if (!call) break;
    const raw = call.args.trim();
    const unquoted = raw.replace(/^(['"])([\s\S]*)\1$/, '$2').trim();
    if (unquoted) out.push(unquoted);
    cursor = call.end;
  }
  return out;
}

/** Quoted / url() resource candidates inside image()/image-set() calls. */
function extractCssImageFunctionUrlInners(value: string): string[] {
  const text = String(value || '');
  const lower = text.toLowerCase();
  const out: string[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const call = findNextCssFunctionCallNamed(
      text,
      MANUAL_EDIT_CSS_IMAGE_FN_NAMES,
      cursor,
      lower,
    );
    if (!call) break;
    out.push(...extractUrlCandidatesFromCssFunctionArgs(call.args));
    cursor = call.end;
  }
  return out;
}

function setCssToken(doc: Document, token: string, value: string): boolean {
  if (!isSafeCssTokenName(token) || !isSafeCssTokenValue(value)) return false;
  const styles = Array.from(doc.querySelectorAll('style'));
  const pattern = new RegExp(`(${escapeRegExp(token)}\\s*:\\s*)([^;]+)(;)`);
  for (const style of styles) {
    const text = style.textContent ?? '';
    if (!pattern.test(text)) continue;
    style.textContent = text.replace(pattern, `$1${value}$3`);
    return true;
  }
  return false;
}

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(value);
  return value.replace(/"/g, '\\"');
}

/** Escape a value for use inside a double-quoted CSS attribute selector. */
function cssQuotedAttrValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function camelToKebab(value: string): string {
  return value.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}

function isSafeAttributeName(value: string): boolean {
  if (!/^[a-zA-Z_:][a-zA-Z0-9_:.-]*$/.test(value)) return false;
  const lower = value.toLowerCase();
  // Block event handlers and high-risk markup attrs from model set-attributes.
  if (lower.startsWith('on')) return false;
  if (
    lower === 'style'
    || lower === 'srcdoc'
    || lower === 'behavior'
    || lower === 'http-equiv'
  ) {
    return false;
  }
  return true;
}

/** Attrs whose values are treated as URLs for scheme deny-list checks. */
const MANUAL_EDIT_URL_ATTRS = new Set([
  'href',
  'src',
  'xlink:href',
  'action',
  'formaction',
  'poster',
  'cite',
  'ping',
  'background',
  'dynsrc',
  'lowsrc',
  'srcset',
  'imagesrcset',
  'longdesc',
  'manifest',
  'codebase',
  'classid',
  'archive',
  'usemap',
  'data',
  // SVG SMIL can assign href via to/from/by/values without on* handlers.
  'to',
  'from',
  'by',
  'values',
]);

const SAFE_MANUAL_EDIT_DATA_IMAGE_RE = /^data:image\/(png|jpe?g|gif|webp|avif|bmp)(;|,)/i;

/**
 * Named entities commonly used to smuggle URL schemes past allowlists.
 * Soft hyphen / Cf / Zs entities decode then collapse in compact().
 */
const MANUAL_EDIT_NAMED_HTML_ENTITIES: Record<string, string> = {
  colon: ':',
  tab: '\t',
  newline: '\n',
  amp: '&',
  quot: '"',
  apos: "'",
  lt: '<',
  gt: '>',
  // Soft hyphen / format / zero-width — strip via compact after decode.
  shy: '\u00ad',
  wj: '\u2060',
  zerowidthspace: '\u200b',
  lrm: '\u200e',
  rlm: '\u200f',
  zwj: '\u200d',
  zwnj: '\u200c',
  // HTML5 space entities (collapse to whitespace, then stripped).
  thinsp: ' ',
  nbsp: ' ',
  ensp: ' ',
  emsp: ' ',
  emsp13: ' ',
  emsp14: ' ',
  numsp: ' ',
  puncsp: ' ',
  hairsp: ' ',
  thickspace: ' ',
  mediumspace: ' ',
  nnbsp: ' ',
  negativemediumspace: '',
  negativethinspace: '',
  negativeverythinspace: '',
};

/** Decode numeric/hex/named HTML character references used to smuggle schemes. */
function decodeHtmlCharacterReferences(value: string): string {
  let out = String(value || '');
  for (let i = 0; i < 3; i += 1) {
    const next = out
      .replace(/&#x([0-9a-fA-F]{1,6});?/g, (_match, hex: string) => {
        const code = Number.parseInt(hex, 16);
        if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return '';
        try {
          return String.fromCodePoint(code);
        } catch {
          return '';
        }
      })
      .replace(/&#([0-9]{1,7});?/g, (_match, dec: string) => {
        const code = Number.parseInt(dec, 10);
        if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return '';
        try {
          return String.fromCodePoint(code);
        } catch {
          return '';
        }
      })
      .replace(/&([a-zA-Z][a-zA-Z0-9]+);?/g, (_match, name: string) => {
        const mapped = MANUAL_EDIT_NAMED_HTML_ENTITIES[name.toLowerCase()];
        // Fail closed: unknown named entities are scheme-smuggling bait.
        return mapped !== undefined ? mapped : '';
      });
    if (next === out) break;
    out = next;
  }
  return out;
}

/**
 * Compact URL text for scheme checks — strip controls, soft hyphen, ZWSP/Cf,
 * and BOM. Uses an explicit smuggling-char class (not `\p{Cf}`) so CSS/URL
 * hot paths avoid unicode-property regex cost on multi-KB style blocks.
 */
function compactManualEditUrlForSchemeCheck(value: string): string {
  return String(value || '')
    // Controls + common Zs whitespace (incl. NBSP).
    .replace(/[\s\u0000-\u001f\u007f\u00a0\ufeff]+/g, '')
    // Soft hyphen, ZWSP/ZWNJ/ZWJ, LRM/RLM, word-joiner, bidi isolates/overrides.
    .replace(/[\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u206f\ufeff]/g, '')
    .toLowerCase();
}

/** Reject javascript:/vbscript:/dangerous data: URL schemes in manual edits. */
export function isSafeManualEditUrl(value: string): boolean {
  const trimmed = String(value || '').trim();
  if (!trimmed) return true;
  // Decode &#106;avascript: / javascript&#58; before scheme checks.
  const decoded = decodeHtmlCharacterReferences(trimmed);
  const compact = compactManualEditUrlForSchemeCheck(decoded);
  // UNC / backslash-authority phishing (`\\evil.example`) — align relative-only.
  if (compact.includes('\\')) return false;
  if (compact.startsWith('javascript:')) return false;
  if (compact.startsWith('vbscript:')) return false;
  // Local / opaque navigators — not needed for deck media and leak context.
  if (compact.startsWith('blob:')) return false;
  if (compact.startsWith('file:')) return false;
  if (compact.startsWith('about:')) return false;
  if (compact.startsWith('filesystem:')) return false;
  if (compact.startsWith('chrome:')) return false;
  if (compact.startsWith('chrome-extension:')) return false;
  if (compact.startsWith('moz-extension:')) return false;
  if (compact.startsWith('resource:')) return false;
  // Browser / OS navigators that are not deck media.
  if (compact.startsWith('view-source:')) return false;
  if (compact.startsWith('ms-appx:')) return false;
  if (compact.startsWith('ms-appx-web:')) return false;
  if (compact.startsWith('data:')) {
    if (compact.startsWith('data:text/html')) return false;
    if (compact.startsWith('data:image/svg+xml')) return false;
    // Allow only common raster data:image MIME types.
    if (compact.startsWith('data:image/')) {
      return SAFE_MANUAL_EDIT_DATA_IMAGE_RE.test(compact);
    }
    return false;
  }
  return true;
}

/**
 * True when a SMIL/CSS value embeds a scriptable scheme in a URL/value position.
 * Avoids false positives on selectors like `.javascript:hover` or path segments
 * such as `/assets/javascript:docs.png` after url() rewrite.
 */
function containsUnsafeEmbeddedCssOrScheme(
  value: string,
  options?: { alreadyNormalized?: boolean },
): boolean {
  // `alreadyNormalized` skips CSS escape/comment rewrite only. HTML entities
  // (`&#106;avascript:`) must still decode before scheme scans.
  const scanned = options?.alreadyNormalized
    ? decodeHtmlCharacterReferences(String(value || ''))
    : normalizeCssForSafetyScan(decodeHtmlCharacterReferences(value));
  if (/\bexpression\s*\(/i.test(scanned)) return true;
  if (/\belement\s*\(/i.test(scanned)) return true;
  for (const inner of extractCssUrlInners(scanned)) {
    if (isForbiddenCssUrlScheme(inner)) return true;
  }
  for (const inner of extractCssImageFunctionUrlInners(scanned)) {
    if (isForbiddenCssUrlScheme(inner)) return true;
  }
  // Bare scheme as a declaration value (`content:javascript:…`), not a selector.
  if (/(?:^|[;{])\s*[^:{}]+?:\s*(?:javascript|vbscript|data):/i.test(scanned)) {
    return true;
  }
  // Quoted string values carrying schemes outside url()/image().
  if (/['"](?:javascript|vbscript|data):/i.test(scanned)) return true;
  return false;
}

/**
 * Allow relative / same-doc / fragment URLs only — block absolute http(s) and
 * protocol-relative phishing on form action / SMIL href retargets.
 */
export function isSafeManualEditRelativeOrFragmentUrl(value: string): boolean {
  const trimmed = String(value || '').trim();
  if (!trimmed) return true;
  if (!isSafeManualEditUrl(trimmed)) return false;
  const compact = compactManualEditUrlForSchemeCheck(decodeHtmlCharacterReferences(trimmed));
  // Reject scheme / protocol-relative / backslash-authority phishing
  // (`\\evil.example` / `\evil.example` normalize toward remote hosts in
  // legacy IE / UNC-style URL handling).
  if (compact.includes('\\')) return false;
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(compact)) return false;
  return true;
}

/**
 * SMIL attributeName=to/from/by/values — per-attr token rules.
 * href/xlink:href/usemap are #fragment-only; ping/archive/srcset split tokens.
 */
function isSafeManualEditSmilNavValue(attr: string, value: string): boolean {
  const lower = String(attr || '').toLowerCase();
  const trimmed = String(value || '').trim();
  if (!trimmed) return true;
  if (lower === 'usemap' || lower === 'href' || lower === 'xlink:href') {
    return isSafeManualEditSvgResourceRef(trimmed);
  }
  if (lower === 'ping' || lower === 'archive') {
    return trimmed
      .split(/\s+/)
      .filter(Boolean)
      .every((part) => isSafeManualEditRelativeOrFragmentUrl(part));
  }
  if (lower === 'srcset' || lower === 'imagesrcset') {
    return trimmed.split(',').every((part) => {
      const url = part.trim().split(/\s+/)[0] || '';
      return !url || isSafeManualEditRelativeOrFragmentUrl(url);
    });
  }
  return isSafeManualEditRelativeOrFragmentUrl(trimmed);
}

/** Validate URL attr values; `srcset`/`values` check each candidate URL. */
export function isSafeManualEditUrlAttrValue(attr: string, value: string): boolean {
  const lower = String(attr || '').toLowerCase();
  if (lower === 'srcset' || lower === 'imagesrcset') {
    for (const part of String(value || '').split(',')) {
      const url = part.trim().split(/\s+/)[0] || '';
      if (url && !isSafeManualEditUrl(url)) return false;
    }
    return true;
  }
  if (lower === 'archive') {
    // Space-separated legacy archive URL list.
    for (const part of String(value || '').split(/\s+/)) {
      if (part && !isSafeManualEditUrl(part)) return false;
    }
    return true;
  }
  // Form navigators — same-document relative / fragment only.
  if (lower === 'action' || lower === 'formaction') {
    return isSafeManualEditRelativeOrFragmentUrl(value);
  }
  // HTML usemap must reference a same-document map name (`#name`).
  if (lower === 'usemap') {
    return isSafeManualEditSvgResourceRef(value);
  }
  // `ping` is a whitespace-separated URL list — validate each token.
  if (lower === 'ping') {
    return String(value || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .every((part) => isSafeManualEditRelativeOrFragmentUrl(part));
  }
  if (lower === 'to' || lower === 'from' || lower === 'by' || lower === 'values') {
    // SMIL may carry bare URLs or CSS (`attributeName=style`) — reject either shape.
    // Absolute / protocol-relative / backslash tokens are relative/fragment only
    // (https://… retargets blocked). CSS paints (`color:red`, `10`) keep the
    // general isSafeManualEditUrl gate — do not treat `color:` as a URL scheme.
    // Also reject mid-token smuggling (`#ok, javascript:…`) that prefix-only
    // isSafeManualEditUrl misses after `;`-split.
    const pieces = lower === 'values' ? String(value || '').split(';') : [value];
    for (const part of pieces) {
      const piece = part.trim();
      if (!piece) continue;
      if (containsUnsafeEmbeddedCssOrScheme(piece)) return false;
      const compact = compactManualEditUrlForSchemeCheck(
        decodeHtmlCharacterReferences(piece),
      );
      if (
        /(?:javascript|vbscript|blob|file|about|filesystem|chrome(?:-extension)?|moz-extension|resource|view-source|ms-appx(?:-web)?):/i
          .test(compact)
        || /data:(?:text\/html|image\/svg\+xml)/i.test(compact)
      ) {
        return false;
      }
      const tokens = piece.split(/[\s,]+/).map((token) => token.trim()).filter(Boolean);
      const candidates = tokens.length > 0 ? tokens : [piece];
      for (const token of candidates) {
        const absoluteOrProto = /^(?:[a-z][a-z0-9+.-]*:\/\/|\/\/)/i.test(token)
          || token.includes('\\');
        if (absoluteOrProto) {
          if (!isSafeManualEditRelativeOrFragmentUrl(token)) return false;
        } else if (!isSafeManualEditUrl(token)) {
          return false;
        }
      }
    }
    return true;
  }
  return isSafeManualEditUrl(value);
}
