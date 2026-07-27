import { useEffect, useRef, type RefObject } from "react";

type Options = {
  enabled: boolean;
  hasMore: boolean;
  loading: boolean;
  rootRef: RefObject<HTMLElement | null>;
  /** Bump when list content changes (e.g. row counts) so layout is re-measured. */
  contentKey: string;
  onLoadMore: () => void;
  maxChase?: number;
  /** When these change, the chase counter resets (scope/folder/search). */
  resetKey: string;
};

/**
 * When the scroll root is not filled (short first page), prefetch more browse pages
 * so the sentinel/scroll UX kicks in without forcing the user to wiggle-scroll.
 */
export function useTeamverDriveBrowseFillShortPage({
  enabled,
  hasMore,
  loading,
  rootRef,
  contentKey,
  onLoadMore,
  maxChase = 5,
  resetKey,
}: Options) {
  const chaseRef = useRef(0);
  const onLoadMoreRef = useRef(onLoadMore);
  onLoadMoreRef.current = onLoadMore;

  useEffect(() => {
    chaseRef.current = 0;
  }, [resetKey]);

  useEffect(() => {
    if (!enabled || !hasMore || loading) return;
    const root = rootRef.current;
    if (!root) return;

    const raf = window.requestAnimationFrame(() => {
      if (root.clientHeight <= 0) return;
      if (root.scrollHeight > root.clientHeight + 12) {
        chaseRef.current = 0;
        return;
      }
      if (chaseRef.current >= maxChase) return;
      chaseRef.current += 1;
      onLoadMoreRef.current();
    });

    return () => window.cancelAnimationFrame(raf);
  }, [contentKey, enabled, hasMore, loading, maxChase, rootRef]);
}
