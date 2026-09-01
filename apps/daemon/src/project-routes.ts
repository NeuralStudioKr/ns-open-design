import { rm } from 'node:fs/promises';
import path from 'node:path';
import type { Express, Request, Response } from 'express';
import {
  artifactFontStylesheetHttpsOrigins,
  defaultScenarioPluginIdForProjectMetadata,
  lockStackedDeckCanvasForPreview,
  type ChatSessionMode,
  type PluginManifest,
  repairArtifactDocumentHead,
} from '@open-design/contracts';
import { seedTemplateClonedDeckOnServer } from './template-clone-deck.js';
import { createProjectArtifactFile } from './artifact-create.js';
import { ArtifactPublicationBlockedError } from './artifact-publication-guard.js';
import { ArtifactRegressionError } from './artifact-stub-guard.js';
import { listDesignSystems } from './design-systems.js';
import {
  FIRST_PARTY_ATOMS,
  buildConnectorProbe,
  getInstalledPlugin,
  listInstalledPlugins,
  resolvePluginSnapshot,
} from './plugins/index.js';
import { connectorService } from './connectors/service.js';
import type { RouteDeps } from './server-context.js';
import { readAnalyticsContext } from './analytics.js';
import { listSkills } from './skills.js';
import { isSafeId } from './projects.js';
import {
  listProjectsAsync,
  listProjectsPageAsync,
  messageUpsertIsProjectActivity,
  parseProjectListCursor,
} from './db.js';
import {
  BUILT_IN_PROJECT_LOCATION_ID,
  allProjectLocations,
  createLocationProjectDir,
  ensureProjectLocation,
  scanProjectLocation,
  writeProjectManifest,
} from './project-locations.js';
import { auditDesignSystemPackage } from './tools-connectors-cli.js';
import { createFileRevisionService, isFileRevisionSource } from './file-revisions/service.js';
import { FileRevisionPayloadTooLargeError } from './file-revisions/errors.js';
import { deleteProjectRevisionSnapshotTree } from './file-revisions/maintenance.js';
import {
  FileRevisionLockError,
  isFileRevisionSequenceConflict,
} from './file-revisions/postgres-lock.js';
import {
  isTeamverDesignManaged,
  readTeamverIdentityFromRequest,
  verifyTeamverProjectAccess,
} from './teamver-project-access.js';
import {
  mintProjectFilePresignedGetFromRequest,
  normalizeProjectFilePresignRelpath,
} from './project-file-presign.js';
import {
  markRequestExplicitDeletedPaths,
  scheduleProjectStoragePersistAfterResponse,
  type ProjectStorageAccessHooks,
} from './storage/lazy-project-materialization.js';
import { scheduleTeamverProjectDaemonStateExport } from './teamver-project-daemon-state.js';
import {
  shouldPersistByokProjectStorageFromMessage,
  shouldReportByokUsageFromMessage,
  reportByokTeamverUsageAndBillingFromDaemon,
} from './teamver-byok-usage-bridge.js';
import { resolveProjectCoverHint } from './project-cover-hints.js';
import { prepareCoverHtmlBatchBody } from './cover-html-isolate.js';
import { inlineProjectImagesFromScratch } from './pdf-export.js';

const PROJECT_COVER_HINTS_BATCH_MAX = 12;
/** Status/metadata enrichment for registry-backed lists (home + projects tab). */
const PROJECT_STATUS_HINTS_BATCH_MAX = 48;
/** Home Recent HTML covers warm preview scopes in one POST. */
const PROJECT_PREVIEW_URL_BATCH_MAX = 12;
/** Home Recent HTML cover bodies in one POST (first-slide isolated). */
const PROJECT_COVER_HTML_BATCH_MAX = 12;
/** Soft cap — oversized decks fall back to per-card /raw. */
const PROJECT_COVER_HTML_BATCH_MAX_BYTES = 900_000;

export interface RegisterProjectRoutesDeps extends RouteDeps<'db' | 'design' | 'http' | 'paths' | 'projectStore' | 'projectFiles' | 'conversations' | 'templates' | 'status' | 'events' | 'ids' | 'telemetry' | 'appConfig' | 'validation'> {
  projectStorageHooks?: ProjectStorageAccessHooks | null;
  /**
   * Set of run ids already reported via the managed-run analytics path. The
   * BYOK terminal-message PUT handler shares this set so a single chat turn
   * never double-reports usage when both pathways race (Strategy B, §4.11).
   */
  reportedRuns?: Set<string>;
}

function projectDetailResolvedDir(
  projectsRoot: string,
  project: any,
  resolveProjectDir: (
    projectsRoot: string,
    projectId: string,
    metadata?: unknown,
    opts?: { allowUnavailableSandboxImportedProject?: boolean },
  ) => string,
): string {
  const baseDir = typeof project?.metadata?.baseDir === 'string'
    ? path.normalize(project.metadata.baseDir)
    : null;
  if (baseDir && path.isAbsolute(baseDir)) return baseDir;
  return resolveProjectDir(projectsRoot, project.id, project.metadata, {
    allowUnavailableSandboxImportedProject: true,
  });
}

const URL_PREVIEW_SCROLL_BRIDGE = `<script data-od-url-scroll-bridge>
(function(){
  if (window.__odUrlScrollBridge) return;
  window.__odUrlScrollBridge = true;
  var pending = false;
  function scrollElement(){
    return document.querySelector('.design-canvas') || document.scrollingElement || document.documentElement;
  }
  function num(value){
    var next = Number(value || 0);
    return Number.isFinite(next) ? next : 0;
  }
  function post(){
    var el = scrollElement();
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
  function schedule(){
    if (pending) return;
    pending = true;
    window.requestAnimationFrame(function(){
      pending = false;
      post();
    });
  }
  function scrollTo(el, left, top){
    if (!el) return;
    if (typeof el.scrollTo === 'function') el.scrollTo(num(left), num(top));
    else {
      el.scrollLeft = num(left);
      el.scrollTop = num(top);
    }
  }
  function scrollBy(el, left, top){
    if (!el) return;
    var dx = num(left);
    var dy = num(top);
    if (!dx && !dy) return;
    if (typeof el.scrollBy === 'function') el.scrollBy({ left: dx, top: dy, behavior: 'auto' });
    else {
      el.scrollLeft = (el.scrollLeft || 0) + dx;
      el.scrollTop = (el.scrollTop || 0) + dy;
    }
  }
  function requestRestore(){
    window.parent.postMessage({ type: 'od:preview-scroll-request' }, '*');
  }
  window.addEventListener('message', function(ev){
    var data = ev && ev.data;
    if (!data || !data.type) return;
    if (data.type === 'od:preview-scroll-restore') {
      scrollTo(document.scrollingElement || document.documentElement, data.frameLeft, data.frameTop);
      scrollTo(scrollElement(), data.canvasLeft, data.canvasTop);
      setTimeout(post, 0);
      return;
    }
    if (data.type === 'od:preview-scroll-by') {
      scrollBy(scrollElement(), data.left, data.top);
      schedule();
    }
  });
  window.addEventListener('scroll', schedule, true);
  document.addEventListener('scroll', schedule, true);
  window.addEventListener('resize', schedule);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){
      requestRestore();
      schedule();
    });
  } else {
    setTimeout(function(){
      requestRestore();
      schedule();
    }, 0);
  }
})();
</script>`;

const URL_PREVIEW_SELECTION_BRIDGE = `<script data-od-url-selection-bridge>
(function(){
  if (window.__odUrlSelectionBridge) return;
  window.__odUrlSelectionBridge = true;
  var commentEnabled = false;
  var mode = 'picker';
  var hoveredId = null;
  var drawing = false;
  var stroke = [];
  var strokeFrame = null;
  var postTargetsPending = false;
  var postTargetsTimer = null;
  var activeCommentElementId = null;
  var activeCommentSelector = null;
  var activeTargetPending = false;
  function esc(value){
    try { return window.CSS && CSS.escape ? CSS.escape(value) : String(value).replace(/"/g, '\\\\"'); }
    catch (_) { return String(value); }
  }
  function ensureStyle(){
    if (document.querySelector('style[data-od-url-selection-style]')) return;
    var style = document.createElement('style');
    style.setAttribute('data-od-url-selection-style', '');
    style.textContent =
      'html[data-od-comment-mode] body * { cursor: crosshair !important; }' +
      'html[data-od-comment-mode][data-od-comment-mode-kind="pod"] body * { cursor: cell !important; }' +
      'html[data-od-comment-mode] body iframe,html[data-od-comment-mode] body object,html[data-od-comment-mode] body embed { pointer-events: none !important; }';
    (document.head || document.documentElement).appendChild(style);
  }
  function active(){ return commentEnabled; }
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
    return parts.length ? 'body > ' + parts.join(' > ') : null;
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
    } catch (_) { return false; }
    return true;
  }
  function meaningfulDomFallbackTarget(el){
    if (!visibleTarget(el)) return false;
    var tag = el.tagName ? el.tagName.toLowerCase() : '';
    if (/^(a|button|input|textarea|select|label|img|video|canvas|h1|h2|h3|h4|h5|h6|p|li|td|th)$/.test(tag)) return true;
    if (el.getAttribute && (el.getAttribute('role') || el.getAttribute('aria-label') || el.getAttribute('title'))) return true;
    if (tag === 'svg') return !!(el.getAttribute && (el.getAttribute('role') || el.getAttribute('aria-label') || el.getAttribute('title')));
    var text = (el.textContent || '').replace(/\\s+/g, ' ').trim();
    if (!text) return false;
    if (/^(span|strong|em|b|i|small|code|mark)$/.test(tag)) return true;
    var meaningfulChildren = 0;
    for (var child = el.firstElementChild; child; child = child.nextElementSibling) {
      var childTag = child.tagName ? child.tagName.toLowerCase() : '';
      if (/^(script|style|template|meta|link|title|noscript)$/.test(childTag)) continue;
      if ((child.textContent || '').replace(/\\s+/g, ' ').trim() || /^(img|video|canvas|svg|input|textarea|select)$/.test(childTag)) {
        meaningfulChildren++;
        if (meaningfulChildren > 1) return false;
      }
    }
    return true;
  }
  function generatedRootAnnotation(el, id){
    return id === 'path-0' && el && el.parentElement === document.body && el.id === 'root';
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
    var cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : '';
    var html = '';
    try {
      var match = (el.outerHTML || '').replace(/\\s+/g, ' ').match(/^<[^>]+>/);
      html = match ? match[0] : '';
    } catch (_) {}
    var payload = {
      type: 'od:comment-target',
      elementId: id,
      selector: selector,
      label: tag + cls,
      text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 160),
      position: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
      htmlHint: html.slice(0, 180),
      style: styleSnapshot(el)
    };
    if (clickPoint) payload.hoverPoint = { x: Math.round(clickPoint.x), y: Math.round(clickPoint.y) };
    if (clickedEl && clickedEl !== el) {
      var clickedTag = clickedEl.tagName ? clickedEl.tagName.toLowerCase() : 'element';
      var clickedCls = typeof clickedEl.className === 'string' && clickedEl.className.trim() ? '.' + clickedEl.className.trim().split(/\\s+/).slice(0, 2).join('.') : '';
      payload.clickedDescendant = {
        label: clickedTag + clickedCls,
        text: (clickedEl.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 80)
      };
    }
    return payload;
  }
  function allTargets(){
    var includeDomFallback = commentEnabled && mode === 'picker';
    var nodes = includeDomFallback ? document.querySelectorAll('body *') : document.querySelectorAll('[data-od-id], [data-screen-label]');
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
  function findCommentTargetByIdentity(elementId, selector){
    var el = null;
    if (selector) {
      try { el = document.querySelector(String(selector)); } catch (_) { el = null; }
    }
    if (!el && elementId) {
      try {
        var id = String(elementId).replace(/"/g, '\\\\"');
        el = document.querySelector('[data-od-id="' + id + '"], [data-screen-label="' + id + '"]');
      } catch (_) { el = null; }
    }
    return el;
  }
  function postActiveCommentTarget(){
    if (!active() || !activeCommentElementId) return;
    var el = findCommentTargetByIdentity(activeCommentElementId, activeCommentSelector);
    if (!el) return;
    var payload = targetFrom(el, commentEnabled && mode === 'picker');
    if (payload) window.parent.postMessage(Object.assign({}, payload, { type: 'od:comment-active-target-update' }), '*');
  }
  function schedulePostActiveCommentTarget(){
    if (!active() || !activeCommentElementId || activeTargetPending) return;
    activeTargetPending = true;
    window.requestAnimationFrame(function(){
      activeTargetPending = false;
      postActiveCommentTarget();
    });
  }
  function eventCandidateElements(event){
    var items = [];
    function push(node){
      if (!node || node.nodeType !== 1) return;
      if (items.indexOf(node) >= 0) return;
      items.push(node);
    }
    try {
      if (event && typeof event.composedPath === 'function') {
        var path = event.composedPath();
        for (var i = 0; i < path.length; i++) push(path[i]);
      }
    } catch (_) {}
    push(event && event.target);
    try {
      if (event && typeof event.clientX === 'number' && typeof event.clientY === 'number' && document.elementsFromPoint) {
        var stack = document.elementsFromPoint(event.clientX, event.clientY);
        for (var s = 0; s < stack.length; s++) push(stack[s]);
      } else if (event && typeof event.clientX === 'number' && typeof event.clientY === 'number' && document.elementFromPoint) {
        push(document.elementFromPoint(event.clientX, event.clientY));
      }
    } catch (_) {}
    return items;
  }
  function closestTarget(event){
    var candidates = eventCandidateElements(event);
    var allowDomFallback = commentEnabled && mode === 'picker';
    var annotatedFallback = null;
    for (var i = 0; i < candidates.length; i++) {
      var clicked = candidates[i];
      var el = clicked;
      while (el && el !== document.documentElement) {
        if (allowDomFallback && meaningfulDomFallbackTarget(el)) return { target: el, clicked: clicked };
        if (el.getAttribute && (el.hasAttribute('data-od-id') || el.hasAttribute('data-screen-label'))) {
          var id = el.getAttribute('data-od-id') || el.getAttribute('data-screen-label');
          if (allowDomFallback && generatedRootAnnotation(el, id)) {
            el = el.parentElement;
            continue;
          }
          if (allowDomFallback && !annotatedFallback) annotatedFallback = { target: el, clicked: clicked };
          if (allowDomFallback) break;
          return { target: el, clicked: clicked };
        }
        el = el.parentElement;
      }
    }
    return annotatedFallback;
  }
  function relativePoint(ev){ return { x: Math.round(ev.clientX), y: Math.round(ev.clientY) }; }
  function postStroke(type){ window.parent.postMessage({ type: type, points: stroke.slice() }, '*'); }
  function schedulePostStroke(){
    if (strokeFrame !== null) return;
    strokeFrame = requestAnimationFrame(function(){
      strokeFrame = null;
      postStroke('od:pod-stroke');
    });
  }
  window.addEventListener('message', function(ev){
    var data = ev && ev.data;
    if (!data || !data.type) return;
    if (data.type === 'od:url-selection-bridge-probe') {
      window.parent.postMessage({ type: 'od:url-selection-bridge-ready' }, '*');
      return;
    }
    if (data.type === 'od:comment-mode') {
      commentEnabled = !!data.enabled;
      mode = data.mode === 'pod' ? 'pod' : 'picker';
      document.documentElement.toggleAttribute('data-od-comment-mode', commentEnabled);
      document.documentElement.setAttribute('data-od-comment-mode-kind', mode);
      if (commentEnabled) setTimeout(postTargets, 0);
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
    if (data.type === 'od:comment-active-target') {
      activeCommentElementId = data.elementId ? String(data.elementId) : null;
      activeCommentSelector = data.selector ? String(data.selector) : null;
      schedulePostActiveCommentTarget();
    }
  });
  document.addEventListener('mouseover', function(ev){
    if (!commentEnabled || mode !== 'picker') return;
    var result = closestTarget(ev);
    if (!result) return;
    var payload = targetFrom(result.target, true);
    if (!payload || payload.elementId === hoveredId) return;
    hoveredId = payload.elementId;
    window.parent.postMessage(Object.assign({}, payload, { type: 'od:comment-hover' }), '*');
  }, true);
  document.addEventListener('mouseout', function(ev){
    if (!commentEnabled || mode !== 'picker') return;
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
    if (!commentEnabled || mode !== 'picker') return;
    var result = closestTarget(ev);
    if (result) {
      ev.preventDefault();
      ev.stopPropagation();
      var payload = targetFrom(result.target, true, result.clicked, { x: ev.clientX, y: ev.clientY });
      if (payload) {
        activeCommentElementId = payload.elementId || activeCommentElementId;
        activeCommentSelector = payload.selector || activeCommentSelector;
        window.parent.postMessage(payload, '*');
      }
      return;
    }
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
    var pinX = Math.round(ev.clientX);
    var pinY = Math.round(ev.clientY);
    var pinId = 'pin-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36);
    window.parent.postMessage({
      type: 'od:comment-target',
      elementId: pinId,
      selector: '[data-od-pin="' + pinId + '"]',
      label: 'pin',
      text: '',
      position: { x: pinX - 12, y: pinY - 12, width: 24, height: 24 },
      hoverPoint: { x: pinX, y: pinY },
      htmlHint: '',
      style: null,
      freePin: true
    }, '*');
  }, true);
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
  }, true);
  var mo = new MutationObserver(schedulePostTargets);
  mo.observe(document.documentElement, { subtree: true, childList: true });
  ensureStyle();
  window.parent.postMessage({ type: 'od:url-selection-bridge-ready' }, '*');
})();
</script>`;

