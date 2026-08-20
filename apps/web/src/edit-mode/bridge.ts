import {
  buildGraphicContainerBridgeSnippet,
  isDeckSlideRootElement,
  resolveGraphicContainerTarget,
} from './manual-edit-graphic-container';

export { isDeckSlideRootElement, resolveGraphicContainerTarget };

export const MANUAL_EDIT_DISCOVERY_SELECTOR = 'main, nav, section, article, header, footer, div, h1, h2, h3, p, a, button, img, svg, strong, span';

export const MANUAL_EDIT_SOURCE_PATH_ATTR = 'data-od-source-path';
export const MANUAL_EDIT_SCREEN_LABEL_ATTR = 'data-screen-label';
export const MANUAL_EDIT_HOST_NODE_SELECTOR = [
  '[data-od-sandbox-shim]',
  '[data-od-deck-bridge]',
  '[data-od-comment-bridge]',
  '[data-od-edit-bridge]',
  '[data-od-comment-bridge-style]',
  '[data-od-edit-bridge-style]',
  '[data-od-deck-fix]',
].join(',');

export function manualEditDomPathForElement(el: Element): string {
  const parts: number[] = [];
  let node: Element | null = el;
  while (node && node !== node.ownerDocument.body) {
    const parentEl: Element | null = node.parentElement;
    if (!parentEl) break;
    const children = Array.from(parentEl.children).filter((child) => !isManualEditHostNode(child));
    parts.unshift(children.indexOf(node));
    node = parentEl;
  }
  return parts.length ? `path-${parts.join('-')}` : '';
}

export function isManualEditHostNode(el: Element): boolean {
  return el.matches(MANUAL_EDIT_HOST_NODE_SELECTOR);
}

export function manualEditStableIdForElement(el: Element): string {
  const explicit = el.getAttribute('data-od-id');
  if (explicit) return explicit;
  const screenLabel = el.getAttribute(MANUAL_EDIT_SCREEN_LABEL_ATTR);
  if (screenLabel) return screenLabel;
  const generated = el.getAttribute(MANUAL_EDIT_SOURCE_PATH_ATTR) || el.getAttribute('data-od-runtime-id') || manualEditDomPathForElement(el);
  if (generated) el.setAttribute('data-od-runtime-id', generated);
  return generated || 'unknown';
}

export function isMeaningfulManualEditElement(el: Element, rect: Pick<DOMRect, 'width' | 'height'>): boolean {
  return isSourceMappableManualEditElement(el) && el.matches(MANUAL_EDIT_DISCOVERY_SELECTOR) && rect.width >= 4 && rect.height >= 4;
}

export function isSourceMappableManualEditElement(el: Element): boolean {
  return (
    el.hasAttribute('data-od-id')
    || el.hasAttribute(MANUAL_EDIT_SCREEN_LABEL_ATTR)
    || el.hasAttribute(MANUAL_EDIT_SOURCE_PATH_ATTR)
  );
}

