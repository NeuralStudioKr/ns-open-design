import { emptyManualEditStyles, MANUAL_EDIT_STYLE_PROPS, type ManualEditFields, type ManualEditPatch, type ManualEditStyles } from './types';

export interface ManualEditPatchResult {
  ok: boolean;
  source: string;
  error?: string;
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

export function applyManualEditPatch(
  source: string,
  patch: ManualEditPatch,
  scope: ManualEditSourceScope = {},
  hint?: ManualEditMergeTargetHint,
): ManualEditPatchResult {
  if (patch.kind === 'set-full-source') return { ok: true, source: patch.source };

  const doc = parseSource(source);
  if (!doc) return { ok: false, source, error: 'Could not parse source.' };

  if (patch.kind === 'set-token') {
    const changed = setCssToken(doc, patch.token, patch.value);
    return changed
      ? { ok: true, source: serializeSource(doc, source) }
      : { ok: false, source, error: `Token not found: ${patch.token}` };
  }

  const effectiveHint = hint ?? scope.targetHint;
  let el = findEditableElement(doc, patch.id, scope, effectiveHint);
  if (!el) return { ok: false, source, error: `Target not found: ${patch.id}` };

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
        // Headings/labels that only use `<br>` for line breaks have no leaf
        // element to patch. Flatten to the committed plain text instead of
        // rejecting with "Use the HTML tab instead".
        el.textContent = patch.value;
        return { ok: true, source: serializeSource(doc, source) };
      } else {
        return { ok: false, source, error: 'This element contains nested markup. Use the HTML tab instead.' };
      }
    }
    el.textContent = patch.value;
  } else if (patch.kind === 'set-link') {
    if (hasElementChildren(el)) {
      const currentText = el.textContent?.trim() ?? '';
      if (patch.text.trim() !== currentText) {
        return { ok: false, source, error: 'This link contains nested markup. Use the HTML tab to change its label.' };
      }
    } else {
      el.textContent = patch.text;
    }
    el.setAttribute('href', patch.href);
  } else if (patch.kind === 'set-image') {
    el.setAttribute('src', patch.src);
    el.setAttribute('alt', patch.alt);
  } else if (patch.kind === 'set-style') {
    setInlineStyles(el as HTMLElement, patch.styles);
  } else if (patch.kind === 'set-attributes') {
    setAttributes(el, patch.attributes);
  } else if (patch.kind === 'set-outer-html') {
    const replaced = replaceOuterHtml(doc, el, patch.html);
    if (!replaced.ok) {
      return {
        ok: false,
        source,
        error: 'error' in replaced ? replaced.error : 'Could not replace element HTML.',
      };
    }
  } else if (patch.kind === 'remove-element') {
    if (!el.parentElement) {
      return { ok: false, source, error: 'Cannot remove the root element.' };
    }
    if (el.parentElement === doc.body && doc.body.children.length === 1) {
      return { ok: false, source, error: 'Cannot remove the last element in the document.' };
    }
    el.remove();
  }

  return { ok: true, source: serializeSource(doc, source) };
}

export function readManualEditFields(
  source: string,
  id: string,
  scope: ManualEditSourceScope = {},
): ManualEditFields {
  const doc = parseSource(source);
  const el = doc ? findEditableElement(doc, id, scope) : null;
  if (!el) return {};
  const kind = inferKind(el);
  if (kind === 'link') {
    return {
      text: el.textContent?.trim() ?? '',
      href: el.getAttribute('href') ?? '',
    };
  }
  if (kind === 'image') {
    return {
      src: el.getAttribute('src') ?? '',
      alt: el.getAttribute('alt') ?? '',
    };
  }
  return { text: el.textContent?.trim() ?? '' };
}

export function readManualEditStyles(
  source: string,
  id: string,
  scope: ManualEditSourceScope = {},
): ManualEditStyles {
  const doc = parseSource(source);
  const el = doc ? findEditableElement(doc, id, scope) : null;
  if (!el) return emptyManualEditStyles();
  const style = (el as HTMLElement).style;
  return MANUAL_EDIT_STYLE_PROPS.reduce<ManualEditStyles>((acc, key) => {
    acc[key] = (style[key as unknown as keyof CSSStyleDeclaration] as string | undefined) ?? '';
    return acc;
  }, {} as ManualEditStyles);
}