const URL_PREVIEW_SNAPSHOT_BRIDGE = `<script data-od-url-snapshot-bridge>
(function(){
  if (window.__odUrlSnapshotBridge) return;
  window.__odUrlSnapshotBridge = true;
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
        .replace(/@import\\s+(?:url\\s*\\(\\s*(?:\"[^\"]*\"|'[^']*'|[^'\")\\s]+)\\s*\\)|(?:\"[^\"]*\"|'[^']*'))[^;]*;?/gi, '')
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
      if (computed && (computed.display === 'none' || computed.visibility === 'hidden')) removals.push(clone);
    }
    for (var r = removals.length - 1; r >= 0; r--) {
      if (removals[r].parentNode) removals[r].parentNode.removeChild(removals[r]);
    }
  }
  function waitForImages(){
    var imgs = Array.prototype.slice.call(document.images || []);
    return Promise.all(imgs.map(function(img){
      if (img.complete) return Promise.resolve();
      return new Promise(function(resolve){
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', resolve, { once: true });
      });
    }));
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
  function prepareDeckSnapshotFrame(){
    var stage = document.getElementById('deck-stage') || document.querySelector('.deck-stage');
    if (!stage) return null;
    var selector = '.slide, [data-slide], [data-screen-label], section.slide, .deck-slide, .ppt-slide';
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
    return { w: 1920, h: 1080, docW: 1920, docH: 1080, scrollX: 0, scrollY: 0 };
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
  function renderSnapshot(id){
    var settled = { done: false };
    var deckFrame = prepareDeckSnapshotFrame();
    var payload = buildSnapshotPayload(deckFrame);
    var w = payload.w;
    var h = payload.h;
    var docW = payload.docW;
    var docH = payload.docH;
    var dpr = window.devicePixelRatio || 1;
    var bgColor = snapshotBackgroundColor();
    var html = '<div xmlns="http://www.w3.org/1999/xhtml" style="' + escapeAttribute(payload.wrapperStyle) + '">' + payload.bodyContent + '</div>';
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' +
      '<foreignObject x="0" y="0" width="' + docW + '" height="' + docH + '">' + html + '</foreignObject></svg>';
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
  window.addEventListener('message', function(ev){
    var data = ev && ev.data;
    if (!data || data.type !== 'od:snapshot' || !data.id) return;
    waitForSnapshotReady().then(function(){ renderSnapshot(String(data.id)); });
  });
})();
</script>`;

function previewBridgeTokens(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(previewBridgeTokens);
  if (typeof value !== 'string') return [];
  return value.split(/[,\s]+/).map((item) => item.trim()).filter(Boolean);
}

function wantsUrlPreviewScrollBridge(value: unknown): boolean {
  return previewBridgeTokens(value).some((token) => token === 'scroll' || token === '1' || token === 'true');
}

function wantsUrlPreviewSelectionBridge(value: unknown): boolean {
  return previewBridgeTokens(value).some((token) => token === 'selection' || token === 'comment' || token === 'comments' || token === 'annotation');
}

function wantsUrlPreviewSnapshotBridge(value: unknown): boolean {
  return previewBridgeTokens(value).some((token) => token === 'snapshot' || token === 'image' || token === 'capture');
}

function injectBeforeBodyClose(html: string, marker: string, injection: string): string {
  if (html.includes(marker)) return html;
  const bodyCloseIndex = html.search(/<\/body\s*>/i);
  if (bodyCloseIndex >= 0) {
    return `${html.slice(0, bodyCloseIndex)}${injection}${html.slice(bodyCloseIndex)}`;
  }
  return `${html}${injection}`;
}

function injectUrlPreviewBridge(html: string, bridge: 'scroll' | 'selection' | 'snapshot'): string {
  if (bridge === 'scroll') {
    return injectBeforeBodyClose(html, 'data-od-url-scroll-bridge', URL_PREVIEW_SCROLL_BRIDGE);
  }
  if (bridge === 'selection') {
    return injectBeforeBodyClose(html, 'data-od-url-selection-bridge', URL_PREVIEW_SELECTION_BRIDGE);
  }
  return injectBeforeBodyClose(html, 'data-od-url-snapshot-bridge', URL_PREVIEW_SNAPSHOT_BRIDGE);
}

function normalizeChatSessionMode(value: unknown): ChatSessionMode {
  return value === 'chat' ? 'chat' : 'design';
}

