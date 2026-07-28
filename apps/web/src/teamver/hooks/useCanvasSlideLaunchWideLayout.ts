import { useEffect, useState } from "react";

const WIDE_LAYOUT_QUERY = "(min-width: 720px)";

/**
 * True when the viewport is wide enough for the 2-column studio layout
 * (paired with `teamver-canvas-slide-launch-modal--wide` in CSS).
 */
export function useCanvasSlideLaunchWideLayout(enabled: boolean): boolean {
  const [wide, setWide] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setWide(false);
      return;
    }
    if (typeof window.matchMedia !== "function") {
      // Mobile-first default for SSR / jsdom — studio only when the query matches.
      setWide(false);
      return;
    }
    const mq = window.matchMedia(WIDE_LAYOUT_QUERY);
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [enabled]);

  return wide;
}
