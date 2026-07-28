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

export interface ManualEditSourceScope {
  /** Zero-based deck slide index. When present, element lookup is limited to that slide. */
  slideIndex?: number;
}

type ManualEditLookupRoot = (ParentNode & Element) | Document;

export function applyManualEditPatch(
  source: string,
  patch: ManualEditPatch,
  scope: ManualEditSourceScope = {},
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

  const el = findEditableElement(doc, patch.id, scope);
  if (!el) return { ok: false, source, error: `Target not found: ${patch.id}` };

  if (patch.kind === 'set-text') {
    if (hasElementChildren(el)) {
      return { ok: false, source, error: 'This element contains nested markup. Use the HTML tab instead.' };
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

export function maskManualEditTargets(
  source: string,
  ids: readonly string[],
  scope: ManualEditSourceScope = {},
): ManualEditMaskTargetsResult {
  const doc = parseSource(source);
  if (!doc) return { ok: false, source, reason: 'Could not parse source.' };
  const targets = new Set<Element>();
  for (const id of ids) {
    const normalized = String(id || '').trim();
    if (!normalized) continue;
    const target = findEditableElement(doc, normalized, scope);
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
    const currentTarget = findEditableElement(currentDoc, id, scope);
    const nextTarget = currentTarget
      ? findEditableElement(nextDoc, id, scope)
        ?? findEquivalentElementByScopedPosition(currentDoc, nextDoc, currentTarget, scope)
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

function findEditableElement(
  doc: Document,
  id: string,
  scope: ManualEditSourceScope = {},
): Element | null {
  const root = findScopedRoot(doc, scope);
  if (!root) return null;
  if (id === '__body__') return root.nodeType === 9 ? (root as Document).body : root as Element;
  const domFallback = findElementByDomSelector(doc, root, id);
  if (domFallback) return domFallback;
  return (
    root.querySelector(`[data-od-id="${cssEscape(id)}"]`) ??
    root.querySelector(`[data-od-runtime-id="${cssEscape(id)}"]`) ??
    root.querySelector(`[data-od-source-path="${cssEscape(id)}"]`) ??
    findElementByPath(root, id)
  );
}

function findScopedRoot(doc: Document, scope: ManualEditSourceScope): ManualEditLookupRoot | null {
  const slideIndex = scope.slideIndex;
  if (!(typeof slideIndex === 'number' && Number.isFinite(slideIndex) && slideIndex >= 0)) return doc;
  const index = Math.floor(slideIndex);
  const explicit = doc.querySelector(`[data-slide-index="${index}"]`);
  if (explicit) return explicit;
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

function findElementByDomSelector(
  doc: Document,
  root: ManualEditLookupRoot,
  id: string,
): Element | null {
  if (!id.startsWith('dom:')) return null;
  const selector = id.slice('dom:'.length).trim();
  if (!selector.startsWith('body > ') || /[<{}]/.test(selector)) return null;
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

function findElementByDomSelectorPath(
  doc: Document,
  root: ManualEditLookupRoot,
  selector: string,
): Element | null {
  const segments = selector
    .slice('body > '.length)
    .split(' > ')
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length === 0) return null;
  let current: Element | null = doc.body;
  for (const segment of segments) {
    const match = /^([a-z][a-z0-9-]*):nth-of-type\(([1-9][0-9]*)\)$/i.exec(segment);
    if (!match || !current) return null;
    const tagRaw = match[1];
    const ordinalRaw = match[2];
    if (tagRaw === undefined || ordinalRaw === undefined) return null;
    const tag = tagRaw.toLowerCase();
    const ordinal = Number(ordinalRaw);
    let seen = 0;
    let next: Element | null = null;
    for (const child of Array.from(current.children)) {
      if (child.tagName.toLowerCase() !== tag) continue;
      seen += 1;
      if (seen === ordinal) {
        next = child;
        break;
      }
    }
    current = next;
  }
  if (!current || current === doc.body || current === doc.documentElement) return null;
  if (root.nodeType === 9) return current;
  return (root as Element).contains(current) ? current : null;
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

function hasElementChildren(el: Element): boolean {
  return Array.from(el.children).some((child) => child.nodeType === 1);
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
  const elements = Array.from(template.content.children);
  if (elements.length !== 1) return { ok: false, error: 'Replacement HTML must contain exactly one root element.' };
  const next = elements[0]!;
  if (el.getAttribute('data-od-id') && !next.getAttribute('data-od-id')) {
    next.setAttribute('data-od-id', el.getAttribute('data-od-id') ?? '');
  }
  if (el.getAttribute('data-od-edit') && !next.getAttribute('data-od-edit')) {
    next.setAttribute('data-od-edit', el.getAttribute('data-od-edit') ?? '');
  }
  el.replaceWith(next);
  return { ok: true };
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function camelToKebab(value: string): string {
  return value.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}

function isSafeAttributeName(value: string): boolean {
  return /^[a-zA-Z_:][a-zA-Z0-9_:.-]*$/.test(value);
}