export function registerProjectRoutes(app: Express, ctx: RegisterProjectRoutesDeps) {
  const { db, design } = ctx;
  const { sendApiError, createSseResponse } = ctx.http;
  const { DESIGN_SYSTEMS_DIR, PROJECTS_DIR, SKILLS_DIR } = ctx.paths;
  const { readAppConfig, writeAppConfig } = ctx.appConfig;
  const {
    insertProject,
    insertProjectAsync,
    validateLinkedDirs,
    getProject,
    getProjectAsync,
    updateProject,
    dbDeleteProject,
    dbDeleteProjectAsync,
    removeProjectDir,
  } = ctx.projectStore;
  const { writeProjectFile, readProjectFile, ensureProject, listFiles, listTabs, setTabs, resolveProjectDir } = ctx.projectFiles;
  const {
    insertConversation,
    insertConversationAsync,
    getConversation, listConversations, listConversationsAsync, updateConversation, deleteConversation, listMessages, listMessagesAsync, upsertMessage, listPreviewComments, listPreviewCommentsAsync, upsertPreviewComment, updatePreviewCommentStatus, applyPreviewCommentDeckSlideRemap, deletePreviewComment } = ctx.conversations;
  const { getTemplate, listTemplates, deleteTemplate, insertTemplate, findTemplateByNameAndProject, updateTemplate } = ctx.templates;
  const {
    listLatestProjectRunStatusesAsync,
    listProjectsAwaitingInputAsync,
    normalizeProjectDisplayStatus,
    composeProjectDisplayStatus,
  } = ctx.status;
  const { subscribeFileEvents, activeProjectEventSinks } = ctx.events;
  const { randomId } = ctx.ids;
  const { validateProjectDesignSystemId, validateProjectSkillId } = ctx.validation;
  async function recoverTeamverConversationForWrite(projectId: string, conversationId: string, patch?: any) {
    if (!isTeamverDesignManaged()) return null;
    if (!isSafeId(projectId) || !isSafeId(conversationId)) return null;
    const project = getProjectAsync
      ? await getProjectAsync(db, projectId)
      : getProject(db, projectId);
    if (!project) return null;
    const now = Date.now();
    const sessionMode = normalizeChatSessionMode(patch?.sessionMode);
    const payload = {
      id: conversationId,
      projectId,
      title: typeof patch?.title === 'string' ? patch.title.trim() || null : null,
      sessionMode,
      createdAt: now,
      updatedAt: now,
    };
    // Await durable PG insert when available so the next sticky hop sees the
    // row; ON CONFLICT in pgInsertConversation covers recover races.
    const conv = insertConversationAsync
      ? await insertConversationAsync(db, payload)
      : insertConversation(db, payload);
    console.warn(
      JSON.stringify({
        metric: 'teamver_conversation_recovered_for_write',
        ts: now,
        projectId,
        conversationId,
        sessionMode,
      }),
    );
    return conv;
  }

  /** Local row or Teamver HA/create-handoff stub. Never invents rows outside Teamver. */
  async function ensureTeamverConversation(
    projectId: string,
    conversationId: string,
    patch?: any,
  ) {
    let conv = getConversation(db, conversationId);
    if (!conv && listConversationsAsync) {
      // Postgres sync getConversation is cache-only. Warm the project list
      // before inventing a stub so sticky-miss reopen keeps the durable row
      // (title, messages) instead of racing a duplicate insert.
      try {
        await listConversationsAsync(db, projectId);
        conv = getConversation(db, conversationId);
      } catch {
        /* fall through to recover */
      }
    }
    if (!conv) {
      conv = await recoverTeamverConversationForWrite(projectId, conversationId, patch);
    }
    if (!conv || conv.projectId !== projectId) return null;
    return conv;
  }

  async function loadPluginRegistryView() {
    const [skills, designSystems] = await Promise.all([
      listSkills(SKILLS_DIR),
      listDesignSystems(DESIGN_SYSTEMS_DIR),
    ]);
    return {
      skills: skills.map((s) => ({ id: s.id, title: s.name, description: s.description })),
      designSystems: designSystems.map((d) => ({ id: d.id, title: d.title })),
      craft: [],
      atoms: FIRST_PARTY_ATOMS.map((a) => ({ id: a.id, label: a.label })),
      scenarios: collectBundledScenarios(),
    };
  }

  function collectBundledScenarios() {
    type ScenarioEntry = {
      id: string;
      taskKind: 'new-generation' | 'figma-migration' | 'code-migration' | 'tune-collab';
      pipeline: NonNullable<NonNullable<PluginManifest['od']>['pipeline']>;
    };
    const byTaskKind = new Map<ScenarioEntry['taskKind'], ScenarioEntry>();
    try {
      const all = listInstalledPlugins(db);
      for (const row of all) {
        if (row.sourceKind !== 'bundled') continue;
        const od = row.manifest.od;
        if (!od || od.kind !== 'scenario') continue;
        if (!od.pipeline || !Array.isArray(od.pipeline.stages) || od.pipeline.stages.length === 0) continue;
        const taskKind = (od.taskKind ?? 'new-generation') as ScenarioEntry['taskKind'];
        if (
          taskKind !== 'new-generation' &&
          taskKind !== 'figma-migration' &&
          taskKind !== 'code-migration' &&
          taskKind !== 'tune-collab'
        ) {
          continue;
        }
        const entry: ScenarioEntry = { id: row.id, taskKind, pipeline: od.pipeline };
        const existing = byTaskKind.get(taskKind);
        if (!existing || entry.id === `od-${taskKind}`) {
          byTaskKind.set(taskKind, entry);
        }
      }
    } catch {
      return [];
    }
    return Array.from(byTaskKind.values());
  }

  async function configuredProjectLocations() {
    const config = await readAppConfig(ctx.paths.RUNTIME_DATA_DIR);
    const all = allProjectLocations(PROJECTS_DIR, config.projectLocations);
    const valid = all[0] ? [all[0]] : [];
    for (const location of all.slice(1)) {
      const validated = validateLinkedDirs([location.path]);
      if (validated.error) continue;
      const canonical = validated.dirs[0];
      if (!canonical) continue;
      if (locationOverlapsDaemonData(canonical)) continue;
      valid.push({ ...location, path: canonical });
    }
    return valid;
  }

  function locationOverlapsDaemonData(locationPath: string): boolean {
    const runtimeDir = ctx.paths.RUNTIME_DATA_DIR_CANONICAL || ctx.paths.RUNTIME_DATA_DIR;
    const projectsDir = path.join(runtimeDir, 'projects');
    const relativeToRuntime = pathRelative(runtimeDir, locationPath);
    const runtimeInsideLocation = pathRelative(locationPath, runtimeDir);
    const relativeToProjects = pathRelative(projectsDir, locationPath);
    const projectsInsideLocation = pathRelative(locationPath, projectsDir);
    return isInsideOrSame(relativeToRuntime) || isInsideOrSame(runtimeInsideLocation)
      || isInsideOrSame(relativeToProjects) || isInsideOrSame(projectsInsideLocation);
  }

  function pathRelative(from: string, to: string): string {
    return path.relative(from, to);
  }

  function isInsideOrSame(relative: string): boolean {
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  }

  function projectBelongsToLocation(project: any, location: { id: string; path: string }): boolean {
    const metadata = project?.metadata;
    if (typeof metadata?.baseDir !== 'string') return metadata?.projectLocationId === location.id;
    const relative = path.relative(location.path, metadata.baseDir);
    return isInsideOrSame(relative) && relative !== '';
  }

  function isProjectLocationProject(project: any): boolean {
    const metadata = project?.metadata;
    return metadata?.importedFrom === 'project-location'
      || typeof metadata?.projectLocationId === 'string';
  }

  function projectVisibleForLocations(
    project: any,
    locations: Array<{ id: string; path: string; builtIn?: boolean }>,
  ): boolean {
    if (!isProjectLocationProject(project)) return true;
    return locations.some((location) => !location.builtIn && projectBelongsToLocation(project, location));
  }

  async function resolveCreateProjectLocationId(explicitProjectLocationId: unknown): Promise<string> {
    if (typeof explicitProjectLocationId === 'string' && explicitProjectLocationId.trim()) {
      return explicitProjectLocationId.trim();
    }
    const config = await readAppConfig(ctx.paths.RUNTIME_DATA_DIR);
    const configuredDefault = typeof config.defaultProjectLocationId === 'string'
      ? config.defaultProjectLocationId.trim()
      : '';
    if (!configuredDefault || configuredDefault === BUILT_IN_PROJECT_LOCATION_ID) {
      return BUILT_IN_PROJECT_LOCATION_ID;
    }
    const locations = await configuredProjectLocations();
    return locations.some((location) => !location.builtIn && location.id === configuredDefault)
      ? configuredDefault
      : BUILT_IN_PROJECT_LOCATION_ID;
  }

  async function unregisterProjectsForRemovedLocations(
    previousLocations: Array<{ id: string; path: string; builtIn?: boolean }>,
    nextLocations: Array<{ id?: string; path: string }>,
  ): Promise<string[]> {
    const nextIds = new Set(nextLocations.map((location) => location.id).filter(Boolean));
    const nextPaths = new Set(nextLocations.map((location) => location.path));
    const removed = previousLocations.filter(
      (location) => !location.builtIn && !nextIds.has(location.id) && !nextPaths.has(location.path),
    );
    if (removed.length === 0) return [];
    const projects = await listProjectsAsync(db);
    return projects
      .filter((project: any) => removed.some((location) => projectBelongsToLocation(project, location)))
      .map((project: any) => project.id);
  }

  const PROJECT_LIST_DEFAULT_LIMIT = 24;
  const PROJECT_LIST_MAX_LIMIT = 100;
  const PROJECT_RECENT_DEFAULT_LIMIT = 6;
  const PROJECT_RECENT_MAX_LIMIT = 24;

  function parseProjectsListLimit(raw: unknown, fallback: number, max: number): number {
    const n = typeof raw === 'string' ? Number(raw) : typeof raw === 'number' ? raw : NaN;
    if (!Number.isFinite(n)) return fallback;
    return Math.max(1, Math.min(Math.floor(n), max));
  }

  async function buildProjectListingContext() {
    const locations = await configuredProjectLocations();
    const latestRunStatuses = await listLatestProjectRunStatusesAsync(db);
    const awaitingInputProjects = await listProjectsAwaitingInputAsync(db);
    const activeRunStatuses = new Map<string, ReturnType<typeof projectStatusFromRun>>();
    for (const run of design.runs.list()) {
      if (!run.projectId) continue;
      const runStatus = projectStatusFromRun(run);
      if (design.runs.isTerminal(run.status)) {
        const existing = latestRunStatuses.get(run.projectId);
        if (!existing || run.updatedAt > (existing.updatedAt ?? 0)) {
          latestRunStatuses.set(run.projectId, runStatus);
        }
      } else {
        const existing = activeRunStatuses.get(run.projectId);
        if (!existing || run.updatedAt > (existing.updatedAt ?? 0)) {
          activeRunStatuses.set(run.projectId, runStatus);
        }
      }
    }
    return { locations, latestRunStatuses, awaitingInputProjects, activeRunStatuses };
  }

  function enrichProjectsForListing(
    rawProjects: Array<{ id: string } & Record<string, unknown>>,
    context: Awaited<ReturnType<typeof buildProjectListingContext>>,
  ) {
    return rawProjects
      .filter((project) => projectVisibleForLocations(project, context.locations))
      .map((project) => ({
        ...project,
        status: composeProjectDisplayStatus(
          context.activeRunStatuses.get(project.id) ??
            context.latestRunStatuses.get(project.id) ?? { value: 'not_started' },
          context.awaitingInputProjects,
          project.id,
        ),
      }));
  }

  app.get('/api/project-locations', async (_req, res) => {
    try {
      const locations = await configuredProjectLocations();
      /** @type {import('@open-design/contracts').ProjectLocationsResponse} */
      const body = { locations };
      res.json(body);
    } catch (err: any) {
      sendApiError(res, 500, 'INTERNAL_ERROR', String(err));
    }
  });

  app.put('/api/project-locations', async (req, res) => {
    try {
      const requested = Array.isArray(req.body?.locations) ? req.body.locations : null;
      if (!requested) return sendApiError(res, 400, 'BAD_REQUEST', 'locations must be an array');
      const previousLocations = await configuredProjectLocations();
      const prepared = [];
      for (const loc of requested) {
        if (!loc || typeof loc !== 'object' || typeof loc.path !== 'string') continue;
        const canonicalPath = await ensureProjectLocation(loc.path);
        const validated = validateLinkedDirs([canonicalPath]);
        if (validated.error) return sendApiError(res, 400, 'BAD_REQUEST', validated.error);
        if (locationOverlapsDaemonData(canonicalPath)) {
          return sendApiError(res, 400, 'BAD_REQUEST', 'project location cannot overlap daemon data');
        }
        prepared.push({
          id: typeof loc.id === 'string' ? loc.id : undefined,
          name: typeof loc.name === 'string' ? loc.name : undefined,
          path: canonicalPath,
        });
      }
      const config = await writeAppConfig(ctx.paths.RUNTIME_DATA_DIR, { projectLocations: prepared });
      const locations = allProjectLocations(PROJECTS_DIR, config.projectLocations);
      const removedProjectIds = await unregisterProjectsForRemovedLocations(previousLocations, config.projectLocations ?? []);
      /** @type {import('@open-design/contracts').ProjectLocationsResponse} */
      const body = { locations, removedProjectIds };
      res.json(body);
    } catch (err: any) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  app.post('/api/project-locations/scan', async (_req, res) => {
    try {
      const locations = (await configuredProjectLocations()).filter((loc: any) => !loc.builtIn);
      const imported = [];
      const existing: string[] = [];
      const skipped: Array<{ path: string; reason: string }> = [];
      let scanned = 0;
      const now = Date.now();
      for (const location of locations) {
        let found;
        try {
          found = await scanProjectLocation(location);
        } catch (err: any) {
          skipped.push({ path: location.path, reason: String(err?.message ?? err) });
          continue;
        }
        scanned += found.length;
        for (const entry of found) {
          const { manifest } = entry;
          if (getProject(db, manifest.id)) {
            existing.push(manifest.id);
            continue;
          }
          try {
            const project = insertProject(db, {
              id: manifest.id,
              name: manifest.name,
              skillId: manifest.skillId ?? null,
              designSystemId: manifest.designSystemId ?? null,
              pendingPrompt: null,
              metadata: {
                kind: 'prototype',
                baseDir: entry.dir,
                importedFrom: 'project-location',
                projectLocationId: location.id,
              },
              customInstructions: null,
              createdAt: manifest.createdAt,
              updatedAt: manifest.updatedAt,
            });
            insertConversation(db, {
              id: randomId(),
              projectId: manifest.id,
              title: null,
              createdAt: now,
              updatedAt: now,
            });
            if (project) imported.push(project);
          } catch (err: any) {
            skipped.push({ path: entry.dir, reason: String(err?.message ?? err) });
          }
        }
      }
      /** @type {import('@open-design/contracts').ScanProjectLocationsResponse} */
      const body = { scanned, imported, existing, skipped };
      res.json(body);
    } catch (err: any) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  app.get('/api/projects/recent', async (req, res) => {
    try {
      const limit = parseProjectsListLimit(
        req.query.limit,
        PROJECT_RECENT_DEFAULT_LIMIT,
        PROJECT_RECENT_MAX_LIMIT,
      );
      const page = await listProjectsPageAsync(db, { limit });
      const context = await buildProjectListingContext();
      /** @type {import('@open-design/contracts').RecentProjectsResponse} */
      const body = {
        projects: enrichProjectsForListing(page.projects, context),
      };
      res.json(body);
    } catch (err: any) {
      sendApiError(res, 500, 'INTERNAL_ERROR', String(err));
    }
  });

  app.get('/api/projects', async (req, res) => {
    try {
      const limitRaw = req.query.limit;
      const cursorRaw = req.query.cursor;
      const paginated = limitRaw !== undefined || cursorRaw !== undefined;
      const context = await buildProjectListingContext();
      if (!paginated) {
        /** @type {import('@open-design/contracts').ProjectsResponse} */
        const body = {
          projects: enrichProjectsForListing(await listProjectsAsync(db), context),
        };
        res.json(body);
        return;
      }
      const limit = parseProjectsListLimit(
        limitRaw,
        PROJECT_LIST_DEFAULT_LIMIT,
        PROJECT_LIST_MAX_LIMIT,
      );
      const page = await listProjectsPageAsync(db, {
        limit,
        cursor: parseProjectListCursor(
          typeof cursorRaw === 'string' ? cursorRaw : undefined,
        ),
      });
      /** @type {import('@open-design/contracts').PaginatedProjectsResponse} */
      const body = {
        projects: enrichProjectsForListing(page.projects, context),
        hasMore: page.hasMore,
        nextCursor: page.nextCursor,
      };
      res.json(body);
    } catch (err: any) {
      sendApiError(res, 500, 'INTERNAL_ERROR', String(err));
    }
  });

  app.post('/api/projects/cover-hints', async (req, res) => {
    try {
      const rawIds = Array.isArray(req.body?.projectIds) ? req.body.projectIds : [];
      const seen = new Set<string>();
      const projectIds: string[] = [];
      for (const raw of rawIds) {
        if (typeof raw !== 'string') continue;
        const id = raw.trim();
        if (!isSafeId(id) || seen.has(id)) continue;
        seen.add(id);
        projectIds.push(id);
        if (projectIds.length >= PROJECT_COVER_HINTS_BATCH_MAX) break;
      }
      const locations = await configuredProjectLocations();
      const teamverManaged = isTeamverDesignManaged();
      const teamverIdentity = teamverManaged ? readTeamverIdentityFromRequest(req) : null;
      /** @type {import('@open-design/contracts').ProjectCoverHint[]} */
      const hints = [];
      for (const projectId of projectIds) {
        // PG project-row warm only (no ensureMaterialized / full warmProjectFromPostgres).
        // Cold nodes often lack sqlite cache; metadata.entryFile is enough for a hint.
        const project = getProjectAsync
          ? await getProjectAsync(db, projectId)
          : getProject(db, projectId);
        if (project && !projectVisibleForLocations(project, locations)) continue;
        if (!project && teamverManaged) {
          if (!teamverIdentity) continue;
          const access = await verifyTeamverProjectAccess(projectId, teamverIdentity);
          if (!access.ok) continue;
        }
        // Registry-first embed lists may reference ids not yet on disk —
        // metadata.entryFile resolves disk-free; otherwise shallow scan when present.
        const resolved = await resolveProjectCoverHint(
          PROJECTS_DIR,
          projectId,
          project ?? { metadata: {} },
        );
        if (!resolved) continue;
        hints.push({
          projectId,
          entryFile: resolved.entryFile ?? null,
          coverKind: resolved.coverKind ?? null,
          coverPath: resolved.coverPath ?? null,
          coverVersion: resolved.coverVersion ?? null,
        });
      }
      /** @type {import('@open-design/contracts').ProjectCoverHintsResponse} */
      const body = { hints };
      res.json(body);
    } catch (err: any) {
      sendApiError(res, 500, 'INTERNAL_ERROR', String(err));
    }
  });

  /**
   * Registry-first embed lists send membership from BFF RDS; daemon top-N
   * pages miss tenant rows and leave cards stuck on `not_started`. Resolve
   * status/metadata for an explicit id set via sqlite (no S3 materialize).
   */
  app.post('/api/projects/status-hints', async (req, res) => {
    try {
      const rawIds = Array.isArray(req.body?.projectIds) ? req.body.projectIds : [];
      const seen = new Set<string>();
      const projectIds: string[] = [];
      for (const raw of rawIds) {
        if (typeof raw !== 'string') continue;
        const id = raw.trim();
        if (!isSafeId(id) || seen.has(id)) continue;
        seen.add(id);
        projectIds.push(id);
        if (projectIds.length >= PROJECT_STATUS_HINTS_BATCH_MAX) break;
      }
      const context = await buildProjectListingContext();
      const rawProjects = [];
      for (const projectId of projectIds) {
        const project = getProject(db, projectId);
        if (!project) continue;
        rawProjects.push(project);
      }
      /** @type {import('@open-design/contracts').ProjectsResponse} */
      const body = {
        projects: enrichProjectsForListing(rawProjects, context),
      };
      res.json(body);
    } catch (err: any) {
      sendApiError(res, 500, 'INTERNAL_ERROR', String(err));
    }
  });

  function projectStatusFromRun(run: any) {
    return {
      value: normalizeProjectDisplayStatus(run.status),
      updatedAt: run.updatedAt,
      runId: run.id,
    };
  }

  app.post('/api/projects', async (req, res) => {
    try {
      const { id, name, projectLocationId, skillId, designSystemId, pendingPrompt, metadata, customInstructions, skipDiscoveryBrief } =
        req.body || {};
      if (typeof id !== 'string' || !isSafeId(id)) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'invalid project id');
      }
      if (typeof name !== 'string' || !name.trim()) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'name required');
      }
      // baseDir is privileged: it lets a project root directly inside the
      // user's filesystem. The /api/import/folder endpoint is the only
      // path that's allowed to set it, because that's where realpath() +
      // RUNTIME_DATA_DIR reentry checks live. Block client-supplied
      // metadata.baseDir on this generic create endpoint so an attacker
      // can't smuggle e.g. /etc through here. Same rule for
      // originalBaseDir / importedFrom='folder' — only the import path
      // owns those state fields.
      if (metadata && typeof metadata === 'object') {
        if ('baseDir' in metadata) {
          return sendApiError(
            res, 400, 'BAD_REQUEST',
            'baseDir can only be set via POST /api/import/folder',
          );
        }
        if ('fromTrustedPicker' in metadata) {
          return sendApiError(
            res, 400, 'BAD_REQUEST',
            'fromTrustedPicker can only be set via POST /api/import/folder',
          );
        }
        // Reject invalid linked working directories up front (consistent with
        // PATCH /api/projects/:id) instead of silently dropping them. The
        // caller promises the agent `--add-dir` access to this folder; if the
        // path is deleted/inaccessible/a system dir, fail loudly so the client
        // can surface it rather than creating a project + auto-running a turn
        // whose linked-dir access never materialises.
        if (Array.isArray(metadata.linkedDirs)) {
          if (isTeamverDesignManaged() && metadata.linkedDirs.length > 0) {
            return sendApiError(
              res,
              400,
              'LINKED_DIRS_UNAVAILABLE',
              'linked local folders are not available in Teamver embed mode',
            );
          }
          const validated = validateLinkedDirs(metadata.linkedDirs);
          if (validated.error) {
            return sendApiError(res, 400, 'INVALID_LINKED_DIR', validated.error);
          }
        }
      }
      if (customInstructions !== undefined
          && typeof customInstructions !== 'string'
          && customInstructions !== null) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'customInstructions must be a string or null');
      }
      if (typeof customInstructions === 'string' && customInstructions.length > 5000) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'customInstructions exceeds 5 000 character limit');
      }
      if (skipDiscoveryBrief !== undefined && typeof skipDiscoveryBrief !== 'boolean') {
        return sendApiError(res, 400, 'BAD_REQUEST', 'skipDiscoveryBrief must be a boolean');
      }
      const designSystemValidation = await validateProjectDesignSystemId(designSystemId);
      if (!designSystemValidation.ok) {
        return sendApiError(
          res,
          400,
          designSystemValidation.code,
          designSystemValidation.message,
        );
      }
      const normalizedDesignSystemId = designSystemValidation.id;
      const skillValidation = await validateProjectSkillId(skillId);
      if (!skillValidation.ok) {
        return sendApiError(res, 400, skillValidation.code, skillValidation.message);
      }
      const normalizedSkillId = skillValidation.id;
      const selectedLocationId = await resolveCreateProjectLocationId(projectLocationId);
      let externalProjectDir: string | null = null;
      if (selectedLocationId !== BUILT_IN_PROJECT_LOCATION_ID) {
        const location = (await configuredProjectLocations()).find((loc: any) => loc.id === selectedLocationId);
        if (!location || location.builtIn) {
          return sendApiError(res, 400, 'BAD_REQUEST', 'unknown project location');
        }
        if (getProject(db, id)) {
          return sendApiError(res, 400, 'BAD_REQUEST', 'project id already exists');
        }
        externalProjectDir = await createLocationProjectDir(location, id);
      }
      const projectMetadata =
        metadata && typeof metadata === 'object'
          ? {
              ...metadata,
              ...(skipDiscoveryBrief === true ? { skipDiscoveryBrief: true } : {}),
              ...(externalProjectDir
                ? {
                    baseDir: externalProjectDir,
                    importedFrom: 'project-location',
                    projectLocationId: selectedLocationId,
                  }
                : {}),
              ...(Array.isArray(metadata.linkedDirs)
                ? (() => {
                    const v = validateLinkedDirs(metadata.linkedDirs);
                    return v.error ? {} : { linkedDirs: v.dirs };
                  })()
                : {}),
            }
          : skipDiscoveryBrief === true
            ? {
                skipDiscoveryBrief: true,
                ...(externalProjectDir
                  ? {
                      baseDir: externalProjectDir,
                      importedFrom: 'project-location',
                      projectLocationId: selectedLocationId,
                    }
                  : {}),
              }
            : externalProjectDir
              ? {
                  kind: 'prototype',
                  baseDir: externalProjectDir,
                  importedFrom: 'project-location',
                  projectLocationId: selectedLocationId,
                }
              : null;
      const now = Date.now();
      let project;
      try {
        if (externalProjectDir) {
          await writeProjectManifest(externalProjectDir, {
            schemaVersion: 1,
            id,
            name: name.trim(),
            createdAt: now,
            updatedAt: now,
            skillId: normalizedSkillId,
            designSystemId: normalizedDesignSystemId,
          });
        }
        project = insertProjectAsync
          ? await insertProjectAsync(db, {
              id,
              name: name.trim(),
              skillId: normalizedSkillId,
              designSystemId: normalizedDesignSystemId,
              pendingPrompt: pendingPrompt || null,
              metadata: projectMetadata,
              customInstructions:
                typeof customInstructions === 'string'
                  ? customInstructions
                  : null,
              createdAt: now,
              updatedAt: now,
            })
          : insertProject(db, {
              id,
              name: name.trim(),
              skillId: normalizedSkillId,
              designSystemId: normalizedDesignSystemId,
              pendingPrompt: pendingPrompt || null,
              metadata: projectMetadata,
              customInstructions:
                typeof customInstructions === 'string'
                  ? customInstructions
                  : null,
              createdAt: now,
              updatedAt: now,
            });
      } catch (err) {
        if (externalProjectDir) {
          await rm(externalProjectDir, { recursive: true, force: true }).catch(() => {});
        }
        throw err;
      }
      // Seed a default conversation so the UI always has somewhere to write.
      const cid = randomId();
      const initialSessionMode = normalizeChatSessionMode(
        req.body?.conversationMode ?? req.body?.sessionMode,
      );
      if (insertConversationAsync) {
        await insertConversationAsync(db, {
          id: cid,
          projectId: id,
          title: null,
          sessionMode: initialSessionMode,
          createdAt: now,
          updatedAt: now,
        });
      } else {
        insertConversation(db, {
          id: cid,
          projectId: id,
          title: null,
          sessionMode: initialSessionMode,
          createdAt: now,
          updatedAt: now,
        });
      }
      const explicitPlugin =
        typeof req.body?.pluginId === 'string' && req.body.pluginId.trim().length > 0
          ? true
          : typeof req.body?.appliedPluginSnapshotId === 'string'
            && req.body.appliedPluginSnapshotId.trim().length > 0;
      let resolveBody =
        explicitPlugin ? (req.body as Record<string, unknown>) : null;
      if (!resolveBody && initialSessionMode === 'design') {
        const fallbackPluginId = defaultScenarioPluginIdForProjectMetadata(projectMetadata);
        if (fallbackPluginId && getInstalledPlugin(db, fallbackPluginId)) {
          resolveBody = { ...(req.body || {}), pluginId: fallbackPluginId };
        }
      }
      let resolvedSnapshot = null;
      if (resolveBody) {
        const registry = await loadPluginRegistryView();
        const resolved = resolvePluginSnapshot({
          db,
          body: resolveBody,
          projectId: id,
          conversationId: cid,
          registry,
          activeProjectDesignSystem:
            typeof normalizedDesignSystemId === 'string' && normalizedDesignSystemId.length > 0
              ? { id: normalizedDesignSystemId }
              : undefined,
          connectorProbe: buildConnectorProbe(connectorService),
        });
        if (resolved && !resolved.ok) {
          if (!explicitPlugin) {
            console.warn(
              `[plugins] default-scenario fallback skipped for project ${id}: ${resolved.body?.error?.code ?? 'unknown'}`,
            );
          } else {
            return res.status(resolved.status).json(resolved.body);
          }
        } else {
          resolvedSnapshot = resolved;
        }
      }
      // For "from template" projects, seed the chosen template's snapshot
      // HTML into the new project folder so the agent can Read/edit files
      // on disk (the system prompt also embeds them, but a real on-disk
      // copy lets the agent treat them as the project's working state).
      if (
        metadata &&
        typeof metadata === 'object' &&
        metadata.kind === 'template' &&
        typeof metadata.templateId === 'string'
      ) {
        const tpl = getTemplate(db, metadata.templateId);
        if (tpl && Array.isArray(tpl.files) && tpl.files.length > 0) {
          await ensureProject(PROJECTS_DIR, id, projectMetadata);
          for (const f of tpl.files) {
            if (
              !f ||
              typeof f.name !== 'string' ||
              typeof f.content !== 'string'
            ) {
              continue;
            }
            try {
              await writeProjectFile(
                PROJECTS_DIR,
                id,
                f.name,
                Buffer.from(f.content, 'utf8'),
                {},
                projectMetadata,
              );
            } catch {
              // Skip individual file failures — the template snapshot is
              // best-effort; the agent still has the embedded copy.
            }
          }
        }
      }
      /** @type {import('@open-design/contracts').CreateProjectResponse} */
      const body = {
        project: resolvedSnapshot?.ok ? getProject(db, id) ?? project : project,
        conversationId: cid,
        ...(resolvedSnapshot?.ok
          ? { appliedPluginSnapshotId: resolvedSnapshot.snapshotId }
          : {}),
      };
      if (!externalProjectDir && ctx.projectStorageHooks) {
        scheduleProjectStoragePersistAfterResponse(ctx.projectStorageHooks, req, res, id);
      }
      res.json(body);
    } catch (err: any) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  // NOTE: The teamver project access middleware used to be registered here.
  // It now lives in server.ts so it can run BEFORE the lazy project
  // materialization middleware, otherwise a not-yet-registered project ID
  // surfaces as a misleading `teamver_project_s3_prefix_required` 502 from
  // materialization instead of the proper 404 from the access gate.
  // See: docs-teamver/18_OD_Tenant_Storage.md §3.4.

  app.post('/api/projects/:id/scratch/evict', async (req, res) => {
    const projectId = req.params.id;
    if (!ctx.projectStorageHooks) {
      return sendApiError(res, 503, 'PROJECT_STORAGE_UNAVAILABLE', 'project storage hooks unavailable');
    }
    await ctx.projectStorageHooks.onProjectRemoved(req, projectId);
    res.status(204).end();
  });

  app.post('/api/projects/:id/scratch/sync-up', async (req, res) => {
    const projectId = req.params.id;
    if (!ctx.projectStorageHooks) {
      return sendApiError(res, 503, 'PROJECT_STORAGE_UNAVAILABLE', 'project storage hooks unavailable');
    }
    try {
      await ctx.projectStorageHooks.persistAfterMutation(req, projectId, { strict: true });
      res.status(204).end();
    } catch (err) {
      sendApiError(
        res,
        502,
        'PROJECT_STORAGE_SYNC_FAILED',
        err instanceof Error ? err.message : 'project storage sync failed',
      );
    }
  });

  app.get('/api/projects/:id', async (req, res) => {
    const project = getProjectAsync
      ? await getProjectAsync(db, req.params.id)
      : getProject(db, req.params.id);
    const locations = await configuredProjectLocations();
    if (!project || !projectVisibleForLocations(project, locations))
      return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'not found');
    const resolvedDir = projectDetailResolvedDir(PROJECTS_DIR, project, resolveProjectDir);
    /** @type {import('@open-design/contracts').ProjectResponse} */
    const body = { project, resolvedDir };
    res.json(body);
  });

  app.patch('/api/projects/:id', async (req, res) => {
    try {
      const patch = req.body || {};
      // baseDir / folder-import state is privileged: it's set only by the
      // import endpoint and otherwise immutable. Two failure modes to
      // guard against here:
      //   1. Explicit attempt to change baseDir → reject with 400.
      //   2. A regular metadata patch that *omits* baseDir (e.g. a UI
      //      that only edits linkedDirs sends `{ metadata: { kind, linkedDirs } }`).
      //      updateProject() replaces metadata wholesale, so without
      //      preservation the existing baseDir gets wiped and the project
      //      detaches from the user's folder — subsequent reads/writes
      //      silently fall back to .od/projects/<id>.
      // For case 2 we re-stamp the immutable fields from the existing
      // project record onto the incoming patch so the user can keep
      // patching other metadata without ever losing their import root.
      if (patch.metadata && typeof patch.metadata === 'object') {
        const existing = getProject(db, req.params.id);
        const existingMeta = existing?.metadata;
        if ('fromTrustedPicker' in patch.metadata
            && patch.metadata.fromTrustedPicker !== existingMeta?.fromTrustedPicker) {
          return sendApiError(
            res, 400, 'BAD_REQUEST',
            'fromTrustedPicker can only be set via POST /api/import/folder',
          );
        }
        if (existingMeta?.baseDir) {
          if ('baseDir' in patch.metadata && patch.metadata.baseDir !== existingMeta.baseDir) {
            return sendApiError(
              res, 400, 'BAD_REQUEST',
              'baseDir is immutable after import; use a new import to change it',
            );
          }
          patch.metadata = {
            ...patch.metadata,
            baseDir: existingMeta.baseDir,
            ...(existingMeta.importedFrom === 'folder'
              ? { importedFrom: 'folder' }
              : {}),
            ...(existingMeta.importedFrom === 'project-location'
              ? { importedFrom: 'project-location' }
              : {}),
            ...(typeof existingMeta.projectLocationId === 'string'
              ? { projectLocationId: existingMeta.projectLocationId }
              : {}),
            ...(existingMeta.fromTrustedPicker === true
              ? { fromTrustedPicker: true as const }
              : {}),
          };
        } else if ('baseDir' in patch.metadata) {
          // Non-imported project trying to acquire a baseDir → reject (only
          // /api/import/folder can set it).
          return sendApiError(
            res, 400, 'BAD_REQUEST',
            'baseDir can only be set via POST /api/import/folder',
          );
        }
      }
      if (patch.metadata?.linkedDirs) {
        if (isTeamverDesignManaged()) {
          return sendApiError(
            res,
            400,
            'LINKED_DIRS_UNAVAILABLE',
            'linked local folders are not available in Teamver embed mode',
          );
        }
        const existing = getProject(db, req.params.id);
        const validated = validateLinkedDirs(patch.metadata.linkedDirs);
        if (validated.error) {
          return sendApiError(res, 400, 'INVALID_LINKED_DIR', validated.error);
        }
        patch.metadata.linkedDirs =
          existing?.metadata?.fromTrustedPicker === true
            ? patch.metadata.linkedDirs
            : validated.dirs;
      }
      if (patch.customInstructions !== undefined
          && typeof patch.customInstructions !== 'string'
          && patch.customInstructions !== null) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'customInstructions must be a string or null');
      }
      if (typeof patch.customInstructions === 'string' && patch.customInstructions.length > 5000) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'customInstructions exceeds 5 000 character limit');
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'designSystemId')) {
        const designSystemValidation = await validateProjectDesignSystemId(patch.designSystemId);
        if (!designSystemValidation.ok) {
          return sendApiError(
            res,
            400,
            designSystemValidation.code,
            designSystemValidation.message,
          );
        }
        patch.designSystemId = designSystemValidation.id;
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'skillId')) {
        const skillValidation = await validateProjectSkillId(patch.skillId);
        if (!skillValidation.ok) {
          return sendApiError(res, 400, skillValidation.code, skillValidation.message);
        }
        patch.skillId = skillValidation.id;
      }
      const project = updateProject(db, req.params.id, patch);
      if (!project)
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'not found');
      /** @type {import('@open-design/contracts').ProjectResponse} */
      const body = { project };
      res.json(body);
    } catch (err: any) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  app.delete('/api/projects/:id', async (req, res) => {
    try {
      const projectId = req.params.id;
      if (dbDeleteProjectAsync) {
        await dbDeleteProjectAsync(db, projectId);
      } else {
        dbDeleteProject(db, projectId);
      }
      await removeProjectDir(PROJECTS_DIR, projectId).catch(() => {});
      await deleteProjectRevisionSnapshotTree(PROJECTS_DIR, projectId).catch(() => {});
      if (ctx.projectStorageHooks) {
        await ctx.projectStorageHooks.onProjectRemoved(req, projectId);
      }
      /** @type {import('@open-design/contracts').OkResponse} */
      const body = { ok: true };
      res.json(body);
    } catch (err: any) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  // SSE stream of file-changed events for a project. Drives preview live-reload.
  // Receipt of a `file-changed` event triggers a file-list refresh, which
  // propagates new mtimes through to FileViewer iframes (the URL-load
  // `?v=${mtime}` cache-bust from PR #384 then reloads the iframe automatically).
  // Subscribers come and go as users open/close project tabs; the underlying
  // chokidar watcher is refcounted in project-watchers.ts so we never hold
  // descriptors for projects no UI is looking at.
  app.get('/api/projects/:id/events', (req, res) => {
    if (!getProject(db, req.params.id)) {
      return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'not found');
    }
    let sub: any;
    try {
      const sse = createSseResponse(res);
      const projectEventSink = (payload: any) => {
        sse.send(payload.type, payload);
      };
      let sinks = activeProjectEventSinks.get(req.params.id);
      if (!sinks) {
        sinks = new Set();
        activeProjectEventSinks.set(req.params.id, sinks);
      }
      sinks.add(projectEventSink);
      const watchProject = getProject(db, req.params.id);
      sub = subscribeFileEvents(PROJECTS_DIR, req.params.id, (evt: any) => {
        sse.send('file-changed', evt);
      }, { metadata: watchProject?.metadata });
      sub.ready.then(() => sse.send('ready', { projectId: req.params.id })).catch(() => {});
      const cleanup = () => {
        if (sub) {
          const { unsubscribe } = sub;
          sub = null;
          Promise.resolve(unsubscribe()).catch(() => {});
        }
        const currentSinks = activeProjectEventSinks.get(req.params.id);
        currentSinks?.delete(projectEventSink);
        if (currentSinks?.size === 0) activeProjectEventSinks.delete(req.params.id);
      };
      res.on('close', cleanup);
      res.on('finish', cleanup);
    } catch (err: any) {
      if (sub) Promise.resolve(sub.unsubscribe()).catch(() => {});
      if (!res.headersSent) sendApiError(res, 400, 'BAD_REQUEST', String(err?.message || err));
    }
  });

  // ---- Conversations --------------------------------------------------------

  app.get('/api/projects/:id/conversations', async (req, res) => {
    const project = getProjectAsync
      ? await getProjectAsync(db, req.params.id)
      : getProject(db, req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'project not found' });
    }
    const list = listConversationsAsync
      ? await listConversationsAsync(db, req.params.id)
      : listConversations(db, req.params.id);
    res.json({ conversations: list });
  });

  app.post('/api/projects/:id/conversations', async (req, res) => {
    const conversationProject = getProjectAsync
      ? await getProjectAsync(db, req.params.id)
      : getProject(db, req.params.id);
    if (!conversationProject) {
      return res.status(404).json({ error: 'project not found' });
    }
    const { title, seedFromConversationId, forkAfterMessageId } = req.body || {};
    const now = Date.now();
    const hasExplicitSessionMode = Boolean(
      req.body && Object.prototype.hasOwnProperty.call(req.body, 'sessionMode'),
    );
    const requestedForkMessageId =
      typeof forkAfterMessageId === 'string' && forkAfterMessageId
        ? forkAfterMessageId
        : null;
    const sourceConversation =
      typeof seedFromConversationId === 'string' && seedFromConversationId
        ? getConversation(db, seedFromConversationId)
        : null;
    // Client-supplied fork snapshot. The chat "Fork" action sends the exact
    // messages the user is looking at (up to the fork point). We prefer it over
    // reading the source conversation from the DB so a fork point that was
    // never persisted — e.g. an assistant turn whose run errored / had its
    // connection reset before reaching the database — still forks instead of
    // 404ing on `forkAfterMessageId`.
    const clientSeedMessages = Array.isArray(req.body?.seedMessages)
      ? (req.body.seedMessages as any[]).filter(
          (message) => message && typeof message.role === 'string',
        )
      : null;
    let seedMessages: any[] = [];
    if (clientSeedMessages && clientSeedMessages.length > 0) {
      seedMessages = clientSeedMessages;
      if (requestedForkMessageId) {
        const forkIndex = seedMessages.findIndex(
          (message) => message.id === requestedForkMessageId,
        );
        if (forkIndex >= 0) {
          seedMessages = seedMessages.slice(0, forkIndex + 1);
        }
      }
    } else if (sourceConversation && sourceConversation.projectId === req.params.id) {
      seedMessages = listMessages(db, seedFromConversationId);
      if (requestedForkMessageId) {
        const forkIndex = seedMessages.findIndex((message) => message.id === requestedForkMessageId);
        if (forkIndex < 0) {
          return res.status(404).json({ error: 'fork message not found' });
        }
        seedMessages = seedMessages.slice(0, forkIndex + 1);
      }
    } else if (requestedForkMessageId) {
      return res.status(404).json({ error: 'fork source conversation not found' });
    }
    const sessionMode =
      hasExplicitSessionMode
        ? normalizeChatSessionMode(req.body.sessionMode)
        : sourceConversation && sourceConversation.projectId === req.params.id
          ? normalizeChatSessionMode(sourceConversation.sessionMode)
          : 'design';
    const conv = insertConversation(db, {
      id: randomId(),
      projectId: req.params.id,
      title: typeof title === 'string' ? title.trim() || null : null,
      sessionMode,
      createdAt: now,
      updatedAt: now,
    });
    // Side Chat: inherit the source conversation's context by copying its
    // messages into the fresh conversation. Be defensive — a missing or
    // cross-project source id silently yields an empty conversation.
    if (conv && seedMessages.length > 0) {
      for (const m of seedMessages) {
        // Fresh id per copied message; upsertMessage assigns the next
        // position so role/content ordering is preserved. Drop the source's
        // run pointers (runId/runStatus/lastRunEventId): they belong to the
        // OTHER conversation's runs, and a copied still-`running` assistant
        // turn would otherwise render a perpetual spinner in the side chat.
        upsertMessage(db, conv.id, {
          ...m,
          id: randomId(),
          runId: undefined,
          runStatus: undefined,
          lastRunEventId: undefined,
        });
      }
    }
    res.json({ conversation: conv });
  });

  app.patch('/api/projects/:id/conversations/:cid', async (req, res) => {
    const conv = await ensureTeamverConversation(req.params.id, req.params.cid, req.body || {});
    if (!conv) {
      return res.status(404).json({ error: 'not found' });
    }
    const updated = updateConversation(db, req.params.cid, req.body || {});
    res.json({ conversation: updated });
  });

  app.delete('/api/projects/:id/conversations/:cid', (req, res) => {
    const conv = getConversation(db, req.params.cid);
    if (!conv || conv.projectId !== req.params.id) {
      return res.status(404).json({ error: 'not found' });
    }
    deleteConversation(db, req.params.cid);
    res.json({ ok: true });
  });

  // ---- Messages -------------------------------------------------------------

  app.get('/api/projects/:id/conversations/:cid/messages', async (req, res) => {
    // Mirror PUT: on Teamver managed hosts a conversation may exist in the
    // client (and eventually in S3) before this node has a local row — e.g.
    // HA sticky miss, fresh pod, or a race where the first write has not
    // landed yet. Returning 404 here makes background recovery spam the
    // browser console and skip server merges forever; recovering a stub
    // (empty messages) matches PUT's recoverTeamverConversationForWrite
    // so subsequent saves attach to a real conversation.
    const conv = await ensureTeamverConversation(req.params.id, req.params.cid);
    if (!conv) {
      return res.status(404).json({ error: 'conversation not found' });
    }
    // Postgres cold cache: sync listMessages returns [] and would make the
    // client look empty / re-PUT everything. Prefer Async so open hydrates
    // from the durable row set.
    const messages = listMessagesAsync
      ? await listMessagesAsync(db, req.params.cid)
      : listMessages(db, req.params.cid);
    res.json({ messages });
  });

  app.put('/api/projects/:id/conversations/:cid/messages/:mid', async (req, res) => {
    const conv = await ensureTeamverConversation(
      req.params.id,
      req.params.cid,
      req.body || {},
    );
    if (!conv) {
      return res.status(404).json({ error: 'conversation not found' });
    }
    const m = req.body || {};
    if (m.id && m.id !== req.params.mid) {
      return res.status(400).json({ error: 'id mismatch' });
    }
    // Async prior lookup — sync listMessages is cache-only on Postgres and
    // treats every open hydrate PUT as a brand-new message (Home 「방금 전」).
    const priorMessages = listMessagesAsync
      ? await listMessagesAsync(db, req.params.cid)
      : listMessages(db, req.params.cid);
    const prior = priorMessages.find(
      (row: { id?: string }) => row.id === req.params.mid,
    ) ?? null;
    const saved = upsertMessage(db, req.params.cid, {
      ...m,
      id: req.params.mid,
    });
    // Identical re-PUT (open / hydrate) must not move Home 「방금 전」.
    if (messageUpsertIsProjectActivity(prior, m)) {
      updateProject(db, req.params.id, { updatedAt: Date.now() });
    }
    if (isTeamverDesignManaged() && ctx.projectStorageHooks) {
      scheduleTeamverProjectDaemonStateExport(
        db,
        ctx.projectStorageHooks,
        req,
        res,
        req.params.id,
      );
    }
    ctx.telemetry?.reportFinalizedMessage(saved, m, {
      analyticsContext: readAnalyticsContext(req),
      projectId: req.params.id,
      conversationId: req.params.cid,
    });
    // Embed BYOK chats bypass `POST /api/runs` → `afterChatRun`, so the
    // daemon never gets a chance to flush run-end artifacts into S3 nor to
    // finalize Strategy-B billing through the managed-run path. Mirror both
    // hooks here on the terminal assistant-message PUT so:
    //   1) scratch → S3 sync-up happens before the next idle-evict sweep
    //      (catastrophic data loss without this — docs-teamver/16 §5.5b).
    //   2) BYOK usage events + billing finalize POST hit design-api, since
    //      `mode=api` proxy streams never visit the managed run pipeline.
    // The server-side proxy materialization hooks
    // (`byok-proxy-materialization.ts`) act as a second safety net for sync,
    // but billing finalize lives only here.
    if (shouldPersistByokProjectStorageFromMessage(saved) && ctx.projectStorageHooks) {
      scheduleProjectStoragePersistAfterResponse(
        ctx.projectStorageHooks,
        req,
        res,
        req.params.id,
      );
    }
    if (shouldReportByokUsageFromMessage(saved, m) && ctx.reportedRuns) {
      const identity = readTeamverIdentityFromRequest(req);
      if (identity) {
        void reportByokTeamverUsageAndBillingFromDaemon({
          message: saved,
          projectId: req.params.id,
          identity,
          reportedRuns: ctx.reportedRuns,
        });
      } else {
        console.warn(
          JSON.stringify({
            metric: 'teamver_usage_5xx',
            stage: 'byok.identity_missing',
            ts: Date.now(),
            projectId: req.params.id,
            messageId: saved.id,
            runStatus: saved.runStatus ?? null,
          }),
        );
      }
    }
    res.json({ ok: true, id: saved.id });
  });

  // ---- Preview comments ----------------------------------------------------

  app.get('/api/projects/:id/conversations/:cid/comments', async (req, res) => {
    // Same HA / create-handoff race as GET messages: ProjectView loads comments
    // as soon as the create conversation id is handed off, before this node has
    // a local row (sticky miss, fresh pod, or first write still in flight).
    // Returning 404 spams the browser console on every new generation; recover
    // a stub conversation so the client gets `{ comments: [] }` like an empty
    // brand-new chat.
    const conv = await ensureTeamverConversation(req.params.id, req.params.cid);
    if (!conv) {
      return res.status(404).json({ error: 'conversation not found' });
    }
    const comments = listPreviewCommentsAsync
      ? await listPreviewCommentsAsync(db, req.params.id, req.params.cid)
      : listPreviewComments(db, req.params.id, req.params.cid);
    res.json({ comments });
  });

  app.post('/api/projects/:id/conversations/:cid/comments', async (req, res) => {
    const conv = await ensureTeamverConversation(req.params.id, req.params.cid);
    if (!conv) {
      return res.status(404).json({ error: 'conversation not found' });
    }
    try {
      const comment = upsertPreviewComment(
        db,
        req.params.id,
        req.params.cid,
        req.body || {},
      );
      updateProject(db, req.params.id, { updatedAt: Date.now() });
      res.json({ comment });
    } catch (err: any) {
      res.status(400).json({ error: String(err?.message || err) });
    }
  });

  app.patch(
    '/api/projects/:id/conversations/:cid/comments/:commentId',
    async (req, res) => {
      const conv = await ensureTeamverConversation(req.params.id, req.params.cid);
      if (!conv) {
        return res.status(404).json({ error: 'conversation not found' });
      }
      try {
        const comment = updatePreviewCommentStatus(
          db,
          req.params.id,
          req.params.cid,
          req.params.commentId,
          req.body?.status,
        );
        if (!comment)
          return res.status(404).json({ error: 'comment not found' });
        updateProject(db, req.params.id, { updatedAt: Date.now() });
        res.json({ comment });
      } catch (err: any) {
        res.status(400).json({ error: String(err?.message || err) });
      }
    },
  );

  /**
   * After deck page delete/±1 move: drop comments on removed slides and
   * rewrite slideIndex by id (two-phase uniqueness-safe).
   */
  app.post(
    '/api/projects/:id/conversations/:cid/comments/remap-deck-slides',
    async (req, res) => {
      const conv = await ensureTeamverConversation(req.params.id, req.params.cid);
      if (!conv) {
        return res.status(404).json({ error: 'conversation not found' });
      }
      try {
        const result = applyPreviewCommentDeckSlideRemap(
          db,
          req.params.id,
          req.params.cid,
          {
            deleteIds: Array.isArray(req.body?.deleteIds) ? req.body.deleteIds : [],
            updates: Array.isArray(req.body?.updates) ? req.body.updates : [],
          },
        );
        updateProject(db, req.params.id, { updatedAt: Date.now() });
        res.json({ ok: true, ...result });
      } catch (err: any) {
        res.status(400).json({ error: String(err?.message || err) });
      }
    },
  );

  app.delete(
    '/api/projects/:id/conversations/:cid/comments/:commentId',
    async (req, res) => {
      const conv = await ensureTeamverConversation(req.params.id, req.params.cid);
      if (!conv) {
        return res.status(404).json({ error: 'conversation not found' });
      }
      const ok = deletePreviewComment(
        db,
        req.params.id,
        req.params.cid,
        req.params.commentId,
      );
      if (!ok) return res.status(404).json({ error: 'comment not found' });
      updateProject(db, req.params.id, { updatedAt: Date.now() });
      res.json({ ok: true });
    },
  );

  // ---- Tabs -----------------------------------------------------------------

  app.get('/api/projects/:id/tabs', (req, res) => {
    if (!getProject(db, req.params.id)) {
      return res.status(404).json({ error: 'project not found' });
    }
    res.json(listTabs(db, req.params.id));
  });

  app.put('/api/projects/:id/tabs', (req, res) => {
    if (!getProject(db, req.params.id)) {
      return res.status(404).json({ error: 'project not found' });
    }
    const { tabs = [], active = null, browserTabs = [] } = req.body || {};
    if (!Array.isArray(tabs) || !tabs.every((t) => typeof t === 'string')) {
      return res.status(400).json({ error: 'tabs must be string[]' });
    }
    if (!Array.isArray(browserTabs)) {
      return res.status(400).json({ error: 'browserTabs must be an array' });
    }
    const result = setTabs(
      db,
      req.params.id,
      {
        tabs,
        active: typeof active === 'string' ? active : null,
        browserTabs,
      },
    );
    res.json(result);
  });

  // ---- Templates ----------------------------------------------------------
  // User-saved snapshots of a project's HTML files. Surfaced in the
  // "From template" tab of the new-project panel so a user can spin up
  // a fresh project pre-seeded with another project's design as a
  // starting point. Created via the project's Share menu (snapshots
  // every .html file in the project folder at the moment of save).

  app.get('/api/templates', (_req, res) => {
    res.json({ templates: listTemplates(db) });
  });

  app.get('/api/templates/:id', (req, res) => {
    const t = getTemplate(db, req.params.id);
    if (!t) return res.status(404).json({ error: 'not found' });
    res.json({ template: t });
  });

  app.post('/api/templates', async (req, res) => {
    try {
      const { name, description, sourceProjectId } = req.body || {};
      if (typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'name required' });
      }
      if (name.length > 100) {
        return res.status(400).json({ error: 'name must be 100 characters or fewer' });
      }
      if (typeof sourceProjectId !== 'string') {
        return res.status(400).json({ error: 'sourceProjectId required' });
      }
      const sourceProject = getProject(db, sourceProjectId);
      if (!sourceProject) {
        return res.status(404).json({ error: 'source project not found' });
      }
      // Snapshot every HTML / sketch / text file in the source project.
      // We deliberately skip binary uploads — templates are about the
      // generated design, not the user's reference imagery.
      const files = await listFiles(PROJECTS_DIR, sourceProjectId, {
        metadata: sourceProject.metadata,
      });
      const snapshot = [];
      for (const f of files) {
        if (f.kind !== 'html' && f.kind !== 'text' && f.kind !== 'code')
          continue;
        const entry = await readProjectFile(
          PROJECTS_DIR,
          sourceProjectId,
          f.name,
          sourceProject.metadata,
        );
        if (entry && Buffer.isBuffer(entry.buffer)) {
          snapshot.push({
            name: f.name,
            content: entry.buffer.toString('utf8'),
          });
        }
      }
      const trimmedName = name.trim();
      const descValue = typeof description === 'string' ? description : null;
      const existing = findTemplateByNameAndProject(db, trimmedName, sourceProjectId);
      let t;
      if (existing) {
        t = updateTemplate(db, existing.id, {
          description: descValue,
          files: snapshot,
        });
      } else {
        t = insertTemplate(db, {
          id: randomId(),
          name: trimmedName,
          description: descValue,
          sourceProjectId,
          files: snapshot,
          createdAt: Date.now(),
        });
      }
      res.json({ template: t });
    } catch (err: any) {
      res.status(400).json({ error: String(err) });
    }
  });

  app.delete('/api/templates/:id', (req, res) => {
    deleteTemplate(db, req.params.id);
    res.json({ ok: true });
  });

}

