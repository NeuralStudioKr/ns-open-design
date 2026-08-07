/**
 * Wrap an artifact's HTML for a sandboxed iframe. Corresponds to
 * buildSrcdoc in packages/runtime/src/index.ts — the reference version also
 * injects an edit-mode overlay and tweak bridge, which this starter omits.
 *
 * If the model returned a full document, pass it through unchanged; otherwise
 * wrap the fragment in a minimal doctype shell.
 *
 * When `options.deck` is set we also inject a `postMessage` listener that
 * lets the host advance / rewind slides without relying on the iframe
 * having keyboard focus. The host posts:
 *   { type: 'od:slide', action: 'next' | 'prev' | 'first' | 'last' | 'go', index?: number }
 * and the iframe responds with:
 *   { type: 'od:slide-state', active: number, count: number }
 * after every navigation so the host can render its own counter / dots.
 * The host can also request an immediate snapshot via:
 *   { type: 'od:slide-state-request' }
 */
import {
  buildManualEditBridge,
  buildManualEditBridgeStyle,
  MANUAL_EDIT_DISCOVERY_SELECTOR,
  MANUAL_EDIT_SOURCE_PATH_ATTR,
} from '../edit-mode/bridge';
import { buildArtifactPreviewDomLeakGuardScript, repairArtifactDocumentHead } from '@open-design/contracts';
import { stripConflictingSrcDocCspBaseUri } from './authenticatedHtmlSrcDoc';
import {
  injectStackedDeckViewport,
  looksLikeCompactApiStackedDeck,
  prepareCompactStackedDeckPreviewHtml,
  wrapPreviewHtmlShell,
} from './compact-api-stacked-deck';
import { SNAPSHOT_DOM_CAPTURE_INLINE } from './snapshot-capture-inline';

export type SrcdocOptions = {
  deck?: boolean;
  baseHref?: string;
  initialSlideIndex?: number;
  commentBridge?: boolean;
  inspectBridge?: boolean;
  selectionBridge?: boolean;
  editBridge?: boolean;
  paletteBridge?: boolean;
  initialPalette?: string | null;
  previewFocusGuard?: boolean;
  /** Lean document for PDF/browser export — omits preview-only bridges. */
  exportDocument?: boolean;
};

export const PREVIEW_REDIRECT_GUARD_MAX_HOPS = 15;
export const PREVIEW_REDIRECT_GUARD_WINDOW_MS = 4000;
export const PREVIEW_REDIRECT_GUARD_SELF_REFRESH_MIN_DELAY_MS = 2000;
export const PREVIEW_REDIRECT_LOOP_MESSAGE = 'od:redirect-loop-blocked';

export interface RedirectGuardState {
  hops: number;
  windowStart: number;
}

export function nextRedirectGuardState(
  prev: RedirectGuardState | null,
  now: number,
  opts: { maxHops?: number; windowMs?: number } = {},
): { state: RedirectGuardState; tripped: boolean } {
  const maxHops = opts.maxHops ?? PREVIEW_REDIRECT_GUARD_MAX_HOPS;
  const windowMs = opts.windowMs ?? PREVIEW_REDIRECT_GUARD_WINDOW_MS;
  const withinWindow =
    prev != null &&
    Number.isFinite(prev.windowStart) &&
    now - prev.windowStart <= windowMs;
  const windowStart = withinWindow ? prev.windowStart : now;
  const hops = (withinWindow ? prev.hops : 0) + 1;
  return { state: { hops, windowStart }, tripped: hops > maxHops };
}