export function readManualEditAttributes(
  source: string,
  id: string,
  scope: ManualEditSourceScope = {},
): Record<string, string> {
  const doc = parseSource(source);
  const el = doc ? findEditableElement(doc, id, scope) : null;
  if (!el) return {};
  const attrs: Record<string, string> = {};
  Array.from(el.attributes).forEach((attr) => {
    if (attr.name === 'data-od-runtime-id') return;
    attrs[attr.name] = attr.value;
  });
  return attrs;
}

export function readManualEditOuterHtml(
  source: string,
  id: string,
  scope: ManualEditSourceScope = {},
): string {
  const doc = parseSource(source);
  return (doc ? findEditableElement(doc, id, scope)?.outerHTML : '') ?? '';
}

/**
 * Preview srcdoc annotates unlabeled nodes with generated `path-N` ids.
 * Those attributes are NOT persisted to deck.html — only the structural
 * child-index walk (`findElementByPath`) can resolve them on disk.
 */
export function isEphemeralGeneratedPathId(id: string | null | undefined): boolean {
  return /^path-\d+(?:-\d+)*$/.test(String(id || '').trim());
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
): string | null {
  const doc = parseSource(source);
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
  const targets = new Set<Element>();
  for (const id of ids) {
    const normalized = String(id || '').trim();
    if (!normalized) continue;
    // Accept per-id hints so the full-deck guard's target masking
    // benefits from the same hint fallback the scoped merge uses.
    // Without this, a click id that no longer resolves structurally
    // masks nothing → the guard reports "target unresolved" and the
    // whole full-deck path fails while the merge path would have
    // recovered via hint.
    const hint = hints.find((candidate) => String(candidate.id || '').trim() === normalized);
    const target = findEditableElement(doc, normalized, scope, hint);
    if (target) targets.add(target);
  }
  if (targets.size === 0) {
    return { ok: false, source, reason: 'No targets found to mask.' };
  }
  let index = 0;
  for (const target of targets) {
    target.replaceWith(doc.createComment(`od-masked-comment-target:${index}`));
    index += 1;
  }
  return {
    ok: true,
    source: serializeSource(doc, source),
    maskedCount: targets.size,
  };
}