export interface RegisterProjectArtifactRoutesDeps extends RouteDeps<'http' | 'uploads' | 'paths' | 'node' | 'artifacts'> {}

export function registerProjectArtifactRoutes(app: Express, ctx: RegisterProjectArtifactRoutesDeps) {
  const { upload } = ctx.uploads;
  const { ARTIFACTS_DIR } = ctx.paths;
  const { path, fs } = ctx.node;
  const { sanitizeSlug, lintArtifact, renderFindingsForAgent } = ctx.artifacts;
  app.post('/api/upload', upload.array('images', 8), (req, res) => {
    const files = ((req.files || []) as any[]).map((f: any) => ({
      name: f.originalname,
      path: f.path,
      size: f.size,
    }));
    res.json({ files });
  });

  // Persist a generated artifact (HTML) to disk so the user can re-open it
  // in their browser or hand it off. Returns the on-disk path + a served URL.
  // The body is also passed through the anti-slop linter; findings are
  // returned alongside the path so the UI can render a P0/P1 badge and the
  // chat layer can splice them into a system reminder for the agent.
  app.post('/api/artifacts/save', (req, res) => {
    try {
      const { identifier, title, html } = req.body || {};
      if (typeof html !== 'string' || html.length === 0) {
        return res.status(400).json({ error: 'html required' });
      }
      const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
      const slug = sanitizeSlug(identifier || title || 'artifact');
      const dir = path.join(ARTIFACTS_DIR, `${stamp}-${slug}`);
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, 'index.html');
      fs.writeFileSync(file, html, 'utf8');
      const findings = lintArtifact(html);
      res.json({
        path: file,
        url: `/artifacts/${path.basename(dir)}/index.html`,
        lint: findings,
      });
    } catch (err: any) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Standalone lint endpoint — POST raw HTML, get findings back.
  // The chat layer uses this to lint streamed-in artifacts without writing
  // them to disk first, so a P0 issue can be surfaced before save.
  app.post('/api/artifacts/lint', (req, res) => {
    try {
      const { html } = req.body || {};
      if (typeof html !== 'string' || html.length === 0) {
        return res.status(400).json({ error: 'html required' });
      }
      const findings = lintArtifact(html);
      res.json({
        findings,
        agentMessage: renderFindingsForAgent(findings),
      });
    } catch (err: any) {
      res.status(500).json({ error: String(err) });
    }
  });

}

export interface RegisterProjectFileRoutesDeps extends RouteDeps<'db' | 'http' | 'paths' | 'uploads' | 'node' | 'projectStore' | 'projectFiles' | 'documents' | 'artifacts' | 'projectPreviewScopes' | 'conversations' | 'ids'> {
  projectStorageHooks?: ProjectStorageAccessHooks | null;
  /** Optional lazy bundled-plugin rehydrate for template clone (HA / fresh volume). */
  ensureBundledPluginForClone?: (pluginId: string) => Promise<{ id: string } | null>;
}

export function registerProjectFileRoutes(app: Express, ctx: RegisterProjectFileRoutesDeps) {
  const { db } = ctx;
  const { sendApiError, sendMulterError } = ctx.http;
  const { PROJECTS_DIR } = ctx.paths;
  const { upload } = ctx.uploads;
  const { fs } = ctx.node;
  const { getProject, getProjectAsync, updateProject } = ctx.projectStore;
  const { listFiles, listProjectFolders, createProjectFolder, deleteProjectFolder, searchProjectFiles, readProjectFile, resolveProjectDir, resolveProjectFilePath, parseByteRange, renameProjectFile, deleteProjectFile, writeProjectFile, sanitizeName, ensureProject } = ctx.projectFiles;
  const { buildDocumentPreview } = ctx.documents;
  const { validateArtifactManifestInput } = ctx.artifacts;
  const { projectPreviewScopes } = ctx;
  // Template-clone chat seed lives in file routes (not registerProjectRoutes).
  const {
    listConversations,
    listConversationsAsync,
    listMessages,
    listMessagesAsync,
    insertConversation,
    insertConversationAsync,
    updateConversation,
    upsertMessage,
  } = ctx.conversations;
  const { randomId } = ctx.ids;
  const fileRevisionService = createFileRevisionService({
    db,
    projectsRoot: PROJECTS_DIR,
    writeProjectFile,
    readProjectFile,
    resolveProjectDir,
  });
  /** Cold node / projectId-hash peer: cache miss must read shared Postgres. */
  async function resolveProjectRow(projectId: string) {
    return getProjectAsync
      ? await getProjectAsync(db, projectId)
      : getProject(db, projectId);
  }
  async function ensureRevisionTargetFileMaterialized(
    req: Request,
    projectId: string,
    fileName: string,
  ): Promise<void> {
    if (!ctx.projectStorageHooks) return;
    await ctx.projectStorageHooks.ensureFileAvailable(req, projectId, fileName);
  }
  const projectPreviewIframeSandbox = 'allow-scripts allow-forms';
  const projectPreviewCsp = [
    `sandbox ${projectPreviewIframeSandbox}`,
    "default-src 'self' data: blob:",
    "img-src 'self' data: blob:",
    "media-src 'self' data: blob:",
    `font-src 'self' data: ${artifactFontStylesheetHttpsOrigins().join(' ')}`,
    `style-src 'self' 'unsafe-inline' ${artifactFontStylesheetHttpsOrigins().join(' ')}`,
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "connect-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    "object-src 'none'",
  ].join('; ');
  const previewScopeRe = /^[A-Za-z0-9_-]{8,128}$/u;

  function setProjectPreviewHeaders(res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', projectPreviewCsp);
  }

  function projectFileEtag(meta: { mtime: number; size: number }): string {
    return `"od-${Math.round(meta.mtime)}-${meta.size}"`;
  }

  function applyProjectRawCacheHeaders(res: Response, mime: string): void {
    if (/^text\/html/i.test(mime)) {
      res.setHeader('Cache-Control', 'private, no-cache');
      return;
    }
    if (/^image\//i.test(mime) || /^video\//i.test(mime) || /^audio\//i.test(mime)) {
      res.setHeader('Cache-Control', 'private, max-age=300');
    }
  }

  function respondNotModifiedIfMatched(
    req: any,
    res: Response,
    meta: { mtime: number; size: number; mime: string },
  ): boolean {
    const etag = projectFileEtag(meta);
    res.setHeader('ETag', etag);
    applyProjectRawCacheHeaders(res, meta.mime);
    const ifNoneMatch = req.headers['if-none-match'];
    if (typeof ifNoneMatch === 'string' && ifNoneMatch === etag) {
      res.status(304).end();
      return true;
    }
    return false;
  }

  async function resolveProjectFilePathWithPointGet(
    req: any,
    projectId: string,
    relPath: string,
    metadata?: unknown,
  ) {
    try {
      return await resolveProjectFilePath(
        PROJECTS_DIR,
        projectId,
        relPath,
        metadata,
      );
    } catch (err: any) {
      // Sibling-node uploads / Drive import can land in S3 while this node's
      // lazy sync-down TTL still skips a full refresh. Deck iframes load via
      // /preview/:scope/* (not chat thumbs), so without a point-get heal the
      // relative <img src="refs/drive/..."> stays 404 forever. Deleted /
      // never-uploaded paths still return false and rethrow ENOENT.
      if (err && err.code === 'ENOENT' && ctx.projectStorageHooks) {
        const filled = await ctx.projectStorageHooks.ensureFileAvailable(
          req,
          projectId,
          relPath,
        );
        if (filled) {
          return await resolveProjectFilePath(
            PROJECTS_DIR,
            projectId,
            relPath,
            metadata,
          );
        }
      }
      throw err;
    }
  }

  async function sendProjectFile(
    req: any,
    res: Response,
    projectId: string,
    relPath: string,
    metadata?: unknown,
    beforeSend?: (mime: string) => void,
    transformFile?: (file: { mime: string; buffer: Buffer }) => Buffer | string | Promise<Buffer | string>,
  ) {
    const meta = await resolveProjectFilePathWithPointGet(
      req,
      projectId,
      relPath,
      metadata,
    );
    beforeSend?.(meta.mime);
    if (respondNotModifiedIfMatched(req, res, meta)) return;

    if (meta.mime.startsWith('video/') || meta.mime.startsWith('audio/')) {
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Type', meta.mime);

      if (meta.size === 0) {
        res.setHeader('Content-Length', '0');
        return res.status(200).end();
      }

      const range = parseByteRange(req.headers.range, meta.size);

      if (range === 'unsatisfiable') {
        res.setHeader('Content-Range', `bytes */${meta.size}`);
        return res.status(416).end();
      }

      let start;
      let end;
      let statusCode;
      if (range) {
        ({ start, end } = range);
        statusCode = 206;
        res.setHeader('Content-Range', `bytes ${start}-${end}/${meta.size}`);
        res.setHeader('Content-Length', String(end - start + 1));
      } else {
        start = 0;
        end = meta.size - 1;
        statusCode = 200;
        res.setHeader('Content-Length', String(meta.size));
      }

      res.status(statusCode);
      const stream = fs.createReadStream(meta.filePath, { start, end });
      stream.on('error', (streamErr: any) => {
        if (!res.headersSent) {
          sendApiError(res, 500, 'STREAM_ERROR', String(streamErr));
        } else {
          res.destroy(streamErr);
        }
      });
      stream.pipe(res);
      return;
    }

    const file = await readProjectFile(PROJECTS_DIR, projectId, relPath, metadata);
    res.type(file.mime).send(transformFile ? await transformFile(file) : file.buffer);
  }

  function isWorkspaceSentinelPreviewFile(filePath: string): boolean {
    const cleaned = filePath.trim();
    if (!cleaned) return false;
    // Match FE sanitizePreviewEntryFile — Design Files / Design System /
    // Questions tab ids are not project files.
    return (
      cleaned === '__design_files__'
      || cleaned === '__design_system__'
      || cleaned === '__questions__'
      || /^__[^/]+__$/u.test(cleaned)
    );
  }

  function previewFilePathForProject(project: any, queryFile: unknown): string {
    if (typeof queryFile === 'string' && queryFile.trim().length > 0) {
      // FE cover URLs append `?v=mtime`; never treat that as part of the path.
      const cleaned = queryFile.trim().split(/[?#]/u, 1)[0]?.trim() ?? '';
      if (cleaned.length > 0 && !isWorkspaceSentinelPreviewFile(cleaned)) {
        return cleaned;
      }
    }
    const entryFile = project?.metadata?.entryFile;
    return typeof entryFile === 'string' && entryFile.length > 0 ? entryFile : 'index.html';
  }

  function encodeProjectPathForUrl(filePath: string): string {
    return filePath.split('/').map((segment) => encodeURIComponent(segment)).join('/');
  }

  function maybeRepairServedHtml(file: { mime: string; buffer: Buffer }, html: string): string {
    if (!/^text\/html(?:;|$)/i.test(file.mime)) return html;
    // /raw HTML must not reintroduce device-width clipping after head repair —
    // lock stacked 1920×1080 canvas + design viewport for Motif/title parity.
    return lockStackedDeckCanvasForPreview(repairArtifactDocumentHead(html));
  }

  /**
   * Opt-in flag on `/raw/*.html` that asks the daemon to rewrite subresource
   * `<img src>` / CSS `url(...)` refs into inline `data:` URIs before responding.
   * Turned on by the FE preview `source` fetch only — all other consumers must
   * see the original bytes (see `maybeInlineImagesForServedHtml` comment).
   */
  function wantsInlineAssets(value: unknown): boolean {
    if (value == null) return false;
    if (Array.isArray(value)) return value.some(wantsInlineAssets);
    const str = String(value).trim().toLowerCase();
    return str === '1' || str === 'true' || str === 'yes' || str === 'on';
  }

  /**
   * Rewrite `<img src>` / CSS `url(...)` refs in served HTML into `data:` URIs
   * by reading the referenced files directly from local scratch. This makes the
   * FE live-preview / `/raw/*.html` route immune to subresource fetch failures
   * inside the srcdoc iframe (Hangul NFC/NFD mismatches, transient /raw 404s,
   * missing `X-Teamver-*` headers on secondary requests, etc.). Only applied
   * to `text/html`; other MIME types pass through unchanged.
   *
   * Failures are swallowed — the original HTML is returned so the browser can
   * still attempt a live subresource fetch as a last resort.
   */
  async function maybeInlineImagesForServedHtml(
    file: { mime: string; buffer: Buffer },
    html: string,
    projectId: string,
    metadata?: unknown,
  ): Promise<string> {
    if (!/^text\/html(?:;|$)/i.test(file.mime)) return html;
    try {
      return await inlineProjectImagesFromScratch({
        html,
        projectId,
        projectsRoot: PROJECTS_DIR,
        metadata,
      });
    } catch {
      return html;
    }
  }

  async function maybeResolveVitePreviewHtml({
    file,
    projectId,
    relPath,
    metadata,
    projectsRoot,
    readProjectFile,
  }: {
    file: { mime: string; buffer: Buffer };
    projectId: string;
    relPath: string;
    metadata?: unknown;
    projectsRoot: string;
    readProjectFile: (projectsRoot: string, projectId: string, relPath: string, metadata?: unknown) => Promise<{ buffer: Buffer }>;
  }): Promise<Buffer | string> {
    if (!/^text\/html(?:;|$)/i.test(file.mime)) return file.buffer;
    const html = file.buffer.toString('utf8');
    if (!isViteDevHtmlEntry(html)) return file.buffer;

    const ownerDir = path.posix.dirname(relPath);
    const distRelPath = ownerDir === '.' ? 'dist/index.html' : `${ownerDir}/dist/index.html`;
    try {
      const distFile = await readProjectFile(projectsRoot, projectId, distRelPath, metadata);
      return rewriteViteDistAssetUrlsForPreview(distFile.buffer.toString('utf8'));
    } catch {
      return file.buffer;
    }
  }

  function isViteDevHtmlEntry(html: string): boolean {
    return /<script\b[^>]*\btype\s*=\s*["']module["'][^>]*\bsrc\s*=\s*["']\/src\/[^"']+["'][^>]*>\s*<\/script>/i.test(html);
  }

  function rewriteViteDistAssetUrlsForPreview(html: string): string {
    return html.replace(
      /\b(href|src)\s*=\s*(["'])\/assets\//gi,
      (_match, attr: string, quote: string) => `${attr}=${quote}dist/assets/`,
    );
  }

  // Project files. Each project owns a flat folder under .od/projects/<id>/
  // containing every file the user has uploaded, pasted, sketched, or that
  // the agent has generated. Names are sanitized; paths are confined to the
  // project's own folder (see apps/daemon/src/projects.ts).
  app.get('/api/projects/:id/files', async (req, res) => {
    try {
      const since = Number(req.query?.since);
      const project = getProject(db, req.params.id);
      const files = await listFiles(PROJECTS_DIR, req.params.id, {
        since: Number.isFinite(since) ? since : undefined,
        metadata: project?.metadata,
      });
      /** @type {import('@open-design/contracts').ProjectFilesResponse} */
      const body = { files };
      res.json(body);
    } catch (err: any) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  app.get('/api/projects/:id/search', async (req, res) => {
    try {
      const query = String(req.query.q ?? '');
      if (!query) {
        sendApiError(res, 400, 'BAD_REQUEST', 'q query parameter is required');
        return;
      }
      const pattern = req.query.pattern ? String(req.query.pattern) : null;
      const max = Math.min(Number(req.query.max) || 200, 1000);
      const searchProject = getProject(db, req.params.id);
      const matches = await searchProjectFiles(PROJECTS_DIR, req.params.id, query, {
        pattern,
        max,
        metadata: searchProject?.metadata,
      });
      res.json({ query, matches });
    } catch (err: any) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  app.get('/api/projects/:id/folders', async (req, res) => {
    try {
      const project = await resolveProjectRow(req.params.id);
      if (!project) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
      }
      const folders = await listProjectFolders(PROJECTS_DIR, req.params.id, {
        metadata: project.metadata,
      });
      /** @type {import('@open-design/contracts').ProjectFoldersResponse} */
      const body = { folders };
      res.json(body);
    } catch (err: any) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  app.post('/api/projects/:id/folders', async (req, res) => {
    try {
      const { name } = req.body || {};
      if (typeof name !== 'string' || !name.trim()) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'name required');
      }
      const project = await resolveProjectRow(req.params.id);
      if (!project) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
      }
      const folder = await createProjectFolder(
        PROJECTS_DIR,
        req.params.id,
        name,
        project.metadata,
      );
      /** @type {import('@open-design/contracts').ProjectFolderResponse} */
      const body = { folder };
      res.json(body);
    } catch (err: any) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err?.message || err));
    }
  });

  app.delete('/api/projects/:id/folders', async (req, res) => {
    try {
      const { path: folderPath } = req.body || {};
      if (typeof folderPath !== 'string' || !folderPath.trim()) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'path required');
      }
      const project = await resolveProjectRow(req.params.id);
      if (!project) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
      }
      await deleteProjectFolder(
        PROJECTS_DIR,
        req.params.id,
        folderPath,
        project.metadata,
      );
      /** @type {import('@open-design/contracts').DeleteProjectFolderResponse} */
      const body = { ok: true };
      res.json(body);
    } catch (err: any) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err?.message || err));
    }
  });

  app.get('/api/projects/:id/design-system-package-audit', async (req, res) => {
    try {
      const project = await resolveProjectRow(req.params.id);
      if (!project) {
        sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
        return;
      }
      const projectRoot = resolveProjectDir(PROJECTS_DIR, project.id, project.metadata);
      const audit = await auditDesignSystemPackage(projectRoot);
      res.setHeader('Cache-Control', 'no-store');
      res.json({ audit });
    } catch (err: any) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  app.get('/api/projects/:id/preview-url', async (req, res) => {
    try {
      const project = getProjectAsync
        ? await getProjectAsync(db, req.params.id)
        : getProject(db, req.params.id);
      if (!project) {
        sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
        return;
      }
      const requestedPath = previewFilePathForProject(project, req.query.file);
      const meta = await resolveProjectFilePath(
        PROJECTS_DIR,
        project.id,
        requestedPath,
        project.metadata,
      );
      const scope = projectPreviewScopes.mint(project.id);
      /** @type {import('@open-design/contracts').ProjectPreviewUrlResponse} */
      const body = {
        url: `/api/projects/${encodeURIComponent(project.id)}/preview/${scope}/${encodeProjectPathForUrl(meta.name)}`,
        file: meta.name,
        csp: projectPreviewCsp,
        iframeSandbox: projectPreviewIframeSandbox,
        opaqueOrigin: true,
      };
      res.setHeader('Cache-Control', 'no-store');
      res.json(body);
    } catch (err: any) {
      const status = err && err.code === 'ENOENT' ? 404 : 400;
      sendApiError(
        res,
        status,
        status === 404 ? 'FILE_NOT_FOUND' : 'BAD_REQUEST',
        String(err),
      );
    }
  });

  async function teamverBatchProjectAccessOk(
    req: Request,
    projectId: string,
  ): Promise<boolean> {
    if (!isTeamverDesignManaged()) return true;
    const identity = readTeamverIdentityFromRequest(req);
    if (!identity) return false;
    const access = await verifyTeamverProjectAccess(projectId, identity);
    return access.ok;
  }

  /**
   * Home / list HTML covers: mint many project preview scopes in one POST
   * so visible cards do not each GET /preview-url.
   */
  app.post('/api/projects/preview-url-batch', async (req, res) => {
    try {
      const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];
      const seen = new Set<string>();
      /** @type {{ projectId: string; file?: string }[]} */
      const items = [];
      for (const raw of rawItems) {
        if (!raw || typeof raw !== 'object') continue;
        const projectId =
          typeof (raw as { projectId?: unknown }).projectId === 'string'
            ? (raw as { projectId: string }).projectId.trim()
            : '';
        if (!isSafeId(projectId) || seen.has(projectId)) continue;
        seen.add(projectId);
        const fileRaw = (raw as { file?: unknown }).file;
        const file =
          typeof fileRaw === 'string' && fileRaw.trim().length > 0
            ? fileRaw.trim().split(/[?#]/u, 1)[0]?.trim()
            : undefined;
        items.push(file ? { projectId, file } : { projectId });
        if (items.length >= PROJECT_PREVIEW_URL_BATCH_MAX) break;
      }

      /** @type {import('@open-design/contracts').ProjectPreviewUrlBatchResult[]} */
      const results = [];
      for (const item of items) {
        try {
          if (!(await teamverBatchProjectAccessOk(req, item.projectId))) {
            results.push({ projectId: item.projectId, ok: false });
            continue;
          }
          if (ctx.projectStorageHooks?.ensureMaterialized) {
            await ctx.projectStorageHooks.ensureMaterialized(req, item.projectId);
          }
          const project = getProjectAsync
            ? await getProjectAsync(db, item.projectId)
            : getProject(db, item.projectId);
          if (!project) {
            results.push({ projectId: item.projectId, ok: false });
            continue;
          }
          const requestedPath = previewFilePathForProject(project, item.file);
          const meta = await resolveProjectFilePath(
            PROJECTS_DIR,
            project.id,
            requestedPath,
            project.metadata,
          );
          const scope = projectPreviewScopes.mint(project.id);
          results.push({
            projectId: project.id,
            ok: true,
            url: `/api/projects/${encodeURIComponent(project.id)}/preview/${scope}/${encodeProjectPathForUrl(meta.name)}`,
            file: meta.name,
          });
        } catch {
          results.push({ projectId: item.projectId, ok: false });
        }
      }

      /** @type {import('@open-design/contracts').ProjectPreviewUrlBatchResponse} */
      const body = { results };
      res.setHeader('Cache-Control', 'no-store');
      res.json(body);
    } catch (err: any) {
      sendApiError(res, 500, 'INTERNAL_ERROR', String(err));
    }
  });

  /**
   * Home / list HTML covers: return first-slide HTML for many projects in one
   * POST so visible cards do not each GET /raw/deck.html.
   */
  app.post('/api/projects/cover-html-batch', async (req, res) => {
    try {
      const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];
      const seen = new Set<string>();
      /** @type {{ projectId: string; file?: string }[]} */
      const items = [];
      for (const raw of rawItems) {
        if (!raw || typeof raw !== 'object') continue;
        const projectId =
          typeof (raw as { projectId?: unknown }).projectId === 'string'
            ? (raw as { projectId: string }).projectId.trim()
            : '';
        if (!isSafeId(projectId) || seen.has(projectId)) continue;
        seen.add(projectId);
        const fileRaw = (raw as { file?: unknown }).file;
        const file =
          typeof fileRaw === 'string' && fileRaw.trim().length > 0
            ? fileRaw.trim().split(/[?#]/u, 1)[0]?.trim()
            : undefined;
        items.push(file ? { projectId, file } : { projectId });
        if (items.length >= PROJECT_COVER_HTML_BATCH_MAX) break;
      }

      /** @type {import('@open-design/contracts').ProjectCoverHtmlBatchResult[]} */
      const results = [];
      for (const item of items) {
        try {
          if (!(await teamverBatchProjectAccessOk(req, item.projectId))) {
            results.push({ projectId: item.projectId, ok: false });
            continue;
          }
          if (ctx.projectStorageHooks?.ensureMaterialized) {
            await ctx.projectStorageHooks.ensureMaterialized(req, item.projectId);
          }
          const project = getProjectAsync
            ? await getProjectAsync(db, item.projectId)
            : getProject(db, item.projectId);
          if (!project) {
            results.push({ projectId: item.projectId, ok: false });
            continue;
          }
          const requestedPath = previewFilePathForProject(project, item.file);
          // Size/mime before full buffer read (N08).
          const meta = await resolveProjectFilePath(
            PROJECTS_DIR,
            project.id,
            requestedPath,
            project.metadata,
          );
          if (!/^text\/html(?:;|$)/i.test(String(meta.mime ?? ''))) {
            results.push({ projectId: item.projectId, ok: false });
            continue;
          }
          if (
            typeof meta.size === 'number'
            && meta.size > PROJECT_COVER_HTML_BATCH_MAX_BYTES
          ) {
            results.push({ projectId: item.projectId, ok: false });
            continue;
          }
          const file = await readProjectFile(
            PROJECTS_DIR,
            project.id,
            meta.name,
            project.metadata,
          );
          const rawHtml = file.buffer.toString('utf8');
          const isolatedHtml = prepareCoverHtmlBatchBody(rawHtml);
          // Inline first-slide images so batch-fed cards render without a
          // subresource GET storm. Falls back to per-card `/raw?inlineAssets=1`
          // when the inlined body exceeds the batch cap (per-card path also
          // inlines via the same daemon transform, so the visual result is
          // identical — just one more round trip per oversized cover).
          const html = await (async () => {
            try {
              return await inlineProjectImagesFromScratch({
                html: isolatedHtml,
                projectId: project.id,
                projectsRoot: PROJECTS_DIR,
                metadata: project.metadata,
              });
            } catch {
              return isolatedHtml;
            }
          })();
          if (
            !html.trim()
            || Buffer.byteLength(html, 'utf8') > PROJECT_COVER_HTML_BATCH_MAX_BYTES
          ) {
            results.push({ projectId: item.projectId, ok: false });
            continue;
          }
          results.push({
            projectId: project.id,
            ok: true,
            html,
            file: typeof file.name === 'string' && file.name ? file.name : meta.name,
          });
        } catch {
          results.push({ projectId: item.projectId, ok: false });
        }
      }

      /** @type {import('@open-design/contracts').ProjectCoverHtmlBatchResponse} */
      const body = { results };
      res.setHeader('Cache-Control', 'no-store');
      res.json(body);
    } catch (err: any) {
      sendApiError(res, 500, 'INTERNAL_ERROR', String(err));
    }
  });

  /**
   * Session-gated S3 GET mint for a project file (chat thumbs / image open).
   * Does not sync-down to scratch — HEAD + SigV4 query auth only.
   * Materialization middleware does not match `/presign-get`.
   */
  app.post('/api/projects/:id/presign-get', async (req, res) => {
    try {
      const projectId = String(req.params.id ?? '').trim();
      if (!projectId) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'project id required');
      }
      const project = getProjectAsync
        ? await getProjectAsync(db, projectId)
        : getProject(db, projectId);
      if (!project) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
      }
      const relpath = normalizeProjectFilePresignRelpath(
        typeof req.body?.path === 'string' ? req.body.path : '',
      );
      if (!relpath) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'path required');
      }
      const minted = await mintProjectFilePresignedGetFromRequest(req, projectId, relpath);
      res.setHeader('Cache-Control', 'no-store');
      if (minted.status === 'not_found') {
        return sendApiError(res, 404, 'FILE_NOT_FOUND', `file not found: ${relpath}`);
      }
      if (minted.status === 'failed') {
        const status = minted.reason.includes('identity') ? 401 : 502;
        return sendApiError(
          res,
          status,
          status === 401 ? 'UNAUTHORIZED' : 'UPSTREAM_UNAVAILABLE',
          minted.reason,
        );
      }
      if (minted.status === 'disabled') {
        /** @type {import('@open-design/contracts').ProjectFilePresignedGetResponse} */
        const body = {
          status: 'disabled' as const,
          path: minted.path,
          rawUrl: minted.rawUrl,
          reason: minted.reason,
        };
        return res.json(body);
      }
      /** @type {import('@open-design/contracts').ProjectFilePresignedGetResponse} */
      const body = {
        status: 'ready' as const,
        path: minted.path,
        url: minted.url,
        expiresInSec: minted.expiresInSec,
        expiresAt: minted.expiresAt,
        rawUrl: minted.rawUrl,
      };
      return res.json(body);
    } catch (err: any) {
      sendApiError(res, 500, 'INTERNAL', err?.message || String(err));
    }
  });

  app.get(/^\/api\/projects\/([^/]+)\/preview\/([^/]+)\/(.+)$/u, async (req, res) => {
    try {
      const params = req.params as unknown as { 0?: string; 1?: string; 2?: string };
      const projectId = String(params[0] ?? '');
      const scope = String(params[1] ?? '');
      const relPath = String(params[2] ?? '');
      if (!previewScopeRe.test(scope)) {
        sendApiError(res, 400, 'BAD_REQUEST', 'invalid preview scope');
        return;
      }
      const project = getProjectAsync
        ? await getProjectAsync(db, projectId)
        : getProject(db, projectId);
      if (!project) {
        sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
        return;
      }
      if (!projectPreviewScopes.validate(project.id, scope)) {
        sendApiError(res, 404, 'PREVIEW_SCOPE_NOT_FOUND', 'preview scope not found');
        return;
      }
      if (req.headers.origin === 'null') {
        res.header('Access-Control-Allow-Origin', '*');
      }
      await sendProjectFile(
        req,
        res,
        project.id,
        relPath,
        project.metadata,
        () => setProjectPreviewHeaders(res),
        async (file) => {
          let transformed = await maybeResolveVitePreviewHtml({
            file,
            projectId: project.id,
            relPath,
            metadata: project.metadata,
            projectsRoot: PROJECTS_DIR,
            readProjectFile,
          });
          // Mirror /raw bridge injection so Teamver embed scoped URL-load
          // previews keep scroll/selection/snapshot bridges.
          if (
            (wantsUrlPreviewScrollBridge(req.query.odPreviewBridge) ||
              wantsUrlPreviewSelectionBridge(req.query.odPreviewBridge) ||
              wantsUrlPreviewSnapshotBridge(req.query.odPreviewBridge)) &&
            /^text\/html(?:;|$)/i.test(file.mime)
          ) {
            let html = Buffer.isBuffer(transformed) ? transformed.toString('utf8') : transformed;
            if (wantsUrlPreviewScrollBridge(req.query.odPreviewBridge)) {
              html = injectUrlPreviewBridge(html, 'scroll');
            }
            if (wantsUrlPreviewSelectionBridge(req.query.odPreviewBridge)) {
              html = injectUrlPreviewBridge(html, 'selection');
            }
            if (wantsUrlPreviewSnapshotBridge(req.query.odPreviewBridge)) {
              html = injectUrlPreviewBridge(html, 'snapshot');
            }
            transformed = html;
          }
          const servedHtml = Buffer.isBuffer(transformed) ? transformed.toString('utf8') : transformed;
          const repaired = maybeRepairServedHtml(file, servedHtml);
          return maybeInlineImagesForServedHtml(file, repaired, project.id, project.metadata);
        },
      );
    } catch (err: any) {
      const status = err && err.code === 'ENOENT' ? 404 : 400;
      sendApiError(
        res,
        status,
        status === 404 ? 'FILE_NOT_FOUND' : 'BAD_REQUEST',
        String(err),
      );
    }
  });


  // Preflight for the raw file route. Current artifact fetches are simple GETs
  // (no preflight needed), but an explicit handler future-proofs the route if
  // artifacts ever add custom request headers.
  app.options(/^\/api\/projects\/([^/]+)\/raw\/(.+)$/u, (req, res) => {
    if (req.headers.origin === 'null') {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
    }
    res.sendStatus(204);
  });

  app.get(/^\/api\/projects\/([^/]+)\/raw\/(.+)$/u, async (req, res) => {
    try {
      const params = req.params as unknown as { 0?: string; 1?: string };
      const projectId = String(params[0] ?? '');
      const relPath = String(params[1] ?? '');
      const project = getProjectAsync
        ? await getProjectAsync(db, projectId)
        : getProject(db, projectId);
      // PreviewModal loads artifact HTML via srcdoc, giving the iframe Origin: "null".
      // data: URIs, file://, and some sandboxed iframes also send null — all are
      // local-only callers, so this is safe. Real cross-origin sites send a real
      // origin and remain blocked by the browser's same-origin policy.
      if (req.headers.origin === 'null') {
        res.header('Access-Control-Allow-Origin', '*');
      }

      await sendProjectFile(
        req,
        res,
        projectId,
        relPath,
        project?.metadata,
        undefined,
        async (file) => {
          let transformed = await maybeResolveVitePreviewHtml({
            file,
            projectId,
            relPath,
            metadata: project?.metadata,
            projectsRoot: PROJECTS_DIR,
            readProjectFile,
          });
          if (
            (wantsUrlPreviewScrollBridge(req.query.odPreviewBridge) ||
              wantsUrlPreviewSelectionBridge(req.query.odPreviewBridge) ||
              wantsUrlPreviewSnapshotBridge(req.query.odPreviewBridge)) &&
            /^text\/html(?:;|$)/i.test(file.mime)
          ) {
            let html = Buffer.isBuffer(transformed) ? transformed.toString('utf8') : transformed;
            if (wantsUrlPreviewScrollBridge(req.query.odPreviewBridge)) {
              html = injectUrlPreviewBridge(html, 'scroll');
            }
            if (wantsUrlPreviewSelectionBridge(req.query.odPreviewBridge)) {
              html = injectUrlPreviewBridge(html, 'selection');
            }
            if (wantsUrlPreviewSnapshotBridge(req.query.odPreviewBridge)) {
              html = injectUrlPreviewBridge(html, 'snapshot');
            }
            transformed = html;
          }
          const servedHtml = Buffer.isBuffer(transformed) ? transformed.toString('utf8') : transformed;
          const repaired = maybeRepairServedHtml(file, servedHtml);
          // Only inline images when caller explicitly opts in (`?inlineAssets=1`).
          // Other /raw consumers — model context, retry / auto-continue payloads,
          // manual raw editor, plain-file downloads — must receive the original
          // bytes; data-URI bloat there would blow token budgets, poison saves,
          // and break element-patch structural diffs.
          if (!wantsInlineAssets(req.query.inlineAssets)) return repaired;
          return maybeInlineImagesForServedHtml(file, repaired, projectId, project?.metadata);
        },
      );
    } catch (err: any) {
      const status = err && err.code === 'ENOENT' ? 404 : 400;
      sendApiError(
        res,
        status,
        status === 404 ? 'FILE_NOT_FOUND' : 'BAD_REQUEST',
        String(err),
      );
    }
  });

  app.delete(/^\/api\/projects\/([^/]+)\/raw\/(.+)$/u, async (req, res) => {
    try {
      const params = req.params as unknown as { 0?: string; 1?: string };
      const projectId = String(params[0] ?? '');
      const rawSplat = String(params[1] ?? '');
      const project = getProject(db, projectId);
      await deleteProjectFile(PROJECTS_DIR, projectId, rawSplat, project?.metadata);
      /** @type {import('@open-design/contracts').DeleteProjectFileResponse} */
      const body = { ok: true };
      res.json(body);
    } catch (err: any) {
      const status = err && err.code === 'ENOENT' ? 404 : 400;
      sendApiError(
        res,
        status,
        status === 404 ? 'FILE_NOT_FOUND' : 'BAD_REQUEST',
        String(err),
      );
    }
  });

  app.get('/api/projects/:id/files/:name/preview', async (req, res) => {
    try {
      const project = getProject(db, req.params.id);
      const file = await readProjectFile(
        PROJECTS_DIR,
        req.params.id,
        req.params.name,
        project?.metadata,
      );
      const preview = await buildDocumentPreview(file);
      res.json(preview);
    } catch (err: any) {
      const status =
        err && err.statusCode
          ? err.statusCode
          : err && err.code === 'ENOENT'
            ? 404
            : 400;
      sendApiError(
        res,
        status,
        status === 404 ? 'FILE_NOT_FOUND' : 'BAD_REQUEST',
        err?.message || 'preview unavailable',
      );
    }
  });

  app.get(/^\/api\/projects\/([^/]+)\/files\/(.+)\/revisions$/u, async (req, res) => {
    try {
      const params = req.params as unknown as { 0?: string; 1?: string };
      const projectId = String(params[0] ?? '');
      const fileName = String(params[1] ?? '');
      const project = await resolveProjectRow(projectId);
      if (!project) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
      }
      const body = await fileRevisionService.listRevisions(projectId, fileName);
      res.json(body);
    } catch (err: any) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  app.get(/^\/api\/projects\/([^/]+)\/files\/(.+)\/revisions\/([^/]+)$/u, async (req, res) => {
    try {
      const params = req.params as unknown as { 0?: string; 1?: string; 2?: string };
      const projectId = String(params[0] ?? '');
      const fileName = String(params[1] ?? '');
      const revisionId = String(params[2] ?? '');
      const project = await resolveProjectRow(projectId);
      if (!project) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
      }
      const result = await fileRevisionService.getRevisionContent(
        projectId,
        fileName,
        revisionId,
        project.metadata,
      );
      if (!result) {
        return sendApiError(res, 404, 'REVISION_NOT_FOUND', 'revision not found');
      }
      res.json(result);
    } catch (err: any) {
      const status = err && err.code === 'ENOENT' ? 404 : 400;
      sendApiError(
        res,
        status,
        status === 404 ? 'REVISION_NOT_FOUND' : 'BAD_REQUEST',
        String(err),
      );
    }
  });

  app.post(/^\/api\/projects\/([^/]+)\/files\/(.+)\/revisions\/([^/]+)\/restore$/u, async (req, res) => {
    try {
      const params = req.params as unknown as { 0?: string; 1?: string; 2?: string };
      const projectId = String(params[0] ?? '');
      const fileName = String(params[1] ?? '');
      const revisionId = String(params[2] ?? '');
      const project = await resolveProjectRow(projectId);
      if (!project) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
      }
      const result = await fileRevisionService.restoreRevision({
        projectId,
        fileName,
        revisionId,
        metadata: project.metadata,
      });
      if (!result) {
        return sendApiError(res, 404, 'REVISION_NOT_FOUND', 'revision not found');
      }
      res.json(result);
    } catch (err: any) {
      if (err instanceof FileRevisionLockError) {
        return sendApiError(res, 409, err.code, err.message);
      }
      const status = err && err.code === 'ENOENT' ? 404 : 400;
      sendApiError(
        res,
        status,
        status === 404 ? 'REVISION_NOT_FOUND' : 'BAD_REQUEST',
        String(err),
      );
    }
  });

  app.post(/^\/api\/projects\/([^/]+)\/files\/(.+)\/revisions$/u, async (req, res) => {
    try {
      const params = req.params as unknown as { 0?: string; 1?: string };
      const projectId = String(params[0] ?? '');
      const fileName = String(params[1] ?? '');
      const project = await resolveProjectRow(projectId);
      if (!project) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
      }
      const {
        content,
        source,
        label,
        artifactManifest,
        conversationId,
        assistantMessageId,
        truncateAfterSequence,
        skipArtifactStubGuard,
        forceArtifactStubGuardReject,
      } = req.body || {};
      if (typeof content !== 'string') {
        return sendApiError(res, 400, 'BAD_REQUEST', 'content required');
      }
      if (!isFileRevisionSource(source)) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'invalid revision source');
      }
      if (typeof label !== 'string' || !label.trim()) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'label required');
      }
      // Style/manual-edit clients often echo `file.artifactManifest`. A stale
      // or partial manifest (empty title, stripped exports) must not block the
      // content revision — drop it and leave the on-disk sidecar unchanged.
      let pushManifest = artifactManifest ?? null;
      if (pushManifest !== undefined && pushManifest !== null) {
        const validated = validateArtifactManifestInput(pushManifest, fileName);
        if (!validated.ok) {
          console.warn(
            `[file-revisions] ignoring invalid artifactManifest for ${projectId}/${fileName}: ${validated.error}`,
          );
          pushManifest = null;
        } else {
          pushManifest = validated.value;
        }
      }
      const truncate = truncateAfterSequence === undefined || truncateAfterSequence === null
        ? undefined
        : Number(truncateAfterSequence);
      await ensureRevisionTargetFileMaterialized(req, projectId, fileName);
      const result = await fileRevisionService.pushRevision({
        projectId,
        fileName,
        content,
        source,
        label: label.trim(),
        artifactManifest: pushManifest,
        ...(typeof conversationId === 'string' ? { conversationId } : {}),
        ...(typeof assistantMessageId === 'string' ? { assistantMessageId } : {}),
        ...(typeof truncate === 'number' && Number.isFinite(truncate)
          ? { truncateAfterSequence: truncate }
          : {}),
        ...(skipArtifactStubGuard === true ? { skipArtifactStubGuard: true } : {}),
        ...(forceArtifactStubGuardReject === true ? { forceArtifactStubGuardReject: true } : {}),
        metadata: project.metadata,
      });
      // Await S3 sync-up before 200 so a page refresh / sibling-node sync-down
      // does not re-materialize a pre-edit snapshot over the revision we just wrote.
      if (ctx.projectStorageHooks) {
        await ctx.projectStorageHooks.persistAfterMutation(req, projectId, { strict: true });
      }
      res.json(result);
    } catch (err: any) {
      if (err instanceof FileRevisionLockError) {
        return sendApiError(res, 409, err.code, err.message);
      }
      if (isFileRevisionSequenceConflict(err)) {
        return sendApiError(res, 409, 'CONFLICT', 'revision sequence conflict; retry push');
      }
      if (err instanceof ArtifactRegressionError) {
        return sendApiError(res, 422, 'ARTIFACT_REGRESSION', err.message);
      }
      if (err instanceof ArtifactPublicationBlockedError) {
        return sendApiError(res, 422, 'ARTIFACT_PUBLICATION_BLOCKED', err.message);
      }
      if (err instanceof FileRevisionPayloadTooLargeError) {
        return sendApiError(res, 413, 'PAYLOAD_TOO_LARGE', err.message);
      }
      if (err && err.code === 'ENOENT') {
        return sendApiError(res, 404, 'FILE_NOT_FOUND', String(err));
      }
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  app.get(/^\/api\/projects\/([^/]+)\/files\/(.+)$/u, async (req, res) => {
    try {
      const params = req.params as unknown as { 0?: string; 1?: string };
      const projectId = String(params[0] ?? '');
      const fileSplat = String(params[1] ?? '');
      const project = getProject(db, projectId);
      // Mirror /raw/: on ENOENT try S3 point-get before failing. Direct
      // file GET on a cold sibling pod otherwise 404s even when the object
      // exists on S3.
      let file;
      try {
        file = await readProjectFile(
          PROJECTS_DIR,
          projectId,
          fileSplat,
          project?.metadata,
        );
      } catch (err: any) {
        if (err && err.code === 'ENOENT' && ctx.projectStorageHooks) {
          const filled = await ctx.projectStorageHooks.ensureFileAvailable(
            req,
            projectId,
            fileSplat,
          );
          if (filled) {
            file = await readProjectFile(
              PROJECTS_DIR,
              projectId,
              fileSplat,
              project?.metadata,
            );
          } else {
            throw err;
          }
        } else {
          throw err;
        }
      }
      res.type(file.mime).send(file.buffer);
    } catch (err: any) {
      const status = err && err.code === 'ENOENT' ? 404 : 400;
      sendApiError(
        res,
        status,
        status === 404 ? 'FILE_NOT_FOUND' : 'BAD_REQUEST',
        String(err),
      );
    }
  });

  /**
   * Server-side template Clone for Canvas→Slide (BYOK has no Clone tool).
   * Reads plugin preview HTML from disk, content-swaps Source headings, writes
   * deck.html. FE must call this instead of cloning in the browser.
   */
  app.post('/api/projects/:id/template-clone-deck', async (req, res) => {
    try {
      const project = await resolveProjectRow(req.params.id);
      if (!project) {
        return sendApiError(res, 404, 'NOT_FOUND', 'project not found');
      }
      const body = req.body || {};
      const pluginId = typeof body.pluginId === 'string' ? body.pluginId.trim() : '';
      if (!pluginId) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'pluginId required');
      }
      const result = await seedTemplateClonedDeckOnServer(
        {
          db,
          projectsRoot: PROJECTS_DIR,
          projectId: req.params.id,
          metadata: project.metadata,
          ensureProject,
          writeProjectFile,
          ...(ctx.ensureBundledPluginForClone
            ? { ensureBundledPlugin: ctx.ensureBundledPluginForClone }
            : {}),
          markTemplateClonedDeckSeeded: async ({
            projectId,
            pluginId: seededPluginId,
            templateTitle,
          }) => {
            const existing = getProject(db, projectId);
            if (!existing) return;
            const prevMeta =
              existing.metadata && typeof existing.metadata === 'object'
                ? (existing.metadata as Record<string, unknown>)
                : {};
            updateProject(db, projectId, {
              // Successful Clone must not leave a composer seed that auto-sends
              // a model structure turn and overwrites deck.html with Neutral.
              pendingPrompt: null,
              metadata: {
                ...prevMeta,
                templateClonedDeckSeeded: true,
                // FE queues a compact CREATE content-fill — do not attach deck.html.
                templateCloneContentFillPending: true,
                selectedDeckTemplateId: seededPluginId,
                ...(templateTitle
                  ? { selectedDeckTemplateTitle: templateTitle }
                  : {}),
              },
            });

            // Do NOT seed a completed assistant ack here. That (1) claimed
            // content was ready when only LOOK was cloned, and (2) left
            // messages.length > 0 so ProjectView refused the AI fill auto-send.
            // Chat user/assistant messages come from the fill turn instead.
          },
        },
        {
          pluginId,
          templateTitle: typeof body.templateTitle === 'string' ? body.templateTitle : null,
          sourceBrief: typeof body.sourceBrief === 'string' ? body.sourceBrief : null,
          userInstruction: typeof body.userInstruction === 'string' ? body.userInstruction : null,
          deckTitle: typeof body.deckTitle === 'string' ? body.deckTitle : (
            typeof body.title === 'string' ? body.title : null
          ),
          slideCountHint:
            typeof body.slideCountHint === 'string' || typeof body.slideCountHint === 'number'
              ? body.slideCountHint
              : null,
        },
      );
      if (!result.ok) {
        return sendApiError(
          res,
          result.status,
          result.reason.toUpperCase(),
          result.message,
        );
      }
      // Prefer awaiting sync, but NEVER fail the clone if persist flakes —
      // a non-2xx after a successful write used to make FE treat seed as
      // failed. FE now blocks Neutral model fallthrough, but we still return
      // 200 so clients open the seeded deck.html without a false error.
      if (ctx.projectStorageHooks) {
        try {
          await ctx.projectStorageHooks.persistAfterMutation(req, req.params.id, {
            strict: true,
          });
        } catch (persistErr) {
          console.warn(
            '[template-clone-deck] persistAfterMutation failed; scheduling async sync',
            persistErr,
          );
          scheduleProjectStoragePersistAfterResponse(
            ctx.projectStorageHooks,
            req,
            res,
            req.params.id,
          );
        }
      }
      return res.json(result);
    } catch (err) {
      if (err instanceof ArtifactRegressionError) {
        return sendApiError(res, 422, 'ARTIFACT_REGRESSION', err.message);
      }
      if (err instanceof ArtifactPublicationBlockedError) {
        return sendApiError(res, 422, 'ARTIFACT_PUBLICATION_BLOCKED', err.message);
      }
      return sendApiError(
        res,
        500,
        'INTERNAL_ERROR',
        err instanceof Error ? err.message : 'template clone failed',
      );
    }
  });

  // Two ways to upload: multipart for binary files (images), and JSON
  // {name, content, encoding} for sketches and pasted text. The frontend
  // uses both depending on the file source.
  app.post(
    '/api/projects/:id/files',
    (req, res, next) => {
      upload.single('file')(req, res, (err: any) => {
        if (err) return sendMulterError(res, err);
        next();
      });
    },
    async (req, res) => {
      try {
        const uploadProject = await resolveProjectRow(req.params.id);
        await ensureProject(PROJECTS_DIR, req.params.id, uploadProject?.metadata);
        if (req.file) {
          const buf = await fs.promises.readFile(req.file.path);
          const desiredName = sanitizeName(
            req.body?.name || req.file.originalname,
          );
          const meta = await writeProjectFile(
            PROJECTS_DIR,
            req.params.id,
            desiredName,
            buf,
            {},
            uploadProject?.metadata,
          );
          fs.promises.unlink(req.file.path).catch(() => {});
          /** @type {import('@open-design/contracts').ProjectFileResponse} */
          const body = { file: meta };
          return res.json(body);
        }
        const { name, content, encoding, artifactManifest, artifact, overwrite, skipArtifactStubGuard, forceArtifactStubGuardReject } = req.body || {};
        if (typeof name !== 'string' || typeof content !== 'string') {
          return sendApiError(
            res,
            400,
            'BAD_REQUEST',
            'name and content required',
          );
        }
        if (artifactManifest !== undefined && artifactManifest !== null) {
          const validated = validateArtifactManifestInput(
            artifactManifest,
            name,
          );
          if (!validated.ok) {
            return sendApiError(
              res,
              400,
              'BAD_REQUEST',
              `invalid artifactManifest: ${validated.error}`,
            );
          }
        }
        const buf =
          encoding === 'base64'
            ? Buffer.from(content, 'base64')
            : Buffer.from(content, 'utf8');
        const meta = artifact === true
          ? await createProjectArtifactFile({
              projectsRoot: PROJECTS_DIR,
              projectId: req.params.id,
              input: { name, content, encoding, artifactManifest },
              metadata: uploadProject?.metadata,
              writeProjectFile,
            })
          : await writeProjectFile(
              PROJECTS_DIR,
              req.params.id,
              name,
              buf,
              {
                artifactManifest,
                ...(overwrite === false ? { overwrite: false } : {}),
                ...(skipArtifactStubGuard === true ? { skipArtifactStubGuard: true } : {}),
                ...(forceArtifactStubGuardReject === true ? { forceArtifactStubGuardReject: true } : {}),
              },
              uploadProject?.metadata,
            );
        /** @type {import('@open-design/contracts').ProjectFileResponse} */
        const body = { file: meta };
        res.json(body);
      } catch (err: any) {
        if (err instanceof ArtifactRegressionError) {
          return sendApiError(res, 422, 'ARTIFACT_REGRESSION', err.message, {
            details: {
              identifier: err.identifier,
              newSize: err.newSize,
              priorSize: err.priorSize,
              priorName: err.priorName,
            },
          });
        }
        if (err instanceof ArtifactPublicationBlockedError) {
          return sendApiError(res, 422, 'ARTIFACT_PUBLICATION_BLOCKED', err.message, {
            details: { placeholders: err.placeholders },
          });
        }
        if (err?.code === 'EEXIST') {
          return sendApiError(res, 409, 'FILE_EXISTS', 'file already exists');
        }
        if (err?.code === 'ARTIFACT_MANIFEST_REQUIRED') {
          return sendApiError(res, 400, 'ARTIFACT_MANIFEST_REQUIRED', err.message);
        }
        if (err?.code === 'ARTIFACT_MANIFEST_INVALID') {
          return sendApiError(res, 400, 'BAD_REQUEST', err.message);
        }
        sendApiError(res, 500, 'INTERNAL_ERROR', 'upload failed');
      }
    },
  );

  app.post('/api/projects/:id/files/rename', async (req, res) => {
    try {
      const { from, to } = req.body || {};
      if (typeof from !== 'string' || typeof to !== 'string') {
        return sendApiError(res, 400, 'BAD_REQUEST', 'from and to required');
      }
      const project = getProject(db, req.params.id);
      const result = await renameProjectFile(
        PROJECTS_DIR,
        req.params.id,
        from,
        to,
        project?.metadata,
      );
      // Enqueue explicit remote deletion for BOTH Unicode forms of the source
      // path so a legacy NFD S3 object is purged after rename — otherwise the
      // orphan sits on S3 until the next full sync purge (or never, when
      // OD_S3_PURGE_ON_DELETE=0).
      if (result.oldName && result.newName !== result.oldName) {
        const oldPaths = new Set<string>();
        oldPaths.add(result.oldName);
        try { oldPaths.add(result.oldName.normalize('NFC')); } catch { /* ignore */ }
        try { oldPaths.add(result.oldName.normalize('NFD')); } catch { /* ignore */ }
        markRequestExplicitDeletedPaths(req, [...oldPaths]);
      }
      /** @type {import('@open-design/contracts').RenameProjectFileResponse} */
      const body = result;
      res.json(body);
    } catch (err: any) {
      if (err?.code === 'EEXIST') {
        return sendApiError(res, 409, 'CONFLICT', String(err?.message || err));
      }
      const message = String(err?.message || err);
      if (err?.code === 'ENOENT' || message.includes('ENOENT') || message.includes('no such file or directory')) {
        return sendApiError(res, 404, 'FILE_NOT_FOUND', message);
      }
      sendApiError(res, 400, 'BAD_REQUEST', message);
    }
  });

  app.delete('/api/projects/:id/files/:name', async (req, res) => {
    try {
      const delProject = getProject(db, req.params.id);
      await deleteProjectFile(PROJECTS_DIR, req.params.id, req.params.name, delProject?.metadata);
      /** @type {import('@open-design/contracts').DeleteProjectFileResponse} */
      const body = { ok: true };
      res.json(body);
    } catch (err: any) {
      const status = err && err.code === 'ENOENT' ? 404 : 400;
      sendApiError(
        res,
        status,
        status === 404 ? 'FILE_NOT_FOUND' : 'BAD_REQUEST',
        String(err),
      );
    }
  });

}

