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
import { fetchTeamverDaemon } from '../../../teamver/teamverDaemonHeaders';
import type { HtmlPreviewSpec } from '../preview';

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
const previewHtmlCache = new Map<string, string>();
const previewInflight = new Map<string, Promise<string>>();

function rememberPreviewHtml(url: string, html: string): void {
  previewHtmlCache.delete(url);
  previewHtmlCache.set(url, html);
  while (previewHtmlCache.size > PREVIEW_CACHE_LIMIT) {
    const oldest = previewHtmlCache.keys().next().value;
    if (!oldest) break;
    previewHtmlCache.delete(oldest);
  }
}

function rememberUnreachable(url: string): void {
  // Negative cache uses empty string sentinel distinct from real HTML.
  rememberPreviewHtml(url, '');
}

// Re-export helpers for existing tests / callers.
export {
  isUnauthorizedHtmlBody as isPluginPreviewUnauthorizedBody,
  looksLikeHtmlDocument as looksLikePluginPreviewHtml,
  pluginPreviewSrcDoc,
} from '../../../runtime/authenticatedHtmlSrcDoc';
export { resolvePluginPreviewBaseHref } from '../../../runtime/authenticatedHtmlSrcDoc';

async function loadPluginPreviewHtml(url: string, signal?: AbortSignal): Promise<string> {
  const cached = previewHtmlCache.get(url);
  if (cached !== undefined) {
    if (!cached) throw new Error('plugin_preview_unreachable');
    return cached;
  }

  const existing = !signal ? previewInflight.get(url) : undefined;
  if (existing) return existing;

  const run = (async () => {
    const res = await fetchTeamverDaemon(url, {
      method: 'GET',
      signal: signal ?? new AbortController().signal,
      // Plugin preview thumbs are non-critical, retryable UI. Do not make a
      // card fetch wake Teamver auth/session refresh or active-workspace reads.
      skipEmbedAuthRecovery: true,
      skipTeamverWorkspaceHeaders: true,
    });
    if (!res.ok) {
      // Only sticky-cache missing assets. Auth failures must remain retryable
      // after cookie recovery / soft sticky clear.
      if (res.status === 404) rememberUnreachable(url);
      throw new Error(`plugin_preview_http_${res.status}`);
    }
    const text = await res.text();
    const contentType = res.headers.get('content-type');
    if (isUnauthorizedHtmlBody(text, contentType) || !looksLikeHtmlDocument(text)) {
      throw new Error('plugin_preview_not_html');
    }
    const srcDoc = pluginPreviewSrcDoc(text, url);
    rememberPreviewHtml(url, srcDoc);
    return srcDoc;
  })().finally(() => {
    previewInflight.delete(url);
  });

  if (!signal) previewInflight.set(url, run);
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
  const [loadState, setLoadState] = useState<LoadState>(() => {
    const cached = previewHtmlCache.get(preview.src);
    if (cached === undefined) return instantMount ? 'loading' : 'idle';
    return cached ? 'ok' : 'unreachable';
  });
  const [srcDoc, setSrcDoc] = useState<string | null>(() => {
    const cached = previewHtmlCache.get(preview.src);
    return cached || null;
  });

  useEffect(() => {
    setArmed(instantMount);
    setShouldLoad(isVisualStabilityMode() || instantMount);
    const cached = previewHtmlCache.get(preview.src);
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
    if (previewHtmlCache.has(preview.src)) {
      setShouldLoad(true);
      return;
    }
    const id = window.setTimeout(() => setShouldLoad(true), eager ? 60 : 520);
    return () => window.clearTimeout(id);
  }, [inView, preview.src, eager, instantMount]);

  useEffect(() => {
    if (!shouldLoad) return;
    const cached = previewHtmlCache.get(preview.src);
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
    const abort = new AbortController();
    setLoadState('loading');
    loadPluginPreviewHtml(preview.src, abort.signal)
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
      abort.abort();
    };
  }, [preview.src, shouldLoad]);

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
    }, 720);
    return () => window.clearTimeout(id);
  }, [inView, loadState, eager, instantMount]);

  if (loadState === 'unreachable') {
    return (
      <UnreachableFallback
        pluginId={pluginId}
        pluginTitle={pluginTitle}
        preview={preview}
        eager={eager}
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
            title={`${pluginTitle} preview`}
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

function UnreachableFallback({ pluginId, pluginTitle, preview, eager = false }: UnreachableFallbackProps) {
  const trimmed = pluginTitle.trim();
  const cp = trimmed.codePointAt(0) ?? 0x2022;
  const glyph = cp === 0x2022 ? '·' : String.fromCodePoint(cp).toUpperCase();
  const hue = hueFor(pluginId);
  const style = {
    background: `linear-gradient(135deg, hsl(${hue} 60% 18%), hsl(${(hue + 24) % 360} 50% 9%))`,
  };
  return (
    <div
      className="plugins-home__html plugins-home__html--fallback"
      data-plugin-id={pluginId}
      data-testid="plugins-home-html-fallback"
      style={style}
      aria-hidden
    >
      <div className="plugins-home__html-fallback-glyph">{glyph}</div>
      {eager ? null : (
        <div className="plugins-home__html-chrome">
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
export function __resetHtmlSurfaceProbeCacheForTests(): void {
  previewHtmlCache.clear();
  previewInflight.clear();
}

export function __htmlSurfaceProbeCacheSizeForTests(): number {
  return previewHtmlCache.size;
}

/** @internal vitest — exercise LRU eviction without mounting iframes. */
export function __seedHtmlSurfacePreviewCacheForTests(url: string, html: string): void {
  rememberPreviewHtml(url, html);
}