export function buildManualEditBridge(enabled: boolean): string {
  const graphicContainerSnippet = buildGraphicContainerBridgeSnippet();
  return `<script data-od-edit-bridge>(function(){
  var enabled = ${JSON.stringify(enabled)};
  var discoverySelector = ${JSON.stringify(MANUAL_EDIT_DISCOVERY_SELECTOR)};
  var hostNodeSelector = ${JSON.stringify(MANUAL_EDIT_HOST_NODE_SELECTOR)};
  var sourcePathAttr = ${JSON.stringify(MANUAL_EDIT_SOURCE_PATH_ATTR)};
  var screenLabelAttr = ${JSON.stringify(MANUAL_EDIT_SCREEN_LABEL_ATTR)};
  var styleProps = ['fontFamily','fontSize','fontWeight','color','display','textAlign','textDecoration','whiteSpace','lineHeight','letterSpacing','width','height','minHeight','maxWidth','maxHeight','position','left','top','right','bottom','gap','flexDirection','justifyContent','alignItems','backgroundColor','opacity','padding','paddingTop','paddingRight','paddingBottom','paddingLeft','margin','marginTop','marginRight','marginBottom','marginLeft','border','borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth','borderStyle','borderColor','borderRadius','zIndex'];
  function isHostNode(el){
    return !!(el && el.matches && el.matches(hostNodeSelector));
  }
  function domPath(el){
    var parts = [];
    var node = el;
    while (node && node !== document.body) {
      var parent = node.parentElement;
      if (!parent) break;
      var children = Array.prototype.slice.call(parent.children).filter(function(child){ return !isHostNode(child); });
      parts.unshift(children.indexOf(node));
      node = parent;
    }
    return parts.length ? 'path-' + parts.join('-') : '';
  }
  function stableId(el){
    var explicit = el.getAttribute('data-od-id');
    if (explicit) return explicit;
    var screenLabel = el.getAttribute(screenLabelAttr);
    if (screenLabel) return screenLabel;
    var generated = el.getAttribute(sourcePathAttr) || el.getAttribute('data-od-runtime-id') || domPath(el);
    if (generated) el.setAttribute('data-od-runtime-id', generated);
    return generated || 'unknown';
  }
  function isSourceMappable(el){
    return !!(el && el.hasAttribute && (
      el.hasAttribute('data-od-id')
      || el.hasAttribute(screenLabelAttr)
      || el.hasAttribute(sourcePathAttr)
    ));
  }
  function isDiscoveryTarget(el){
    return !!(el && el.matches && el.matches(discoverySelector));
  }
  ${graphicContainerSnippet}
  function inferKind(el){
    var explicit = el.getAttribute('data-od-edit');
    if (explicit) return explicit;
    var tag = el.tagName ? el.tagName.toLowerCase() : '';
    if (tag === 'a') return 'link';
    if (tag === 'img' || tag === 'svg') return 'image';
    if (['section','main','nav','div','article','header','footer'].indexOf(tag) >= 0) return 'container';
    return 'text';
  }
  function labelFor(el, id, kind){
    var explicit = el.getAttribute('data-od-label');
    if (explicit) return explicit;
    var tag = el.tagName ? el.tagName.toLowerCase() : 'element';
    var text = (el.textContent || '').replace(/\\s+/g, ' ').trim();
    if (text) return text.slice(0, 42);
    if (kind === 'image') return el.getAttribute('alt') || id;
    return tag + ' #' + id;
  }
  function attrsFor(el){
    var attrs = {};
    for (var i = 0; i < el.attributes.length; i++) {
      var attr = el.attributes[i];
      if (!attr || attr.name.indexOf('data-od-runtime') === 0 || attr.name === 'data-od-edit-selected' || attr.name === 'data-od-edit-host-chrome') continue;
      attrs[attr.name] = attr.value;
    }
    return attrs;
  }
  // Geometry must stay authored/inline-only so Esc / flush-fail rollback
  // removeProperty instead of baking computed px (!important) over %/auto CSS.
  // Typography/paint still fall back to computed for the inspector.
  var geometryStyleProps = {
    display:1, width:1, height:1, minHeight:1, maxWidth:1, maxHeight:1, position:1,
    left:1, top:1, right:1, bottom:1, zIndex:1,
    margin:1, marginTop:1, marginRight:1, marginBottom:1, marginLeft:1,
    padding:1, paddingTop:1, paddingRight:1, paddingBottom:1, paddingLeft:1,
    gap:1, flexDirection:1, justifyContent:1, alignItems:1,
    border:1, borderTopWidth:1, borderRightWidth:1, borderBottomWidth:1, borderLeftWidth:1,
    borderStyle:1, borderColor:1, borderRadius:1,
  };
  function stylesFor(el){
    var computed = window.getComputedStyle(el);
    var styles = {};
    styleProps.forEach(function(prop){
      var inline = el.style[prop] || '';
      if (geometryStyleProps[prop]) styles[prop] = inline;
      else styles[prop] = inline || computed[prop] || '';
    });
    return styles;
  }
  function isLayoutContainer(el){
    var display = window.getComputedStyle(el).display || '';
    if (display.indexOf('flex') >= 0 || display.indexOf('grid') >= 0) return true;
    return hasOwnDisplayHiddenState(el) && inferKind(el) === 'container';
  }
  function hasOwnDisplayHiddenState(el){
    var computed = window.getComputedStyle(el);
    return computed.display === 'none' || el.hasAttribute('hidden');
  }
  function hasHiddenAncestorDisplayState(el){
    var node = el;
    while (node && node !== document.documentElement) {
      if (hasOwnDisplayHiddenState(node)) return true;
      node = node.parentElement;
    }
    return false;
  }
  function isHiddenTarget(el, rect){
    var targetVisibility = window.getComputedStyle(el).visibility;
    if (targetVisibility === 'hidden' || targetVisibility === 'collapse') return true;
    return hasHiddenAncestorDisplayState(el);
  }
  function plainTextFrom(el){
    // Preserve intentional line breaks: <br> → \\n.
    // textContent alone collapses <br> away (e.g. "A<br>B" → "AB").
    var out = '';
    function walk(node){
      if (!node) return;
      if (node.nodeType === 3) { out += node.nodeValue || ''; return; }
      if (node.nodeType !== 1) return;
      var tag = (node.tagName || '').toLowerCase();
      if (tag === 'br') { out += '\\n'; return; }
      var child = node.firstChild;
      while (child) { walk(child); child = child.nextSibling; }
    }
    walk(el);
    return out.replace(/\\r\\n/g, '\\n').replace(/\\r/g, '\\n');
  }
  // Absolute CB: positioned ancestor OR transform/filter/perspective/contain.
  // Fixed CB: viewport unless a transform-like ancestor traps it (CSS2.1/CSS transforms).
  function isTransformContainingBlock(style){
    if (!style) return false;
    if (style.transform && style.transform !== 'none') return true;
    if (style.perspective && style.perspective !== 'none') return true;
    if (style.filter && style.filter !== 'none') return true;
    if (style.backdropFilter && style.backdropFilter !== 'none') return true;
    var contain = String(style.contain || '');
    if (/\\b(paint|layout|strict|content)\\b/.test(contain)) return true;
    var willChange = String(style.willChange || '');
    if (/\\b(transform|perspective|filter|backdrop-filter)\\b/.test(willChange)) return true;
    return false;
  }
  function isAbsoluteContainingBlock(style){
    var pos = style && style.position ? style.position : '';
    if (pos && pos !== 'static') return true;
    return isTransformContainingBlock(style);
  }
  // Sticky containing block = nearest scrollport (overflow not visible).
  function isScrollport(style){
    if (!style) return false;
    function axis(v){
      v = String(v || '').toLowerCase();
      return v === 'auto' || v === 'scroll' || v === 'overlay' || v === 'hidden';
    }
    return axis(style.overflowY) || axis(style.overflowX) || axis(style.overflow);
  }
  function findNearestScrollport(el){
    var node = el && el.parentElement;
    while (node && node !== document.documentElement) {
      if (isScrollport(window.getComputedStyle(node))) return node;
      node = node.parentElement;
    }
    return null;
  }
  // Sticky→absolute: prefer scrollport as CB (pin position:relative when static)
  // so left/top stay content-relative and further scrolling moves the box.
  function stickyPromoteContainingBlock(el){
    var scrollport = findNearestScrollport(el);
    if (!scrollport) return null;
    var node = el.parentElement;
    while (node && node !== scrollport) {
      if (isAbsoluteContainingBlock(window.getComputedStyle(node))) return node;
      node = node.parentElement;
    }
    return scrollport;
  }
  function ensureStickyScrollportContainingBlock(el){
    var scrollport = findNearestScrollport(el);
    if (!scrollport) return null;
    var node = el.parentElement;
    while (node && node !== scrollport) {
      if (isAbsoluteContainingBlock(window.getComputedStyle(node))) return null;
      node = node.parentElement;
    }
    var spStyle = window.getComputedStyle(scrollport);
    if (isAbsoluteContainingBlock(spStyle)) return null;
    scrollport.style.setProperty('position', 'relative', 'important');
    scrollport.setAttribute('data-od-sticky-scrollport-cb', '1');
    return scrollport;
  }
  function clearStickyScrollportContainingBlock(el){
    var node = el && el.parentElement;
    while (node && node !== document.documentElement) {
      if (node.getAttribute && node.getAttribute('data-od-sticky-scrollport-cb') === '1') {
        node.style.removeProperty('position');
        node.removeAttribute('data-od-sticky-scrollport-cb');
        return;
      }
      node = node.parentElement;
    }
  }
  // Post-promote / nested absolute left/top origin (not pre-promote offsetParent).
  function promoteCoords(el){
    var rect = el.getBoundingClientRect();
    var parent = null;
    var node = el.parentElement;
    var selfPos = (window.getComputedStyle(el).position || 'static');
    var isFixed = selfPos === 'fixed';
    if (selfPos === 'sticky') {
      parent = stickyPromoteContainingBlock(el);
    }
    if (!parent) {
      while (node && node !== document.documentElement) {
        var style = window.getComputedStyle(node);
        if (isFixed ? isTransformContainingBlock(style) : isAbsoluteContainingBlock(style)) {
          parent = node;
          break;
        }
        node = node.parentElement;
      }
    }
    if (!parent) parent = document.documentElement;
    var pr = parent.getBoundingClientRect();
    return {
      left: Math.round(rect.left - pr.left - (parent.clientLeft || 0) + (parent.scrollLeft || 0)),
      top: Math.round(rect.top - pr.top - (parent.clientTop || 0) + (parent.scrollTop || 0)),
    };
  }
  function stickyScrollportIdFor(el){
    if ((window.getComputedStyle(el).position || 'static') !== 'sticky') return '';
    var scrollport = findNearestScrollport(el);
    if (!scrollport) return '';
    var node = el.parentElement;
    while (node && node !== scrollport) {
      if (isAbsoluteContainingBlock(window.getComputedStyle(node))) return '';
      node = node.parentElement;
    }
    if (isAbsoluteContainingBlock(window.getComputedStyle(scrollport))) return '';
    return stableId(scrollport);
  }
  function slideIndexFor(el){
    var node = el;
    while (node && node !== document.documentElement) {
      if (node.getAttribute) {
        var raw = node.getAttribute('data-slide-index');
        if (raw != null && raw !== '') {
          var idx = parseInt(raw, 10);
          if (Number.isFinite(idx) && idx >= 0) return idx;
        }
      }
      node = node.parentElement;
    }
    return undefined;
  }
  function readPositionedZIndex(el){
    var cs = window.getComputedStyle(el);
    var pos = (cs.position || 'static').toLowerCase();
    if (pos !== 'absolute' && pos !== 'fixed' && pos !== 'relative' && pos !== 'sticky' && pos !== 'static') return 0;
    var raw = cs.zIndex;
    if (!raw || raw === 'auto') return 0;
    var parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  function stackMetaFor(el){
    var parent = el.parentElement;
    var parentKey = '';
    var parentSiblingIndex = 0;
    var parentStackZ = 0;
    if (parent && parent !== document.documentElement) {
      parentKey = stableId(parent);
      if (parent.parentElement) {
        parentSiblingIndex = Array.prototype.indexOf.call(parent.parentElement.children, parent);
      }
      parentStackZ = readPositionedZIndex(parent);
    }
    return {
      parentKey: parentKey,
      parentSiblingIndex: parentSiblingIndex,
      parentStackZ: parentStackZ,
      stackZ: readPositionedZIndex(el),
      siblingIndex: parent ? Array.prototype.indexOf.call(parent.children, el) : 0,
    };
  }
  function targetFrom(el, includeOuterHtml){
    var rect = el.getBoundingClientRect();
    var kind = inferKind(el);
    var id = stableId(el);
    var hidden = isHiddenTarget(el, rect);
    var promo = promoteCoords(el);
    var stickyScrollportId = stickyScrollportIdFor(el);
    var fields = {};
    if (kind === 'link') {
      fields.text = plainTextFrom(el);
      fields.href = el.getAttribute('href') || '';
    } else if (kind === 'image') {
      fields.src = el.getAttribute('src') || '';
      fields.alt = el.getAttribute('alt') || '';
    } else {
      fields.text = plainTextFrom(el);
    }
    // Layout border-box for CSS width/height writes. getBoundingClientRect
    // follows ancestor transforms (deck-stage fit scale) and must not be
    // persisted as width — that shrinks the box on first resize preview.
    var layoutW = Math.round(Math.max(1, el.offsetWidth || 0));
    var layoutH = Math.round(Math.max(1, el.offsetHeight || 0));
    var stackMeta = stackMetaFor(el);
    var target = {
      id: id,
      kind: kind,
      label: labelFor(el, id, kind),
      tagName: el.tagName ? el.tagName.toLowerCase() : 'element',
      className: typeof el.className === 'string' ? el.className : '',
      text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 180),
      rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
      layoutWidth: layoutW,
      layoutHeight: layoutH,
      fields: fields,
      attributes: attrsFor(el),
      styles: stylesFor(el),
      isLayoutContainer: isLayoutContainer(el),
      isHidden: hidden,
      cssPosition: (window.getComputedStyle(el).position || 'static'),
      offsetLeft: promo.left,
      offsetTop: promo.top,
      parentKey: stackMeta.parentKey,
      parentSiblingIndex: stackMeta.parentSiblingIndex,
      parentStackZ: stackMeta.parentStackZ,
      stackZ: stackMeta.stackZ,
      siblingIndex: stackMeta.siblingIndex,
      outerHtml: includeOuterHtml ? (el.outerHTML || '').replace(/\\sdata-od-runtime-id="[^"]*"/g, '').replace(/\\sdata-od-source-path="[^"]*"/g, '').replace(/\\sdata-od-edit-selected="[^"]*"/g, '').replace(/\\sdata-od-edit-host-chrome="[^"]*"/g, '') : ''
    };
    if (stickyScrollportId) target.stickyScrollportId = stickyScrollportId;
    var slideIndex = slideIndexFor(el);
    if (slideIndex !== undefined) target.slideIndex = slideIndex;
    return target;
  }
  function markGraphicWrapperHints(){
    var marked = document.querySelectorAll('[data-od-edit-graphic-wrapper]');
    for (var mi = 0; mi < marked.length; mi++) {
      marked[mi].removeAttribute('data-od-edit-graphic-wrapper');
    }
    if (!enabled) return;
    var nodes = document.body ? document.body.querySelectorAll(discoverySelector) : [];
    for (var ni = 0; ni < nodes.length; ni++) {
      var node = nodes[ni];
      var ntag = node.tagName ? node.tagName.toLowerCase() : '';
      if (ntag !== 'img' && ntag !== 'svg') continue;
      var wrap = resolveGraphicContainerTarget(node);
      if (wrap && wrap !== node) wrap.setAttribute('data-od-edit-graphic-wrapper', 'true');
    }
  }
  function allTargets(){
    var nodes = document.body ? document.body.querySelectorAll(discoverySelector) : [];
    var targets = [];
    var seenIds = Object.create(null);
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (!isSourceMappable(node)) continue;
      var resolved = resolveGraphicContainerTarget(node);
      var nodeTag = node.tagName ? node.tagName.toLowerCase() : '';
      if ((nodeTag === 'img' || nodeTag === 'svg') && resolved !== node) continue;
      var rect = resolved.getBoundingClientRect();
      if (!isHiddenTarget(resolved, rect) && (rect.width < 4 || rect.height < 4)) continue;
      var rid = stableId(resolved);
      if (seenIds[rid]) continue;
      seenIds[rid] = 1;
      targets.push(targetFrom(resolved, false));
    }
    return targets;
  }
  function postTargets(){
    if (!enabled) return;
    markGraphicWrapperHints();
    window.parent.postMessage({ type: 'od-edit-targets', targets: allTargets() }, '*');
  }
  var lastHoverId = null;
  function postHoverTarget(el){
    if (!enabled || !el) return;
    var id = stableId(el);
    if (id === lastHoverId) return;
    lastHoverId = id;
    window.parent.postMessage({ type: 'od-edit-hover', target: targetFrom(el, true) }, '*');
  }
  function clearSelectedTarget(){
    var selected = document.querySelectorAll('[data-od-edit-selected]');
    for (var i = 0; i < selected.length; i++) {
      selected[i].removeAttribute('data-od-edit-selected');
      selected[i].removeAttribute('data-od-edit-host-chrome');
      selected[i].removeAttribute('data-od-edit-primary');
    }
  }
  function setSelectedTarget(id, hostChrome){
    clearSelectedTarget();
    if (!id) return;
    var el = findById(id);
    if (!el) return;
    el.setAttribute('data-od-edit-selected', 'true');
    // Host resize/move overlay already paints the selection ring — suppress the
    // iframe outline/glow so users do not see a double border.
    if (hostChrome) el.setAttribute('data-od-edit-host-chrome', 'true');
  }
  function setSelectedTargets(ids, primaryId, hostChrome){
    clearSelectedTarget();
    if (!ids || !ids.length) return;
    for (var i = 0; i < ids.length; i++) {
      var sid = ids[i];
      var el = findById(sid);
      if (!el) continue;
      el.setAttribute('data-od-edit-selected', 'true');
      if (sid === primaryId) {
        el.setAttribute('data-od-edit-primary', 'true');
        if (hostChrome) el.setAttribute('data-od-edit-host-chrome', 'true');
      }
    }
  }
  function isVisibleHitTarget(el){
    if (!el || el === document.body || el === document.documentElement) return false;
    try {
      var cs = window.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    } catch (e) {}
    return true;
  }
  function pickMappableTargetFrom(el){
    while (el && el !== document.documentElement) {
      if (
        el !== document.body
        && el !== document.documentElement
        && isVisibleHitTarget(el)
        && isSourceMappable(el)
        && isDiscoveryTarget(el)
      ) {
        return resolveGraphicContainerTarget(el);
      }
      el = el.parentElement;
    }
    return null;
  }
  function pickTargetAtPoint(x, y){
    var candidates = [];
    if (typeof document.elementsFromPoint === 'function') {
      try { candidates = document.elementsFromPoint(x, y); } catch (e) { candidates = []; }
    }
    if (!candidates || candidates.length === 0) {
      var fallback = document.elementFromPoint(x, y);
      if (fallback) candidates = [fallback];
    }
    for (var i = 0; i < candidates.length; i++) {
      var hit = pickMappableTargetFrom(candidates[i]);
      if (hit) return hit;
    }
    return null;
  }
  function closestTarget(event){
    var fromTarget = pickMappableTargetFrom(event.target);
    var x = event.clientX;
    var y = event.clientY;
    if (typeof x === 'number' && typeof y === 'number' && typeof document.elementsFromPoint === 'function') {
      var fromPoint = pickTargetAtPoint(x, y);
      if (fromPoint) {
        if (!fromTarget) return fromPoint;
        if (fromPoint !== fromTarget && fromTarget.contains && fromTarget.contains(fromPoint)) {
          var resolvedPoint = resolveGraphicContainerTarget(fromPoint);
          return resolvedPoint !== fromPoint ? resolvedPoint : fromPoint;
        }
      }
    }
    return fromTarget;
  }
  function caretRangeFromClick(clickEvent){
    if (!clickEvent) return null;
    try {
      if (document.caretPositionFromPoint) {
        var position = document.caretPositionFromPoint(clickEvent.clientX, clickEvent.clientY);
        if (!position) return null;
        var positionRange = document.createRange();
        positionRange.setStart(position.offsetNode, position.offset);
        positionRange.collapse(true);
        return positionRange;
      }
      if (document.caretRangeFromPoint) {
        return document.caretRangeFromPoint(clickEvent.clientX, clickEvent.clientY);
      }
    } catch (e) {}
    return null;
  }
  function placeCaretFromClick(clickEvent, el){
    var range = caretRangeFromClick(clickEvent);
    if (!range) {
      range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
    }
    try {
      var sel = window.getSelection();
      if (!sel) return;
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (e) {}
  }
  function makeEditable(el, clickEvent){
    if (!el || el.getAttribute('contenteditable') === 'true') return;
    var originalHtml = el.innerHTML;
    var originalText = plainTextFrom(el);
    clearSelectedTarget();
    el.setAttribute('contenteditable', 'plaintext-only');
    el.setAttribute('data-od-editing', 'true');
    try { el.focus(); } catch (e) {}
    placeCaretFromClick(clickEvent, el);
    try {
      window.parent.postMessage({ type: 'od-edit-text-active', active: true }, '*');
    } catch (e) {}
    function finish(commit){
      el.removeAttribute('contenteditable');
      el.removeAttribute('data-od-editing');
      el.removeEventListener('blur', onBlur);
      el.removeEventListener('keydown', onKeyCapture, true);
      el.removeEventListener('keydown', onKey);
      try {
        window.parent.postMessage({ type: 'od-edit-text-active', active: false }, '*');
      } catch (e) {}
      // Do not .trim() — that silently drops leading/trailing newlines the
      // user kept. Only normalize newline shape for a stable compare/commit.
      var value = plainTextFrom(el);
      if (commit && value !== originalText) {
        window.parent.postMessage({
          type: 'od-edit-text-commit',
          id: stableId(el),
          value: value,
          flattenNestedMarkup: true
        }, '*');
      } else if (!commit) {
        el.innerHTML = originalHtml;
      }
    }
    function onBlur(){ finish(true); }
    function onKeyCapture(ev){
      if (
        ev.key === 'ArrowLeft' || ev.key === 'ArrowRight' || ev.key === 'ArrowUp' || ev.key === 'ArrowDown'
        || ev.key === 'Home' || ev.key === 'End' || ev.key === 'PageUp' || ev.key === 'PageDown'
      ) {
        ev.stopImmediatePropagation();
      }
    }
    function onKey(ev){
      // Enter inserts a newline (contenteditable default). Commit with
      // Cmd/Ctrl+Enter or by blurring (click outside). Escape cancels.
      if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) {
        ev.preventDefault();
        finish(true);
        try { el.blur(); } catch (e) {}
        return;
      }
      if (ev.key === 'Escape') {
        ev.preventDefault();
        finish(false);
        try { el.blur(); } catch (e) {}
      }
    }
    el.addEventListener('blur', onBlur);
    el.addEventListener('keydown', onKeyCapture, true);
    el.addEventListener('keydown', onKey);
  }
  function camelToKebab(name){ return String(name).replace(/[A-Z]/g, function(m){ return '-' + m.toLowerCase(); }); }
  function cssEscapeId(value){ if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(value); return String(value).replace(/"/g, '\\\\"'); }
  function findById(id){
    if (!id) return null;
    if (id === '__body__') return document.body;
    var el = document.querySelector('[data-od-id="' + cssEscapeId(id) + '"]')
          || document.querySelector('[' + screenLabelAttr + '="' + cssEscapeId(id) + '"]')
          || document.querySelector('[data-od-runtime-id="' + cssEscapeId(id) + '"]')
          || document.querySelector('[' + sourcePathAttr + '="' + cssEscapeId(id) + '"]');
    if (el) return el;
    if (typeof id === 'string' && id.indexOf('path-') === 0) {
      var parts = id.slice('path-'.length).split('-').map(function(s){ return Number(s); });
      var node = document.body;
      for (var i = 0; i < parts.length; i++) {
        if (!node) return null;
        var idx = parts[i];
        if (!Number.isInteger(idx) || idx < 0) return null;
        var children = Array.prototype.slice.call(node.children).filter(function(c){ return !isHostNode(c); });
        node = children[idx] || null;
      }
      return node;
    }
    return null;
  }
  var unitlessStyleProps = { fontWeight:1, opacity:1, lineHeight:1, zIndex:1, flex:1, flexGrow:1, flexShrink:1, order:1 };
  function coercePreviewStyleValue(key, value){
    if (typeof value === 'number' && isFinite(value)) {
      return unitlessStyleProps[key] ? String(value) : (String(value) + 'px');
    }
    if (typeof value !== 'string') return null;
    var trimmed = value.trim();
    if (trimmed === '') return '';
    if (!unitlessStyleProps[key] && /^-?\\d+(\\.\\d+)?$/.test(trimmed)) return trimmed + 'px';
    return trimmed;
  }
  function applyPreviewStyles(id, styles, version){
    var el = findById(id);
    if (!el) {
      window.parent.postMessage({ type: 'od-edit-preview-style-applied', id: id || '', version: Number(version) || 0, ok: false, error: 'Target not found' }, '*');
      return;
    }
    var allowed = Object.create(null);
    for (var p = 0; p < styleProps.length; p++) allowed[styleProps[p]] = 1;
    var keys = Object.keys(styles || {});
    try {
      var nextPosition = Object.prototype.hasOwnProperty.call(styles || {}, 'position')
        ? String((styles || {}).position || '').trim().toLowerCase()
        : null;
      var wasSticky = (window.getComputedStyle(el).position || 'static') === 'sticky';
      if (nextPosition === 'absolute' && wasSticky) {
        ensureStickyScrollportContainingBlock(el);
      } else if (nextPosition != null && nextPosition !== 'absolute') {
        clearStickyScrollportContainingBlock(el);
      }
      for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        if (!allowed[key]) continue;
        var value = coercePreviewStyleValue(key, styles[key]);
        if (value == null) continue;
        var cssName = camelToKebab(key);
        if (value.trim() === '') el.style.removeProperty(cssName);
        else el.style.setProperty(cssName, value.trim(), 'important');
      }
      var tag = el.tagName ? el.tagName.toLowerCase() : '';
      if (tag === 'svg') {
        if (Object.prototype.hasOwnProperty.call(styles || {}, 'width')) {
          var wv = coercePreviewStyleValue('width', (styles || {}).width);
          if (wv != null && String(wv).trim() === '') el.removeAttribute('width');
          else if (wv && /px$/i.test(String(wv).trim())) el.setAttribute('width', String(wv).trim().replace(/px$/i, ''));
        }
        if (Object.prototype.hasOwnProperty.call(styles || {}, 'height')) {
          var hv = coercePreviewStyleValue('height', (styles || {}).height);
          if (hv != null && String(hv).trim() === '') el.removeAttribute('height');
          else if (hv && /px$/i.test(String(hv).trim())) el.setAttribute('height', String(hv).trim().replace(/px$/i, ''));
        }
      }
      if ((tag === 'div' || tag === 'section' || tag === 'article')
        && el.children
        && el.children.length === 1
        && ((styles || {}).width != null || (styles || {}).height != null)) {
        var lone = el.children[0];
        var loneTag = lone && lone.tagName ? lone.tagName.toLowerCase() : '';
        if (loneTag === 'svg' || loneTag === 'img') {
          var childStyles = { display: 'block', maxWidth: 'none', maxHeight: 'none' };
          if (Object.prototype.hasOwnProperty.call(styles || {}, 'width')) childStyles.width = (styles || {}).width;
          if (Object.prototype.hasOwnProperty.call(styles || {}, 'height')) childStyles.height = (styles || {}).height;
          var childKeys = Object.keys(childStyles);
          for (var ck = 0; ck < childKeys.length; ck++) {
            var ckey = childKeys[ck];
            var cval = coercePreviewStyleValue(ckey, childStyles[ckey]);
            if (cval == null) continue;
            var ccss = camelToKebab(ckey);
            if (String(cval).trim() === '') lone.style.removeProperty(ccss);
            else lone.style.setProperty(ccss, String(cval).trim(), 'important');
          }
          if (loneTag === 'svg') {
            if (childStyles.width != null) {
              var cwv = coercePreviewStyleValue('width', childStyles.width);
              if (cwv && /px$/i.test(String(cwv).trim())) lone.setAttribute('width', String(cwv).trim().replace(/px$/i, ''));
            }
            if (childStyles.height != null) {
              var chv = coercePreviewStyleValue('height', childStyles.height);
              if (chv && /px$/i.test(String(chv).trim())) lone.setAttribute('height', String(chv).trim().replace(/px$/i, ''));
            }
          }
        }
      }
      window.parent.postMessage({ type: 'od-edit-preview-style-applied', id: id, version: Number(version) || 0, ok: true }, '*');
    } catch (e) {
      window.parent.postMessage({ type: 'od-edit-preview-style-applied', id: id, version: Number(version) || 0, ok: false, error: e && e.message ? String(e.message) : 'Could not apply preview styles' }, '*');
    }
  }
  window.addEventListener('message', function(ev){
    if (!ev.data) return;
    if (ev.data.type === 'od-edit-mode') {
      enabled = !!ev.data.enabled;
      document.documentElement.toggleAttribute('data-od-edit-mode', enabled);
      if (!enabled) clearSelectedTarget();
      if (enabled) setTimeout(postTargets, 0);
      return;
    }
    if (ev.data.type === 'od-edit-selected-target') {
      var ids = ev.data.ids && ev.data.ids.length ? ev.data.ids : (ev.data.id ? [ev.data.id] : []);
      var primaryId = ev.data.primaryId || ev.data.id || null;
      if (ids.length > 1) {
        setSelectedTargets(ids, primaryId, false);
      } else {
        setSelectedTarget(primaryId, !!ev.data.hostChrome);
      }
      return;
    }
    if (ev.data.type === 'od-edit-hover-reset') {
      // Host signals the cursor truly left the canvas, so the next pointerover
      // re-announces the hovered element (defeats the per-element dedupe).
      lastHoverId = null;
      return;
    }
    if (ev.data.type === 'od-edit-preview-style') {
      applyPreviewStyles(ev.data.id, ev.data.styles || {}, ev.data.version);
      return;
    }
    if (ev.data.type === 'od-edit-refresh-targets') {
      postTargets();
      return;
    }
    if (ev.data.type === 'od-edit-remeasure') {
      var remeasureId = ev.data.id || null;
      var remeasureEl = findById(remeasureId);
      if (!remeasureEl) {
        window.parent.postMessage({ type: 'od-edit-rect', id: remeasureId, ok: false, error: 'Target not found' }, '*');
        return;
      }
      // Staging contract: full target (includes promoteCoords offsets / cssPosition).
      window.parent.postMessage({ type: 'od-edit-rect', id: remeasureId, ok: true, target: targetFrom(remeasureEl, false) }, '*');
      return;
    }
    // Host overlay covers absolute text/link; dblclick is forwarded here so
    // inline contenteditable still works while the selection chrome is up.
    if (ev.data.type === 'od-edit-start-text-edit') {
      if (!enabled) return;
      var editEl = findById(ev.data.id || null);
      if (!editEl) return;
      var editKind = inferKind(editEl);
      if (editKind !== 'text' && editKind !== 'link') return;
      setSelectedTarget(ev.data.id || null, true);
      makeEditable(editEl, null);
      return;
    }
  });
  document.addEventListener('click', function(ev){
    if (!enabled) return;
    if (ev.target && ev.target.closest && ev.target.closest('[data-od-editing="true"]')) return;
    ev.preventDefault();
    ev.stopPropagation();
    var el = closestTarget(ev);
    if (!el) {
      // Clicking empty canvas (no source-mapped ancestor) is the gesture for
      // page-level styles; the host decides whether to surface the card.
      window.parent.postMessage({ type: 'od-edit-background' }, '*');
      return;
    }
    // Select only — text/link stay selectable for resize (wrap width) and the
    // inspector. Inline contenteditable is double-click (51-1 §12).
    var additive = !!(ev.shiftKey || ev.metaKey || ev.ctrlKey);
    window.parent.postMessage({ type: 'od-edit-select', target: targetFrom(el, true), additive: additive }, '*');
  }, true);
  document.addEventListener('dblclick', function(ev){
    if (!enabled) return;
    if (ev.target && ev.target.closest && ev.target.closest('[data-od-editing="true"]')) return;
    ev.preventDefault();
    ev.stopPropagation();
    var el = closestTarget(ev);
    if (!el) return;
    var kind = inferKind(el);
    if (kind !== 'text' && kind !== 'link') return;
    window.parent.postMessage({ type: 'od-edit-select', target: targetFrom(el, true), additive: false }, '*');
    makeEditable(el, ev);
  }, true);
  document.addEventListener('pointerover', function(ev){
    if (!enabled) return;
    if (ev.target && ev.target.closest && ev.target.closest('[data-od-editing="true"]')) return;
    var el = closestTarget(ev);
    if (!el) return;
    postHoverTarget(el);
  }, true);
  window.addEventListener('resize', postTargets);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', postTargets);
  else setTimeout(postTargets, 0);
  document.documentElement.toggleAttribute('data-od-edit-mode', enabled);
})();</script>`;
}

