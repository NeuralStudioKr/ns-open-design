import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";

import { injectHtmlBaseHref } from "../../runtime/authenticatedHtmlSrcDoc";
import { isTeamverEmbedMode } from "../designApiBase";
import { fetchTeamverDaemon } from "../teamverDaemonHeaders";
import {
  projectScopedPreviewUrl,
  resolveTeamverProjectPreviewPrefix,
} from "../teamverProjectPreviewScope";

// Match Teamver slide canvas (canvasSlideLaunch / TEAMVER_SLIDE_CANVAS).
// Older 1280×720 forced absolute-px decks to clip; scripts are stripped so
// fit() never rescales inside the thumb iframe.
const DECK_PREVIEW_WIDTH = 1920;
const DECK_PREVIEW_HEIGHT = 1080;

const htmlCoverCache = new Map<string, string>();
const htmlCoverInflight = new Map<string, Promise<string>>();

export type ProjectCardHtmlCoverProps = {
  src: string;
  /** Deck projects — first-slide layout CSS; prototypes use a simpler clip. */
  deckCoverOnly?: boolean;
  iframeClassName?: string;
  deckFrameClassName?: string;
  deckIframeClassName?: string;
  deckLoadingClassName?: string;
};

/**
 * Project card HTML preview via authenticated fetch + srcDoc.
 *
 * Never use a bare iframe `src=/api/.../raw/...` in Teamver embed: sandboxed
 * iframes cannot send identity cookies/headers, so nginx/daemon return
 * UNAUTHORIZED JSON (reads as a black thumb). Deck covers already fetched;
 * prototypes need the same path.
 */
export function ProjectCardHtmlCover({
  src,
  deckCoverOnly = false,
  iframeClassName = "thumb-iframe",
  deckFrameClassName = "project-thumb-deck-frame",
  deckIframeClassName = "project-thumb-deck-iframe",
  deckLoadingClassName = "project-thumb-deck-loading",
}: ProjectCardHtmlCoverProps) {
  return (
    <AuthenticatedHtmlCover
      src={src}
      mode={deckCoverOnly ? "deck" : "page"}
      deckFrameClassName={deckFrameClassName}
      deckIframeClassName={deckIframeClassName || iframeClassName}
      deckLoadingClassName={deckLoadingClassName}
    />
  );
}

function AuthenticatedHtmlCover({
  src,
  mode,
  deckFrameClassName,
  deckIframeClassName,
  deckLoadingClassName,
}: {
  src: string;
  mode: "deck" | "page";
  deckFrameClassName: string;
  deckIframeClassName: string;
  deckLoadingClassName: string;
}) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  // Cache by path without ?v= so mtime bumps / remounts reuse HTML; still fetch
  // the busted URL when the cache misses.
  const cacheKey = `${mode}:${src.split(/[?#]/u, 1)[0] ?? src}`;
  const [srcDoc, setSrcDoc] = useState<string | null>(() => htmlCoverCache.get(cacheKey) ?? null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    let cancelled = false;
    const cached = htmlCoverCache.get(cacheKey);
    if (cached) {
      setSrcDoc(cached);
      return;
    }
    // Keep prior frame while reloading — avoids flash on remount/status churn.
    const abort = new AbortController();
    loadHtmlCover(src, mode, abort.signal, cacheKey)
      .then((next) => {
        if (!cancelled) setSrcDoc(next);
      })
      .catch(() => {
        if (!cancelled) setSrcDoc(null);
      });
    return () => {
      cancelled = true;
      abort.abort();
    };
  }, [cacheKey, mode, src]);

  useEffect(() => {
    const node = frameRef.current;
    if (!node) return;
    const update = () => {
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      setScale(Math.min(rect.width / DECK_PREVIEW_WIDTH, rect.height / DECK_PREVIEW_HEIGHT));
    };
    update();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={frameRef}
      className={deckFrameClassName}
      style={{ "--project-deck-scale": scale, "--recent-deck-scale": scale } as CSSProperties}
      aria-hidden
    >
      {srcDoc ? (
        <iframe
          className={deckIframeClassName}
          srcDoc={srcDoc}
          title=""
          loading="lazy"
          sandbox="allow-scripts"
          tabIndex={-1}
          style={{
            width: DECK_PREVIEW_WIDTH,
            height: DECK_PREVIEW_HEIGHT,
            transform: `scale(${scale})`,
            transformOrigin: "0 0",
          }}
        />
      ) : (
        <span className={deckLoadingClassName} aria-hidden />
      )}
    </div>
  );
}

/** Parse `/api/projects/:id/raw/:path` so cover base href can use scoped preview. */
export function parseProjectRawUrl(
  src: string,
): { projectId: string; filePath: string } | null {
  // Cover media URLs append `?v=mtime` for cache-bust — strip query/hash so
  // preview-url mint does not look up a literal `deck.html?v=…` path (404).
  const pathOnly = String(src || "").trim().split(/[?#]/u, 1)[0] ?? "";
  const match = /^\/api\/projects\/([^/]+)\/raw\/(.+)$/u.exec(pathOnly);
  if (!match) return null;
  let projectId = match[1] || "";
  let filePath = match[2] || "";
  try {
    projectId = decodeURIComponent(projectId);
  } catch {
    /* keep raw */
  }
  filePath = filePath
    .split("/")
    .map((seg) => {
      try {
        return decodeURIComponent(seg);
      } catch {
        return seg;
      }
    })
    .filter(Boolean)
    .join("/");
  if (!projectId || !filePath) return null;
  return { projectId, filePath };
}

async function resolveCoverBaseHref(
  src: string,
  signal?: AbortSignal,
): Promise<{ href: string; scoped: boolean }> {
  if (!isTeamverEmbedMode()) return { href: src, scoped: true };
  const parsed = parseProjectRawUrl(src);
  if (!parsed) return { href: src, scoped: false };
  // Retry briefly — a one-shot preview-url miss must not poison the cover
  // cache with an auth-gated /raw base that sandboxed iframes cannot load.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (signal?.aborted) break;
    const prefix = await resolveTeamverProjectPreviewPrefix(
      parsed.projectId,
      parsed.filePath,
      { signal },
    );
    if (prefix) {
      return {
        href: projectScopedPreviewUrl(prefix, parsed.filePath),
        scoped: true,
      };
    }
    if (attempt < 2) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 120 * (attempt + 1));
        signal?.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            resolve();
          },
          { once: true },
        );
      });
    }
  }
  return { href: src, scoped: false };
}