export interface RegisterProjectUploadRoutesDeps extends RouteDeps<'http' | 'uploads' | 'node'> {}

export function registerProjectUploadRoutes(app: Express, ctx: RegisterProjectUploadRoutesDeps) {
  const { sendApiError } = ctx.http;
  const { handleProjectUpload } = ctx.uploads;
  const { fs } = ctx.node;

  app.post(
    '/api/projects/:id/upload',
    handleProjectUpload,
    async (req, res) => {
      try {
        const incoming = Array.isArray(req.files) ? req.files : [];
        // Subfolder the upload targeted (sanitized, forward-slash, '' for root),
        // stashed by the multer destination resolver. Prepend it so callers
        // get the file's true project-relative path, not just its basename.
        const relDir = typeof (req as any)._uploadRelDir === 'string' ? (req as any)._uploadRelDir : '';
        const out = [];
        for (const f of incoming) {
          try {
            const stat = await fs.promises.stat(f.path);
            const rel = relDir ? `${relDir}/${f.filename}` : f.filename;
            out.push({
              name: rel,
              path: rel,
              size: stat.size,
              mtime: stat.mtimeMs,
              originalName: f.originalname,
            });
          } catch {
            // skip files that vanished mid-flight
          }
        }
        /** @type {import('@open-design/contracts').UploadProjectFilesResponse} */
        const body = { files: out };
        res.json(body);
      } catch (err: any) {
        sendApiError(res, 500, 'INTERNAL_ERROR', 'upload failed');
      }
    },
  );
}