export function buildManualEditBridgeStyle(): string {
  return `<style data-od-edit-bridge-style>
html[data-od-edit-mode] body * { cursor: pointer !important; }
/* Deck templates often disable pointer-events on decorative SVGs — re-enable in edit mode so logos/icons are pickable. */
html[data-od-edit-mode] img,
html[data-od-edit-mode] svg { pointer-events: auto !important; }
/* Absolute graphic wrappers (deck cover logos) also use pointer-events:none — restore hits on the full box. */
html[data-od-edit-mode] [data-od-edit-graphic-wrapper] { pointer-events: auto !important; }
html[data-od-edit-mode] [data-od-id],
html[data-od-edit-mode] [data-screen-label],
html[data-od-edit-mode] [data-od-runtime-id],
html[data-od-edit-mode] [data-od-source-path] { outline: 1px dashed rgba(37, 99, 235, 0.35); outline-offset: 2px; }
/* Nested editable boxes: only the outer ancestor paints at rest (avoids double dashed rings). */
html[data-od-edit-mode] [data-od-id] [data-od-id],
html[data-od-edit-mode] [data-od-id] [data-od-runtime-id],
html[data-od-edit-mode] [data-od-id] [data-od-source-path],
html[data-od-edit-mode] [data-od-runtime-id] [data-od-id],
html[data-od-edit-mode] [data-od-runtime-id] [data-od-runtime-id],
html[data-od-edit-mode] [data-od-runtime-id] [data-od-source-path],
html[data-od-edit-mode] [data-od-source-path] [data-od-id],
html[data-od-edit-mode] [data-od-source-path] [data-od-runtime-id],
html[data-od-edit-mode] [data-od-source-path] [data-od-source-path] { outline-color: transparent; }
html[data-od-edit-mode] [data-od-id]:hover,
html[data-od-edit-mode] [data-screen-label]:hover,
html[data-od-edit-mode] [data-od-runtime-id]:hover,
html[data-od-edit-mode] [data-od-source-path]:hover { outline: 2px solid #2563eb; outline-offset: 2px; }
html[data-od-edit-mode] [data-od-edit-selected] {
  outline: 2px solid #2563eb !important;
  outline-offset: 2px;
  box-shadow: none;
}
/* Host ManualEditResizeOverlay owns the selection chrome — no iframe ring. */
html[data-od-edit-mode] [data-od-edit-selected][data-od-edit-host-chrome] {
  outline: none !important;
  outline-offset: 0;
  box-shadow: none !important;
  pointer-events: none !important;
}
html[data-od-edit-mode] [data-od-editing="true"] {
  outline: 2px solid #2563eb !important;
  outline-offset: 2px;
  background: rgba(37, 99, 235, 0.06);
  cursor: text !important;
}
</style>`;
}