async function loadHtmlCover(
  src: string,
  mode: "deck" | "page",
  signal?: AbortSignal,
  cacheKeyOverride?: string,
): Promise<string> {
  const cacheKey = cacheKeyOverride ?? `${mode}:${src.split(/[?#]/u, 1)[0] ?? src}`;
  const cached = htmlCoverCache.get(cacheKey);
  if (cached) return cached;

  // Do not share in-flight promises across cards: aborting one unmount must
  // not cancel another card's cover fetch for the same URL.
  const existing = !signal ? htmlCoverInflight.get(cacheKey) : undefined;
  if (existing) return existing;

  const run = (async () => {
    const res = await fetchTeamverDaemon(src, {
      // Unique AbortSignal skips GET dedupe in fetchTeamverDaemon.
      signal: signal ?? new AbortController().signal,
    });
    if (!res.ok) throw new Error(`Failed to load project cover: ${res.status}`);
    const html = await res.text();
    const { href: baseHref } = await resolveCoverBaseHref(src, signal);
    const parsed =
      mode === "deck" ? deckPreviewSrcDoc(html, baseHref) : pagePreviewSrcDoc(html, baseHref);
    // Always cache thumb HTML. Skipping cache on unscoped embed fallback caused
    // remount loops (e.g. former status-column churn) to refetch /raw forever.
    htmlCoverCache.set(cacheKey, parsed);
    return parsed;
  })().finally(() => {
    htmlCoverInflight.delete(cacheKey);
  });

  if (!signal) htmlCoverInflight.set(cacheKey, run);
  return run;
}

export function pagePreviewSrcDoc(html: string, sourceUrl: string): string {
  const withoutScripts = stripHtmlScripts(html);
  const style = `<style id="od-page-card-preview">
    html,
    body {
      margin: 0 !important;
      width: ${DECK_PREVIEW_WIDTH}px !important;
      min-height: ${DECK_PREVIEW_HEIGHT}px !important;
      overflow: hidden !important;
    }
  </style>`;
  return injectPreviewHead(withoutScripts, sourceUrl, style);
}

export function deckPreviewSrcDoc(html: string, sourceUrl: string): string {
  const withoutScripts = stripHtmlScripts(html);
  const style = `<style id="od-deck-card-preview">
    html,
    body {
      margin: 0 !important;
      width: ${DECK_PREVIEW_WIDTH}px !important;
      height: ${DECK_PREVIEW_HEIGHT}px !important;
      overflow: hidden !important;
    }
    body {
      display: block !important;
      scroll-snap-type: none !important;
    }
    .slide,
    section[data-slide],
    section[data-screen-label] {
      position: absolute !important;
      inset: 0 !important;
      width: ${DECK_PREVIEW_WIDTH}px !important;
      height: ${DECK_PREVIEW_HEIGHT}px !important;
      flex: none !important;
      scroll-snap-align: none !important;
    }
    /* Sibling combinator: :first-of-type hides the real first .slide when a
       preceding <section> sibling steals first-of-type. */
    .slide ~ .slide,
    section[data-slide] ~ section[data-slide],
    section[data-screen-label] ~ section[data-screen-label],
    .deck-counter,
    .deck-controls,
    .deck-hint,
    .deck-page-controls,
    .deck-pager,
    .deck-progress,
    .deck-nav,
    .deck-navigation,
    .page-controls,
    .page-flip-controls,
    .page-nav,
    .page-navigation,
    .pagination-control,
    .pagination-controls,
    #deck-prev,
    #deck-next,
    #deck-cur,
    #deck-total,
    [data-deck-controls],
    [data-page-controls],
    [data-pagination],
    [aria-label="Previous slide"],
    [aria-label="Next slide"],
    [aria-label="Deck navigation"],
    [aria-label="Page navigation"],
    [aria-label="Pagination"],
    nav[aria-label*="page" i],
    nav[aria-label*="pagination" i] {
      display: none !important;
      visibility: hidden !important;
      pointer-events: none !important;
    }
  </style>`;
  return injectPreviewHead(withoutScripts, sourceUrl, style);
}

function injectPreviewHead(source: string, sourceUrl: string, style: string): string {
  // Shared base inject also strips canvas CSP `base-uri 'none'` so srcDoc
  // thumbs do not spam DevTools (see injectHtmlBaseHref).
  return injectBefore(injectHtmlBaseHref(source, sourceUrl), "</head>", style);
}

function injectBefore(source: string, marker: string, addition: string): string {
  const index = source.toLowerCase().lastIndexOf(marker);
  if (index === -1) return `${addition}${source}`;
  return `${source.slice(0, index)}${addition}${source.slice(index)}`;
}

/** Drop executable script tags so card thumbs stay CSS-only. */
function stripHtmlScripts(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, "")
    .replace(/<script\b[^>]*\/>/giu, "");
}

/** @internal vitest */
export function clearProjectDeckCoverCacheForTests(): void {
  htmlCoverCache.clear();
  htmlCoverInflight.clear();
}