export function buildRedirectLoopBlockedDoc(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      html, body { height: 100%; margin: 0; }
      body {
        display: flex; align-items: center; justify-content: center;
        font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        background: #0d1117; color: #e6edf3; text-align: center; padding: 24px;
      }
      .card { max-width: 420px; }
      h1 { font-size: 15px; font-weight: 600; margin: 0 0 8px; }
      p { font-size: 13px; line-height: 1.5; margin: 0; color: #9ba7b4; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Preview stopped: redirect loop detected</h1>
      <p>This document kept redirecting to itself, which would freeze the preview. Reload the preview to try again.</p>
    </div>
  </body>
</html>`;
}

/**
 * Cheap gate: skip od-id / source-path annotation when OD-authored HTML already
 * carries them on structural opens. Imported HTML without annotations still
 * pays the DOMParser walk. Conservative — any bare section/main open forces annotate.
 */
function shouldAnnotatePreviewEditTargets(html: string, sourcePaths: boolean): boolean {
  if (!/data-od-id=/i.test(html)) return true;
  if (sourcePaths && !/data-od-source-path=/i.test(html)) return true;
  const structuralOpens = html.match(/<(?:section|main)\b[^>]*>/gi) ?? [];
  if (structuralOpens.length === 0) return true;
  for (const tag of structuralOpens) {
    if (!/data-od-id=/i.test(tag) && !/data-screen-label=/i.test(tag)) return true;
  }
  return false;
}

export {
  artifactDocumentHeadLooksIntact,
  repairArtifactDocumentHeadIfNeeded,
} from './artifact-document-head';
import { repairArtifactDocumentHeadIfNeeded } from './artifact-document-head';

export function buildSrcdoc(
  html: string,
  options: SrcdocOptions = {}
): string {
  const repairedHead = repairArtifactDocumentHeadIfNeeded(html);
  const repaired = stripConflictingSrcDocCspBaseUri(repairedHead);
  // alreadyRepaired: avoid wrapPreviewHtmlShell re-running repair on full docs.
  const wrapped = wrapPreviewHtmlShell(repaired, { alreadyRepaired: true });
  // Export docs skip od-id / source-path annotation (no selection/edit bridges).
  // OD-authored decks that already carry annotations skip the DOMParser walk.
  const sourcePaths = Boolean(options.editBridge);
  const withAnnotations = options.exportDocument
    || !shouldAnnotatePreviewEditTargets(wrapped, sourcePaths)
    ? wrapped
    : annotatePreviewEditTargets(wrapped, { sourcePaths });
  const withBase = options.baseHref ? injectBaseHref(withAnnotations, options.baseHref) : withAnnotations;
  const withImageRetry = injectPreviewImageRetryBridge(withBase);
  const withShim = injectSandboxShim(withImageRetry);
  const withRedirectGuard = options.exportDocument
    ? withShim
    : injectPreviewRedirectGuard(withShim, {
        blockLoadTimeScriptRedirect: htmlHasLoadTimeLocationNavigation(withBase),
      });
  const withFocusGuard = options.previewFocusGuard ? injectPreviewFocusGuard(withRedirectGuard) : withRedirectGuard;
  // Artifact text-leak guard always runs in preview — viewport/CSS/JS fragments
  // agents stream as visible prose must be stripped even when focus-guard is off.
  const withArtifactGuard = injectPreviewArtifactGuard(withFocusGuard);
  if (options.exportDocument) {
    return withArtifactGuard;
  }
  const compactStackedDeck = options.deck ? looksLikeCompactApiStackedDeck(wrapped) : false;
  const withStackedViewport = compactStackedDeck
    ? injectStackedDeckViewport(withArtifactGuard)
    : withArtifactGuard;
  const withDeck = options.deck
    ? injectDeckBridge(withStackedViewport, options.initialSlideIndex, compactStackedDeck)
    : withArtifactGuard;
  // Comment + Inspect share an element-selection bridge: both pick a
  // [data-od-id] / [data-screen-label] node and route the host's reply
  // to either the comment popover (annotate) or the inspect panel
  // (live-style overrides). Inject once when either mode is on. Pass the
  // requested modes through so the bridge boots with picking already
  // active — without that initial seed there is a window after each
  // srcdoc rebuild where the host's `od:*-mode` postMessage races the
  // bridge's own listener install and the iframe ignores clicks.
  const withSelection = options.selectionBridge || options.commentBridge || options.inspectBridge
    ? injectSelectionBridge(withDeck, {
        initialCommentMode: !!options.commentBridge,
        initialInspectMode: !!options.inspectBridge,
      })
    : withDeck;
  const withPalette = options.paletteBridge
    ? injectPaletteBridge(withSelection, { initialPalette: options.initialPalette ?? null })
    : withSelection;
  const withEdit = options.editBridge ? injectManualEditBridge(withPalette) : withPalette;
  // The tweaks bridge is always injected — it's a passive listener that
  // toggles a `.tw-panel`'s visibility in response to host postMessage. Tying
  // it to a per-call option would force iframe srcdoc regeneration (and a
  // visible flash) every time the host toggle flips.
  const withTweaks = injectTweaksBridge(withEdit);
  return injectSrcdocTransportActivationBridge(injectSnapshotBridge(withTweaks));
}

/**
 * Build the lazy transport shell.
 *
 * The shell does two things:
 *   1. Register a listener for `od:srcdoc-transport-activate` that replaces
 *      its own document with the real artifact HTML.
 *   2. Post `od:srcdoc-transport-ready` to the parent as soon as the listener
 *      is installed. This `ready` signal is the only reliable way for the
 *      host to know the listener is live; without it, the host risks posting
 *      `activate` before the iframe's script has executed (e.g. right after a
 *      key-driven re-mount), in which case the message is dropped and the
 *      iframe stays stuck on the empty shell. See #2253.
 */
export function buildLazySrcdocTransport(): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <script data-od-lazy-srcdoc-transport>(function(){
      window.addEventListener('message', function(ev){
        var data = ev && ev.data;
        if (!data || data.type !== 'od:srcdoc-transport-activate' || typeof data.html !== 'string') return;
        document.open();
        document.write(data.html);
        document.close();
      });
      try {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({ type: 'od:srcdoc-transport-ready' }, '*');
        }
      } catch (_) { /* sandboxed parent — host falls back to onLoad */ }
    })();</script>
  </head>
  <body></body>
</html>`;
}

export interface SrcDocActivationInputs {
  /** The real artifact HTML the host wants to inject into the shell. */
  srcDoc: string;
  /** Host is currently showing the URL-loaded iframe (srcDoc iframe is hidden). */
  useUrlLoadPreview: boolean;
  /** Host's render pipeline is routing through the lazy transport shell. */
  useLazySrcDocTransport: boolean;
  /** The shell document has loaded AND posted `od:srcdoc-transport-ready`. */
  shellReady: boolean;
  /** Which artifact HTML has already been pushed into this shell (dedupe). */
  activatedHtml: string | null;
}

/**
 * Pure decision for whether the host should now post
 * `od:srcdoc-transport-activate` to the shell iframe.
 *
 * Gating on `shellReady` is the fix for #2253: without it, an activation
 * triggered by `useUrlLoadPreview` flipping to false (e.g. opening the
 * Tweaks palette) can fire while the iframe's shell script has not yet
 * registered its message listener. The message is dropped, the shell stays
 * on its empty 536-byte body, and the dedupe check then suppresses the
 * follow-up activation from the iframe's onLoad path.
 */
export function canActivateSrcDocTransport(state: SrcDocActivationInputs): boolean {
  if (!state.srcDoc) return false;
  if (state.useUrlLoadPreview) return false;
  if (!state.useLazySrcDocTransport) return false;
  if (!state.shellReady) return false;
  if (state.activatedHtml === state.srcDoc) return false;
  return true;
}

function injectSrcdocTransportActivationBridge(doc: string): string {
  const script = `<script data-od-srcdoc-transport-activation>(function(){
  window.addEventListener('message', function(ev){
    var data = ev && ev.data;
    if (!data || data.type !== 'od:srcdoc-transport-activate' || typeof data.html !== 'string') return;
    document.open();
    document.write(data.html);
    document.close();
  });
})();</script>`;
  return injectBeforeBodyEnd(doc, script);
}

function injectSnapshotBridge(doc: string): string {
  const domCaptureScript = `<script data-od-snapshot-dom-capture>${SNAPSHOT_DOM_CAPTURE_INLINE}</script>`;
  const script = `<script data-od-snapshot-bridge>(function(){
  var SNAPSHOT_STYLE_PROPS = [
    'display','position','box-sizing','width','height','min-width','max-width','min-height','max-height',
    'margin','margin-top','margin-right','margin-bottom','margin-left',
    'padding','padding-top','padding-right','padding-bottom','padding-left',
    'border','border-top','border-right','border-bottom','border-left','border-radius',
    'font','font-family','font-size','font-weight','font-style','line-height','letter-spacing',
    'color','background-color','opacity','transform','transform-origin','overflow','overflow-x','overflow-y',
    'white-space','text-align','vertical-align','object-fit','object-position',
    'flex','flex-direction','flex-wrap','flex-grow','flex-shrink','flex-basis',
    'grid','grid-template-columns','grid-template-rows','grid-column','grid-row',
    'gap','row-gap','column-gap','align-items','align-content','align-self',
    'justify-items','justify-content','justify-self','inset','top','right','bottom','left',
    'z-index','box-shadow','text-shadow'
  ];
  function copyComputedStyle(source, target){
    if (!source || !target || source.nodeType !== 1 || target.nodeType !== 1) return;
    var computed = window.getComputedStyle(source);
    var style = target.getAttribute('style') || '';
    for (var i = 0; i < SNAPSHOT_STYLE_PROPS.length; i++){
      var prop = SNAPSHOT_STYLE_PROPS[i];
      var value = computed.getPropertyValue(prop);
      if (value) style += prop + ':' + value + ';';
    }
    target.setAttribute('style', style);
  }
  function syncElementState(source, target){
    var tag = source.tagName ? source.tagName.toLowerCase() : '';
    if (tag === 'img' && source.currentSrc) target.setAttribute('src', source.currentSrc);
    if (tag === 'input' || tag === 'textarea') target.setAttribute('value', source.value || '');
    if (tag === 'canvas') {
      try {
        var img = document.createElement('img');
        img.setAttribute('src', source.toDataURL('image/png'));
        img.setAttribute('style', target.getAttribute('style') || '');
        target.parentNode && target.parentNode.replaceChild(img, target);
      } catch (_) {}
    }
  }
  function inlineSnapshotStyles(originalRoot, cloneRoot){
    copyComputedStyle(originalRoot, cloneRoot);
    syncElementState(originalRoot, cloneRoot);
    var originals = originalRoot.querySelectorAll('*');
    var clones = cloneRoot.querySelectorAll('*');
    var count = Math.min(originals.length, clones.length, 3500);
    for (var i = 0; i < count; i++){
      copyComputedStyle(originals[i], clones[i]);
      syncElementState(originals[i], clones[i]);
    }
    var scripts = cloneRoot.querySelectorAll('script');
    for (var s = scripts.length - 1; s >= 0; s--) scripts[s].remove();
    var links = cloneRoot.querySelectorAll('link[rel~="stylesheet"], link[rel~="preload"], link[rel~="preconnect"]');
    for (var l = links.length - 1; l >= 0; l--) links[l].remove();
    var styles = cloneRoot.querySelectorAll('style');
    for (var st = 0; st < styles.length; st++) {
      styles[st].textContent = (styles[st].textContent || '')
        .replace(/@import[^;]+;/gi, '')
        .replace(/@font-face\\s*\\{[^}]*\\}/gi, '');
    }
  }
  function pruneHiddenSnapshotNodes(originalRoot, cloneRoot){
    var originals = originalRoot.querySelectorAll('*');
    var clones = cloneRoot.querySelectorAll('*');
    var count = Math.min(originals.length, clones.length);
    var removals = [];
    for (var i = 0; i < count; i++){
      var original = originals[i];
      var clone = clones[i];
      if (!original || !clone || !clone.parentNode) continue;
      var computed = window.getComputedStyle(original);
      if (computed && (computed.display === 'none' || computed.visibility === 'hidden')) {
        removals.push(clone);
      }
    }
    for (var r = removals.length - 1; r >= 0; r--){
      if (removals[r].parentNode) removals[r].parentNode.removeChild(removals[r]);
    }
  }
  function waitForImages(){
    var imgs = Array.prototype.slice.call(document.images || []);
    var fontsReady = (document.fonts && document.fonts.ready)
      ? document.fonts.ready.catch(function(){})
      : Promise.resolve();
    return Promise.all([fontsReady].concat(imgs.map(function(img){
      if (img.complete) return Promise.resolve();
      return new Promise(function(resolve){
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', resolve, { once: true });
      });
    })));
  }
  function prepareDeckSnapshotFrame(){
    var stage = document.getElementById('deck-stage') || document.querySelector('.deck-stage');
    if (!stage) return null;
    var selector = '.slide, [data-slide], [data-screen-label], section.slide, .deck-slide, .ppt-slide';
    var saved = {
      stageTransform: stage.style.transform,
      stageTransformPriority: stage.style.getPropertyPriority('transform'),
      deckScale: document.documentElement.style.getPropertyValue('--deck-scale'),
      deckScalePriority: document.documentElement.style.getPropertyPriority('--deck-scale'),
      shells: [],
      slides: []
    };
    document.querySelectorAll('.deck-shell').forEach(function(shell){
      saved.shells.push({
        el: shell,
        padding: shell.style.padding,
        priority: shell.style.getPropertyPriority('padding')
      });
    });
    document.querySelectorAll(selector).forEach(function(slide){
      saved.slides.push({
        el: slide,
        display: slide.style.display,
        priority: slide.style.getPropertyPriority('display')
      });
    });
    try {
      stage.style.setProperty('transform', 'none', 'important');
      document.querySelectorAll('.deck-shell').forEach(function(shell){
        shell.style.setProperty('padding', '0', 'important');
      });
      document.documentElement.style.setProperty('--deck-scale', '1');
      document.querySelectorAll(selector).forEach(function(slide){
        if (slide.classList.contains('active')) {
          slide.style.setProperty('display', 'flex', 'important');
        } else {
          slide.style.setProperty('display', 'none', 'important');
        }
      });
    } catch (_) {}
    return {
      w: 1920,
      h: 1080,
      docW: 1920,
      docH: 1080,
      scrollX: 0,
      scrollY: 0,
      restore: function(){
        try {
          if (saved.stageTransformPriority) {
            stage.style.setProperty('transform', saved.stageTransform, saved.stageTransformPriority);
          } else if (saved.stageTransform) {
            stage.style.transform = saved.stageTransform;
          } else {
            stage.style.removeProperty('transform');
          }
          if (saved.deckScalePriority) {
            document.documentElement.style.setProperty('--deck-scale', saved.deckScale, saved.deckScalePriority);
          } else if (saved.deckScale) {
            document.documentElement.style.setProperty('--deck-scale', saved.deckScale);
          } else {
            document.documentElement.style.removeProperty('--deck-scale');
          }
          saved.shells.forEach(function(entry){
            if (entry.priority) entry.el.style.setProperty('padding', entry.padding, entry.priority);
            else if (entry.padding) entry.el.style.padding = entry.padding;
            else entry.el.style.removeProperty('padding');
          });
          saved.slides.forEach(function(entry){
            if (entry.priority) entry.el.style.setProperty('display', entry.display, entry.priority);
            else if (entry.display) entry.el.style.display = entry.display;
            else entry.el.style.removeProperty('display');
          });
        } catch (_) {}
      }
    };
  }
  var activeDeckSnapshotRestore = null;
  function clearDeckSnapshotRestore(){
    if (!activeDeckSnapshotRestore) return;
    try { activeDeckSnapshotRestore(); } catch (_) {}
    activeDeckSnapshotRestore = null;
  }
  function scrollOffset(){
    var doc = document.documentElement;
    var body = document.body;
    return {
      x: Math.max(window.scrollX || 0, doc ? doc.scrollLeft || 0 : 0, body ? body.scrollLeft || 0 : 0),
      y: Math.max(window.scrollY || 0, doc ? doc.scrollTop || 0 : 0, body ? body.scrollTop || 0 : 0)
    };
  }
  function escapeAttribute(value){
    return String(value || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }
  function snapshotBackgroundColor(){
    try {
      var probe = window.getComputedStyle(document.body || document.documentElement);
      var bg = probe && probe.backgroundColor || '';
      if (!bg || bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)') return '#ffffff';
      return bg;
    } catch (_) { return '#ffffff'; }
  }
  // After painting, sample the canvas: a uniform (single-color) bitmap means
  // the foreignObject rasterizer painted nothing — Chromium frequently refuses
  // to paint <foreignObject> HTML loaded via <img>. Treating that as an honest
  // 'empty-render' error (instead of shipping the background-only frame) lets
  // the host fall back / surface a real failure rather than a silent black PNG.
  function canvasLooksBlank(ctx, cw, ch){
    try {
      var data = ctx.getImageData(0, 0, cw, ch).data;
      var step = Math.max(4, Math.floor((cw * ch) / 4096)) * 4;
      var first = null, samples = 0;
      for (var i = 0; i + 3 < data.length; i += step){
        samples++;
        if (!first){ first = [data[i], data[i+1], data[i+2], data[i+3]]; continue; }
        if (Math.abs(data[i]-first[0]) > 6 || Math.abs(data[i+1]-first[1]) > 6 ||
            Math.abs(data[i+2]-first[2]) > 6 || Math.abs(data[i+3]-first[3]) > 6) return false;
      }
      return samples > 8;
    } catch (_) { return false; }
  }
  function waitForSnapshotReady(){
    return waitForImages().then(function(){
      return new Promise(function(resolve){
        var stage = document.getElementById('deck-stage') || document.querySelector('.deck-stage');
        if (!stage) {
          resolve();
          return;
        }
        function settle(){
          requestAnimationFrame(function(){ requestAnimationFrame(resolve); });
        }
        if (document.documentElement.hasAttribute('data-od-stacked-deck-ready')) {
          settle();
          return;
        }
        var deadline = Date.now() + 1500;
        function tick(){
          if (document.documentElement.hasAttribute('data-od-stacked-deck-ready') || Date.now() >= deadline) {
            settle();
            return;
          }
          setTimeout(tick, 50);
        }
        tick();
      });
    });
  }
  function buildSnapshotPayload(deckFrame){
    var w = deckFrame ? deckFrame.w : Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
    var h = deckFrame ? deckFrame.h : Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
    var docW = deckFrame ? deckFrame.docW : Math.max(w, document.documentElement.scrollWidth || 0, document.body ? document.body.scrollWidth : 0);
    var docH = deckFrame ? deckFrame.docH : Math.max(h, document.documentElement.scrollHeight || 0, document.body ? document.body.scrollHeight : 0);
    var scroll = deckFrame ? { x: deckFrame.scrollX, y: deckFrame.scrollY } : scrollOffset();
    if (deckFrame) {
      var stage = document.getElementById('deck-stage') || document.querySelector('.deck-stage');
      if (stage) {
        var stageClone = stage.cloneNode(true);
        inlineSnapshotStyles(stage, stageClone);
        pruneHiddenSnapshotNodes(stage, stageClone);
        return {
          w: w,
          h: h,
          docW: docW,
          docH: docH,
          wrapperStyle: 'margin:0;padding:0;width:' + docW + 'px;height:' + docH + 'px;overflow:hidden;',
          bodyContent: stageClone.outerHTML
        };
      }
    }
    var clone = document.documentElement.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    inlineSnapshotStyles(document.documentElement, clone);
    pruneHiddenSnapshotNodes(document.documentElement, clone);
    var cloneBody = clone.querySelector('body');
    var rootStyle = clone.getAttribute('style') || '';
    var bodyStyle = cloneBody ? cloneBody.getAttribute('style') || '' : '';
    var bodyContent = cloneBody ? cloneBody.innerHTML : clone.innerHTML;
    var wrapperStyle = rootStyle + bodyStyle +
      'margin:0;position:relative;left:' + (-scroll.x) + 'px;top:' + (-scroll.y) + 'px;' +
      'width:' + docW + 'px;height:' + docH + 'px;overflow:visible;';
    return { w: w, h: h, docW: docW, docH: docH, wrapperStyle: wrapperStyle, bodyContent: bodyContent };
  }
  function postSnapshotCanvas(id, canvas, settled){
    if (settled && settled.done) return false;
    var ctx = canvas.getContext('2d');
    if (!ctx || canvasLooksBlank(ctx, canvas.width, canvas.height)) {
      return false;
    }
    if (settled) settled.done = true;
    clearDeckSnapshotRestore();
    window.parent.postMessage({
      type: 'od:snapshot:result',
      id: id,
      dataUrl: canvas.toDataURL('image/png'),
      w: canvas.width,
      h: canvas.height
    }, '*');
    return true;
  }
  function publishSnapshotError(id, settled, error){
    if (settled && settled.done) return;
    if (settled) settled.done = true;
    clearDeckSnapshotRestore();
    window.parent.postMessage({ type: 'od:snapshot:result', id: id, error: error }, '*');
  }
  function drawSnapshotSourceToCanvas(source, w, h, dpr, bgColor){
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    var ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.scale(dpr, dpr);
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(source, 0, 0, w, h);
    return canvas;
  }
  function renderSnapshotViaImage(id, svg, w, h, dpr, bgColor, settled){
    var img = new Image();
    function onImageReady(){
      try {
        if (!postSnapshotCanvas(id, drawSnapshotSourceToCanvas(img, w, h, dpr, bgColor), settled)) {
          publishSnapshotError(id, settled, 'empty-render');
        }
      } catch (err) {
        publishSnapshotError(id, settled, String(err && err.message || err));
      }
    }
    function loadSvgSource(src, triedBlob){
      img.onload = function(){
        if (src.indexOf('blob:') === 0 && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(src);
        onImageReady();
      };
      img.onerror = function(){
        if (src.indexOf('blob:') === 0 && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(src);
        if (!triedBlob && typeof URL.createObjectURL === 'function' && typeof Blob !== 'undefined') {
          try {
            loadSvgSource(URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })), true);
            return;
          } catch (_) {}
        }
        publishSnapshotError(id, settled, 'snapshot image failed');
      };
      img.src = src;
    }
    loadSvgSource('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg), false);
  }
  function ensureSnapshotDomCapture(){
    if (window.__odSnapshotDomCapture && typeof window.__odSnapshotDomCapture.domToPng === 'function') {
      return Promise.resolve(window.__odSnapshotDomCapture);
    }
    return new Promise(function(resolve, reject){
      var deadline = Date.now() + 5000;
      function tick(){
        if (window.__odSnapshotDomCapture && typeof window.__odSnapshotDomCapture.domToPng === 'function') {
          resolve(window.__odSnapshotDomCapture);
          return;
        }
        if (Date.now() >= deadline) {
          reject(new Error('snapshot dom capture unavailable'));
          return;
        }
        setTimeout(tick, 50);
      }
      tick();
    });
  }
  function renderSnapshotLegacy(id, settled, deckFrame, payload, w, h, docW, docH, dpr, bgColor){
    var html = '<div xmlns="http://www.w3.org/1999/xhtml" style="' + escapeAttribute(payload.wrapperStyle) + '">' + payload.bodyContent + '</div>';
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' +
      '<foreignObject x="0" y="0" width="' + docW + '" height="' + docH + '">' +
      html +
      '</foreignObject></svg>';
    if (typeof createImageBitmap === 'function' && typeof DOMParser !== 'undefined') {
      try {
        var parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
        var svgEl = parsed.documentElement;
        var host = document.createElement('div');
        host.setAttribute('aria-hidden', 'true');
        host.style.cssText = 'position:fixed;left:-10000px;top:0;width:0;height:0;overflow:hidden;pointer-events:none;opacity:0;';
        document.body.appendChild(host);
        host.appendChild(svgEl);
        createImageBitmap(svgEl, {
          resizeWidth: Math.max(1, Math.floor(w * dpr)),
          resizeHeight: Math.max(1, Math.floor(h * dpr))
        }).then(function(bitmap){
          try {
            if (!postSnapshotCanvas(id, drawSnapshotSourceToCanvas(bitmap, w, h, dpr, bgColor), settled)) {
              renderSnapshotViaImage(id, svg, w, h, dpr, bgColor, settled);
            }
            if (bitmap.close) bitmap.close();
          } catch (err) {
            publishSnapshotError(id, settled, String(err && err.message || err));
          }
        }).catch(function(){
          renderSnapshotViaImage(id, svg, w, h, dpr, bgColor, settled);
        }).finally(function(){
          if (host.parentNode) host.parentNode.removeChild(host);
        });
        return;
      } catch (_) {}
    }
    renderSnapshotViaImage(id, svg, w, h, dpr, bgColor, settled);
  }
  function snapshotTargetDimensions(target){
    if (target && (target.id === 'deck-stage' || (target.classList && target.classList.contains('deck-stage')))) {
      return { w: 1920, h: 1080 };
    }
    var rect = target && target.getBoundingClientRect ? target.getBoundingClientRect() : null;
    return {
      w: Math.max(1, Math.round((rect && rect.width) || (target && target.clientWidth) || 1)),
      h: Math.max(1, Math.round((rect && rect.height) || (target && target.clientHeight) || 1))
    };
  }
  function renderSnapshotDom(id, settled, w, h, dpr){
    var target = document.getElementById('deck-stage') || document.querySelector('.deck-stage') || document.body;
    if (!target) return Promise.reject(new Error('snapshot target missing'));
    return ensureSnapshotDomCapture().then(function(capture){
      return capture.domToPng(target, {
        scale: dpr,
        width: w,
        height: h,
        timeout: 6000,
        font: false
      });
    }).then(function(dataUrl){
      if (settled && settled.done) return;
      settled.done = true;
      window.parent.postMessage({
        type: 'od:snapshot:result',
        id: id,
        dataUrl: dataUrl,
        w: w,
        h: h
      }, '*');
    });
  }
  function renderSnapshot(id){
    var settled = { done: false };
    var dpr = window.devicePixelRatio || 1;
    var target = document.getElementById('deck-stage') || document.querySelector('.deck-stage') || document.body;
    var dims = snapshotTargetDimensions(target);
    var w = dims.w;
    var h = dims.h;
    var bgColor = snapshotBackgroundColor();
    renderSnapshotDom(id, settled, w, h, dpr).catch(function(){
      if (settled.done) return;
      var deckFrame = prepareDeckSnapshotFrame();
      activeDeckSnapshotRestore = deckFrame && deckFrame.restore ? deckFrame.restore : null;
      var payload = buildSnapshotPayload(deckFrame);
      var docW = payload.docW;
      var docH = payload.docH;
      renderSnapshotLegacy(id, settled, deckFrame, payload, payload.w, payload.h, docW, docH, dpr, bgColor);
    });
  }
  window.addEventListener('message', function(ev){
    var data = ev && ev.data;
    if (!data || data.type !== 'od:snapshot' || !data.id) return;
    waitForSnapshotReady().then(function(){ renderSnapshot(String(data.id)); });
  });
})();</script>`;
  return injectBeforeBodyEnd(doc, domCaptureScript + script);
}

// Palette bridge: re-skin the page on host postMessage. Generated pages
// hard-code multiple shades of one accent and a CSS-variable swap will
// not catch them. We walk the DOM and shift any chromatic paint to the
// target palette's hue while keeping each color's saturation and
// lightness — pale tints stay pale, bold CTAs stay bold, just in the
// new color family. Mono-noir desaturates instead of shifting.
function injectPaletteBridge(
  doc: string,
  options: { initialPalette: string | null } = { initialPalette: null },
): string {
  const initial = options.initialPalette
    ? JSON.stringify(String(options.initialPalette))
    : 'null';
  const script = `<script data-od-palette-bridge>(function(){
  var PALETTES = {
    'coral':       { hue: 10,  satFloor: 0.55, mono: false },
    'electric':    { hue: 262, satFloor: 0.55, mono: false },
    'acid-forest': { hue: 142, satFloor: 0.55, mono: false },
    'risograph':   { hue: 349, satFloor: 0.60, mono: false },
    'mono-noir':   { hue: 0,   satFloor: 0,    mono: true  }
  };
  var current = ${initial};
  var ATTR = 'data-od-palette-fix';
  var SAVED = '__odPaletteSaved__';
  var MIN_SAT = 0.08;
  var WALK_LIMIT = 12000;
  var STYLE_RULE_LIMIT = 5000;
  var ROOT_SELECTOR = /(^|,)\\s*(:root|html|body|:host)\\s*($|,)/;
  var varApplied = Object.create(null);
  var probeEl = null;
  function parseRgb(s){
    var str = String(s||'').trim();
    if (!str || str === 'transparent' || str === 'none') return null;
    var m = str.match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    var p = m[1].split(/[\\s,/]+/).filter(Boolean).map(function(x){ return parseFloat(x); });
    if (p.length < 3) return null;
    return { r: p[0]||0, g: p[1]||0, b: p[2]||0, a: p[3] == null ? 1 : p[3] };
  }
  function rgbToHsl(r,g,b){
    r/=255; g/=255; b/=255;
    var max=Math.max(r,g,b), min=Math.min(r,g,b);
    var h=0, s=0, l=(max+min)/2;
    if (max!==min){
      var d=max-min;
      s = l>0.5 ? d/(2-max-min) : d/(max+min);
      if (max===r) h=(g-b)/d + (g<b?6:0);
      else if (max===g) h=(b-r)/d + 2;
      else h=(r-g)/d + 4;
      h *= 60;
    }
    return {h:h, s:s, l:l};
  }
  function h2rgb(p,q,t){
    if (t<0) t+=1;
    if (t>1) t-=1;
    if (t<1/6) return p+(q-p)*6*t;
    if (t<1/2) return q;
    if (t<2/3) return p+(q-p)*(2/3-t)*6;
    return p;
  }
  function hslStr(h,s,l){
    h = ((h%360)+360)%360/360;
    var r,g,b;
    if (s===0){ r=g=b=l; }
    else {
      var q = l<0.5 ? l*(1+s) : l+s-l*s;
      var p = 2*l-q;
      r=h2rgb(p,q,h+1/3); g=h2rgb(p,q,h); b=h2rgb(p,q,h-1/3);
    }
    return 'rgb('+Math.round(r*255)+','+Math.round(g*255)+','+Math.round(b*255)+')';
  }
  function chromatic(c){
    if (!c || c.a < 0.3) return null;
    var hsl = rgbToHsl(c.r,c.g,c.b);
    if (hsl.s < MIN_SAT) return null;
    if (hsl.l < 0.04 || hsl.l > 0.98) return null;
    return hsl;
  }
  function shift(hsl, palette){
    if (palette.mono) return hslStr(0, 0, hsl.l);
    var sat = Math.max(hsl.s, palette.satFloor * 0.7);
    return hslStr(palette.hue, sat, hsl.l);
  }
  function normalizeColor(value){
    var raw = String(value||'').trim();
    if (!raw) return null;
    var direct = parseRgb(raw);
    if (direct) return direct;
    if (raw.indexOf('var(') === 0 || raw.indexOf('--') === 0) return null;
    if (!probeEl){
      probeEl = document.createElement('div');
      probeEl.style.display = 'none';
      (document.body || document.documentElement).appendChild(probeEl);
    }
    probeEl.style.color = '';
    try { probeEl.style.color = raw; } catch (_){ return null; }
    if (!probeEl.style.color) return null;
    return parseRgb(probeEl.style.color);
  }
  function isRootSelector(selector){
    return !!selector && ROOT_SELECTOR.test(String(selector));
  }
  function forEachStyleRule(rules, visit, budget){
    if (!rules || !budget.left) return;
    for (var i=0; i<rules.length && budget.left>0; i++){
      var rule = rules[i];
      budget.left--;
      if (rule.selectorText && rule.style && isRootSelector(rule.selectorText)) visit(rule);
      if (rule.cssRules && rule.cssRules.length) forEachStyleRule(rule.cssRules, visit, budget);
    }
  }
  function applyVarTint(palette){
    var sheets = document.styleSheets;
    if (!sheets || !sheets.length) return;
    var budget = { left: STYLE_RULE_LIMIT };
    for (var i=0; i<sheets.length; i++){
      var sheet = sheets[i];
      var rules = null;
      try { rules = sheet.cssRules; } catch (_){ continue; }
      forEachStyleRule(rules, function(rule){
        var decl = rule.style;
        for (var j=0; j<decl.length; j++){
          var name = decl[j];
          if (name.indexOf('--') !== 0) continue;
          var raw = decl.getPropertyValue(name);
          var color = normalizeColor(raw);
          var hsl = chromatic(color);
          if (!hsl) continue;
          document.documentElement.style.setProperty(name, shift(hsl, palette));
          varApplied[name] = true;
        }
      }, budget);
    }
  }
  function restoreVars(){
    for (var name in varApplied){
      document.documentElement.style.setProperty(name, '');
    }
    varApplied = Object.create(null);
  }
  function restoreAll(){
    restoreVars();
    var nodes = document.querySelectorAll('['+ATTR+']');
    for (var i=0;i<nodes.length;i++){
      var el = nodes[i], saved = el[SAVED];
      if (saved){
        if ('bg' in saved) el.style.backgroundColor = saved.bg;
        if ('color' in saved) el.style.color = saved.color;
        if ('border' in saved) el.style.borderColor = saved.border;
        if ('fill' in saved){ if (saved.fill) el.setAttribute('fill', saved.fill); else el.removeAttribute('fill'); }
        if ('stroke' in saved){ if (saved.stroke) el.setAttribute('stroke', saved.stroke); else el.removeAttribute('stroke'); }
      }
      el.removeAttribute(ATTR);
      delete el[SAVED];
    }
  }
  function applyTint(id){
    var palette = PALETTES[id];
    if (!palette) return;
    applyVarTint(palette);
    var all = document.body ? document.body.querySelectorAll('*') : [];
    for (var i=0; i<all.length && i<WALK_LIMIT; i++){
      var el = all[i], cs = getComputedStyle(el), saved = {}, changed = false;
      var bg = chromatic(parseRgb(cs.backgroundColor));
      if (bg){ saved.bg = el.style.backgroundColor; el.style.setProperty('background-color', shift(bg, palette), 'important'); changed = true; }
      var fg = chromatic(parseRgb(cs.color));
      if (fg){ saved.color = el.style.color; el.style.setProperty('color', shift(fg, palette), 'important'); changed = true; }
      var bd = chromatic(parseRgb(cs.borderTopColor));
      if (bd){ saved.border = el.style.borderColor; el.style.setProperty('border-color', shift(bd, palette), 'important'); changed = true; }
      var fillAttr = el.getAttribute && el.getAttribute('fill');
      if (fillAttr){
        var f = chromatic(parseRgb(cs.fill));
        if (f){ saved.fill = fillAttr; el.setAttribute('fill', shift(f, palette)); changed = true; }
      }
      var strokeAttr = el.getAttribute && el.getAttribute('stroke');
      if (strokeAttr){
        var sk = chromatic(parseRgb(cs.stroke));
        if (sk){ saved.stroke = strokeAttr; el.setAttribute('stroke', shift(sk, palette)); changed = true; }
      }
      if (changed){ el[SAVED] = saved; el.setAttribute(ATTR, '1'); }
    }
  }
  function apply(id){
    restoreAll();
    if (!id || !PALETTES[id]){ current = null; return; }
    current = id;
    applyTint(id);
  }
  window.addEventListener('message', function(ev){
    var data = ev && ev.data;
    if (!data || data.type !== 'od:palette') return;
    apply(data.palette ? String(data.palette) : null);
  });
  function boot(){ if (current) apply(current); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();</script>`;
  return injectBeforeBodyEnd(doc, script);
}

function annotateManualEditSourcePathsOnDocument(parsed: Document): void {
  parsed.body.querySelectorAll(MANUAL_EDIT_DISCOVERY_SELECTOR).forEach((el) => {
    if (el.hasAttribute(MANUAL_EDIT_SOURCE_PATH_ATTR)) return;
    const path = sourcePathForElement(el);
    if (path) el.setAttribute(MANUAL_EDIT_SOURCE_PATH_ATTR, path);
  });
}

function annotateManualEditSourcePaths(doc: string): string {
  if (typeof DOMParser === 'undefined') return doc;
  try {
    const parsed = new DOMParser().parseFromString(doc, 'text/html');
    annotateManualEditSourcePathsOnDocument(parsed);
    return serializeHtmlDocument(parsed);
  } catch {
    return doc;
  }
}

function sourcePathForElement(el: Element): string {
  const parts: number[] = [];
  let node: Element | null = el;
  while (node && node !== node.ownerDocument.body) {
    const parent: Element | null = node.parentElement;
    if (!parent) break;
    parts.unshift(Array.prototype.indexOf.call(parent.children, node));
    node = parent;
  }
  return parts.length ? `path-${parts.join('-')}` : '';
}

function serializeHtmlDocument(doc: Document): string {
  const doctype = doc.doctype ? '<!doctype html>\n' : '';
  return `${doctype}${doc.documentElement.outerHTML}`;
}

/**
 * Auto-annotate structural HTML elements that lack `data-od-id` or
 * `data-screen-label` so that the selection bridge (Picker / Pods /
 * Tweaks) can target them. This fixes imported designs whose HTML was
 * generated outside of Open Design and therefore carries no OD-specific
 * annotations.
 */
function annotateMissingOdIdsOnDocument(parsed: Document): void {
  // Only target divs that are direct children of semantic containers or body;
  // deeply nested layout divs (e.g. flex/grid wrappers) create noise in the
  // selection bridge without adding meaningful pickable targets.
  const selector = [
    'section', 'article', 'header', 'footer', 'nav', 'main', 'aside',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'button', 'a', 'img', 'svg', '[id]',
    'body > div[class]', 'body > div[id]',
    'section > div[class]', 'section > div[id]',
    'article > div[class]', 'article > div[id]',
    'main > div[class]', 'main > div[id]',
    'header > div[class]', 'header > div[id]',
    'footer > div[class]', 'footer > div[id]',
    'nav > div[class]', 'nav > div[id]',
    'aside > div[class]', 'aside > div[id]',
    '[id] > div[class]', '[id] > div[id]',
    // Deck slide icons / positioned chrome often ship as bare <div style="...">.
    'section.slide > div[style]', 'section[class~="slide"] > div[style]',
  ].join(', ');
  const skipTags = new Set(['script', 'style', 'template', 'noscript', 'iframe', 'object', 'embed']);
  const skipDeckChrome = (el: Element): boolean => {
    const id = el.id;
    if (id === 'deck-stage' || id === 'od-stacked-deck-stage' || id === 'deck' || id === 'deck-track') {
      return true;
    }
    return el.classList.contains('deck-shell') || el.classList.contains('deck-stage');
  };
  let fallbackIndex = 0;
  parsed.body.querySelectorAll(selector).forEach((el) => {
    if (el.hasAttribute('data-od-id') || el.hasAttribute('data-screen-label')) return;
    const tag = el.tagName.toLowerCase();
    if (skipTags.has(tag)) return;
    if (skipDeckChrome(el)) return;
    const path = sourcePathForElement(el);
    el.setAttribute('data-od-id', path || `od-${tag}-${fallbackIndex++}`);
  });
}

function annotateMissingOdIds(doc: string): string {
  if (typeof DOMParser === 'undefined') return doc;
  try {
    const parsed = new DOMParser().parseFromString(doc, 'text/html');
    annotateMissingOdIdsOnDocument(parsed);
    return serializeHtmlDocument(parsed);
  } catch {
    return doc;
  }
}

/** Fold od-id + optional source-path annotation into one DOMParser pass. */
function annotatePreviewEditTargets(
  doc: string,
  options: { sourcePaths: boolean },
): string {
  if (typeof DOMParser === 'undefined') return doc;
  try {
    const parsed = new DOMParser().parseFromString(doc, 'text/html');
    annotateMissingOdIdsOnDocument(parsed);
    if (options.sourcePaths) {
      annotateManualEditSourcePathsOnDocument(parsed);
    }
    return serializeHtmlDocument(parsed);
  } catch {
    return doc;
  }
}

function injectManualEditBridge(doc: string): string {
  const withStyle = injectBeforeHeadEnd(doc, buildManualEditBridgeStyle());
  return injectBeforeBodyEnd(withStyle, buildManualEditBridge(false));
}

function injectBeforeHeadEnd(doc: string, payload: string): string {
  // String-first: a plain splice before the real </head> (or after <head…>) is
  // correct for well-formed documents and avoids a full DOMParser parse +
  // re-serialize. Every bridge calls this, so the parse path was the dominant
  // srcdoc-build cost; DOMParser is now only the fallback for head-less
  // fragments where we can't locate an insertion point textually. Find the real
  // </head> (last one before <body>) to skip </head> literals in <script>/<style>.
  const lower = doc.toLowerCase();
  const bodyStart = lower.indexOf('<body');
  const limit = bodyStart >= 0 ? bodyStart : lower.length;
  const idx = lower.lastIndexOf('</head>', limit - 1);
  if (idx >= 0) return doc.slice(0, idx) + payload + doc.slice(idx);
  if (/<head[^>]*>/i.test(doc)) return doc.replace(/<head[^>]*>/i, (m) => `${m}${payload}`);
  // No recognizable <head>: let DOMParser normalize (it synthesizes a head).
  if (typeof DOMParser !== 'undefined') {
    try {
      const parsed = new DOMParser().parseFromString(doc, 'text/html');
      if (parsed.head) parsed.head.insertAdjacentHTML('beforeend', payload);
      return serializeHtmlDocument(parsed);
    } catch { /* fall through to prepend */ }
  }
  return payload + doc;
}

function injectBeforeBodyEnd(doc: string, payload: string): string {
  // String-first (see injectBeforeHeadEnd). Find the real </body> (last one
  // before </html>) to skip </body> literals inside <script>/<style>.
  const lower = doc.toLowerCase();
  const htmlEnd = lower.lastIndexOf('</html>');
  const limit = htmlEnd >= 0 ? htmlEnd : lower.length;
  const idx = lower.lastIndexOf('</body>', limit - 1);
  if (idx >= 0) return doc.slice(0, idx) + payload + doc.slice(idx);
  // No recognizable </body>: let DOMParser normalize (it synthesizes a body).
  if (typeof DOMParser !== 'undefined') {
    try {
      const parsed = new DOMParser().parseFromString(doc, 'text/html');
      if (parsed.body) parsed.body.insertAdjacentHTML('beforeend', payload);
      return serializeHtmlDocument(parsed);
    } catch { /* fall through to append */ }
  }
  return doc + payload;
}

function injectBaseHref(doc: string, baseHref: string): string {
  const prepared = stripConflictingSrcDocCspBaseUri(doc);
  const safeHref = escapeAttr(baseHref);
  const tag = `<base href="${safeHref}">`;
  if (/<head[^>]*>/i.test(prepared)) {
    return prepared.replace(/<head[^>]*>/i, (m) => `${m}${tag}`);
  }
  if (/<html[^>]*>/i.test(prepared)) {
    return prepared.replace(/<html[^>]*>/i, (m) => `${m}<head>${tag}</head>`);
  }
  return tag + prepared;
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Sandboxed iframes (we use `sandbox="allow-scripts"`) without
// `allow-same-origin` raise a SecurityError on first `localStorage` /
// `sessionStorage` access. Many freeform-generated decks call
// `localStorage.getItem(...)` at the top of their IIFE without a
// try/catch — when it throws, the whole script aborts and the deck
// becomes a static, unnavigable preview. We install a same-origin
// in-memory shim BEFORE any user script runs so those decks degrade
// gracefully (position just doesn't persist across reloads).
// allow-popups and allow-popups-to-escape-sandbox are needed for 
// links with target="_blank" to work in the sandboxed preview.
// Empty hrefs and hash only hrefs will be intercepted and ignored.
// hrefs leading to an id on the page will be scrolled into view.
function injectSandboxShim(doc: string): string {
  const shim = `<script data-od-sandbox-shim>(function(){
  function makeStore(){
    var data = {};
    var api = {
      getItem: function(k){ return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
      setItem: function(k, v){ data[k] = String(v); },
      removeItem: function(k){ delete data[k]; },
      clear: function(){ data = {}; },
      key: function(i){ return Object.keys(data)[i] || null; }
    };
    Object.defineProperty(api, 'length', { get: function(){ return Object.keys(data).length; } });
    return api;
  }
  function tryShim(name){
    var works = false;
    try { works = !!window[name] && typeof window[name].getItem === 'function'; void window[name].length; }
    catch (_) { works = false; }
    if (works) return;
    try { Object.defineProperty(window, name, { configurable: true, value: makeStore() }); }
    catch (_) { try { window[name] = makeStore(); } catch (__) {} }
  }
  tryShim('localStorage');
  tryShim('sessionStorage');
  document.addEventListener('click', (e) => {
    if (!e.target || !(e.target instanceof Element)) return;
    var link = e.target.closest('a[href]');
    if (!link) return;
    var href = link.getAttribute('href');
    if (href === null) return;
    var isAnchor = href.startsWith('#') || href === '';
    if (isAnchor) {
      e.preventDefault();
      if (href === '' || href === '#') {
        window.scrollTo({ top: 0 });
        history.replaceState(null, '', ' ');
      } else {
        var targetId = href.slice(1);
        var target = targetId ? document.getElementById(targetId) : null;
        if (target) {
          target.scrollIntoView();
          location.hash === href && history.replaceState(null, '', ' ');
          location.hash = href;
        }
      }
    } else if (link.getAttribute('target') === '_blank') {
      e.preventDefault();
      let safe = false;
      try {
        var url = new URL(href, location.href);
        safe =
          url.protocol === 'http:' ||
          url.protocol === 'https:' ||
          url.protocol === 'mailto:';
      } catch (_) {}
      safe && window.open(href, '_blank', 'noopener,noreferrer');
    }
  });
})();</script>`;
  if (/<head[^>]*>/i.test(doc))
    return doc.replace(/<head[^>]*>/i, (m) => `${m}${shim}`);
  if (/<body[^>]*>/i.test(doc))
    return doc.replace(/<body[^>]*>/i, (m) => `${m}${shim}`);
  return shim + doc;
}

/**
 * Retry failed project-relative image loads inside the deck iframe.
 *
 * Composer / Drive-imported images the model embeds as
 * `<img src="refs/drive/…">` can race against:
 *   - S3 sync-down on the serving pod (file uploaded on a different pod).
 *   - Teamver preview-scope prefix minting (fail-open first paint has no
 *     `<base href>`, so the first fetch resolves against the parent doc URL
 *     and 404s until the deck srcdoc rebuilds with a real base).
 *
 * Without retry the user sees the browser's broken-image placeholder + alt
 * text (visually "the slide only has the image title") even after the file
 * becomes reachable a moment later. This helper listens for `error` on any
 * `<img>` with a same-origin / relative src and retries with a cache-bust up
 * to a few times, spaced to cover S3 lag and prefix retry cadence.
 */
function injectPreviewImageRetryBridge(doc: string): string {
  const script = `<script data-od-preview-image-retry>(function(){
  var MAX_RETRIES = 3;
  var RETRY_DELAYS_MS = [400, 1200, 3000];
  var STATE = new WeakMap();
  function hasScopedBase(){
    try {
      var base = document.querySelector('base[href]');
      if (!base) return false;
      var href = base.getAttribute('href') || '';
      if (!href || href === 'about:blank') return false;
      // Relative project assets need a project-scoped /raw/ or /preview/ base.
      return /\\/(?:raw|preview)\\//.test(href) || href.indexOf('/api/projects/') === 0;
    } catch (_) { return false; }
  }
  function shouldRetry(img){
    // Without <base href> relative src resolves against about:srcdoc — burn
    // the retry budget only after a scoped base is present (S3 lag case).
    if (!hasScopedBase()) return false;
    var raw = img.getAttribute('src');
    if (!raw) return false;
    var trimmed = String(raw).trim();
    if (!trimmed) return false;
    if (/^(?:data:|blob:|about:|javascript:)/i.test(trimmed)) return false;
    if (/^https?:/i.test(trimmed)) {
      try {
        var abs = new URL(trimmed, location.href);
        return abs.origin === location.origin;
      } catch (_) { return false; }
    }
    return true;
  }
  function bump(url, nonce){
    var sep = url.indexOf('?') >= 0 ? '&' : '?';
    return url + sep + '_odr=' + nonce;
  }
  function unicodeVariants(url){
    // Try alternate NFC / NFD forms after byte-exact same-URL retries fail.
    // Hangul filenames uploaded from macOS often persist in one Unicode form
    // while the HTML references the other — swapping fixes preview 404s
    // without a page reload.
    var out = [];
    if (!url) return out;
    try { var nfc = url.normalize('NFC'); if (nfc !== url) out.push(nfc); } catch (_) {}
    try { var nfd = url.normalize('NFD'); if (nfd !== url && out.indexOf(nfd) < 0) out.push(nfd); } catch (_) {}
    return out;
  }
  function retry(img){
    if (!img || !img.isConnected) return;
    if (!shouldRetry(img)) return;
    var state = STATE.get(img);
    if (!state) {
      var original = img.getAttribute('src') || '';
      // Strip prior _odr cache-bust so we retry from the clean project path.
      original = original.replace(/([?&])_odr=[^&]*/g, '$1').replace(/[?&]$/, '');
      state = { original: original, attempts: 0, variants: null, variantIndex: -1 };
      STATE.set(img, state);
    }
    if (state.attempts >= MAX_RETRIES) {
      // After same-URL budget is spent, try one Unicode variant (NFC↔NFD) as
      // a last-ditch swap for Hangul filename mismatches.
      if (state.variants === null) state.variants = unicodeVariants(state.original);
      state.variantIndex += 1;
      if (state.variantIndex >= state.variants.length) return;
      var swap = state.variants[state.variantIndex];
      setTimeout(function(){
        if (!img.isConnected) return;
        if (!hasScopedBase()) return;
        try {
          img.src = bump(swap, 'u' + state.variantIndex + '-' + Date.now());
        } catch (_) {}
      }, 400);
      return;
    }
    var delay = RETRY_DELAYS_MS[state.attempts] || 3000;
    state.attempts += 1;
    setTimeout(function(){
      if (!img.isConnected) return;
      if (!hasScopedBase()) return;
      var complete = img.complete && img.naturalWidth > 0;
      if (complete) return;
      try {
        img.src = bump(state.original, 'r' + state.attempts + '-' + Date.now());
      } catch (_) {}
    }, delay);
  }
  function onError(event){
    var img = event && event.target;
    if (!img || img.tagName !== 'IMG') return;
    retry(img);
  }
  document.addEventListener('error', onError, true);
  try {
    var mo = new MutationObserver(function(mutations){
      for (var i = 0; i < mutations.length; i++) {
        var added = mutations[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var node = added[j];
          if (!node || node.nodeType !== 1) continue;
          if (node.tagName === 'IMG') {
            if (node.complete && node.naturalWidth === 0) retry(node);
          } else if (node.querySelectorAll) {
            var imgs = node.querySelectorAll('img');
            for (var k = 0; k < imgs.length; k++) {
              var img = imgs[k];
              if (img.complete && img.naturalWidth === 0) retry(img);
            }
          }
        }
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  } catch (_) {}
})();</script>`;
  if (/<head[^>]*>/i.test(doc))
    return doc.replace(/<head[^>]*>/i, (m) => `${m}${script}`);
  if (/<body[^>]*>/i.test(doc))
    return doc.replace(/<body[^>]*>/i, (m) => `${m}${script}`);
  return script + doc;
}

function injectPreviewFocusGuard(doc: string): string {
  const script = `<script data-od-preview-focus-guard>(function(){
  var lastTrustedInputAt = 0;
  function userActivated(){
    return Date.now() - lastTrustedInputAt < 1000;
  }
  function markTrustedInput(event){
    if (event && event.isTrusted) lastTrustedInputAt = Date.now();
  }
  document.addEventListener('pointerdown', function(event){
    markTrustedInput(event);
  }, true);
  document.addEventListener('keydown', function(event){
    markTrustedInput(event);
  }, true);
  try {
    var nativeWindowFocus = window.focus && window.focus.bind(window);
    Object.defineProperty(window, 'focus', {
      configurable: true,
      writable: true,
      value: function(){
        if (userActivated() && nativeWindowFocus) return nativeWindowFocus();
      }
    });
  } catch (_) {}
  try {
    var nativeElementFocus = HTMLElement.prototype.focus;
    Object.defineProperty(HTMLElement.prototype, 'focus', {
      configurable: true,
      writable: true,
      value: function(options){
        if (userActivated()) return nativeElementFocus.call(this, options);
      }
    });
  } catch (_) {}
})();</script>`;
  if (/<head[^>]*>/i.test(doc))
    return doc.replace(/<head[^>]*>/i, (m) => `${m}${script}`);
  if (/<body[^>]*>/i.test(doc))
    return doc.replace(/<body[^>]*>/i, (m) => `${m}${script}`);
  return script + doc;
}

function htmlHasLoadTimeLocationNavigation(source: string): boolean {
  if (/\blocation\s*\.\s*(?:reload|replace|assign)\s*\(/i.test(source)) return true;
  if (/\blocation\s*\.\s*href\s*=[^=]/i.test(source)) return true;
  if (/\b(?:window|document|self|top|parent)\s*\.\s*location\s*=[^=]/i.test(source)) return true;
  return false;
}

function injectPreviewRedirectGuard(
  doc: string,
  opts: { blockLoadTimeScriptRedirect?: boolean } = {},
): string {
  const script = `<script data-od-preview-redirect-guard>(function(){
  var NAME_PREFIX = '__odRedirectGuard=';
  var MAX_HOPS = ${PREVIEW_REDIRECT_GUARD_MAX_HOPS};
  var WINDOW_MS = ${PREVIEW_REDIRECT_GUARD_WINDOW_MS};
  var SELF_MIN_DELAY_MS = ${PREVIEW_REDIRECT_GUARD_SELF_REFRESH_MIN_DELAY_MS};
  var MESSAGE_TYPE = ${JSON.stringify(PREVIEW_REDIRECT_LOOP_MESSAGE)};
  var BLOCK_LOAD_TIME_SCRIPT_REDIRECT = ${opts.blockLoadTimeScriptRedirect ? 'true' : 'false'};
  function nowMs(){ try { return Date.now(); } catch (_) { return 0; } }
  function readState(){
    try {
      var raw = window.name;
      if (typeof raw === 'string' && raw.indexOf(NAME_PREFIX) === 0) {
        var parsed = JSON.parse(raw.slice(NAME_PREFIX.length));
        if (parsed && typeof parsed.hops === 'number' && typeof parsed.windowStart === 'number') return parsed;
      }
    } catch (_) {}
    return null;
  }
  function writeState(state){
    try { window.name = NAME_PREFIX + JSON.stringify({ hops: state.hops, windowStart: state.windowStart }); } catch (_) {}
  }
  function clearState(){
    try { if (typeof window.name === 'string' && window.name.indexOf(NAME_PREFIX) === 0) window.name = ''; } catch (_) {}
  }
  function nextState(){
    var t = nowMs();
    var prev = readState();
    var withinWindow = prev && (t - prev.windowStart) <= WINDOW_MS;
    return { hops: (withinWindow ? prev.hops : 0) + 1, windowStart: withinWindow ? prev.windowStart : t };
  }
  function scheduleCandidateReset(state){
    try {
      if (typeof setTimeout !== 'function') return;
      setTimeout(function(){
        try {
          var current = readState();
          if (current && current.hops === state.hops && current.windowStart === state.windowStart) clearState();
        } catch (_) {}
      }, WINDOW_MS + 1);
    } catch (_) {}
  }
  function report(hops){
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: MESSAGE_TYPE, hops: hops }, '*');
      }
    } catch (_) {}
  }
  function recordScriptRedirectCandidate(){
    if (!BLOCK_LOAD_TIME_SCRIPT_REDIRECT) return;
    var state = nextState();
    if (state.hops > MAX_HOPS) {
      clearState();
      report(state.hops);
      return;
    }
    writeState(state);
    scheduleCandidateReset(state);
  }
  function metaRefreshes(){
    var out = [];
    try {
      var metas = document.getElementsByTagName('meta');
      for (var i = 0; i < metas.length; i++) {
        var equiv = metas[i].getAttribute ? metas[i].getAttribute('http-equiv') : null;
        if (equiv && String(equiv).toLowerCase() === 'refresh') out.push(metas[i]);
      }
    } catch (_) {}
    return out;
  }
  function parseContent(meta){
    var content = '';
    try { content = String(meta.getAttribute('content') || ''); } catch (_) {}
    var delayMatch = content.match(/^\\s*([0-9]+(?:\\.[0-9]+)?)/);
    var delayMs = delayMatch ? Math.round(parseFloat(delayMatch[1]) * 1000) : 0;
    var urlMatch = content.match(/[;,]\\s*url\\s*=\\s*['"]?\\s*([^'"\\s]+)/i);
    return { delayMs: delayMs, url: urlMatch ? urlMatch[1] : '' };
  }
  function currentArtifactHref(){
    try {
      var href = String(location.href || '');
      if (href === 'about:srcdoc') return String(document.baseURI || href);
      return href;
    } catch (_) { return ''; }
  }
  function isSelfTarget(url){
    if (!url) return true;
    try {
      var base = document.baseURI || location.href;
      return new URL(url, base).href === currentArtifactHref();
    } catch (_) { return false; }
  }
  function isFastSrcdocUrlHop(parsed){
    if (!parsed.url || parsed.delayMs > SELF_MIN_DELAY_MS) return false;
    try { return String(location.href || '') === 'about:srcdoc'; } catch (_) { return false; }
  }
  function neutralize(metas){
    for (var i = 0; i < metas.length; i++) {
      try { metas[i].parentNode && metas[i].parentNode.removeChild(metas[i]); } catch (_) {}
    }
    try { if (window.stop) window.stop(); } catch (_) {}
  }
  function evaluate(){
    var metas = metaRefreshes();
    if (!metas.length) {
      if (!BLOCK_LOAD_TIME_SCRIPT_REDIRECT) clearState();
      return;
    }
    var selfLoop = false;
    for (var i = 0; i < metas.length; i++) {
      var parsed = parseContent(metas[i]);
      if (parsed.delayMs <= SELF_MIN_DELAY_MS && isSelfTarget(parsed.url)) { selfLoop = true; break; }
      if (isFastSrcdocUrlHop(parsed)) { selfLoop = true; break; }
    }
    var state = nextState();
    if (selfLoop || state.hops > MAX_HOPS) {
      neutralize(metas);
      clearState();
      report(state.hops);
      return;
    }
    writeState(state);
  }
  recordScriptRedirectCandidate();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', evaluate);
  } else {
    evaluate();
  }
})();</script>`;
  if (/<head[^>]*>/i.test(doc))
    return doc.replace(/<head[^>]*>/i, (m) => `${m}${script}`);
  if (/<body[^>]*>/i.test(doc))
    return doc.replace(/<body[^>]*>/i, (m) => `${m}${script}`);
  return script + doc;
}

function injectPreviewArtifactGuard(doc: string): string {
  const style = `<style data-od-preview-artifact-guard>
.deck-counter,
.deck-hint,
.deck-controls,
.deck-page-controls,
.deck-pager,
.deck-progress,
.deck-nav,
.deck-navigation,
#deck-prev,
#deck-next,
#deck-cur,
#deck-total,
[data-deck-controls],
[data-page-controls] {
  display: none !important;
  visibility: hidden !important;
  pointer-events: none !important;
}
</style>`;
  const script = `<script data-od-preview-artifact-guard>${buildArtifactPreviewDomLeakGuardScript()}</script>`;
  const withStyle = /<head[^>]*>/i.test(doc)
    ? doc.replace(/<head[^>]*>/i, (m) => `${m}${style}`)
    : (/<body[^>]*>/i.test(doc) ? doc.replace(/<body[^>]*>/i, (m) => `${m}${style}`) : style + doc);
  if (/<head[^>]*>/i.test(withStyle))
    return withStyle.replace(/<head[^>]*>/i, (m) => `${m}${script}`);
  if (/<body[^>]*>/i.test(withStyle))
    return withStyle.replace(/<body[^>]*>/i, (m) => `${m}${script}`);
  return script + withStyle;
}

// Selection bridge: shared substrate for Comment mode and Inspect mode.
// Both modes pick a [data-od-id] / [data-screen-label] element on click;
// the difference is what the host does with the selection — annotate
// (Comment) or live-tune basic styles (Inspect).
//
// Inspect adds four messages on top of the comment protocol:
//   in:  { type: 'od:inspect-set', elementId, selector, prop, value }
//        Apply (or unset, when value === '') a per-element CSS override.
//   in:  { type: 'od:inspect-reset', elementId? } Clear overrides for one
//        element, or all if elementId is omitted.
//   in:  { type: 'od:inspect-extract' } Reply with the cumulative
//        override map so the host can persist to source.
//   in:  { type: 'od:inspect-replay', overrides } Replace the in-memory
//        override map with the host's authoritative set so the iframe
//        preview matches host state after every srcdoc rebuild. Without
//        this the bridge re-hydrates only the persisted <style> block on
//        load, so any unsaved edit the host still holds disappears from
//        the preview while saveInspectToSource() can later commit CSS the
//        user is no longer seeing. Re-validates every entry under the
//        same allow-list / value sanitizer applied to od:inspect-set.
//   out: { type: 'od:inspect-overrides', overrides } The current snapshot,
//        sent in reply to extract and after every set/reset/replay. The
//        host re-derives the persisted CSS body from the structured map
//        under its own allow-list — the bridge's own stylesheet text is
//        NOT included in this message because artifact JS can forge a
//        same-source od:inspect-overrides containing a hostile `css`.
//
// Overrides are written into a single <style data-od-inspect-overrides>
// block in <head>, with `!important` on every property so the bridge
// can defeat author inline styles (common in agent-generated HTML).
//
// Security: this bridge runs inside a sandboxed iframe but still shares the
// host page context for the override <style> element. The message listener
// does NOT validate ev.origin — the web app runs on configurable ports and
// preview domains, so the host origin is not stable. The bridge therefore
// trusts any parent that can postMessage to it and relies on iframe
// sandboxing + the prop allow-list / value sanitization below to contain
// damage. Any parent able to postMessage here can already mount the iframe.
function injectSelectionBridge(
  doc: string,
  options: { initialCommentMode?: boolean; initialInspectMode?: boolean } = {},
): string {
  const initialComment = options.initialCommentMode ? 'true' : 'false';
  const initialInspect = options.initialInspectMode ? 'true' : 'false';
  const script = `<script data-od-selection-bridge>(function(){
  var commentEnabled = ${initialComment};
  var inspectEnabled = ${initialInspect};
  // Comment mode has two sub-tools (kept on the host side as boardTool):
  //   'picker' — click-to-select an element for annotation.
  //   'pod'    — pointer-drag a freeform stroke that the host turns into a
  //              pod selection covering whatever the stroke encloses.
  // Inspect mode always uses 'picker'-style click selection regardless of
  // this value.
  var mode = 'picker';
  var hoveredId = null;
  var drawing = false;
  var stroke = [];
  var strokeFrame = null;
  var postTargetsTimer = null;
  // overrides[elementId] = { selector: '[data-od-id="x"]', props: { color: '#fff', ... } }
  var overrides = Object.create(null);
  var styleEl = null;
  // Allow-list of CSS properties the host may override. A malicious parent
  // could otherwise smuggle arbitrary CSS (or, with </style>, raw HTML)
  // through od:inspect-set. Keep this in sync with the InspectPanel UI.
  var ALLOWED_PROPS = {
    'color': true,
    'background-color': true,
    'font-size': true,
    'font-weight': true,
    'font-family': true,
    'line-height': true,
    'text-align': true,
    'padding': true,
    'padding-top': true,
    'padding-right': true,
    'padding-bottom': true,
    'padding-left': true,
    'border-radius': true
  };
  // Reject any value that could break out of a 'prop: value' declaration:
  // semicolons (extra declarations), braces (close the rule), angle
  // brackets (close the <style> tag), and newlines (defense in depth).
  // Mirror HOST_UNSAFE_INSPECT_VALUE — block url()/expression()/javascript:/….
  var UNSAFE_VALUE = /[;{}<>\\n\\r]|url\\s*\\(|expression\\s*\\(|image-set\\s*\\(|element\\s*\\(|-moz-binding|javascript\\s*:|vbscript\\s*:|data\\s*:/i;
  function normalizeInspectCssValue(css){
    var text = String(css || '');
    text = text.replace(/\\/\\*[\\s\\S]*?\\*\\//g, '');
    text = text.replace(/\\\\(?:\\r\\n|[\\n\\r\\f])/g, '');
    text = text.replace(/\\\\([0-9a-fA-F]{1,6})(\\r\\n|[ \\t\\r\\n\\f])?/g, function(_m, hex){
      var code = parseInt(hex, 16);
      if (!isFinite(code) || code < 0 || code > 0x10ffff) return '';
      try { return String.fromCodePoint(code); } catch (_e) { return ''; }
    });
    text = text.replace(/\\\\(.)/g, '$1');
    return text;
  }
  function inspectValueUnsafe(v){
    var trimmed = String(v || '').trim();
    if (!trimmed) return false;
    return UNSAFE_VALUE.test(normalizeInspectCssValue(trimmed));
  }
  function active(){ return commentEnabled || inspectEnabled; }
  function deckSlideIndexForPayload(anchorEl){
    // Prefer the slide that actually contains the clicked element. The
    // globally "active" slide from deck navigation heuristics can lag
    // behind what the user sees (transform decks, framework idx desync,
    // stacked-stage letterbox) and was the main source of wrong slideIndex
    // on comment pins.
    try {
      if (anchorEl && typeof window.__odSlideIndexForElement === 'function') {
        var fromElement = window.__odSlideIndexForElement(anchorEl);
        if (typeof fromElement === 'number' && fromElement >= 0) return fromElement;
      }
    } catch (_) {}
    // Emit slideIndex for any artifact that reports a slide-shaped
    // structure (>=1 slide-class element under a deck container /
    // body). Single-slide "decks" still need the index so the
    // deck-patch contract (\`<section class="slide" data-slide-index="0">\`)
    // has a target to name — without this line the model would fall
    // back to full-deck rewrite for any single-slide artifact.
    try {
      var state = window.__odDeckSlideState && window.__odDeckSlideState();
      if (state && typeof state.active === 'number' && state.count >= 1) return state.active;
    } catch (_) {}
    return null;
  }
  function elementVisibleForComment(el, rect){
    if (!el || !rect || rect.width <= 0 || rect.height <= 0) return false;
    try {
      var cs = window.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
    } catch (_) {}
    return true;
  }
  function esc(value){ try { return window.CSS && CSS.escape ? CSS.escape(value) : String(value).replace(/"/g, '\\\\"'); } catch (_) { return String(value); } }
  // Recompute the selector from elementId rather than trusting the one in
  // the inbound message — a forged selector like
  // '} </style><script>...' would otherwise be concatenated into the
  // override <style> sheet verbatim. The hint string is only inspected to
  // decide which attribute kind (data-od-id vs data-screen-label) was the
  // user's pick at click time, so we tune the same node the host
  // serializer keys off; the hint itself is never written into CSS.
  function safeSelectorFor(elementId, hint){
    var id = String(elementId);
    var kind = null;
    if (typeof hint === 'string') {
      if (hint.indexOf('[data-od-id=') === 0) kind = 'data-od-id';
      else if (hint.indexOf('[data-screen-label=') === 0) kind = 'data-screen-label';
    }
    if (kind === 'data-screen-label' && document.querySelector('[data-screen-label="' + esc(id) + '"]')) {
      return '[data-screen-label="' + esc(id) + '"]';
    }
    if (kind === 'data-od-id' && document.querySelector('[data-od-id="' + esc(id) + '"]')) {
      return '[data-od-id="' + esc(id) + '"]';
    }
    if (document.querySelector('[data-od-id="' + esc(id) + '"]')) {
      return '[data-od-id="' + esc(id) + '"]';
    }
    if (document.querySelector('[data-screen-label="' + esc(id) + '"]')) {
      return '[data-screen-label="' + esc(id) + '"]';
    }
    return null;
  }
  function ensureStyleEl(){
    if (styleEl && styleEl.isConnected) return styleEl;
    styleEl = document.querySelector('style[data-od-inspect-overrides]');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.setAttribute('data-od-inspect-overrides', '');
      (document.head || document.documentElement).appendChild(styleEl);
    }
    return styleEl;
  }
  // Hydrate the in-memory override map from any persisted
  // <style data-od-inspect-overrides> block already in the document.
  // Without this, the first od:inspect-set rebuilds the sheet from an
  // empty map and silently drops every previously saved rule for other
  // elements — a subsequent Save-to-source would then erase them from
  // the artifact too.
  function hydrateOverridesFromDom(){
    var existing = document.querySelector('style[data-od-inspect-overrides]');
    if (!existing) return;
    var text = existing.textContent || '';
    var ruleRe = /(\\[data-(?:od-id|screen-label)="[^"]*"\\])\\s*\\{\\s*([^}]*)\\}/g;
    var match;
    while ((match = ruleRe.exec(text)) !== null) {
      var selector = match[1];
      var declBody = match[2];
      var idMatch = selector.match(/="([^"]*)"/);
      if (!idMatch) continue;
      var elementId = idMatch[1];
      var props = Object.create(null);
      var decls = declBody.split(';');
      for (var d = 0; d < decls.length; d++) {
        var raw = decls[d];
        if (!raw) continue;
        var colon = raw.indexOf(':');
        if (colon <= 0) continue;
        var name = raw.slice(0, colon).trim().toLowerCase();
        if (!Object.prototype.hasOwnProperty.call(ALLOWED_PROPS, name)) continue;
        var value = raw.slice(colon + 1).replace(/!important/i, '').trim();
        if (!value || inspectValueUnsafe(value)) continue;
        props[name] = value;
      }
      if (Object.keys(props).length) {
        overrides[elementId] = { selector: selector, props: props };
      }
    }
    styleEl = existing;
  }
  function rebuildStyleSheet(){
    var el = ensureStyleEl();
    var lines = [];
    Object.keys(overrides).forEach(function(id){
      var entry = overrides[id];
      if (!entry) return;
      var props = entry.props || {};
      var keys = Object.keys(props);
      if (!keys.length) return;
      var body = keys.map(function(k){ return k + ': ' + props[k] + ' !important'; }).join('; ');
      lines.push(entry.selector + ' { ' + body + ' }');
    });
    el.textContent = lines.join('\\n');
  }
  function postOverrides(){
    var clean = {};
    Object.keys(overrides).forEach(function(id){
      var entry = overrides[id];
      if (entry && entry.props && Object.keys(entry.props).length) {
        clean[id] = { selector: entry.selector, props: Object.assign({}, entry.props) };
      }
    });
    // Intentionally do NOT include a css string here. Artifact code
    // running inside this iframe shares window.parent and could forge
    // od:inspect-overrides with a hostile css (e.g. </style><script>...).
    // The host re-derives CSS from the structured overrides map under
    // its own allow-list, so any stray css field on the wire would only
    // be a false-trust trap.
    try { window.parent.postMessage({ type: 'od:inspect-overrides', overrides: clean }, '*'); } catch (_) {}
  }
  function styleSnapshot(el){
    try {
      var cs = window.getComputedStyle(el);
      return {
        color: cs.color,
        backgroundColor: cs.backgroundColor,
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
        lineHeight: cs.lineHeight,
        paddingTop: cs.paddingTop,
        paddingRight: cs.paddingRight,
        paddingBottom: cs.paddingBottom,
        paddingLeft: cs.paddingLeft,
        borderRadius: cs.borderTopLeftRadius,
        textAlign: cs.textAlign,
        fontFamily: cs.fontFamily
      };
    } catch (_) { return null; }
  }
  function annotatedSelectorFor(el){
    var id = el.getAttribute('data-od-id') || el.getAttribute('data-screen-label');
    if (!id) return null;
    return el.hasAttribute('data-od-id') ? '[data-od-id="' + esc(id) + '"]' : '[data-screen-label="' + esc(id) + '"]';
  }
  function domSelectorFor(el){
    if (!el || !el.tagName || el === document.documentElement || el === document.body) return null;
    var parts = [];
    var node = el;
    while (node && node !== document.documentElement && node !== document.body) {
      var tag = node.tagName ? node.tagName.toLowerCase() : '';
      if (!tag || /^(script|style|template|meta|link|title|noscript)$/.test(tag)) return null;
      var parent = node.parentElement;
      if (!parent) return null;
      var index = 1;
      var sibling = node.previousElementSibling;
      while (sibling) {
        if (sibling.tagName && sibling.tagName.toLowerCase() === tag) index++;
        sibling = sibling.previousElementSibling;
      }
      parts.unshift(tag + ':nth-of-type(' + index + ')');
      node = parent;
    }
    if (!parts.length) return null;
    return 'body > ' + parts.join(' > ');
  }
  function visibleTarget(el){
    if (!el || !el.getBoundingClientRect) return false;
    if (el === document.documentElement || el === document.body) return false;
    if (/^(script|style|template|meta|link|title|noscript)$/.test(el.tagName ? el.tagName.toLowerCase() : '')) return false;
    try {
      var rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return false;
      var cs = window.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.pointerEvents === 'none') return false;
    } catch (_) {
      return false;
    }
    return true;
  }
function meaningfulDomFallbackTarget(el) {
  if (!visibleTarget(el)) return false;

  var tag = el.tagName ? el.tagName.toLowerCase() : '';

  if (/^(a|button|input|textarea|select|label|img|video|canvas|h1|h2|h3|h4|h5|h6|p|li|td|th)$/.test(tag)) {
    return true;
  }

  if (
    el.getAttribute &&
    (
      el.getAttribute('role') ||
      el.getAttribute('aria-label') ||
      el.getAttribute('title')
    )
  ) {
    return true;
  }

  if (tag === 'svg') {
    return !!(
      el.getAttribute &&
      (
        el.getAttribute('role') ||
        el.getAttribute('aria-label') ||
        el.getAttribute('title')
      )
    );
  }

  var text = (el.textContent || '').replace(/\s+/g, ' ').trim();
  if (!text) return false;

  if (/^(span|strong|em|b|i|small|code|mark)$/.test(tag)) return true;

  var meaningfulChildren = 0;
  for (var child = el.firstElementChild;child;child = child.nextElementSibling) {
    var childTag = child.tagName ? child.tagName.toLowerCase() : '';
    if (/^(script|style|template|meta|link|title|noscript)$/.test(childTag)) continue;
    if ((child.textContent || '').replace(/\s+/g, ' ').trim() || /^(img|video|canvas|svg|input|textarea|select)$/.test(childTag)) {
      meaningfulChildren++;
      if (meaningfulChildren > 1) return false;
    }
  }

  return true;
}
  function generatedRootAnnotation(el, id){
    return id === 'path-0' && el && el.parentElement === document.body && el.id === 'root';
  }
  function targetFrom(el, allowDomFallback, clickedEl, clickPoint){
    var id = el.getAttribute('data-od-id') || el.getAttribute('data-screen-label');
    if (allowDomFallback && id && generatedRootAnnotation(el, id)) return null;
    var selector = annotatedSelectorFor(el);
    if (!id && allowDomFallback && meaningfulDomFallbackTarget(el)) {
      selector = domSelectorFor(el);
      if (selector) id = 'dom:' + selector;
    }
    if (!id || !selector) return null;
    var rect = el.getBoundingClientRect();
    var tag = el.tagName ? el.tagName.toLowerCase() : 'element';
    var cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\\s+/).slice(0,2).join('.') : '';
    var html = '';
    try { html = (el.outerHTML || '').replace(/\\s+/g, ' ').match(/^<[^>]+>/)?.[0] || ''; } catch (_) {}
    var position = { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) };
    if (!elementVisibleForComment(el, position)) return null;
    var payload = {
      type: 'od:comment-target',
      elementId: id,
      selector: selector,
      label: tag + cls,
      text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 160),
      position: position,
      htmlHint: html.slice(0, 180),
      style: styleSnapshot(el)
    };
    var slideIndex = deckSlideIndexForPayload(el);
    if (typeof slideIndex === 'number') payload.slideIndex = slideIndex;
    if (clickPoint) {
      payload.hoverPoint = { x: Math.round(clickPoint.x), y: Math.round(clickPoint.y) };
    }
    if (clickedEl && clickedEl !== el) {
      var clickedTag = clickedEl.tagName ? clickedEl.tagName.toLowerCase() : 'element';
      var clickedCls = typeof clickedEl.className === 'string' && clickedEl.className.trim() ? '.' + clickedEl.className.trim().split(/\\s+/).slice(0,2).join('.') : '';
      payload.clickedDescendant = {
        label: clickedTag + clickedCls,
        text: (clickedEl.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 80)
      };
    }
    return payload;
  }
  function allTargets(){
    var annotatedNodes = document.querySelectorAll('[data-od-id], [data-screen-label]');
    var includeDomFallback = canUseDomFallback();
    var nodes = includeDomFallback
      ? document.querySelectorAll('body *')
      : annotatedNodes;
    var items = [];
    var seen = Object.create(null);
    for (var i = 0; i < nodes.length; i++) {
      var item = targetFrom(nodes[i], includeDomFallback);
      if (item && !seen[item.elementId]) {
        seen[item.elementId] = true;
        items.push(item);
      }
    }
    return items;
  }
  var postTargetsPending = false;
  var postPreviewScrollPending = false;
  var postActiveTargetPending = false;
  var activeCommentElementId = null;
  var activeCommentSelector = null;
  function previewScrollElement(){
    return document.querySelector('.design-canvas') || document.scrollingElement || document.documentElement;
  }
  function previewScrollBy(left, top){
    var dx = Number(left || 0);
    var dy = Number(top || 0);
    if (!Number.isFinite(dx)) dx = 0;
    if (!Number.isFinite(dy)) dy = 0;
    if (!dx && !dy) return;
    var el = previewScrollElement();
    if (!el) return;
    try {
      if (typeof el.scrollBy === 'function') el.scrollBy({ left: dx, top: dy, behavior: 'auto' });
      else {
        el.scrollLeft = (el.scrollLeft || 0) + dx;
        el.scrollTop = (el.scrollTop || 0) + dy;
      }
    } catch (_) {
      try {
        el.scrollLeft = (el.scrollLeft || 0) + dx;
        el.scrollTop = (el.scrollTop || 0) + dy;
      } catch (__) {}
    }
    schedulePostTargets();
    schedulePostPreviewScroll();
  }
  function postPreviewScroll(){
    var el = previewScrollElement();
    if (!el) return;
    var frame = document.scrollingElement || document.documentElement;
    window.parent.postMessage({
      type: 'od:preview-scroll',
      canvasLeft: Math.round(el.scrollLeft || 0),
      canvasTop: Math.round(el.scrollTop || 0),
      frameLeft: Math.round(frame.scrollLeft || 0),
      frameTop: Math.round(frame.scrollTop || 0)
    }, '*');
  }
  function schedulePostPreviewScroll(){
    if (postPreviewScrollPending) return;
    postPreviewScrollPending = true;
    window.requestAnimationFrame(function(){
      postPreviewScrollPending = false;
      postPreviewScroll();
    });
  }
  function requestPreviewScrollRestore(){
    window.parent.postMessage({ type: 'od:preview-scroll-request' }, '*');
  }
  function findCommentTargetByIdentity(elementId, selector){
    var el = null;
    if (selector) {
      try { el = document.querySelector(String(selector)); } catch (_) { el = null; }
    }
    if (!el && elementId) {
      try {
        var id = String(elementId).replace(/"/g, '\\"');
        el = document.querySelector('[data-od-id="' + id + '"], [data-screen-label="' + id + '"]');
      } catch (_) { el = null; }
    }
    return el;
  }
  function postActiveCommentTarget(){
    if (!active() || !activeCommentElementId) return;
    var el = findCommentTargetByIdentity(activeCommentElementId, activeCommentSelector);
    if (!el) return;
    var payload = targetFrom(el, commentEnabled && mode === 'picker' && !inspectEnabled);
    if (payload) window.parent.postMessage(Object.assign({}, payload, { type: 'od:comment-active-target-update' }), '*');
  }
  function schedulePostActiveCommentTarget(){
    if (!active() || !activeCommentElementId || postActiveTargetPending) return;
    postActiveTargetPending = true;
    window.requestAnimationFrame(function(){
      postActiveTargetPending = false;
      postActiveCommentTarget();
    });
  }
  function postTargets(){
    if (!active()) return;
    window.parent.postMessage({ type: 'od:comment-targets', targets: allTargets() }, '*');
  }
  function schedulePostTargets(){
    if (!active() || postTargetsPending) return;
    postTargetsPending = true;
    if (postTargetsTimer) window.clearTimeout(postTargetsTimer);
    postTargetsTimer = window.setTimeout(function(){
      window.requestAnimationFrame(function(){
        postTargetsPending = false;
        postTargetsTimer = null;
        postTargets();
      });
    }, 120);
  }
  function relativePoint(ev){
    return { x: Math.round(ev.clientX), y: Math.round(ev.clientY) };
  }
  function postStroke(type){
    window.parent.postMessage({ type: type, points: stroke.slice() }, '*');
  }
  // Coalesce live stroke updates to one post per frame. The stroke array still
  // grows synchronously on every pointermove, but the host (which re-renders
  // the comment overlay on each od:pod-stroke) only sees ~60 updates/sec
  // instead of one per raw pointer event.
  function schedulePostStroke(){
    if (strokeFrame !== null) return;
    strokeFrame = requestAnimationFrame(function(){
      strokeFrame = null;
      postStroke('od:pod-stroke');
    });
  }
  function canUseDomFallback(){
    return commentEnabled && !inspectEnabled;
  }
  function isDeckPickerChrome(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el === document.body || el === document.documentElement) return true;
    var id = el.id || '';
    if (id === 'deck-stage' || id === 'od-stacked-deck-stage' || id === 'deck' || id === 'deck-track') return true;
    if (el.classList && (el.classList.contains('deck-shell') || el.classList.contains('deck-stage'))) return true;
    return false;
  }
  function isSlideSectionContainer(el) {
    if (!el || el.nodeType !== 1) return false;
    var tag = el.tagName ? el.tagName.toLowerCase() : '';
    return !!(el.classList && el.classList.contains('slide') && tag === 'section');
  }
  function eventCandidateElements(event){
    var items = [];
    function push(node){
      if (!node || node.nodeType !== 1) return;
      if (items.indexOf(node) >= 0) return;
      items.push(node);
    }
    try {
      if (
        event &&
        typeof event.clientX === 'number' &&
        typeof event.clientY === 'number' &&
        document.elementsFromPoint
      ) {
        var stack = document.elementsFromPoint(event.clientX, event.clientY);
        for (var s = 0; s < stack.length; s++) push(stack[s]);
      } else if (
        event &&
        typeof event.clientX === 'number' &&
        typeof event.clientY === 'number' &&
        document.elementFromPoint
      ) {
        push(document.elementFromPoint(event.clientX, event.clientY));
      }
    } catch (_) {}
    try {
      if (event && typeof event.composedPath === 'function') {
        var path = event.composedPath();
        for (var i = 0; i < path.length; i++) push(path[i]);
      }
    } catch (_) {}
    push(event && event.target);
    return items;
  }
  function closestTarget(event){
    var candidates = eventCandidateElements(event);
    var allowDomFallback = mode === 'picker' && canUseDomFallback();
    var annotatedFallback = null;
    var slideSectionFallback = null;
    for (var i = 0; i < candidates.length; i++) {
      var clicked = candidates[i];
      if (!clicked || clicked.nodeType !== 1 || isDeckPickerChrome(clicked)) continue;
      var el = clicked;
      while (el && el !== document.documentElement) {
        if (isDeckPickerChrome(el)) {
          el = el.parentElement;
          continue;
        }
        if (allowDomFallback && meaningfulDomFallbackTarget(el)) {
          return { target: el, clicked: clicked };
        }
        if (el.getAttribute && (el.hasAttribute('data-od-id') || el.hasAttribute('data-screen-label'))) {
          var id = el.getAttribute('data-od-id') || el.getAttribute('data-screen-label');
          if (allowDomFallback && generatedRootAnnotation(el, id)) {
            el = el.parentElement;
            continue;
          }
          if (isSlideSectionContainer(el)) {
            if (!slideSectionFallback) slideSectionFallback = { target: el, clicked: clicked };
            break;
          }
          if (!annotatedFallback) annotatedFallback = { target: el, clicked: clicked };
          break;
        }
        el = el.parentElement;
      }
      if (annotatedFallback && !isSlideSectionContainer(annotatedFallback.target)) {
        return annotatedFallback;
      }
    }
    if (annotatedFallback) return annotatedFallback;
    return slideSectionFallback;
  }
  function applyOverride(elementId, selector, prop, value){
    if (!elementId || !prop) return;
    if (!Object.prototype.hasOwnProperty.call(ALLOWED_PROPS, prop)) return;
    var safeSelector = safeSelectorFor(elementId, selector);
    if (!safeSelector) return;
    var v = (value == null) ? '' : String(value).trim();
    if (v && inspectValueUnsafe(v)) return;
    var entry = overrides[elementId];
    if (!entry) {
      entry = { selector: safeSelector, props: Object.create(null) };
      overrides[elementId] = entry;
    } else {
      entry.selector = safeSelector;
    }
    if (!v) delete entry.props[prop];
    else entry.props[prop] = v;
    if (Object.keys(entry.props).length === 0) delete overrides[elementId];
    rebuildStyleSheet();
    postOverrides();
  }
  function resetOverrides(elementId){
    if (elementId) delete overrides[elementId];
    else overrides = Object.create(null);
    rebuildStyleSheet();
    postOverrides();
  }
  window.addEventListener('message', function(ev){
    var data = ev && ev.data;
    if (!data || !data.type) return;
    if (data.type === 'od:comment-mode') {
      commentEnabled = !!data.enabled;
      mode = data.mode === 'pod' ? 'pod' : 'picker';
      document.documentElement.toggleAttribute('data-od-comment-mode', commentEnabled);
      document.documentElement.setAttribute('data-od-comment-mode-kind', mode);
      if (active()) setTimeout(postTargets, 0);
      else {
        hoveredId = null;
        activeCommentElementId = null;
        activeCommentSelector = null;
      }
      if (!commentEnabled || mode !== 'pod') {
        drawing = false;
        stroke = [];
        try { window.parent.postMessage({ type: 'od:pod-clear' }, '*'); } catch (_) {}
      }
      return;
    }
    if (data.type === 'od:preview-scroll-restore') {
      var frame = document.scrollingElement || document.documentElement;
      var el = previewScrollElement();
      if (frame) frame.scrollTo(Number(data.frameLeft || 0), Number(data.frameTop || 0));
      if (el) el.scrollTo(Number(data.canvasLeft || 0), Number(data.canvasTop || 0));
      setTimeout(postPreviewScroll, 0);
      return;
    }
    if (data.type === 'od:comment-active-target') {
      activeCommentElementId = data.elementId ? String(data.elementId) : null;
      activeCommentSelector = data.selector ? String(data.selector) : null;
      schedulePostActiveCommentTarget();
      return;
    }
    if (data.type === 'od:preview-scroll-by') {
      previewScrollBy(data.left, data.top);
      return;
    }

    if (data.type === 'od:inspect-mode') {
      inspectEnabled = !!data.enabled;
      document.documentElement.toggleAttribute('data-od-inspect-mode', inspectEnabled);
      if (active()) setTimeout(postTargets, 0);
      else hoveredId = null;
      return;
    }
    if (data.type === 'od:inspect-set') {
      applyOverride(data.elementId, data.selector, data.prop, data.value);
      return;
    }
    if (data.type === 'od:inspect-reset') {
      resetOverrides(data.elementId);
      return;
    }
    if (data.type === 'od:inspect-extract') {
      postOverrides();
      return;
    }
    if (data.type === 'od:inspect-replay') {
      // Replace the in-memory map with the host's authoritative set so
      // unsaved edits survive a srcdoc rebuild (toggling inspect off/on,
      // switching to comment, any other reload reloads the iframe from
      // previewSource without the unsaved style block). Re-validate every
      // entry: a parent able to postMessage to this bridge is otherwise
      // trusted, but applying its payload through the same allow-list /
      // value sanitizer keeps the override sheet under the bridge's own
      // contract instead of whatever the parent sent.
      var raw = (data && typeof data.overrides === 'object' && data.overrides) ? data.overrides : {};
      overrides = Object.create(null);
      var ids = Object.keys(raw);
      for (var i = 0; i < ids.length; i++) {
        var id = ids[i];
        var entry = raw[id];
        if (!entry || typeof entry.props !== 'object' || !entry.props) continue;
        var safeSelector = safeSelectorFor(id, entry.selector);
        if (!safeSelector) continue;
        var clean = Object.create(null);
        var pkeys = Object.keys(entry.props);
        for (var p = 0; p < pkeys.length; p++) {
          var name = String(pkeys[p]).toLowerCase();
          if (!Object.prototype.hasOwnProperty.call(ALLOWED_PROPS, name)) continue;
          var rawValue = entry.props[pkeys[p]];
          if (rawValue == null) continue;
          var v = String(rawValue).trim();
          if (!v || inspectValueUnsafe(v)) continue;
          clean[name] = v;
        }
        if (Object.keys(clean).length) overrides[id] = { selector: safeSelector, props: clean };
      }
      rebuildStyleSheet();
      postOverrides();
      return;
    }
  });
  function pickerActive(){ return inspectEnabled || (commentEnabled && mode === 'picker'); }
  function restorePickerClickFocus(target) {
    if (!pickerActive() || !target || target.nodeType !== 1) return;
    if (target === document.body || target === document.documentElement) return;
    setTimeout(function() {
      try {
        if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
      } catch (_) {}
    }, 0);
  }
  document.addEventListener('mousedown', function(ev) {
    if (!pickerActive()) return;
    restorePickerClickFocus(ev.target);
  }, false);
  document.addEventListener('mouseover', function(ev){
    if (!pickerActive()) return;
    var result = closestTarget(ev);
    if (!result) return;
    var payload = targetFrom(result.target, commentEnabled && mode === 'picker' && !inspectEnabled);
    if (!payload || payload.elementId === hoveredId) return;
    hoveredId = payload.elementId;
    window.parent.postMessage(Object.assign({}, payload, { type: 'od:comment-hover' }), '*');
  }, true);
  document.addEventListener('mouseout', function(ev){
    if (!pickerActive()) return;
    var result = closestTarget(ev);
    if (!result) return;
    var next = ev.relatedTarget;
    while (next && next !== document.documentElement) {
      if (next === result.target) return;
      next = next.parentElement;
    }
    hoveredId = null;
    window.parent.postMessage({ type: 'od:comment-leave' }, '*');
  }, true);
  document.addEventListener('click', function(ev){
    if (!pickerActive()) return;
    var result = closestTarget(ev);
    if (result) {
      ev.preventDefault();
      ev.stopPropagation();
      var commentPickerClick = commentEnabled && mode === 'picker' && !inspectEnabled;
      var clickPoint = commentPickerClick ? { x: ev.clientX, y: ev.clientY } : null;
      var payload = targetFrom(result.target, commentPickerClick, result.clicked, clickPoint);
      if (payload) {
        activeCommentElementId = payload.elementId || activeCommentElementId;
        activeCommentSelector = payload.selector || activeCommentSelector;
        window.parent.postMessage(payload, '*');
        return;
      }
      // targetFrom refused (rejected as generated root, no usable id,
      // or elementVisibleForComment failed on a zero-size / hidden node).
      // In comment picker mode fall through to the free-pin path so the
      // user still gets an actionable annotation at the click point
      // instead of a silent no-op. Inspect mode / pod mode still bail
      // below because those require a resolvable selector.
    }
    // Free-pin fallback (comment mode only). Lets users drop a comment
    // at a click location even when the artifact has no data-od-id
    // annotations. Skipped for pod mode (drawing) and inspect mode
    // (needs a real selector for live overrides).
    if (!canUseDomFallback() || mode === 'pod') return;
    // Skip clicks on interactive elements so links / buttons / inputs
    // keep their native behavior; pin only on inert surfaces.
    var t = ev.target;
    var walk = t && t.nodeType === 1 ? t : null;
    while (walk && walk !== document.documentElement) {
      var tag = walk.tagName;
      if (tag === 'A' || tag === 'BUTTON' || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'LABEL') return;
      if (walk.isContentEditable) return;
      walk = walk.parentElement;
    }
    ev.preventDefault();
    ev.stopPropagation();
    // Store viewport coordinates to match regular getBoundingClientRect()
    // element targets; the host overlay renders this position directly.
    var pinX = Math.round(ev.clientX);
    var pinY = Math.round(ev.clientY);
    var pinId = 'pin-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36);
    var pinSlideIndex = deckSlideIndexForPayload();
    var pinPayload = {
      type: 'od:comment-target',
      // Synthetic selector / label so daemon upsert validation (which
      // requires both to be non-empty) accepts the saved free-pin.
      selector: '[data-od-pin="' + pinId + '"]',
      label: 'pin',
      text: '',
      position: { x: pinX - 12, y: pinY - 12, width: 24, height: 24 },
      hoverPoint: { x: pinX, y: pinY },
      htmlHint: '',
      style: null,
      freePin: true
    };
    pinPayload.elementId = pinId;
    if (typeof pinSlideIndex === 'number') pinPayload.slideIndex = pinSlideIndex;
    window.parent.postMessage(pinPayload, '*');
  }, true);
  // Pod drawing — only active in comment mode with the 'pod' tool.
  document.addEventListener('pointerdown', function(ev){
    if (!commentEnabled || mode !== 'pod' || ev.button !== 0) return;
    drawing = true;
    stroke = [relativePoint(ev)];
    ev.preventDefault();
    ev.stopPropagation();
    postStroke('od:pod-stroke');
  }, true);
  document.addEventListener('pointermove', function(ev){
    if (!drawing || mode !== 'pod') return;
    var point = relativePoint(ev);
    var last = stroke[stroke.length - 1];
    if (last && Math.hypot(last.x - point.x, last.y - point.y) < 4) return;
    stroke.push(point);
    ev.preventDefault();
    ev.stopPropagation();
    schedulePostStroke();
  }, true);
  function finishStroke(ev){
    if (!drawing || mode !== 'pod') return;
    drawing = false;
    if (strokeFrame !== null) { cancelAnimationFrame(strokeFrame); strokeFrame = null; }
    if (ev) {
      ev.preventDefault();
      ev.stopPropagation();
    }
    postStroke('od:pod-select');
  }
  document.addEventListener('pointerup', finishStroke, true);
  document.addEventListener('pointercancel', finishStroke, true);
  window.addEventListener('resize', schedulePostTargets);
  document.addEventListener('scroll', function(){
    schedulePostActiveCommentTarget();
    schedulePostTargets();
    schedulePostPreviewScroll();
  }, true);
  var mo = new MutationObserver(schedulePostTargets);
  // childList only — NOT attributes/characterData. Re-walking every annotated
  // target on every attribute/text mutation made an animated artifact (inline
  // style/text changes per frame) churn schedulePostTargets continuously while
  // in comment/inspect mode. Structural changes (childList) still re-walk, and
  // scroll/resize already re-post geometry for layout shifts.
  mo.observe(document.documentElement, { subtree: true, childList: true });
  // The active comment marker still has to follow its own element's text and
  // attribute edits, but schedulePostActiveCommentTarget re-posts exactly ONE
  // element (the active comment), so it stays cheap even on animated artifacts —
  // unlike the full allTargets() re-walk above. This is why attributes/
  // characterData live on this targeted observer instead of the main observer.
  var textMo = new MutationObserver(schedulePostActiveCommentTarget);
  textMo.observe(document.documentElement, { subtree: true, characterData: true, attributes: true });
  // Reflect the host-requested initial modes on the documentElement so
  // the cursor/hover styles match what the bridge picks up on click.
  if (commentEnabled) document.documentElement.toggleAttribute('data-od-comment-mode', true);
  if (inspectEnabled) document.documentElement.toggleAttribute('data-od-inspect-mode', true);
  document.documentElement.setAttribute('data-od-comment-mode-kind', mode);
  hydrateOverridesFromDom();
  // Acknowledge the hydrated overrides to the host as a preview signal so
  // diagnostic listeners (and tests) can observe that the bridge is in sync
  // with the persisted style sheet. The host no longer treats this message
  // as save input — it parses the artifact source itself — but emitting it
  // keeps the iframe → host channel symmetric across set/reset/extract.
  if (Object.keys(overrides).length) setTimeout(postOverrides, 0);
  setTimeout(requestPreviewScrollRestore, 0);
  setTimeout(requestPreviewScrollRestore, 80);
  setTimeout(requestPreviewScrollRestore, 240);
  window.__odScheduleCommentTargets = schedulePostTargets;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', postTargets);
  else setTimeout(postTargets, 0);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', postPreviewScroll);
  else setTimeout(postPreviewScroll, 0);
})();</script>`;
  const style = `<style data-od-selection-bridge-style>
html[data-od-comment-mode] body * { cursor: crosshair !important; }
html[data-od-inspect-mode] body * { cursor: crosshair !important; }
html[data-od-comment-mode][data-od-comment-mode-kind="pod"] body * { cursor: cell !important; }
/* Nested iframes (e.g. shared device frames) consume clicks in their own browsing context.
   While picker modes are on, disable pointer events on outer-document iframes so the
   hit target resolves to an annotated ancestor (card, shell) in this document. */
html[data-od-comment-mode] body iframe,
html[data-od-inspect-mode] body iframe { pointer-events: none !important; }
</style>`;
  return injectBeforeBodyEnd(injectBeforeHeadEnd(doc, style), script);
}

// The deck bridge supports three deck conventions found across our skills
// and freeform-generated artifacts:
//   1. Horizontal scroll decks (simple-deck, guizang-ppt) — slides laid out
//      side-by-side, navigation = scrollTo({ left }).
//   2. Class-toggle decks (deck-framework, freeform pitches) — one slide
//      carries `.active` or `.is-active`; siblings are display:none. Their
//      own JS listens for ArrowRight/Left, so we drive them by dispatching
//      synthetic KeyboardEvents.
//   3. Visibility-only decks — no class toggle, slides hidden via inline
//      style. We fall back to keyboard dispatch + visibility detection.
//
// All three report `{ active, count }` back to the host so the toolbar can
// render a unified counter. A MutationObserver on each `.slide` lets us
// catch class changes from the deck's own keyboard handler.
//
// We also inject a small CSS override that fixes a common authoring
// mistake in fixed-canvas decks: a `.stage { display: grid; place-items:
// center }` only centers items within their grid cells, but the track
// itself stays `start`-aligned, so the 1920x1080 canvas top-lefts at
// (0,0) of the stage. Combined with `transform-origin: center center`,
// the scaled canvas ends up offset toward the bottom-right of any
// preview that's smaller than 1920x1080 — exactly what users see in the
// sandbox iframe. `place-content: center` centers the track itself.
//
// Framework decks (apps/daemon/src/prompts/deck-framework.ts) opt out:
// their `fit()` already centers a `transform-origin: top left` stage with
// an explicit `translate(tx, ty)` that assumes the stage's natural layout
// position is (0, 0). If we force `place-content: center` on their
// `.deck-shell` grid, the implicit track gets re-centered to
// ((sw-1920)/2, (sh-1080)/2) and `fit()`'s translate stacks on top, so
// the scaled stage lands ~1000px off-screen and the user sees a mostly-
// black preview with a sliver of slide content in the top-left. Skip the
// override whenever the framework's marker id is present.
function injectDeckBridge(
  doc: string,
  initialSlideIndex = 0,
  compactStackedDeck = false,
): string {
  const safeInitialSlideIndex = Number.isFinite(initialSlideIndex)
    ? Math.max(0, Math.floor(initialSlideIndex))
    : 0;
  const isFrameworkDeck = /\bid\s*=\s*["']deck-stage["']/i.test(doc);
  const isCompactStackedDeck = compactStackedDeck;
  const legacyDeckFix = isFrameworkDeck
    ? ''
    : `<style data-od-deck-fix>
.stage, .deck-stage, .deck-shell { place-content: center !important; }
</style>`;
  // Belt-and-suspenders against agent CSS that re-shows inactive slides
  // (e.g. `.slide.s-about { display:flex !important }` after the framework
  // hide rule). Absolute-stacked slides then paint through transparent
  // regions of the active slide — "ghost text in the background".
  const inactiveSlideHideFix = `<style data-od-deck-inactive-hide>
#deck-stage > .slide:not(.active):not(.is-active):not(.current),
.deck-stage > .slide:not(.active):not(.is-active):not(.current),
.deck-shell > .slide:not(.active):not(.is-active):not(.current),
.deck > .slide:not(.active):not(.is-active):not(.current),
body > .slide:not(.active):not(.is-active):not(.current) {
  display: none !important;
  visibility: hidden !important;
  pointer-events: none !important;
}
</style>`;
  const compactStackedBoot = isCompactStackedDeck
    ? `<script data-od-stacked-boot>document.documentElement.setAttribute('data-od-compact-stacked','');document.documentElement.style.overflow='hidden';</script>`
    : '';
  const compactStackedDeckFix = isCompactStackedDeck
    ? `<style data-od-deck-stacked-fix>
html[data-od-compact-stacked],
html[data-od-compact-stacked] body {
  width: 100% !important;
  height: 100% !important;
  background: #0b0c10 !important;
  margin: 0 !important;
  overflow: hidden !important;
  overscroll-behavior: none !important;
  touch-action: none !important;
}
html[data-od-compact-stacked] body {
  position: relative !important;
}
html[data-od-compact-stacked]:not([data-od-stacked-deck]) .slide ~ .slide {
  display: none !important;
}
#od-stacked-deck-stage {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 1920px;
  height: 1080px;
  margin: 0;
  transform-origin: center center;
}
#od-stacked-deck-stage > .slide {
  box-sizing: border-box !important;
  width: 1920px !important;
  height: 1080px !important;
  min-height: 0 !important;
  max-height: none !important;
  margin: 0 !important;
  position: absolute !important;
  top: 0 !important;
  left: 0 !important;
  overflow: hidden !important;
  display: none !important;
  flex-direction: column;
  justify-content: center;
  align-items: stretch;
}
</style>`
    : '';
  const styleFix = `${compactStackedBoot}${legacyDeckFix}${inactiveSlideHideFix}${compactStackedDeckFix}`;
  const script = `<script data-od-deck-bridge>(function(){
  var initialSlideIndex = ${safeInitialSlideIndex};
  var compactStackedDeckEnabled = ${isCompactStackedDeck ? 'true' : 'false'};
  var didRestoreInitialSlide = false;
  var hostSlideNavigationSeen = false;
  var hostViewport = { w: 0, h: 0, scale: 1, layoutFit: false };
  var deckPanX = 0;
  var deckPanY = 0;
  function resetDeckPan() {
    deckPanX = 0;
    deckPanY = 0;
    nudgeDeckFit();
  }
  function deckPanBy(left, top) {
    var dx = Number(left || 0);
    var dy = Number(top || 0);
    if (!Number.isFinite(dx)) dx = 0;
    if (!Number.isFinite(dy)) dy = 0;
    if (!dx && !dy) return;
    deckPanX += dx;
    deckPanY += dy;
    nudgeDeckFit();
  }
  function frameworkDeckStage() {
    return document.getElementById('deck-stage');
  }
  function stackedDeckStage() {
    return document.getElementById('od-stacked-deck-stage');
  }
  function isStackedSlideCandidate(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.id === 'od-stacked-deck-stage') return false;
    if (el.closest && el.closest('header, nav, #od-stacked-deck-stage')) return false;
    // Only skip slides owned by the real framework / transform-track hosts.
    // Decorative deck-shell wrappers without #deck-stage must still hoist.
    if (el.closest && el.closest('#deck-stage, #deck, #deck-track')) return false;
    return !!(el.classList && el.classList.contains('slide'));
  }
  function slidesFromElementChildren(container) {
    var out = [];
    if (!container || !container.children) return out;
    for (var c = 0; c < container.children.length; c++) {
      var child = container.children[c];
      if (isStackedSlideCandidate(child)) out.push(child);
    }
    return out;
  }
  function stackedSlideNodes() {
    var direct = document.querySelectorAll('body > .slide');
    if (direct.length) return direct;
    if (!document.body) return direct;
    var children = document.body.children;
    for (var i = 0; i < children.length; i++) {
      var el = children[i];
      if (!el || el.nodeType !== 1) continue;
      if (el.id === 'od-stacked-deck-stage') continue;
      var tag = String(el.tagName || '').toLowerCase();
      if (tag === 'header' || tag === 'nav' || tag === 'style' || tag === 'script') continue;
      if (el.classList && el.classList.contains('slide')) continue;
      var wrapped = slidesFromElementChildren(el);
      if (wrapped.length >= 2) return wrapped;
      if (wrapped.length === 0 && el.children.length === 1) {
        var inner = el.children[0];
        if (inner && inner.nodeType === 1) {
          var deep = slidesFromElementChildren(inner);
          if (deep.length >= 2) return deep;
        }
      }
    }
    if (!frameworkDeckStage()) {
      var all = document.querySelectorAll('body .slide');
      var list = [];
      for (var a = 0; a < all.length; a++) {
        if (isStackedSlideCandidate(all[a])) list.push(all[a]);
      }
      if (list.length >= 2) return list;
    }
    return direct;
  }
  function shouldUseStackedDeckStage() {
    if (!compactStackedDeckEnabled) return false;
    if (frameworkDeckStage()) return false;
    if (stackedDeckStage()) return true;
    var direct = stackedSlideNodes();
    if (!direct.length) return false;
    try {
      var bodyStyle = window.getComputedStyle(document.body);
      if (/\\bgrid\\b/i.test(bodyStyle.display)) return false;
      if (/\\bflex\\b/i.test(bodyStyle.display)) {
        var flexDir = String(bodyStyle.flexDirection || 'row').toLowerCase();
        var rowish = flexDir === 'row' || flexDir === 'row-reverse';
        if (rowish || isScrollableOverflowMode(String(bodyStyle.overflowX || '').toLowerCase())) return false;
      }
    } catch (_) {}
    var list = [];
    for (var d = 0; d < direct.length; d++) list.push(direct[d]);
    if (transformTrack(list)) return false;
    var stackedViewport = false;
    function hasFixedCanvasSizingText(value) {
      var text = String(value || '');
      return /(?:^|;)\\s*width\\s*:\\s*1920px\\b/i.test(text)
        && /(?:^|;)\\s*(?:min-)?height\\s*:\\s*1080px\\b/i.test(text);
    }
    function hasFixedCanvasComputedStyle(cs) {
      if (!cs) return false;
      var w = parseFloat(String(cs.width || ''));
      var heightValue = parseFloat(String(cs.height || ''));
      var minHeightValue = parseFloat(String(cs.minHeight || ''));
      var h = isFinite(heightValue) && heightValue > 0 ? heightValue : minHeightValue;
      if (!isFinite(w) || !isFinite(h) || w <= 0 || h <= 0) return false;
      var ratio = w / h;
      return w >= 1200 && h >= 675 && Math.abs(ratio - (16 / 9)) < 0.08;
    }
    for (var i = 0; i < direct.length; i++) {
      var inline = String(direct[i].getAttribute('style') || '');
      if (/min-height\\s*:\\s*100(?:vh|dvh|svh|lvh)/i.test(inline)
        || /(?:^|;)\\s*height\\s*:\\s*100(?:vh|dvh|svh|lvh)/i.test(inline)
        || hasFixedCanvasSizingText(inline)) {
        stackedViewport = true;
        break;
      }
    }
    if (!stackedViewport) {
      try {
        for (var j = 0; j < direct.length; j++) {
          var cs = window.getComputedStyle(direct[j]);
          if (/100(?:vh|dvh|svh|lvh)/i.test(String(cs.minHeight || ''))
            || /100(?:vh|dvh|svh|lvh)/i.test(String(cs.height || ''))
            || hasFixedCanvasComputedStyle(cs)) {
            stackedViewport = true;
            break;
          }
        }
      } catch (_) {}
    }
    if (!stackedViewport && direct.length >= 2 && !hasHorizontalScroll()) {
      stackedViewport = true;
    }
    return stackedViewport;
  }
  var stackedDeckStageHoistInFlight = false;
  function moveSlidesIntoStackedStage(stage, slideList) {
    if (!stage || !slideList || !slideList.length) return;
    for (var i = 0; i < slideList.length; i++) {
      var slide = slideList[i];
      if (!slide || !slide.parentNode) continue;
      if (slide.parentNode === stage) continue;
      try { stage.appendChild(slide); } catch (_) {}
    }
  }
  function bodyDirectChildAncestor(node, body) {
    var cur = node;
    while (cur && cur.parentNode && cur.parentNode !== body) cur = cur.parentNode;
    if (cur && cur.parentNode === body) return cur;
    return null;
  }
  function removeEmptyBodyDirectWrapper(body, wrap, stage) {
    if (!wrap || !body || wrap === body || wrap === stage) return;
    if (wrap.parentNode !== body) return;
    var hasElementChild = false;
    for (var j = 0; j < wrap.childNodes.length; j++) {
      if (wrap.childNodes[j].nodeType === 1) {
        hasElementChild = true;
        break;
      }
    }
    if (!hasElementChild) {
      try { body.removeChild(wrap); } catch (_) {}
    }
  }
  function pruneOrphanStackedDeckShells(body, stage) {
    if (!body) return;
    var children = body.children;
    for (var i = children.length - 1; i >= 0; i--) {
      var el = children[i];
      if (!el || el === stage) continue;
      if (el.id === 'od-stacked-deck-stage') continue;
      var tag = String(el.tagName || '').toLowerCase();
      if (tag === 'header' || tag === 'nav' || tag === 'style' || tag === 'script') continue;
      if (el.querySelector && el.querySelector('.slide')) continue;
      var peel = el;
      while (peel && peel !== body && peel !== stage && peel.children && peel.children.length === 1) {
        var only = peel.children[0];
        if (!only || only.nodeType !== 1) break;
        if (only.classList && only.classList.contains('slide')) break;
        if (only.querySelector && only.querySelector('.slide')) break;
        var onlyHasElement = false;
        for (var k = 0; k < only.childNodes.length; k++) {
          if (only.childNodes[k].nodeType === 1) { onlyHasElement = true; break; }
        }
        if (onlyHasElement) break;
        try { peel.removeChild(only); } catch (_) { break; }
      }
      var hasElementChild = false;
      for (var j = 0; j < el.childNodes.length; j++) {
        if (el.childNodes[j].nodeType === 1) {
          hasElementChild = true;
          break;
        }
      }
      if (!hasElementChild) {
        try { body.removeChild(el); } catch (_) {}
      }
    }
  }
  function compactStackedDeckNavigationReady() {
    if (!compactStackedDeckEnabled) return false;
    if (stackedDeckStage()) return true;
    if (!shouldUseStackedDeckStage()) return false;
    return !!ensureStackedDeckStage();
  }
  function ensureStackedDeckStage() {
    if (!compactStackedDeckEnabled) return null;
    if (frameworkDeckStage()) return null;

    var existing = stackedDeckStage();
    var slideList = stackedSlideNodes();
    if (existing) {
      if (slideList.length) moveSlidesIntoStackedStage(existing, slideList);
      return existing;
    }
    if (!slideList.length) return null;
    if (!shouldUseStackedDeckStage()) return null;

    var first = slideList[0];
    if (!first || !first.parentNode) return null;
    var hostStage = first.closest ? first.closest('#od-stacked-deck-stage') : null;
    if (hostStage) {
      moveSlidesIntoStackedStage(hostStage, slideList);
      return hostStage;
    }

    if (stackedDeckStageHoistInFlight) return stackedDeckStage();
    stackedDeckStageHoistInFlight = true;
    try {
      existing = stackedDeckStage();
      if (existing) {
        moveSlidesIntoStackedStage(existing, slideList);
        return existing;
      }

      var body = document.body;
      if (!body) return null;

      var stage = document.createElement('div');
      stage.id = 'od-stacked-deck-stage';
      stage.setAttribute('data-od-stacked-deck-stage', '');

      var insertParent = body;
      var ref = bodyDirectChildAncestor(first, body) || first;
      if (ref.parentNode !== body) ref = null;

      try {
        if (ref && ref.parentNode === insertParent) {
          insertParent.insertBefore(stage, ref);
        } else {
          insertParent.appendChild(stage);
        }
      } catch (_) {
        existing = stackedDeckStage();
        if (existing) {
          moveSlidesIntoStackedStage(existing, slideList);
          return existing;
        }
        try { insertParent.appendChild(stage); } catch (__) { return stackedDeckStage(); }
      }

      moveSlidesIntoStackedStage(stage, slideList);

      if (ref && ref !== stage && ref.parentNode === body) {
        removeEmptyBodyDirectWrapper(body, ref, stage);
      }
      pruneOrphanStackedDeckShells(body, stage);

      existing = stackedDeckStage();
      if (existing && existing !== stage) {
        moveSlidesIntoStackedStage(existing, slideList);
        try { if (stage.parentNode) stage.parentNode.removeChild(stage); } catch (_) {}
        return existing;
      }

      document.documentElement.setAttribute('data-od-stacked-deck', '');
      var target = Math.max(0, Math.min(slideList.length - 1, initialSlideIndex));
      forceRevealSlide(target);
      return stage;
    } finally {
      stackedDeckStageHoistInFlight = false;
    }
  }
  function layoutViewportSize() {
    var cw = Math.max(0, document.documentElement.clientWidth || 0);
    var ch = Math.max(0, document.documentElement.clientHeight || 0);
    var bw = 0;
    var bh = 0;
    try {
      if (document.body) {
        bw = Math.max(0, document.body.clientWidth || 0);
        bh = Math.max(0, document.body.clientHeight || 0);
      }
    } catch (_) {}
    var w = cw || bw;
    var h = ch || bh;
    var iw = Math.max(0, window.innerWidth || 0);
    var ih = Math.max(0, window.innerHeight || 0);
    if (w > 0 && h > 0) {
      if (iw > w * 1.05) iw = w;
      if (ih > h * 1.05) ih = h;
      return { w: w, h: h };
    }
    return { w: iw, h: ih };
  }
  function frameworkDeckViewport() {
    var layout = layoutViewportSize();
    var iw = layout.w;
    var ih = layout.h;
    var hw = Math.max(0, hostViewport.w || 0);
    var hh = Math.max(0, hostViewport.h || 0);
    var scale = hostViewport.scale > 0 ? hostViewport.scale : 1;
    // Host toolbar zoom uses CSS transform on the iframe shell; FileViewer posts
    // layout box dimensions (useLayoutBox) with scale 1 so fit math stays stable.
    // Auto-fit modal scalers set layoutFit and pass scale < 1 to reconstruct width.
    // Compact stacked decks inject viewport width=1920 so slide vw math stays
    // fixed; that inflates documentElement.clientWidth inside the iframe. The
    // host posts the real iframe layout box via useLayoutBox — always prefer it.
    if (compactStackedDeckEnabled && hw > 0 && hh > 0 && scale <= 1.001) {
      return { w: hw, h: hh };
    }
    if (hw > 0 && hh > 0) {
      if (hostViewport.layoutFit && scale > 0) {
        return { w: hw / scale, h: hh / scale };
      }
      // scale 1 + layout box from host (framework + compact deck previews)
      return { w: hw, h: hh };
    }
    // Compact stacked decks inject <meta viewport width=1920>, which inflates
    // documentElement.clientWidth inside the iframe. Fitting against that box
    // centers the 1920×1080 stage in a fake 1920-wide document while the host
    // only shows the top-left letterbox — black canvas with a working 1/N
    // counter. Wait for od:deck-host-viewport before fitting.
    if (compactStackedDeckEnabled) {
      return { w: 0, h: 0 };
    }
    return { w: iw || hw, h: ih || hh };
  }
  function applyStackedDeckTransform(stage, s, panX, panY) {
    stage.style.transformOrigin = 'center center';
    stage.style.transform = 'translate(calc(-50% + ' + panX + 'px), calc(-50% + ' + panY + 'px)) scale(' + s + ')';
  }
  function runStackedDeckFit() {
    var stage = stackedDeckStage();
    if (!stage && shouldUseStackedDeckStage()) stage = ensureStackedDeckStage();
    if (!stage) return false;
    var vp = frameworkDeckViewport();
    var sw = vp.w;
    var sh = vp.h;
    if (sw <= 0 || sh <= 0) return false;
    var pad = 32;
    var s = Math.min((sw - pad) / 1920, (sh - pad) / 1080);
    if (!isFinite(s) || s <= 0) s = 1;
    applyStackedDeckTransform(stage, s, deckPanX, deckPanY);
    markStackedDeckReadyIfFit();
    return true;
  }
  function runFrameworkDeckFit() {
    var stage = frameworkDeckStage();
    if (!stage) return false;
    var vp = frameworkDeckViewport();
    var sw = vp.w;
    var sh = vp.h;
    if (sw <= 0 || sh <= 0) return false;
    var pad = 32;
    var s = Math.min((sw - pad) / 1920, (sh - pad) / 1080);
    if (!isFinite(s) || s <= 0) s = 1;
    var tx = (sw - 1920 * s) / 2 + deckPanX;
    var ty = (sh - 1080 * s) / 2 + deckPanY;
    stage.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + s + ')';
    return true;
  }
  function nudgeDeckFit() {
    if (runFrameworkDeckFit()) return;
    if (runStackedDeckFit()) return;
    try { window.dispatchEvent(new Event('resize')); }
    catch (_) {}
  }
  function reconcileFrameworkDeckFitSoon() {
    if (!frameworkDeckStage()) return;
    nudgeDeckFit();
    var raf = window.requestAnimationFrame;
    if (typeof raf === 'function') {
      raf(function() { nudgeDeckFit(); });
    } else {
      setTimeout(nudgeDeckFit, 16);
    }
  }
  // Framework decks ship their own fit() on window resize using
  // window.innerWidth, which can be inflated inside the OD iframe.
  // Re-apply our viewport-aware fit on the next turn so a bad pass
  // from the artifact script cannot stick after host zoom/layout changes.
  window.addEventListener('resize', function() {
    setTimeout(reconcileFrameworkDeckFitSoon, 0);
  });
  function slides(){
    // Structured selectors first so decorative .slide markup in non-deck
    // pages (icons, badges, code samples) is not counted as deck slides;
    // fall back to all .slide only when nothing structured matched, so
    // freeform decks that nest slides under an extra wrapper still report
    // the real count instead of leaving the host counter at 1 / 0.
    var structured = document.querySelectorAll('.deck > .slide, .deck-stage > .slide, .deck-shell > .slide, #od-stacked-deck-stage > .slide, body > .slide');
    if (structured.length) return structured;
    return document.querySelectorAll('.slide');
  }
  function scrollOverflow(el){
    if (!el) return 0;
    return Math.max(0, (el.scrollWidth || 0) - (el.clientWidth || 0));
  }
  function overflowMode(el){
    if (!el || !window.getComputedStyle) return '';
    try {
      return String(window.getComputedStyle(el).overflowX || '').toLowerCase();
    } catch (_) {
      return '';
    }
  }
  function isScrollableOverflowMode(mode){
    return mode === 'auto' || mode === 'scroll' || mode === 'overlay';
  }
  function isClippedOverflowMode(mode){
    return mode === 'hidden' || mode === 'clip';
  }
  function isRootScrollContainer(el){
    return !!el && (
      el === document.scrollingElement ||
      el === document.documentElement ||
      el === document.body
    );
  }
  function rootScrollerClipped(){
    return isClippedOverflowMode(overflowMode(document.documentElement)) ||
      isClippedOverflowMode(overflowMode(document.body));
  }
  function scrollLeftOf(el){
    if (!el) return 0;
    try {
      return Number(el.scrollLeft) || 0;
    } catch (_) {
      return 0;
    }
  }
  function scrollTargets(){
    var targets = [];
    function add(node){
      if (!node) return;
      for (var i=0; i<targets.length; i++) if (targets[i] === node) return;
      targets.push(node);
    }
    add(document.scrollingElement);
    add(document.documentElement);
    add(document.body);
    return targets;
  }
  function maxScrollLeft(){
    var targets = scrollTargets();
    var value = 0;
    for (var i=0; i<targets.length; i++) {
      value = Math.max(value, Number(targets[i].scrollLeft || 0));
    }
    return value;
  }
  function hasHorizontalScroll(){
    var targets = scrollTargets();
    for (var i=0; i<targets.length; i++) {
      if (targets[i].scrollWidth > targets[i].clientWidth + 1) return true;
    }
    return false;
  }
  function isScrollDeck(){
    var list = slides();
    if (transformTrack(list)) return false;
    var targets = scrollTargets();
    for (var i=0; i<targets.length; i++) {
      var candidate = targets[i];
      if (scrollOverflow(candidate) <= 1) continue;
      var mode = overflowMode(candidate);
      if (isScrollableOverflowMode(mode)) return true;
      if (isRootScrollContainer(candidate) && !isClippedOverflowMode(mode) && !rootScrollerClipped()) return true;
    }
    return false;
  }
  function findActiveByClass(list){
    for (var i=0; i<list.length; i++) {
      var cl = list[i].classList;
      if (cl && (cl.contains('is-active') || cl.contains('active') || cl.contains('current'))) return i;
    }
    return -1;
  }
  function findActiveByVisibility(list){
    for (var i=0; i<list.length; i++) {
      try {
        var cs = window.getComputedStyle(list[i]);
        if (cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0') return i;
      } catch (_) {}
    }
    return -1;
  }
  function activeIndex(list){
    if (!list || !list.length) return 0;
    if (stackedDeckStage()) {
      var stackedByClass = findActiveByClass(list);
      if (stackedByClass >= 0) return stackedByClass;
      var stackedByVis = findActiveByVisibility(list);
      if (stackedByVis >= 0) return stackedByVis;
      return 0;
    }
    if (isScrollDeck()) {
      var w = Math.max(1, window.innerWidth);
      return Math.max(0, Math.min(list.length - 1, Math.round(maxScrollLeft() / w)));
    }
    var byPagination = activeIndexFromPagination(list);
    if (byPagination >= 0) return byPagination;
    var byTransform = activeIndexFromTransform(list);
    if (byTransform >= 0) return byTransform;
    var byClass = findActiveByClass(list);
    if (byClass >= 0) return byClass;
    var byVis = findActiveByVisibility(list);
    if (byVis >= 0) return byVis;
    return 0;
  }
  function dispatchKey(key){
    // Try window first: many deck frameworks listen on both window and
    // document in capture phase for iframe focus resilience. Dispatching a
    // bubbling event at document hits the document listener and then the
    // window listener, turning one host "next" request into two slide moves.
    var init = { key: key, code: key, bubbles: true, cancelable: true, composed: true };
    var before = activeIndex(slides());
    try {
      window.dispatchEvent(new KeyboardEvent('keydown', init));
      window.dispatchEvent(new KeyboardEvent('keyup', init));
    } catch (_) {}
    if (activeIndex(slides()) !== before) return;
    try {
      document.dispatchEvent(new KeyboardEvent('keydown', init));
      document.dispatchEvent(new KeyboardEvent('keyup', init));
    } catch (_) {}
  }
  function pad2(n){ return (n < 10 ? '0' : '') + n; }
  function activeClassName(list){
    var names = ['active', 'is-active', 'current'];
    for (var n=0; n<names.length; n++) {
      for (var i=0; i<list.length; i++) {
        if (list[i].classList && list[i].classList.contains(names[n])) return names[n];
      }
    }
    return 'active';
  }
  function hasComputedHiddenSibling(list, active){
    if (active < 0) return false;
    for (var i=0; i<list.length; i++) {
      if (i === active) continue;
      try {
        var cs = window.getComputedStyle(list[i]);
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return true;
      } catch (_) {}
    }
    return false;
  }
  function canSetActive(list){
    // A bare active-class marker is not enough to prove the host can drive the
    // deck by class mutation alone. Many generated decks keep that marker in
    // sync for counters / dots but move the visible slide via a translated
    // stage or track, so flipping classes in the host bridge updates the
    // reported slide index while leaving the canvas on the old page. Only
    // treat class-driven decks as directly mutable when inactive siblings are
    // actually hidden by computed visibility rules.
    var active = findActiveByClass(list);
    if (active >= 0 && hasComputedHiddenSibling(list, active)) return true;
    for (var i=0; i<list.length; i++) {
      if (list[i].style.display === 'none') return true;
      if (list[i].style.visibility === 'hidden') return true;
      if (list[i].hasAttribute('hidden')) return true;
    }
    return false;
  }
  function transformTrack(list){
    if (!list || !list.length) return null;
    var first = list[0];
    var node = first && first.parentElement;
    while (node && node !== document.body && node !== document.documentElement) {
      if (node.id === 'od-stacked-deck-stage' || node.getAttribute('data-od-stacked-deck-stage') !== null) {
        node = node.parentElement;
        continue;
      }
      // Framework decks drive slides via active-class toggles on #deck-stage
      // children, not by translating the stage itself.
      if (node.id === 'deck-stage') {
        node = node.parentElement;
        continue;
      }
      try {
        var directSlides = 0;
        for (var i=0; i<node.children.length; i++) {
          if (node.children[i].classList && node.children[i].classList.contains('slide')) directSlides += 1;
        }
        var style = window.getComputedStyle(node);
        var computedTransform = style.transform || '';
        var hasComputedTransform = !!(computedTransform && computedTransform !== 'none');
        if (
          directSlides >= list.length &&
          (
            node.id === 'deck-track' ||
            (node.classList && node.classList.contains('deck-track')) ||
            node.style.transform ||
            hasComputedTransform ||
            /\\b(?:flex|grid)\\b/i.test(style.display)
          )
        ) {
          return node;
        }
      } catch (_) {}
      node = node.parentElement;
    }
    return null;
  }
  function activeIndexFromTransform(list){
    var track = transformTrack(list);
    if (!track) return -1;
    var raw = track.style.transform || '';
    if (!raw) {
      try {
        if (window.getComputedStyle) raw = window.getComputedStyle(track).transform || '';
      } catch (_) {}
    }
    if (!raw || raw === 'none') return -1;
    var match = raw.match(/translate(?:3d|X)?\\(\\s*(-?[0-9.]+)\\s*(vw|%|px)?/i);
    if (match) {
      var value = parseFloat(match[1]);
      if (!Number.isFinite(value)) return -1;
      var unit = match[2] || 'px';
      var step = unit === 'px'
        ? Math.max(1, track.clientWidth / list.length, window.innerWidth)
        : 100;
      return Math.max(0, Math.min(list.length - 1, Math.round(Math.abs(value) / step)));
    }
    var matrix = raw.match(/matrix(?:3d)?\\(([^)]+)\\)/);
    if (matrix) {
      var parts = matrix[1].split(',').map(function(part){ return parseFloat(String(part).trim()); });
      var tx = parts.length === 16 ? parts[12] : parts.length >= 6 ? parts[4] : NaN;
      if (Number.isFinite(tx)) {
        var stepPx = Math.max(1, window.innerWidth, track.clientWidth / list.length);
        return Math.max(0, Math.min(list.length - 1, Math.round(Math.abs(tx) / stepPx)));
      }
    }
    return -1;
  }
  function activeIndexFromPagination(list){
    if (!list || !list.length) return -1;
    var nodes;
    try {
      nodes = Array.prototype.slice.call(document.querySelectorAll(
        'button,[role="button"],[aria-current],[data-slide-index],[data-slide],[data-index],.dot,.dots span,.pagination span,.indicator'
      ));
    } catch (_) {
      return -1;
    }
    for (var i=0; i<nodes.length; i++) {
      var node = nodes[i];
      if (!node || (node.classList && node.classList.contains('slide'))) continue;
      if (!looksActiveControl(node)) continue;
      var direct = controlIndex(node, list.length);
      if (direct >= 0) return direct;
      var groupIndex = indexWithinControlGroup(node, list.length);
      if (groupIndex >= 0) return groupIndex;
    }
    return -1;
  }
  function looksActiveControl(node){
    try {
      if (node.getAttribute('aria-current')) return true;
      var active = String(node.getAttribute('data-active') || node.getAttribute('data-current') || '').toLowerCase();
      if (active === 'true' || active === '1') return true;
      var cl = node.classList;
      return !!(cl && (
        cl.contains('active') ||
        cl.contains('is-active') ||
        cl.contains('current') ||
        cl.contains('selected') ||
        cl.contains('is-selected')
      ));
    } catch (_) {
      return false;
    }
  }
  function controlIndex(node, count){
    var attrs = ['data-slide-index', 'data-slide', 'data-index', 'aria-posinset'];
    for (var i=0; i<attrs.length; i++) {
      var raw = node.getAttribute && node.getAttribute(attrs[i]);
      if (!raw) continue;
      var n = parseInt(raw, 10);
      if (!Number.isFinite(n)) continue;
      var index = attrs[i] === 'aria-posinset' ? n - 1 : n;
      if (index >= 0 && index < count) return index;
    }
    return -1;
  }
  function controlGroupNodes(parent){
    if (!parent) return [];
    var children = Array.prototype.slice.call(parent.children || []);
    return children.filter(function(child){
      if (!child) return false;
      if (child.classList && child.classList.contains('slide')) return false;
      var tag = String(child.tagName || '').toLowerCase();
      var role = child.getAttribute && child.getAttribute('role');
      return tag === 'button' ||
        role === 'button' ||
        !!(child.classList && child.classList.contains('dot')) ||
        !!(child.getAttribute && child.getAttribute('data-slide-index') != null) ||
        !!(child.getAttribute && child.getAttribute('data-index') != null);
    });
  }
  function indexWithinControlGroup(node, count){
    var parent = node.parentElement;
    while (parent && parent !== document.body && parent !== document.documentElement) {
      var group = controlGroupNodes(parent);
      if (group.length >= count) {
        var index = group.indexOf(node);
        if (index >= 0) return Math.max(0, Math.min(count - 1, index));
      }
      parent = parent.parentElement;
    }
    return -1;
  }
  function clearInlineSlideHide(el){
    if (!el || !el.style) return;
    el.style.removeProperty('display');
    el.style.removeProperty('pointer-events');
    el.style.removeProperty('visibility');
  }
  function syncPaginationControls(target, count){
    try {
      var groups = [
        document.querySelectorAll('#nav-dots > *'),
        document.querySelectorAll('.nav-dots > *'),
        document.querySelectorAll('.dots > *'),
        document.querySelectorAll('[data-deck-dots] > *'),
        document.querySelectorAll('.pagination > *')
      ];
      for (var g=0; g<groups.length; g++) {
        var nodes = groups[g];
        if (!nodes || nodes.length < count) continue;
        for (var i=0; i<count; i++) {
          var node = nodes[i];
          if (!node || !node.classList) continue;
          var on = i === target;
          node.classList.toggle('is-active', on);
          node.classList.toggle('active', on);
          node.classList.toggle('current', on);
          if (on) node.setAttribute('aria-current', 'true');
          else node.removeAttribute('aria-current');
        }
      }
    } catch (_) {}
  }
  function syncTransformStripActive(list, target){
    if (!list || !list.length) return;
    var activeClass = activeClassName(list);
    for (var k=0; k<list.length; k++) {
      // Prior forceReveal/setActive may have collapsed the strip with
      // display:none !important — clear so translateX(-N00vw) still lands
      // on a real slide (Grove / horizontal #deck).
      clearInlineSlideHide(list[k]);
      if (list[k].classList) {
        list[k].classList.remove('active', 'is-active', 'current');
        if (k === target) list[k].classList.add(activeClass);
      }
    }
    syncPaginationControls(target, list.length);
  }
  function transformGo(i){
    var list = slides();
    var track = transformTrack(list);
    if (!track || track.id === 'od-stacked-deck-stage') return false;
    var target = Math.max(0, Math.min(list.length - 1, i));
    var unit = /translateX\\(\\s*-?[0-9.]+\\s*%\\s*\\)/i.test(track.style.transform || '') ? '%' : 'vw';
    track.style.transform = 'translateX(' + (-target * 100) + unit + ')';
    syncTransformStripActive(list, target);
    updateDeckChrome(target, list.length);
    report();
    nudgeDeckFit();
    return true;
  }
  var hostNativeClickInFlight = false;
  function nativeControlMatches(node, action){
    if (!node) return false;
    var text = [
      node.id,
      node.className,
      node.getAttribute && node.getAttribute('aria-label'),
      node.getAttribute && node.getAttribute('title'),
      node.textContent
    ].join(' ').toLowerCase();
    if (action === 'next') return /\\bnext\\b|다음|→|›|>|right|forward/.test(text);
    if (action === 'prev') return /\\bprev\\b|\\bprevious\\b|이전|←|‹|<|left|back/.test(text);
    return false;
  }
  function clickableControls(){
    try {
      return Array.prototype.slice.call(document.querySelectorAll('button,a,[role="button"]'));
    } catch (_) {
      return [];
    }
  }
  function clickNativeControl(action, target){
    var before = activeIndex(slides());
    var controls = clickableControls();
    var clicked = false;
    if (action === 'go' || action === 'first' || action === 'last') {
      var list = slides();
      var index = action === 'first' ? 0 : action === 'last' ? list.length - 1 : target;
      if (typeof index === 'number') {
        for (var d=0; d<controls.length; d++) {
          var nodeIndex = controlIndex(controls[d], list.length);
          if (nodeIndex < 0) nodeIndex = indexWithinControlGroup(controls[d], list.length);
          if (nodeIndex === index) {
            clicked = dispatchNativeClick(controls[d]);
            break;
          }
        }
      }
    } else {
      for (var i=0; i<controls.length; i++) {
        if (controls[i].disabled || (controls[i].getAttribute && controls[i].getAttribute('aria-disabled') === 'true')) continue;
        if (nativeControlMatches(controls[i], action)) {
          clicked = dispatchNativeClick(controls[i]);
          break;
        }
      }
    }
    if (!clicked) return false;
    setTimeout(report, 80);
    setTimeout(report, 220);
    setTimeout(function(){
      if (activeIndex(slides()) === before) report();
    }, 360);
    return true;
  }
  function dispatchNativeClick(node){
    try {
      hostNativeClickInFlight = true;
      node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
      return true;
    } catch (_) {
      try { node.click(); return true; } catch (__) { return false; }
    } finally {
      setTimeout(function(){ hostNativeClickInFlight = false; }, 0);
    }
  }
  function updateDeckChrome(i, count){
    var cur = document.getElementById('deck-cur');
    var total = document.getElementById('deck-total');
    var prev = document.getElementById('deck-prev');
    var next = document.getElementById('deck-next');
    if (cur) cur.textContent = pad2(i + 1);
    if (total) total.textContent = pad2(count);
    if (prev) prev.toggleAttribute('disabled', i <= 0);
    if (next) next.toggleAttribute('disabled', i >= count - 1);
  }
  function setSlideDisplayed(el, visible) {
    if (!el || !el.style) return;
    var parent = el.parentElement;
    var stacked = !!(parent && (parent.id === 'od-stacked-deck-stage' || parent.getAttribute('data-od-stacked-deck-stage') !== null));
    // Horizontal translate strips keep every slide in document flow.
    // Collapsing siblings with display:none shortens the track so
    // translateX(-N00vw) paints empty canvas (community Grove templates).
    if (!stacked && transformTrack(slides())) {
      clearInlineSlideHide(el);
      return;
    }
    if (visible) {
      if (stacked) {
        // Stacked stage owns layout — force a flex box onto the active slide.
        el.style.setProperty('display', 'flex', 'important');
      } else {
        // Framework / class-toggle decks: clear any previous hide so author
        // .active / variant classes (flex/grid/block) control layout.
        el.style.removeProperty('display');
      }
      el.style.removeProperty('pointer-events');
      el.style.removeProperty('visibility');
      return;
    }
    // Always hide with !important so agent display:flex !important rules
    // on variant classes cannot keep inactive slides painted behind the
    // active one.
    el.style.setProperty('display', 'none', 'important');
    el.style.setProperty('pointer-events', 'none', 'important');
    el.style.setProperty('visibility', 'hidden', 'important');
  }
  function requestHostDeckViewport() {
    if (!compactStackedDeckEnabled && !frameworkDeckStage()) return;
    try { window.parent.postMessage({ type: 'od:deck-host-viewport-request' }, '*'); }
    catch (_) {}
  }
  function setActive(i){
    var list = slides();
    if (!list.length) return false;
    var target = Math.max(0, Math.min(list.length - 1, i));
    var activeClass = activeClassName(list);
    var usesHidden = false;
    for (var j=0; j<list.length; j++) {
      usesHidden = usesHidden || list[j].hasAttribute('hidden');
    }
    for (var k=0; k<list.length; k++) {
      if (list[k].classList) {
        list[k].classList.remove('active', 'is-active', 'current');
        if (k === target) list[k].classList.add(activeClass);
      }
      if (usesHidden) {
        if (k === target) list[k].removeAttribute('hidden');
        else list[k].setAttribute('hidden', '');
      }
      // Always apply display hide/show. Framework decks used to rely only on
      // author CSS slide:not(.active) display:none; agent overrides then
      // left every absolute slide painted and ghost text bled through.
      setSlideDisplayed(list[k], k === target);
    }
    updateDeckChrome(target, list.length);
    report();
    nudgeDeckFit();
    return true;
  }
  function forceRevealSlide(i){
    var list = slides();
    if (!list.length) return false;
    var target = Math.max(0, Math.min(list.length - 1, i));
    var activeClass = activeClassName(list);
    for (var k=0; k<list.length; k++) {
      if (list[k].classList) {
        list[k].classList.remove('active', 'is-active', 'current');
        if (k === target) list[k].classList.add(activeClass);
      }
      setSlideDisplayed(list[k], k === target);
    }
    updateDeckChrome(target, list.length);
    report();
    nudgeDeckFit();
    return true;
  }
  function countVisibleSlides(list) {
    var visible = 0;
    if (!list || !list.length) return 0;
    for (var i = 0; i < list.length; i++) {
      try {
        var cs = window.getComputedStyle(list[i]);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        if (parseFloat(cs.opacity || '1') <= 0.01) continue;
        visible += 1;
      } catch (_) {}
    }
    return visible;
  }
  function repairOverlappingSlides(preferredIndex) {
    var list = slides();
    if (list.length < 2) return false;
    // Translate-strip decks intentionally keep all slides painted in a
    // row; "many visible" is not overlap. forceReveal would collapse the
    // strip and break host/native page turns.
    if (transformTrack(list)) return false;
    if (countVisibleSlides(list) <= 1) return false;
    var target = typeof preferredIndex === 'number'
      ? Math.max(0, Math.min(list.length - 1, preferredIndex))
      : Math.max(0, activeIndex(list));
    return forceRevealSlide(target);
  }
  function scrollGo(i){
    var list = slides();
    var next = Math.max(0, Math.min(list.length - 1, i));
    var left = next * window.innerWidth;
    var targets = scrollTargets();
    for (var t=0; t<targets.length; t++) {
      try {
        targets[t].scrollTo({ left: left, behavior: 'smooth' });
      } catch (_) {
        try { targets[t].scrollLeft = left; } catch (__) {}
      }
      try {
        if (Math.abs(scrollLeftOf(targets[t]) - left) > 1) {
          targets[t].scrollLeft = left;
        }
      } catch (__) {}
    }
    setTimeout(report, 380);
  }
  function targetFor(action, list){
    var i = activeIndex(list);
    if (action === 'next') return i + 1;
    if (action === 'prev') return i - 1;
    if (action === 'first') return 0;
    if (action === 'last') return list.length - 1;
    return i;
  }
  function go(action){
    var list = slides();
    if (!list.length) return;
    var target = Math.max(0, Math.min(list.length - 1, targetFor(action, list)));
    if (target !== activeIndex(list)) resetDeckPan();
    if (compactStackedDeckNavigationReady()) {
      if (forceRevealSlide(target)) return;
    }
    if (clickNativeControl(action, target)) return;
    if (transformGo(target)) return;
    if (isScrollDeck()) {
      scrollGo(target);
      return;
    }
    if (canSetActive(list) && setActive(target)) return;
    if (!transformTrack(list) && forceRevealSlide(target)) return;
    if (action === 'next') dispatchKey('ArrowRight');
    else if (action === 'prev') dispatchKey('ArrowLeft');
    else if (action === 'first') dispatchKey('Home');
    else if (action === 'last') dispatchKey('End');
    setTimeout(report, 280);
  }
  function gotoIndex(i){
    var list = slides();
    if (!list.length) return;
    var target = Math.max(0, Math.min(list.length - 1, i));
    var prev = activeIndex(list);
    if (target !== prev) resetDeckPan();
    if (compactStackedDeckNavigationReady()) {
      if (forceRevealSlide(target)) return;
    }
    if (clickNativeControl('go', target)) return;
    if (transformGo(target)) return;
    if (isScrollDeck()) { scrollGo(target); return; }
    if (canSetActive(list) && setActive(target)) return;
    if (!transformTrack(list) && forceRevealSlide(target)) return;
    var current = activeIndex(list);
    var diff = target - current;
    if (!diff) { report(); return; }
    var key = diff > 0 ? 'ArrowRight' : 'ArrowLeft';
    var n = Math.abs(diff);
    for (var k = 0; k < n; k++) dispatchKey(key);
    setTimeout(report, 320);
  }
  var lastCommentTargetSlideIndex = -1;
  function report(){
    try {
      var list = slides();
      var i = activeIndex(list);
      var count = list.length;
      var progressWidth = count ? ((i + 1) / count * 100) + '%' : '0';
      window.parent.postMessage({
        type: 'od:slide-state',
        active: i,
        count: count,
      }, '*');
      document.querySelectorAll('.slide-number').forEach(function(el){
        el.setAttribute('data-current',i+1); el.setAttribute('data-total',count);
      });
      document.querySelectorAll('.progress-bar>span,.deck-progress>span,.deck-progress .bar').forEach(function(el){
        el.style.width=progressWidth;
      });
      document.querySelectorAll('.deck-progress').forEach(function(el){
        if (el.querySelector('span,.bar')) return;
        el.style.width=progressWidth;
      });
      if (i !== lastCommentTargetSlideIndex) {
        lastCommentTargetSlideIndex = i;
        try {
          if (typeof window.__odScheduleCommentTargets === 'function') window.__odScheduleCommentTargets();
        } catch (_) {}
      }
    } catch (e) {}
  }
  function scheduleReport(delay){
    clearTimeout(window.__odReportT3);
    window.__odReportT3 = setTimeout(report, typeof delay === 'number' ? delay : 80);
  }
  window.__odDeckSlideState = function(){
    var list = slides();
    return { active: activeIndex(list), count: list.length };
  };
  window.__odSlideIndexForElement = function(el){
    if (!el) return -1;
    var slide = null;
    try { slide = el.closest ? el.closest('.slide') : null; } catch (_) {}
    if (!slide) return -1;
    var list = slides();
    if (!list || !list.length) return -1;
    for (var i = 0; i < list.length; i++) {
      if (list[i] === slide) return i;
    }
    var attr = slide.getAttribute('data-slide-index');
    if (attr !== null && attr !== '') {
      var parsed = parseInt(attr, 10);
      if (Number.isFinite(parsed) && parsed >= 0 && parsed < list.length) return parsed;
    }
    var allSlides = document.querySelectorAll('.slide');
    for (var j = 0; j < allSlides.length; j++) {
      if (allSlides[j] !== slide) continue;
      for (var k = 0; k < list.length; k++) {
        if (list[k] === slide) return k;
      }
      return j < list.length ? j : -1;
    }
    return -1;
  };
  function restoreInitialSlide(){
    var list = slides();
    if (!list.length) return;
    var target = Math.max(0, Math.min(list.length - 1, initialSlideIndex));
    if (hostSlideNavigationSeen) {
      didRestoreInitialSlide = true;
      report();
      return;
    }
    if (didRestoreInitialSlide) {
      if (findActiveByVisibility(list) < 0) gotoIndex(target);
      report();
      return;
    }
    didRestoreInitialSlide = true;
    gotoIndex(target);
  }
  function onDeckBridgeKeydown(e) {
    if (!e || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    var target = e.target;
    // Manual-edit inline text uses contenteditable="plaintext-only" plus
    // data-od-editing. Some engines leave isContentEditable false for
    // plaintext-only, so also honor the attribute / editing marker —
    // otherwise ←/→ advances slides instead of moving the caret.
    if (target) {
      var tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return;
      if (target.closest) {
        if (target.closest('[data-od-editing="true"]')) return;
        if (target.closest('[contenteditable]:not([contenteditable="false"])')) return;
      }
    }
    if (document.querySelector && document.querySelector('[data-od-editing="true"]')) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
      e.preventDefault();
      e.stopImmediatePropagation();
      go('next');
    } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
      e.preventDefault();
      e.stopImmediatePropagation();
      go('prev');
    } else if (e.key === 'Home') {
      e.preventDefault();
      e.stopImmediatePropagation();
      go('first');
    } else if (e.key === 'End') {
      e.preventDefault();
      e.stopImmediatePropagation();
      go('last');
    }
  }
  // Sandboxed new-tab presentation keeps keyboard focus on the outer wrapper
  // when possible, but any click inside the iframe steals focus. The wrapper
  // can no longer post od:slide, so handle presenter keys inside the bridge
  // for every deck shape — not only compact stacked decks.
  document.addEventListener('keydown', onDeckBridgeKeydown, true);
  window.addEventListener('message', function(ev){
    var data = ev && ev.data;
    if (!data) return;
    if (data.type === 'od:deck-host-viewport') {
      var w = Number(data.width);
      var h = Number(data.height);
      var scale = Number(data.scale);
      if (Number.isFinite(w) && w > 0) hostViewport.w = w;
      if (Number.isFinite(h) && h > 0) hostViewport.h = h;
      if (Number.isFinite(scale) && scale > 0) hostViewport.scale = scale;
      hostViewport.layoutFit = data.layoutFit === true;
      nudgeDeckFit();
      return;
    }
    if (data.type === 'od:deck-nudge-fit') { nudgeDeckFit(); return; }
    if (data.type === 'od:preview-scroll-by') { deckPanBy(data.left, data.top); return; }
    if (data.type === 'od:deck-pan-reset') { resetDeckPan(); return; }
    if (data.type === 'od:slide-state-request') { report(); return; }
    if (data.type !== 'od:slide') return;
    hostSlideNavigationSeen = true;
    if (data.action === 'go' && typeof data.index === 'number') gotoIndex(data.index);
    else go(data.action);
  });
  function ownDeckButton(id, action){
    var btn = document.getElementById(id);
    if (!btn || btn.__odDeckOwned) return;
    btn.__odDeckOwned = true;
    btn.addEventListener('click', function(e){
      if (hostNativeClickInFlight) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      go(action);
    }, true);
  }
  ownDeckButton('deck-prev', 'prev');
  ownDeckButton('deck-next', 'next');
  function notifyStackedDeckReady() {
    try { parent.postMessage({ type: 'od:stacked-deck-ready' }, '*'); }
    catch (_) {}
  }
  function markStackedDeckReadyIfFit() {
    if (!compactStackedDeckEnabled) return;
    if (document.documentElement.hasAttribute('data-od-stacked-deck-ready')) return;
    var stage = stackedDeckStage();
    if (!stage) return;
    var vp = frameworkDeckViewport();
    if (vp.w < 64 || vp.h < 64) return;
    var raw = stage.style.transform || '';
    var scaleMatch = raw.match(/scale\\(([0-9.eE+-]+)\\)/);
    if (!scaleMatch) return;
    var s = parseFloat(scaleMatch[1]);
    if (!isFinite(s) || s <= 0.001) return;
    document.documentElement.setAttribute('data-od-stacked-deck-ready', '');
    notifyStackedDeckReady();
  }
  function bootstrapCompactStackedDeck() {
    if (!compactStackedDeckEnabled) return;
    ensureStackedDeckStage();
    var list = slides();
    if (list.length) {
      var target = Math.max(0, Math.min(list.length - 1, initialSlideIndex));
      forceRevealSlide(target);
    }
    nudgeDeckFit();
    markStackedDeckReadyIfFit();
  }
  // Report once on load and on every scroll-end so the host stays in sync.
  window.addEventListener('load', function(){ setTimeout(restoreInitialSlide, 200); });
  document.addEventListener('scroll', function(){
    clearTimeout(window.__odReportT);
    window.__odReportT = setTimeout(report, 120);
  }, { passive: true, capture: true });
  document.addEventListener('click', function(){ scheduleReport(80); }, true);
  document.addEventListener('keyup', function(){ scheduleReport(80); }, true);
  document.addEventListener('pointerup', function(){ scheduleReport(100); }, true);
  document.addEventListener('touchend', function(){ scheduleReport(140); }, true);
  document.addEventListener('transitionend', function(){ scheduleReport(40); }, true);
  document.addEventListener('animationend', function(){ scheduleReport(40); }, true);
  // Aggressively nudge during the first ~3s so the deck catches the
  // iframe's first non-zero host box. Compact decks must not stop on the
  // inflated 1920 document width alone — that freezes a black letterbox
  // until the page is refreshed (host viewport arrives too late). After the
  // fast chase, keep a slow recovery loop until ready (liveHtml→disk remount
  // often lands host viewport after the initial window).
  function chaseFirstLayout(){
    var attempts = 0;
    var maxAttempts = compactStackedDeckEnabled ? 60 : 30;
    var slowAttempts = 0;
    var maxSlowAttempts = 30;
    function tick(){
      attempts += 1;
      if (compactStackedDeckEnabled || frameworkDeckStage()) {
        requestHostDeckViewport();
      }
      if (compactStackedDeckEnabled) {
        ensureStackedDeckStage();
      }
      var w = frameworkDeckViewport().w;
      nudgeDeckFit();
      if (compactStackedDeckEnabled) {
        // Host box alone is not enough — stage may still be missing. Stop only
        // after a successful fit marked the deck ready (or attempts exhaust).
        if (
          attempts >= 2
          && document.documentElement.hasAttribute('data-od-stacked-deck-ready')
        ) {
          return;
        }
      } else if (frameworkDeckStage()) {
        // Do not stop on innerWidth alone — wait for host viewport so
        // framework fit() does not freeze a wrong letterbox scale.
        if (hostViewport.w > 0 && hostViewport.h > 0 && attempts >= 2) return;
      } else if (w > 0 && attempts >= 2) {
        return; // one extra nudge after first non-zero
      }
      if (attempts < maxAttempts) {
        setTimeout(tick, 50);
        return;
      }
      if (!compactStackedDeckEnabled) return;
      if (document.documentElement.hasAttribute('data-od-stacked-deck-ready')) return;
      function slowTick(){
        slowAttempts += 1;
        if (document.documentElement.hasAttribute('data-od-stacked-deck-ready')) return;
        requestHostDeckViewport();
        ensureStackedDeckStage();
        nudgeDeckFit();
        if (slowAttempts < maxSlowAttempts) setTimeout(slowTick, 500);
      }
      setTimeout(slowTick, 500);
    }
    tick();
  }
  if (compactStackedDeckEnabled) {
    bootstrapCompactStackedDeck();
    setTimeout(function() {
      if (document.documentElement.hasAttribute('data-od-stacked-deck-ready')) return;
      bootstrapCompactStackedDeck();
      requestHostDeckViewport();
      markStackedDeckReadyIfFit();
    }, 400);
  }
  if (document.readyState === 'complete') chaseFirstLayout();
  else window.addEventListener('load', chaseFirstLayout);
  if (compactStackedDeckEnabled || frameworkDeckStage()) requestHostDeckViewport();
  if (compactStackedDeckEnabled) {
    document.addEventListener('wheel', function(e) {
      e.preventDefault();
    }, { passive: false, capture: true });
    document.addEventListener('touchmove', function(e) {
      if (e.cancelable) e.preventDefault();
    }, { passive: false, capture: true });
  }
  // Re-nudge whenever the iframe itself is resized by the host (e.g.
  // user toggles zoom, resizes the chat sidebar, exits Present).
  if (typeof ResizeObserver !== 'undefined') {
    try {
      var ro = new ResizeObserver(function(){ nudgeDeckFit(); });
      ro.observe(document.documentElement);
    } catch (_) {}
  }
  // For class-toggle decks the deck's own keyboard handler updates classes
  // on the slide elements; an attribute observer translates that into the
  // host counter without depending on scroll events.
  function observeSlides(){
    var list = slides();
    if (!list.length) { setTimeout(observeSlides, 150); return; }
    try {
      var mo = new MutationObserver(function(){
        clearTimeout(window.__odReportT2);
        window.__odReportT2 = setTimeout(report, 60);
      });
      for (var i = 0; i < list.length; i++) {
        mo.observe(list[i], { attributes: true, attributeFilter: ['class', 'style', 'hidden', 'aria-hidden'] });
      }
      var track = transformTrack(list);
      if (track) {
        mo.observe(track, { attributes: true, attributeFilter: ['class', 'style', 'hidden', 'aria-hidden'] });
      } else if (list[0] && list[0].parentElement) {
        // Some decks only become transform-track decks after their native
        // controls set parent.style.transform for the first time.
        mo.observe(list[0].parentElement, { attributes: true, attributeFilter: ['class', 'style', 'hidden', 'aria-hidden'] });
      }
    } catch (e) {}
    setTimeout(function(){
      restoreInitialSlide();
      repairOverlappingSlides(initialSlideIndex);
    }, 100);
  }
  observeSlides();
})();</script>`;
  return injectBeforeBodyEnd(injectBeforeHeadEnd(doc, styleFix), script);
}

// The tweaks bridge lets the host toolbar toggle the visibility of the artifact's
// native tweaks panel. Bidirectional: host posts `od:tweaks-panel-visible` to
// drive panel visibility; bridge posts `od:tweaks-panel-state` back whenever the
// artifact's own `× close` button or `T` shortcut flips the `.tw-hidden` class,
// so the toolbar toggle stays in sync. Also reports `od:tweaks-available` so the
// host can disable the toggle on artifacts without a `.tw-panel`.
function injectTweaksBridge(doc: string): string {
  // Hide-state styling mirrors the artifact's own `.tw-hidden` (transform +
  // opacity) so the CSS transition plays in both directions. `.tw-restore` is
  // kept permanently hidden — the host toolbar is the only entry point.
  const style = `<style data-od-tweaks-bridge-style>
[data-od-tweaks-hidden] .tw-panel {
  transform: translateX(calc(100% + 32px)) !important;
  opacity: 0 !important;
  pointer-events: none !important;
}
.tw-restore { display: none !important; }
</style>`;
  const script = `<script data-od-tweaks-bridge>(function(){
  // Synchronously hide BEFORE the artifact body parses so the panel never
  // flashes on initial paint. The host removes the attribute via postMessage
  // once it knows the desired state.
  document.documentElement.setAttribute('data-od-tweaks-hidden', '');

  var suppressEcho = false;
  var observer = null;

  function panelEl(){ return document.querySelector('.tw-panel'); }

  function applyClassesToPanel(visible){
    var panel = panelEl();
    if (panel) panel.classList.toggle('tw-hidden', !visible);
  }

  function setPanelVisible(visible){
    suppressEcho = true;
    document.documentElement.toggleAttribute('data-od-tweaks-hidden', !visible);
    applyClassesToPanel(visible);
    // Clear flag after the MutationObserver has had a chance to fire for this
    // change so we don't echo our own host-driven toggles back to the host.
    Promise.resolve().then(function(){ suppressEcho = false; });
  }

  function postState(){
    var panel = panelEl();
    if (!panel) return;
    try {
      parent.postMessage({
        type: 'od:tweaks-panel-state',
        visible: !panel.classList.contains('tw-hidden'),
      }, '*');
    } catch (e) {}
  }

  function postAvailability(){
    try {
      parent.postMessage({
        type: 'od:tweaks-available',
        available: !!panelEl(),
      }, '*');
    } catch (e) {}
  }

  function attachObserver(){
    var panel = panelEl();
    if (!panel || observer) return;
    observer = new MutationObserver(function(){
      if (suppressEcho) return;
      postState();
    });
    observer.observe(panel, { attributes: true, attributeFilter: ['class'] });
  }

  function onReady(){
    // Capture the panel authored visibility BEFORE we apply the host hidden
    // attribute. The bridge sets data-od-tweaks-hidden synchronously in head
    // (before the body parses), so on entry to onReady the attribute is
    // always present even though the artifact may have authored the panel
    // as default-visible. Reading the panel class first is the only place
    // we can still observe the author intent. Then drive the attribute,
    // classes, and posted state from that captured value so a default
    // visible tw-panel reports visible:true and the toolbar toggle starts
    // ON. Issue surfaced in PR #1643 review.
    var panel = panelEl();
    var initialVisible = !!panel && !panel.classList.contains('tw-hidden');
    document.documentElement.toggleAttribute('data-od-tweaks-hidden', !initialVisible);
    applyClassesToPanel(initialVisible);
    attachObserver();
    postAvailability();
    // Post the captured initial visibility so the toolbar toggle reflects
    // the default state on mount. Without this the toggle reads OFF while
    // a default-visible tw-panel artifact clearly shows its panel and the
    // user would have to click toggle-on then toggle-off to actually hide.
    postState();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else {
    onReady();
  }

  window.addEventListener('message', function(ev){
    if (!ev.data || ev.data.type !== 'od:tweaks-panel-visible') return;
    setPanelVisible(!!ev.data.visible);
  });
})();</script>`;
  const withStyle = /<\/head>/i.test(doc)
    ? doc.replace(/<\/head>/i, style + '</head>')
    : /<head[^>]*>/i.test(doc)
      ? doc.replace(/<head[^>]*>/i, (m) => m + style)
      : style + doc;
  // Inject the bridge as early as possible (inside <head>) so the synchronous
  // attribute set runs before the artifact body parses.
  if (/<\/head>/i.test(withStyle)) return withStyle.replace(/<\/head>/i, script + '</head>');
  if (/<head[^>]*>/i.test(withStyle)) return withStyle.replace(/<head[^>]*>/i, (m) => m + script);
  return script + withStyle;
}
