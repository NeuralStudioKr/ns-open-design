import { useEffect, useRef, type RefObject } from "react";

type Options = {
  enabled: boolean;
  hasMore: boolean;
  loading: boolean;
  rootRef: RefObject<HTMLElement | null>;
  onLoadMore: () => void;
  /** Extra px before the sentinel enters the scroll root. */
  rootMargin?: string;
};

/**
 * Observes a bottom sentinel inside `rootRef` and calls `onLoadMore` when the
 * user scrolls near the end of the drive browse list (cursor pagination).
 */
export function useTeamverDriveBrowseInfiniteScroll({
  enabled,
  hasMore,
  loading,
  rootRef,
  onLoadMore,
  rootMargin = "160px",
}: Options) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const onLoadMoreRef = useRef(onLoadMore);
  onLoadMoreRef.current = onLoadMore;

  useEffect(() => {
    if (!enabled || !hasMore || loading) return;
    const root = rootRef.current;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    if (typeof IntersectionObserver === "undefined") {
      onLoadMoreRef.current();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        onLoadMoreRef.current();
      },
      { root, rootMargin, threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [enabled, hasMore, loading, rootMargin, rootRef]);

  return sentinelRef;
}
