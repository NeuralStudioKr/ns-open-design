// Sandboxed HTML preview surface — used for `examples/*` plugins
// and any scenario plugin that ships a runnable `od.preview.entry`.
//
// The iframe is mounted only after the card scrolls into view. We
// further guard the iframe behind a one-shot pointer hover (`armed`)
// for tiles that contain heavy interactive content; once armed it
// stays mounted so cursor flicker doesn't tear down the preview.
//
// The iframe is rendered tiny inside the card and visually scaled
// up via CSS `transform: scale(...)` so a full-size HTML doc reads
// as a thumbnail without needing a server-rendered screenshot. The
// daemon already enforces a strict CSP on the asset response.
//
// Authenticated fetch + srcDoc
// ----------------------------
// Never mount a bare iframe `src=/api/plugins/.../preview|example` in
// Teamver embed (or any auth-gated preview). Sandboxed iframes cannot
// send identity cookies, so nginx returns `{"detail":"session_expired"}`
// and Chrome paints that JSON as a black "pretty print" thumb. Parent
// fetch (same-origin credentials, no embed recovery ladder) loads the HTML, then we inject a
// `<base href>` so public `/asset/` subresources still resolve.
//
// Reachability
// ------------
// The same authenticated GET doubles as the reachability probe: 404 /
// 401 / JSON error envelopes swap in a typographic fallback instead of
// leaving a blank or JSON-viewer tile. Results are cached per-URL.

import { useEffect, useState } from 'react';
import { isVisualStabilityMode } from '../../../utils/visualStability';
import {
  isUnauthorizedHtmlBody,
  looksLikeHtmlDocument,
  pluginPreviewSrcDoc,
} from '../../../runtime/authenticatedHtmlSrcDoc';
import { pluginCatalogPreviewSrcDoc } from '../../../teamver/htmlCoverSrcDoc';
import { fetchTeamverDaemon } from '../../../teamver/teamverDaemonHeaders';
import { TEAMVER_EMBED_PASSIVE_AUTH_RECOVERED_EVENT } from '../../../teamver/teamverEmbedPassiveAuth';
import { embedUiLabel } from '../../../teamver/embedUiLabels';
import type { HtmlPreviewSpec } from '../preview';

/** Linger before inView preview GET — short enough for gallery UX, long enough to skip scroll-by. */
const IN_VIEW_PREVIEW_LINGER_MS = 120;
const EAGER_PREVIEW_LINGER_MS = 60;
/** After HTML lands, wait briefly before mounting the iframe (scroll-past skip). */
const IN_VIEW_IFRAME_ARM_MS = 180;

interface Props {
  preview: HtmlPreviewSpec;
  pluginId: string;
  pluginTitle: string;
  inView: boolean;
  // Gallery layout: render the live iframe as soon as the tile is in
  // view (no hover/linger gate) and drop the built-in dot+url chrome
  // strip, since the gallery card provides its own top bar.
  eager?: boolean;
  // Composer hover panels: skip reachability probe delays.
  instantMount?: boolean;
}

type LoadState = 'idle' | 'loading' | 'ok' | 'unreachable';

const PREVIEW_CACHE_LIMIT = 256;
/** Cap concurrent `/preview` GETs so a viewport of cards cannot stampede the daemon. */
const PREVIEW_FETCH_CONCURRENCY = 3;
/** Coalesce same-frame visible card preview requests into one daemon call. */
const PREVIEW_BATCH_DELAY_MS = 24;
const PREVIEW_BATCH_MAX_ITEMS = 24;
const SESSION_PREVIEW_PREFIX = 'od:plugin-preview:v2:';
const SESSION_PREVIEW_MAX_ENTRY_CHARS = 180_000;
const SESSION_PREVIEW_MAX_ENTRIES = 16;

