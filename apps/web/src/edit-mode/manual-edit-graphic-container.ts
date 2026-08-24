import {
  classAttrHasDeckSlideToken,
  classAttrHasTemplateSlideAlias,
} from '@open-design/contracts';

/** Keep in sync with bridge.ts discovery + mappable checks (avoids import cycle). */
const DISCOVERY_SELECTOR = 'main, nav, section, article, header, footer, div, h1, h2, h3, p, a, button, img, svg, strong, span';

function defaultIsSourceMappable(el: Element): boolean {
  return (
    el.hasAttribute('data-od-id')
    || el.hasAttribute('data-screen-label')
    || el.hasAttribute('data-od-source-path')
  );
}

/** Flow graphic wrappers below this size stay inner-targeted (inline icons). */
export const MIN_GRAPHIC_WRAPPER_PX = 24;

/** Deck slide roots must not be selected as graphic-wrapper parents. */
export function isDeckSlideRootElement(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag !== 'section' && tag !== 'div') return false;
  const cls = ` ${typeof el.className === 'string' ? el.className : ''} `;
  if (classAttrHasDeckSlideToken(cls) || classAttrHasTemplateSlideAlias(cls)) return true;
  if (el.hasAttribute('data-slide')) return true;
  if (el.hasAttribute('data-slide-index')) return true;
  const label = el.getAttribute('data-screen-label');
  if (label != null && /^\d{2}(?:\s|$)/.test(label)) return true;
  return false;
}

export function parentHasOnlyGraphicChildren(parent: Element): boolean {
  let graphicCount = 0;
  for (const child of Array.from(parent.children)) {
    const childTag = child.tagName.toLowerCase();
    if (childTag === 'img' || childTag === 'svg') {
      graphicCount += 1;
      continue;
    }
    if (childTag === 'br' || childTag === 'wbr') continue;
    if ((child.textContent || '').replace(/\s+/g, '').length > 0) return false;
  }
  return graphicCount >= 1;
}

export function graphicWrapperPosition(
  parent: Element,
  view?: Window | null,
): string {
  return String(
  (view ?? parent.ownerDocument?.defaultView)?.getComputedStyle(parent).position ?? 'static',
  ).toLowerCase();
}

export function isGraphicWrapperHost(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  return tag === 'div' || tag === 'section' || tag === 'article';
}

export function isAnchoredGraphicWrapper(parent: Element, view?: Window | null): boolean {
  const position = graphicWrapperPosition(parent, view);
  return position === 'absolute' || position === 'fixed';
}

export function isSizedFlowGraphicWrapper(parent: Element, view?: Window | null): boolean {
  if (!isGraphicWrapperHost(parent)) return false;
  const position = graphicWrapperPosition(parent, view);
  if (position !== 'static' && position !== 'relative') return false;
  const rect = parent.getBoundingClientRect();
  if (rect.width < MIN_GRAPHIC_WRAPPER_PX || rect.height < MIN_GRAPHIC_WRAPPER_PX) return false;
  const win = view ?? parent.ownerDocument?.defaultView ?? null;
  const style = win?.getComputedStyle(parent);
  const display = String(style?.display ?? '').toLowerCase();
  if (display !== 'flex' && display !== 'inline-flex' && display !== 'grid') return false;
  const centers = (value: string) => {
    const v = value.toLowerCase();
    return v === 'center' || v === 'safe center';
  };
  return centers(String(style?.alignItems ?? '')) || centers(String(style?.justifyContent ?? ''));
}

export type GraphicContainerResolveOptions = {
  isSourceMappable?: (el: Element) => boolean;
  matchesDiscovery?: (el: Element) => boolean;
  view?: Window | null;
};

/**
 * Deck / hero icons: inline SVG/img inside a positioning wrapper.
 * Select the wrapper so move/resize applies to the whole logo box, not the
 * centered child trapped in a flex slot.
 */
