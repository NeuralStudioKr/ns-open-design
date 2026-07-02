import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";

import { fetchTeamverDaemon } from "../teamverDaemonHeaders";

const DECK_PREVIEW_WIDTH = 1280;
const DECK_PREVIEW_HEIGHT = 720;

const deckCoverCache = new Map<string, string>();
const deckCoverInflight = new Map<string, Promise<string>>();

export type ProjectCardHtmlCoverProps = {
  src: string;
  /** Deck projects — fetch HTML once, show first slide via srcDoc (lighter than live iframe). */
  deckCoverOnly?: boolean;
  iframeClassName?: string;
  deckFrameClassName?: string;
  deckIframeClassName?: string;
  deckLoadingClassName?: string;
};

/** Project card HTML preview — raw iframe or deck-first-slide srcDoc. */
export function ProjectCardHtmlCover({
  src,
  deckCoverOnly = false,
  iframeClassName = "thumb-iframe",
  deckFrameClassName = "project-thumb-deck-frame",
  deckIframeClassName = "project-thumb-deck-iframe",
  deckLoadingClassName = "project-thumb-deck-loading",
}: ProjectCardHtmlCoverProps) {
  if (!deckCoverOnly) {
    return (
      <iframe
        className={iframeClassName}
        src={src}
        title=""
        loading="lazy"
        sandbox="allow-scripts"
        tabIndex={-1}
      />
    );
  }

  return (
    <DeckCoverThumb
      src={src}
      deckFrameClassName={deckFrameClassName}
      deckIframeClassName={deckIframeClassName}
      deckLoadingClassName={deckLoadingClassName}
    />
  );
}

function DeckCoverThumb({
  src,
  deckFrameClassName,
  deckIframeClassName,
  deckLoadingClassName,
}: {
  src: string;
  deckFrameClassName: string;
  deckIframeClassName: string;
  deckLoadingClassName: string;
}) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [srcDoc, setSrcDoc] = useState<string | null>(() => deckCoverCache.get(src) ?? null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    let cancelled = false;
    const cached = deckCoverCache.get(src);
    if (cached) {
      setSrcDoc(cached);
      return;
    }
    setSrcDoc(null);
    loadDeckCover(src)
      .then((next) => {
        if (!cancelled) setSrcDoc(next);
      })
      .catch(() => {
        if (!cancelled) setSrcDoc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [src]);

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

async function loadDeckCover(src: string): Promise<string> {
  const cached = deckCoverCache.get(src);
  if (cached) return cached;
  const existing = deckCoverInflight.get(src);
  if (existing) return existing;
  // Per-request AbortSignal skips GET dedupe (each card needs its own response body).
  const abort = new AbortController();
  const run = fetchTeamverDaemon(src, { signal: abort.signal })
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to load project cover: ${res.status}`);
      return res.text();
    })
    .then((html) => {
      const parsed = deckPreviewSrcDoc(html);
      deckCoverCache.set(src, parsed);
      deckCoverInflight.delete(src);
      return parsed;
    })
    .catch((error) => {
      deckCoverInflight.delete(src);
      throw error;
    });
  deckCoverInflight.set(src, run);
  return run;
}

function deckPreviewSrcDoc(html: string): string {
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
  return injectBefore(withoutScripts, "</head>", style);
}

function injectBefore(source: string, marker: string, addition: string): string {
  const index = source.toLowerCase().lastIndexOf(marker);
  if (index === -1) return `${addition}${source}`;
  return `${source.slice(0, index)}${addition}${source.slice(index)}`;
}

/** @internal vitest */
export function clearProjectDeckCoverCacheForTests(): void {
  deckCoverCache.clear();
  deckCoverInflight.clear();
}