const previewHtmlCache = new Map<string, string>();
const previewInflight = new Map<string, Promise<string>>();
const previewBatchQueue: Array<{
  url: string;
  resolve: (html: string) => void;
  reject: (error: unknown) => void;
}> = [];
let previewFetchActive = 0;
const previewFetchWaiters: Array<() => void> = [];
let previewBatchTimer: ReturnType<typeof setTimeout> | null = null;

function rememberPreviewHtml(url: string, html: string): void {
  previewHtmlCache.delete(url);
  previewHtmlCache.set(url, html);
  while (previewHtmlCache.size > PREVIEW_CACHE_LIMIT) {
    const oldest = previewHtmlCache.keys().next().value;
    if (!oldest) break;
    previewHtmlCache.delete(oldest);
  }
  writeSessionPreviewHtml(url, html);
}

function rememberUnreachable(url: string): void {
  // Negative cache uses empty string sentinel distinct from real HTML.
  rememberPreviewHtml(url, '');
}

/** Drop a single preview cache entry so a later GET can retry (auth recovery). */
function forgetPluginPreviewHtml(url: string): void {
  const cacheKey = pluginPreviewCacheKey(url);
  previewHtmlCache.delete(cacheKey);
  previewInflight.delete(cacheKey);
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(sessionPreviewKey(cacheKey));
  } catch {
    // ignore
  }
}

function sessionPreviewKey(cacheKey: string): string {
  return `${SESSION_PREVIEW_PREFIX}${cacheKey}`;
}

function readSessionPreviewHtml(cacheKey: string): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(sessionPreviewKey(cacheKey));
    if (raw == null) return null;
    return raw;
  } catch {
    return null;
  }
}

function writeSessionPreviewHtml(cacheKey: string, html: string): void {
  if (typeof sessionStorage === 'undefined') return;
  // Skip huge decks / empty negative sentinels — memory cache is enough.
  if (!html || html.length > SESSION_PREVIEW_MAX_ENTRY_CHARS) return;
  try {
    const key = sessionPreviewKey(cacheKey);
    sessionStorage.setItem(key, html);
    const indexKey = `${SESSION_PREVIEW_PREFIX}__index`;
    const prev = sessionStorage.getItem(indexKey);
    const order: string[] = prev ? (JSON.parse(prev) as string[]) : [];
    const next = order.filter((entry) => entry !== cacheKey);
    next.push(cacheKey);
    while (next.length > SESSION_PREVIEW_MAX_ENTRIES) {
      const evicted = next.shift();
      if (evicted) sessionStorage.removeItem(sessionPreviewKey(evicted));
    }
    sessionStorage.setItem(indexKey, JSON.stringify(next));
  } catch {
    // Quota / private mode — ignore; memory cache still works.
  }
}

async function withPreviewFetchSlot<T>(run: () => Promise<T>): Promise<T> {
  if (previewFetchActive >= PREVIEW_FETCH_CONCURRENCY) {
    await new Promise<void>((resolve) => {
      previewFetchWaiters.push(resolve);
    });
  }
  previewFetchActive += 1;
  try {
    return await run();
  } finally {
    previewFetchActive -= 1;
    const next = previewFetchWaiters.shift();
    if (next) next();
  }
}

