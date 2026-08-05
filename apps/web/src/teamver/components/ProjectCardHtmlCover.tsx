import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";

import { isTeamverEmbedMode } from "../designApiBase";
import {
  buildHtmlCoverSrcDoc,
  HTML_COVER_CANVAS_HEIGHT,
  HTML_COVER_CANVAS_WIDTH,
} from "../htmlCoverSrcDoc";
import { fetchTeamverDaemon } from "../teamverDaemonHeaders";
import {
  projectScopedPreviewUrl,
  resolveTeamverProjectPreviewPrefix,
} from "../teamverProjectPreviewScope";

export {
  buildHtmlCoverSrcDoc,
  deckPreviewSrcDoc,
  extractCoverSlideSections,
  htmlLooksLikeMultiSlideDeck,
  isolateFirstDeckSlideHtml,
  pagePreviewSrcDoc,
  type CoverSlideSection,
} from "../htmlCoverSrcDoc";

const htmlCoverCache = new Map<string, string>();
const htmlCoverInflight = new Map<string, Promise<string>>();

const VIEWPORT_ROOT_MARGIN_PX = 160;

function isNearViewport(node: Element): boolean {
  const rect = node.getBoundingClientRect();
  return (
    rect.bottom >= -VIEWPORT_ROOT_MARGIN_PX &&
    rect.top <= window.innerHeight + VIEWPORT_ROOT_MARGIN_PX
  );
}

export type ProjectCardHtmlCoverProps = {
  src: string;
  /** Deck projects — first-slide layout CSS; prototypes use a simpler clip. */
  deckCoverOnly?: boolean;
  /**
   * When true (default in Teamver embed), wait until the card is near the
   * viewport before fetching `/raw` + minting `preview-url`. Standalone OD
   * still loads immediately so existing thumbnails keep painting.
   */
  deferUntilVisible?: boolean;
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
  deferUntilVisible = isTeamverEmbedMode(),
  iframeClassName = "thumb-iframe",
  deckFrameClassName = "project-thumb-deck-frame",
  deckIframeClassName = "project-thumb-deck-iframe",
  deckLoadingClassName = "project-thumb-deck-loading",
}: ProjectCardHtmlCoverProps) {
  return (
    <AuthenticatedHtmlCover
      src={src}
      mode={deckCoverOnly ? "deck" : "page"}
      deferUntilVisible={deferUntilVisible}
      deckFrameClassName={deckFrameClassName}
      deckIframeClassName={deckIframeClassName || iframeClassName}
      deckLoadingClassName={deckLoadingClassName}
    />
  );
}

function AuthenticatedHtmlCover({
  src,
  mode,
  deferUntilVisible,
  deckFrameClassName,
  deckIframeClassName,
  deckLoadingClassName,
}: {
  src: string;
  mode: "deck" | "page";
  deferUntilVisible: boolean;
  deckFrameClassName: string;
  deckIframeClassName: string;
  deckLoadingClassName: string;
}) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  // Cache by path without ?v= so mtime bumps / remounts reuse HTML; still fetch
  // the busted URL when the cache misses. Prefixed with builder version so
  // logic bumps do not serve stale full-deck thumbs from the in-memory Map.
  const cacheKey = `v2:${mode}:${src.split(/[?#]/u, 1)[0] ?? src}`;
  const [visible, setVisible] = useState(() => {
    if (!deferUntilVisible) return true;
    return htmlCoverCache.has(cacheKey);
  });
  const [srcDoc, setSrcDoc] = useState<string | null>(() => htmlCoverCache.get(cacheKey) ?? null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (!deferUntilVisible) {
      setVisible(true);
      return;
    }
    if (htmlCoverCache.has(cacheKey)) {
      setVisible(true);
      return;
    }
    let cancelled = false;
    let observer: IntersectionObserver | null = null;
    let raf = 0;
    let attempts = 0;
    const attach = () => {
      if (cancelled) return;
      const node = frameRef.current;
      if (!node) {
        // First paint can run the effect before the frame ref is committed.
        // Retry a few frames instead of leaving visible=false forever.
        attempts += 1;
        if (attempts > 8) {
          setVisible(true);
          return;
        }
        raf = requestAnimationFrame(attach);
        return;
      }
      if (typeof IntersectionObserver === "undefined" || isNearViewport(node)) {
        setVisible(true);
        return;
      }
      observer = new IntersectionObserver(
        ([entry]) => {
          if (!entry?.isIntersecting) return;
          setVisible(true);
          observer?.disconnect();
        },
        { rootMargin: `${VIEWPORT_ROOT_MARGIN_PX}px` },
      );
      observer.observe(node);
    };
    attach();
    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      observer?.disconnect();
    };
  }, [cacheKey, deferUntilVisible]);

  useEffect(() => {
    if (!visible) return;
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
  }, [cacheKey, mode, src, visible]);

  useEffect(() => {
    const node = frameRef.current;
    if (!node) return;
    const update = () => {
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      setScale(Math.min(rect.width / HTML_COVER_CANVAS_WIDTH, rect.height / HTML_COVER_CANVAS_HEIGHT));
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
            width: HTML_COVER_CANVAS_WIDTH,
            height: HTML_COVER_CANVAS_HEIGHT,
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
  const cacheKey = cacheKeyOverride ?? `v2:${mode}:${src.split(/[?#]/u, 1)[0] ?? src}`;
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
    const parsed = buildHtmlCoverSrcDoc(html, baseHref, { preferDeck: mode === "deck" });
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

/** @internal vitest */
export function clearProjectDeckCoverCacheForTests(): void {
  htmlCoverCache.clear();
  htmlCoverInflight.clear();
}