export function resolveGraphicContainerTarget(
  el: Element,
  options?: GraphicContainerResolveOptions,
): Element {
  const tag = el.tagName.toLowerCase();
  if (tag !== 'img' && tag !== 'svg') return el;
  const parent = el.parentElement;
  if (!parent) return el;
  const isMappable = options?.isSourceMappable ?? defaultIsSourceMappable;
  const matchesDiscovery = options?.matchesDiscovery
    ?? ((node: Element) => node.matches(DISCOVERY_SELECTOR));
  if (!isMappable(parent) || !matchesDiscovery(parent)) return el;
  if (isDeckSlideRootElement(parent)) return el;
  if (!parentHasOnlyGraphicChildren(parent)) return el;
  const view = options?.view ?? parent.ownerDocument?.defaultView ?? null;
  if (!isAnchoredGraphicWrapper(parent, view) && !isSizedFlowGraphicWrapper(parent, view)) {
    return el;
  }
  return parent;
}

/**
 * Injected into the iframe bridge — keep in sync with the TS helpers above.
 * Tests in manual-edit-graphic-container.test.ts guard drift.
 */
export function buildGraphicContainerBridgeSnippet(): string {
  return `
  function isDeckSlideClassToken(token){
    token = String(token || '').trim().toLowerCase();
    if (!token) return false;
    if (token === 'slide' || token === 'ppt-slide' || token === 'deck-slide' || token === 'slide-frame') return true;
    if (/^slide-\\d+$/.test(token) || /^s(?:-[a-z0-9_-]+|\\d+)$/.test(token)) return true;
    return false;
  }
  function isDeckSlideRootEl(el){
    if (!el || !el.tagName) return false;
    var tag = el.tagName.toLowerCase();
    if (tag !== 'section' && tag !== 'div') return false;
    var cls = typeof el.className === 'string' ? el.className : '';
    var tokens = cls.split(/\\s+/);
    for (var i = 0; i < tokens.length; i++) {
      if (isDeckSlideClassToken(tokens[i])) return true;
    }
    if (el.getAttribute('data-slide') != null) return true;
    if (el.getAttribute('data-slide-index') != null) return true;
    var label = el.getAttribute('data-screen-label');
    if (label && /^\\d{2}(?:\\s|$)/.test(label)) return true;
    return false;
  }
  function parentHasOnlyGraphicChildren(parent){
    var kids = parent.children;
    var graphicCount = 0;
    for (var gi = 0; gi < kids.length; gi++) {
      var childTag = kids[gi].tagName ? kids[gi].tagName.toLowerCase() : '';
      if (childTag === 'img' || childTag === 'svg') { graphicCount++; continue; }
      if (childTag === 'br' || childTag === 'wbr') continue;
      if ((kids[gi].textContent || '').replace(/\\s+/g, '').length > 0) return false;
    }
    return graphicCount >= 1;
  }
  function isGraphicWrapperHost(parent){
    var tag = parent.tagName ? parent.tagName.toLowerCase() : '';
    return tag === 'div' || tag === 'section' || tag === 'article';
  }
  function isAnchoredGraphicWrapper(parent){
    var pos = (window.getComputedStyle(parent).position || 'static').toLowerCase();
    return pos === 'absolute' || pos === 'fixed';
  }
  function isSizedFlowGraphicWrapper(parent){
    if (!isGraphicWrapperHost(parent)) return false;
    var pos = (window.getComputedStyle(parent).position || 'static').toLowerCase();
    if (pos !== 'static' && pos !== 'relative') return false;
    var rect = parent.getBoundingClientRect();
    if (rect.width < ${MIN_GRAPHIC_WRAPPER_PX} || rect.height < ${MIN_GRAPHIC_WRAPPER_PX}) return false;
    var style = window.getComputedStyle(parent);
    var display = (style.display || '').toLowerCase();
    if (display !== 'flex' && display !== 'inline-flex' && display !== 'grid') return false;
    var align = (style.alignItems || '').toLowerCase();
    var justify = (style.justifyContent || '').toLowerCase();
    var centers = function(v){ return v === 'center' || v === 'safe center'; };
    return centers(align) || centers(justify);
  }
  function resolveGraphicContainerTarget(el){
    if (!el || !el.tagName) return el;
    var tag = el.tagName.toLowerCase();
    if (tag !== 'img' && tag !== 'svg') return el;
    var parent = el.parentElement;
    if (!parent) return el;
    if (!isSourceMappable(parent) || !isDiscoveryTarget(parent)) return el;
    if (isDeckSlideRootEl(parent)) return el;
    if (!parentHasOnlyGraphicChildren(parent)) return el;
    if (!isAnchoredGraphicWrapper(parent) && !isSizedFlowGraphicWrapper(parent)) return el;
    return parent;
  }`;
}