function isBatchablePluginPreviewUrl(url: string): boolean {
  return (
    /^\/api\/plugins\/[^/?#]+\/preview$/u.test(url) ||
    /^\/api\/plugins\/[^/?#]+\/example\/[^/?#]+$/u.test(url)
  );
}

async function fetchSinglePluginPreviewHtml(cacheKey: string): Promise<string> {
  const res = await fetchTeamverDaemon(cacheKey, {
    method: 'GET',
    // Plugin preview thumbs are non-critical, retryable UI. Do not make a
    // card fetch wake Teamver auth/session refresh, active-workspace reads,
    // or the embed passive-auth / soft-sticky ladder — a viewport of 401s
    // used to poison later detail-modal `/preview` fetches.
    skipEmbedAuthRecovery: true,
    skipEmbedUnauthorizedNotify: true,
    skipTeamverWorkspaceHeaders: true,
  });
  if (!res.ok) {
    // Only sticky-cache missing assets. Auth failures must remain retryable
    // after cookie recovery / soft sticky clear.
    if (res.status === 404) rememberUnreachable(cacheKey);
    throw new Error(`plugin_preview_http_${res.status}`);
  }
  const text = await res.text();
  const contentType = res.headers.get('content-type');
  if (isUnauthorizedHtmlBody(text, contentType) || !looksLikeHtmlDocument(text)) {
    throw new Error('plugin_preview_not_html');
  }
  const srcDoc = pluginCatalogPreviewSrcDoc(text, cacheKey);
  rememberPreviewHtml(cacheKey, srcDoc);
  return srcDoc;
}

function schedulePluginPreviewBatch(): void {
  if (previewBatchTimer) return;
  previewBatchTimer = setTimeout(() => {
    previewBatchTimer = null;
    const batch = previewBatchQueue.splice(0, PREVIEW_BATCH_MAX_ITEMS);
    if (previewBatchQueue.length > 0) schedulePluginPreviewBatch();
    if (batch.length === 0) return;
    const uniqueUrls = Array.from(new Set(batch.map((entry) => entry.url)));
    withPreviewFetchSlot(async () => {
      try {
        const res = await fetchTeamverDaemon('/api/plugins/preview-batch', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ urls: uniqueUrls, mode: 'thumbnail' }),
          skipEmbedAuthRecovery: true,
          skipEmbedUnauthorizedNotify: true,
          skipTeamverWorkspaceHeaders: true,
        });
        if (!res.ok) throw new Error(`plugin_preview_batch_http_${res.status}`);
        const payload = (await res.json()) as {
          results?: Array<{
            url?: unknown;
            ok?: unknown;
            html?: unknown;
            status?: unknown;
          }>;
        };
        const byUrl = new Map(
          (payload.results ?? [])
            .filter((row) => typeof row.url === 'string')
            .map((row) => [String(row.url), row]),
        );

        for (const item of batch) {
          const row = byUrl.get(item.url);
          const status = typeof row?.status === 'number' ? row.status : 0;
          if (!row?.ok || typeof row.html !== 'string') {
            if (status === 404) rememberUnreachable(item.url);
            item.reject(new Error(`plugin_preview_batch_item_${status || 'failed'}`));
            continue;
          }
          if (isUnauthorizedHtmlBody(row.html, 'text/html') || !looksLikeHtmlDocument(row.html)) {
            item.reject(new Error('plugin_preview_not_html'));
            continue;
          }
          const srcDoc = pluginCatalogPreviewSrcDoc(row.html, item.url);
          rememberPreviewHtml(item.url, srcDoc);
          item.resolve(srcDoc);
        }
      } catch (error) {
        for (const item of batch) {
          try {
            item.resolve(await fetchSinglePluginPreviewHtml(item.url));
          } catch (itemError) {
            item.reject(itemError);
          }
        }
      }
    }).catch((error) => {
      for (const item of batch) item.reject(error);
    });
  }, PREVIEW_BATCH_DELAY_MS);
}

async function loadPluginPreviewHtmlViaBatch(cacheKey: string): Promise<string> {
  if (!isBatchablePluginPreviewUrl(cacheKey)) {
    return withPreviewFetchSlot(() => fetchSinglePluginPreviewHtml(cacheKey));
  }
  return new Promise<string>((resolve, reject) => {
    previewBatchQueue.push({ url: cacheKey, resolve, reject });
    schedulePluginPreviewBatch();
  });
}

// Re-export helpers for existing tests / callers.
export {
  isUnauthorizedHtmlBody as isPluginPreviewUnauthorizedBody,
  looksLikeHtmlDocument as looksLikePluginPreviewHtml,
  pluginPreviewSrcDoc,
} from '../../../runtime/authenticatedHtmlSrcDoc';
export { resolvePluginPreviewBaseHref } from '../../../runtime/authenticatedHtmlSrcDoc';

