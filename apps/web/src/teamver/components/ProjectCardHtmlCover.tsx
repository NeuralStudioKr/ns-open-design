import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";

import { injectHtmlBaseHref } from "../../runtime/authenticatedHtmlSrcDoc";
import { fetchTeamverDaemon } from "../teamverDaemonHeaders";

const DECK_PREVIEW_WIDTH = 1280;
const DECK_PREVIEW_HEIGHT = 720;

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
  const cacheKey = `${mode}:${src}`;
  const [srcDoc, setSrcDoc] = useState<string | null>(() => htmlCoverCache.get(cacheKey) ?? null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    let cancelled = false;
    const cached = htmlCoverCache.get(cacheKey);
    if (cached) {
      setSrcDoc(cached);
      return;
    }
    setSrcDoc(null);
    const abort = new AbortController();
    loadHtmlCover(src, mode, abort.signal)
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
          sandbox=""
          tabIndex={-1}
        />
      ) : (
        <span className={deckLoadingClassName} aria-hidden />
      )}
    </div>
  );
}

async function loadHtmlCover(
  src: string,
  mode: "deck" | "page",
  signal?: AbortSignal,
): Promise<string> {
  const cacheKey = `${mode}:${src}`;
  const cached = htmlCoverCache.get(cacheKey);
  if (cached) return cached;

  // Do not share in-flight promises across cards: aborting one unmount must
  // not cancel another card's cover fetch for the same URL.
  const existing = !signal ? htmlCoverInflight.get(cacheKey) : undefined;
  if (existing) return existing;

  const run = fetchTeamverDaemon(src, {
    // Unique AbortSignal skips GET dedupe in fetchTeamverDaemon.
    signal: signal ?? new AbortController().signal,
  })
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to load project cover: ${res.status}`);
      return res.text();
    })
    .then((html) => {
      const parsed = mode === "deck" ? deckPreviewSrcDoc(html, src) : pagePreviewSrcDoc(html, src);
      htmlCoverCache.set(cacheKey, parsed);
      return parsed;
    })
    .finally(() => {
      htmlCoverInflight.delete(cacheKey);
    });

  if (!signal) htmlCoverInflight.set(cacheKey, run);
  return run;
}

export function pagePreviewSrcDoc(html: string, sourceUrl: string): string {
  const withoutScripts = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, "");
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
  const withoutScripts = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, "");
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
    .slide:not(:first-of-type),
    section[data-slide]:not(:first-of-type),
    section[data-screen-label]:not(:first-of-type),
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

/** @internal vitest */
export function clearProjectDeckCoverCacheForTests(): void {
  htmlCoverCache.clear();
  htmlCoverInflight.clear();
}