export function mergeManualEditTargetsFromSource(
  currentSource: string,
  nextSource: string,
  ids: readonly string[],
  scope: ManualEditSourceScope = {},
  hints: readonly ManualEditMergeTargetHint[] = [],
): ManualEditMergeTargetsResult {
  const currentDoc = parseSource(currentSource);
  const nextDoc = parseSource(nextSource);
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
    const currentOuter = currentTarget.outerHTML;
    const nextOuter = nextTarget.outerHTML;
    const replacement = currentDoc.importNode(nextTarget, true);
    preserveManualEditIdentityAttributes(currentTarget, replacement);
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
): ManualEditPatchResult {
  const currentDoc = parseSource(currentSource);
  const patchedDoc = parseSource(patchedSource);
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

  const replacement = currentDoc.importNode(patchedTarget, true);
  preserveManualEditIdentityAttributes(currentTarget, replacement);
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

function serializeSource(doc: Document, originalSource: string): string {
  if (!isManualEditFullHtmlDocument(originalSource)) return doc.body.innerHTML;
  return `<!doctype html>\n${doc.documentElement.outerHTML}`;
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
  if (tag === 'img') return 'image';
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
    else if (text.includes(hintText) || hintText.includes(text)) score += 80;
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
): ManualEditMergeTargetsResult {
  const currentDoc = parseSource(currentSource);
  const nextDoc = parseSource(nextSource);
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

  const replacement = currentDoc.importNode(nextTarget, true);
  preserveManualEditIdentityAttributes(currentTarget, replacement);
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
): string | null {
  const doc = parseSource(html);
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
    else if (hintText && text.includes(hintText)) score += 80;
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
  return nextCursor;
}

function preserveManualEditIdentityAttributes(currentTarget: Element, replacement: Element): void {
  for (const attr of ['data-od-id', 'data-od-runtime-id', 'data-od-source-path', 'data-od-edit', 'data-od-label']) {
    const currentValue = currentTarget.getAttribute(attr);
    if (currentValue && !replacement.getAttribute(attr)) {
      replacement.setAttribute(attr, currentValue);
    }
  }
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
    if (candidate.tagName.toLowerCase() === currentTarget.tagName.toLowerCase()) score += 25;
    for (const term of instructionTerms) {
      if (term && text.includes(term)) score += 120;
    }
    for (const token of currentTokens) {
      if (text.includes(token)) score += 12;
    }
    if (hint?.htmlHint) {
      const hintedTag = /^<\s*([a-z][a-z0-9-]*)\b/i.exec(hint.htmlHint)?.[1]?.toLowerCase();
      if (hintedTag && candidate.tagName.toLowerCase() === hintedTag) score += 12;
    }
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

function extractLikelyReplacementTerms(text: string): string[] {
  const terms = new Set<string>();
  const source = String(text || '');
  for (const match of source.matchAll(/['"“”‘’「」『』]([^'"“”‘’「」『』\n]{1,80})['"“”‘’「」『』]/g)) {
    const term = normalizeTextForCandidate(match[1] || '');
    if (term) terms.add(term);
  }
  for (const match of source.matchAll(/(?:이름|제목|텍스트|문구|내용)[^\n]{0,20}?(?:은|는|을|를)\s*([가-힣A-Za-z0-9 _.-]{2,40}?)(?:\s*(?:이야|야|로|으로|입니다|다|\.|$))/g)) {
    const term = normalizeTextForCandidate(match[1] || '');
    if (term) terms.add(term);
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
export function parseAbsoluteDomSlideSelector(
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

function setInlineStyles(el: HTMLElement, styles: Partial<ManualEditStyles>): void {
  for (const [name, value] of Object.entries(styles)) {
    const cssName = camelToKebab(name);
    if (typeof value !== 'string' || value.trim() === '') el.style.removeProperty(cssName);
    else el.style.setProperty(cssName, value.trim());
  }
}

function setAttributes(el: Element, attributes: Record<string, string>): void {
  const protectedAttrs = new Set(['data-od-id', 'data-od-edit', 'data-od-label', 'data-od-runtime-id']);
  for (const [name, value] of Object.entries(attributes)) {
    if (!isSafeAttributeName(name) || protectedAttrs.has(name)) continue;
    if (value.trim() === '') el.removeAttribute(name);
    else el.setAttribute(name, value);
  }
}

function replaceOuterHtml(doc: Document, el: Element, html: string): { ok: true } | { ok: false; error: string } {
  const template = doc.createElement('template');
  template.innerHTML = html.trim();
  // Models often emit set-outer-html bodies with sibling roots
  // (`<style>…</style><h1>…</h1>`, badge + title, etc.). Strict
  // "exactly one root" rejected those as deck_patch_merge_failed even
  // when a clear primary replacement was present — salvage first.
  const next = resolveSingleRootReplacementElement(doc, el, template);
  if (!next) {
    return { ok: false, error: 'Replacement HTML must contain exactly one root element.' };
  }
  if (el.getAttribute('data-od-id') && !next.getAttribute('data-od-id')) {
    next.setAttribute('data-od-id', el.getAttribute('data-od-id') ?? '');
  }
  if (el.getAttribute('data-od-edit') && !next.getAttribute('data-od-edit')) {
    next.setAttribute('data-od-edit', el.getAttribute('data-od-edit') ?? '');
  }
  el.replaceWith(next);
  return { ok: true };
}

const NON_CONTENT_REPLACEMENT_TAGS = new Set([
  'STYLE',
  'SCRIPT',
  'LINK',
  'META',
  'NOSCRIPT',
  'TEMPLATE',
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
  if (elements.length === 1) return elements[0]!;

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
    if (direct) return direct;
    const escaped = cssQuotedAttrValue(odId);
    for (const candidate of elements) {
      try {
        const nested = candidate.querySelector(`[data-od-id="${escaped}"]`);
        if (nested) return nested;
      } catch {
        // Invalid selector characters — fall through.
      }
    }
  }

  const contentRoots = elements.filter(
    (candidate) => !NON_CONTENT_REPLACEMENT_TAGS.has(candidate.tagName),
  );
  const pool = contentRoots.length > 0 ? contentRoots : elements;

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

function setCssToken(doc: Document, token: string, value: string): boolean {
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
  return /^[a-zA-Z_:][a-zA-Z0-9_:.-]*$/.test(value);
}