function pluginPreviewCacheKey(url: string): string {
  return url.split(/[?#]/u, 1)[0] ?? url;
}

async function loadPluginPreviewHtml(url: string): Promise<string> {
  // Path-only key + shared inflight (no AbortSignal). Per-card abort used to
  // skip fetchTeamverDaemon GET dedupe and cancel sibling tiles on remount.
  const cacheKey = pluginPreviewCacheKey(url);
  const cached = previewHtmlCache.get(cacheKey);
  if (cached !== undefined) {
    if (!cached) throw new Error('plugin_preview_unreachable');
    return cached;
  }

  const fromSession = readSessionPreviewHtml(cacheKey);
  if (fromSession !== null && fromSession.length > 0) {
    // Memory only — session already holds the bytes.
    previewHtmlCache.set(cacheKey, fromSession);
    return fromSession;
  }

  const existing = previewInflight.get(cacheKey);
  if (existing) return existing;

  const run = loadPluginPreviewHtmlViaBatch(cacheKey).finally(() => {
    previewInflight.delete(cacheKey);
  });

  previewInflight.set(cacheKey, run);
  return run;
}

export function HtmlSurface({
  preview,
  pluginId,
  pluginTitle,
  inView,
  eager = false,
  instantMount = false,
}: Props) {
  const [armed, setArmed] = useState(() => instantMount);
  const [shouldLoad, setShouldLoad] = useState(() => isVisualStabilityMode() || instantMount);
  // Bumped on auth recovery / explicit retry so a prior 401 fallback can
  // re-fetch without remounting the whole gallery.
  const [reloadToken, setReloadToken] = useState(0);
  const [loadState, setLoadState] = useState<LoadState>(() => {
    const cached = previewHtmlCache.get(pluginPreviewCacheKey(preview.src));
    if (cached === undefined) return instantMount ? 'loading' : 'idle';
    return cached ? 'ok' : 'unreachable';
  });
  const [srcDoc, setSrcDoc] = useState<string | null>(() => {
    const cached = previewHtmlCache.get(pluginPreviewCacheKey(preview.src));
    return cached || null;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onRecovered = () => {
      forgetPluginPreviewHtml(preview.src);
      setShouldLoad(true);
      setReloadToken((token) => token + 1);
    };
    window.addEventListener(TEAMVER_EMBED_PASSIVE_AUTH_RECOVERED_EVENT, onRecovered);
    return () => {
      window.removeEventListener(TEAMVER_EMBED_PASSIVE_AUTH_RECOVERED_EVENT, onRecovered);
    };
  }, [preview.src]);

  useEffect(() => {
    setArmed(instantMount);
    setShouldLoad(isVisualStabilityMode() || instantMount);
    const cached = previewHtmlCache.get(pluginPreviewCacheKey(preview.src));
    if (cached === undefined) {
      setSrcDoc(null);
      setLoadState(instantMount ? 'loading' : 'idle');
      return;
    }
    if (cached) {
      setSrcDoc(cached);
      setLoadState('ok');
    } else {
      setSrcDoc(null);
      setLoadState('unreachable');
    }
  }, [preview.src, instantMount]);

  useEffect(() => {
    if (!inView || instantMount) return;
    if (isVisualStabilityMode()) {
      setShouldLoad(true);
      return;
    }
    if (previewHtmlCache.has(pluginPreviewCacheKey(preview.src))) {
      setShouldLoad(true);
      return;
    }
    // In-view linger loads thumbs for visible gallery cards (incl. Teamver
    // embed). Boot fan-out is still avoided via eager=false + tight
    // IntersectionObserver rootMargin on PreviewSurface — not by blocking
    // inView entirely (that left hover-only empty skeletons).
    const lingerMs = eager ? EAGER_PREVIEW_LINGER_MS : IN_VIEW_PREVIEW_LINGER_MS;
    const id = window.setTimeout(() => setShouldLoad(true), lingerMs);
    return () => window.clearTimeout(id);
  }, [inView, preview.src, eager, instantMount]);

  useEffect(() => {
    if (!shouldLoad) return;
    const cacheKey = pluginPreviewCacheKey(preview.src);
    const cached = previewHtmlCache.get(cacheKey);
    if (cached !== undefined) {
      if (cached) {
        setSrcDoc(cached);
        setLoadState('ok');
      } else {
        setSrcDoc(null);
        setLoadState('unreachable');
      }
      return;
    }

    let cancelled = false;
    setLoadState('loading');
    // Unmount only skips setState — do not abort the shared network GET.
    loadPluginPreviewHtml(preview.src)
      .then((html) => {
        if (cancelled) return;
        setSrcDoc(html);
        setLoadState('ok');
      })
      .catch(() => {
        if (cancelled) return;
        setSrcDoc(null);
        setLoadState('unreachable');
      });
    return () => {
      cancelled = true;
    };
  }, [preview.src, shouldLoad, reloadToken]);

  // Arm the iframe after a short visibility window so the user can
  // scroll past tiles without paying for an iframe per tile, but tiles
  // that linger get the live preview without requiring hover.
  useEffect(() => {
    if (loadState !== 'ok') return;
    if (isVisualStabilityMode()) {
      if (inView) setArmed(true);
      return;
    }
    if (eager || instantMount) {
      if (inView) setArmed(true);
      return;
    }
    const id = window.setTimeout(() => {
      if (inView) setArmed(true);
    }, IN_VIEW_IFRAME_ARM_MS);
    return () => window.clearTimeout(id);
  }, [inView, loadState, eager, instantMount]);

  function retryPreviewLoad(options?: { force?: boolean }) {
    const cacheKey = pluginPreviewCacheKey(preview.src);
    // Sticky 404 sentinel — hover must not re-stampede missing assets.
    if (!options?.force && previewHtmlCache.get(cacheKey) === '') return;
    forgetPluginPreviewHtml(preview.src);
    setShouldLoad(true);
    setReloadToken((token) => token + 1);
  }

  if (loadState === 'unreachable') {
    return (
      <UnreachableFallback
        pluginId={pluginId}
        pluginTitle={pluginTitle}
        preview={preview}
        eager={eager}
        onRetry={retryPreviewLoad}
      />
    );
  }

  return (
    <div
      className="plugins-home__html"
      data-plugin-id={pluginId}
      onMouseEnter={() => {
        setShouldLoad(true);
        if (loadState === 'ok') setArmed(true);
      }}
    >
      <div className="plugins-home__html-frame">
        {armed && srcDoc ? (
          <iframe
            title={embedUiLabel(
              `${pluginTitle} preview`,
              `${pluginTitle} 미리보기`,
            )}
            srcDoc={srcDoc}
            sandbox="allow-scripts"
            loading="lazy"
            tabIndex={-1}
            aria-hidden
            className="plugins-home__html-iframe"
          />
        ) : (
          <div
            className={`plugins-home__html-skeleton${inView ? ' is-active' : ''}`}
            aria-hidden
          >
            <span />
            <span />
            <span />
          </div>
        )}
      </div>
      {eager ? null : (
        <div className="plugins-home__html-chrome" aria-hidden>
          <span className="plugins-home__html-dot" />
          <span className="plugins-home__html-dot" />
          <span className="plugins-home__html-dot" />
          <span className="plugins-home__html-url">{preview.label}</span>
        </div>
      )}
    </div>
  );
}

interface UnreachableFallbackProps {
  pluginId: string;
  pluginTitle: string;
  preview: HtmlPreviewSpec;
  eager?: boolean;
  onRetry?: (options?: { force?: boolean }) => void;
}

// Stable colour from the plugin id so adjacent fallback tiles stay
// visually distinct without flickering on re-renders.
function hueFor(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return hash % 360;
}

function UnreachableFallback({
  pluginId,
  pluginTitle,
  preview,
  eager = false,
  onRetry,
}: UnreachableFallbackProps) {
  const trimmed = pluginTitle.trim();
  const cp = trimmed.codePointAt(0) ?? 0x2022;
  const glyph = cp === 0x2022 ? '·' : String.fromCodePoint(cp).toUpperCase();
  const hue = hueFor(pluginId);
  const style = {
    background: `linear-gradient(135deg, hsl(${hue} 60% 18%), hsl(${(hue + 24) % 360} 50% 9%))`,
  };
  const retryLabel = embedUiLabel(
    `Retry ${pluginTitle} preview`,
    `${pluginTitle} 미리보기 다시 시도`,
  );
  return (
    <div
      className="plugins-home__html plugins-home__html--fallback"
      data-plugin-id={pluginId}
      data-testid="plugins-home-html-fallback"
      style={style}
      onMouseEnter={() => onRetry?.()}
    >
      <div className="plugins-home__html-fallback-glyph" aria-hidden>
        {glyph}
      </div>
      {onRetry ? (
        <button
          type="button"
          className="plugins-home__html-fallback-retry"
          data-testid="plugins-home-html-fallback-retry"
          onClick={(event) => {
            // Gallery tiles open details on card click — keep retry local.
            event.stopPropagation();
            // Force bypasses the sticky-404 empty-string cache that would
            // otherwise make an explicit Retry a silent no-op.
            onRetry({ force: true });
          }}
          aria-label={retryLabel}
        >
          {embedUiLabel('Retry', '다시 시도')}
        </button>
      ) : null}
      {eager ? null : (
        <div className="plugins-home__html-chrome" aria-hidden>
          <span className="plugins-home__html-dot" />
          <span className="plugins-home__html-dot" />
          <span className="plugins-home__html-dot" />
          <span className="plugins-home__html-url">{preview.label}</span>
        </div>
      )}
    </div>
  );
}

// Test seam — exposed so unit tests can reset the preview cache between
// scenarios without leaking state across files.
/** @internal vitest — memory + session + fetch slots. */
export function __resetHtmlSurfaceProbeCacheForTests(): void {
  __clearHtmlSurfaceMemoryCacheForTests();
  if (typeof sessionStorage !== 'undefined') {
    try {
      const keys: string[] = [];
      for (let i = 0; i < sessionStorage.length; i += 1) {
        const key = sessionStorage.key(i);
        if (key?.startsWith(SESSION_PREVIEW_PREFIX)) keys.push(key);
      }
      for (const key of keys) sessionStorage.removeItem(key);
    } catch {
      // ignore
    }
  }
}

/** @internal vitest — leave sessionStorage so revisit-without-GET can be asserted. */
export function __clearHtmlSurfaceMemoryCacheForTests(): void {
  previewHtmlCache.clear();
  previewInflight.clear();
  previewBatchQueue.length = 0;
  if (previewBatchTimer) {
    clearTimeout(previewBatchTimer);
    previewBatchTimer = null;
  }
  previewFetchActive = 0;
  previewFetchWaiters.length = 0;
}

/** @internal vitest */
export function __pluginPreviewFetchConcurrencyForTests(): number {
  return PREVIEW_FETCH_CONCURRENCY;
}

/** @internal vitest */
export function __pluginPreviewBatchMaxItemsForTests(): number {
  return PREVIEW_BATCH_MAX_ITEMS;
}

export function __htmlSurfaceProbeCacheSizeForTests(): number {
  return previewHtmlCache.size;
}

/** @internal vitest — exercise LRU eviction without mounting iframes. */
export function __seedHtmlSurfacePreviewCacheForTests(url: string, html: string): void {
  rememberPreviewHtml(url, html);
}
