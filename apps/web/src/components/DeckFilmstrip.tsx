import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
} from "react";

export type DeckFilmstripItem = {
  index: number;
  label: string;
};

/**
 * Convert an insert-before slot (0..n) to `reorderDeckSlideToIndex` toIndex.
 * Returns null when the reorder would be a no-op or the slot is out of range.
 */
export function filmstripSlotToReorderIndex(
  fromIndex: number,
  insertBeforeSlot: number,
  itemCount: number,
): number | null {
  if (!Number.isInteger(fromIndex) || !Number.isInteger(insertBeforeSlot) || !Number.isInteger(itemCount)) {
    return null;
  }
  if (itemCount < 2) return null;
  if (fromIndex < 0 || fromIndex >= itemCount) return null;
  if (insertBeforeSlot < 0 || insertBeforeSlot > itemCount) return null;
  const toIndex = fromIndex < insertBeforeSlot ? insertBeforeSlot - 1 : insertBeforeSlot;
  if (toIndex === fromIndex || toIndex < 0 || toIndex >= itemCount) return null;
  return toIndex;
}

/** Keep the active chip visible by adjusting only the filmstrip's horizontal scroll. */
export function scrollFilmstripChipIntoView(
  nav: HTMLElement,
  chip: HTMLElement,
  padPx = 8,
): void {
  const navRect = nav.getBoundingClientRect();
  const chipRect = chip.getBoundingClientRect();
  if (chipRect.left < navRect.left + padPx) {
    nav.scrollLeft -= navRect.left + padPx - chipRect.left;
  } else if (chipRect.right > navRect.right - padPx) {
    nav.scrollLeft += chipRect.right - (navRect.right - padPx);
  }
}

const EDGE_PX = 28;
const EDGE_SCROLL_STEP = 14;

export function DeckFilmstrip({
  items,
  currentSlideIndex,
  ariaLabel,
  slideLabelTemplate,
  onGo,
  onReorder,
  disabled = false,
}: {
  items: DeckFilmstripItem[];
  currentSlideIndex: number;
  ariaLabel: string;
  slideLabelTemplate: string;
  onGo: (index: number) => void;
  onReorder: (fromIndex: number, toIndex: number) => void | Promise<void>;
  disabled?: boolean;
}) {
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  /** Insert-before slot in 0..items.length while dragging. */
  const [dropSlot, setDropSlot] = useState<number | null>(null);
  const navRef = useRef<HTMLNavElement | null>(null);
  const chipRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const edgeRafRef = useRef<number | null>(null);
  const edgeDirRef = useRef<-1 | 0 | 1>(0);
  /** HTML5 DnD often synthesizes a click after dragend — suppress go in that case. */
  const suppressClickRef = useRef(false);
  const dropSlotRef = useRef<number | null>(null);

  const setDropSlotBoth = useCallback((slot: number | null) => {
    dropSlotRef.current = slot;
    setDropSlot(slot);
  }, []);

  const stopEdgeScroll = useCallback(() => {
    edgeDirRef.current = 0;
    if (edgeRafRef.current != null) {
      cancelAnimationFrame(edgeRafRef.current);
      edgeRafRef.current = null;
    }
  }, []);

  const tickEdgeScroll = useCallback(() => {
    const nav = navRef.current;
    const dir = edgeDirRef.current;
    if (!nav || dir === 0) {
      edgeRafRef.current = null;
      return;
    }
    nav.scrollLeft += dir * EDGE_SCROLL_STEP;
    edgeRafRef.current = requestAnimationFrame(tickEdgeScroll);
  }, []);

  const updateEdgeScroll = useCallback((clientX: number) => {
    const nav = navRef.current;
    if (!nav || disabled) {
      stopEdgeScroll();
      return;
    }
    const rect = nav.getBoundingClientRect();
    let dir: -1 | 0 | 1 = 0;
    if (clientX - rect.left < EDGE_PX) dir = -1;
    else if (rect.right - clientX < EDGE_PX) dir = 1;

    if (dir === 0) {
      if (edgeDirRef.current !== 0) stopEdgeScroll();
      return;
    }
    const restart = edgeDirRef.current !== dir || edgeRafRef.current == null;
    edgeDirRef.current = dir;
    if (restart && edgeRafRef.current == null) {
      edgeRafRef.current = requestAnimationFrame(tickEdgeScroll);
    }
  }, [disabled, stopEdgeScroll, tickEdgeScroll]);

  useEffect(() => () => stopEdgeScroll(), [stopEdgeScroll]);

  useEffect(() => {
    chipRefs.current.length = items.length;
  }, [items.length]);

  useEffect(() => {
    if (disabled || draggingIndex != null) return;
    const nav = navRef.current;
    const chip = chipRefs.current[currentSlideIndex];
    if (!nav || !chip) return;
    scrollFilmstripChipIntoView(nav, chip);
  }, [currentSlideIndex, items.length, disabled, draggingIndex]);

  const resolveSlotFromPoint = useCallback((clientX: number, overIndex: number): number => {
    const chip = chipRefs.current[overIndex];
    if (!chip) return overIndex;
    const rect = chip.getBoundingClientRect();
    const mid = rect.left + rect.width / 2;
    return clientX < mid ? overIndex : overIndex + 1;
  }, []);

  /** Resolve insert slot from X even when the pointer is in the gap between chips. */
  const resolveSlotFromClientX = useCallback((clientX: number): number => {
    const chips = chipRefs.current;
    const n = items.length;
    if (n === 0) return 0;
    for (let i = 0; i < n; i += 1) {
      const chip = chips[i];
      if (!chip) continue;
      const rect = chip.getBoundingClientRect();
      if (clientX < rect.left) return i;
      if (clientX <= rect.right) {
        return clientX < rect.left + rect.width / 2 ? i : i + 1;
      }
    }
    return n;
  }, [items.length]);

  const handleDragStart = useCallback((index: number) => (event: DragEvent<HTMLButtonElement>) => {
    if (disabled) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.setData("text/plain", String(index));
    event.dataTransfer.effectAllowed = "move";
    suppressClickRef.current = true;
    setDraggingIndex(index);
    setDropSlotBoth(null);
  }, [disabled, setDropSlotBoth]);

  const handleChipDragOver = useCallback((index: number) => (event: DragEvent<HTMLButtonElement>) => {
    if (disabled) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    setDropSlotBoth(resolveSlotFromPoint(event.clientX, index));
    updateEdgeScroll(event.clientX);
  }, [disabled, resolveSlotFromPoint, setDropSlotBoth, updateEdgeScroll]);

  const handleNavDragOver = useCallback((event: DragEvent<HTMLElement>) => {
    if (disabled || draggingIndex == null) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    updateEdgeScroll(event.clientX);
    setDropSlotBoth(resolveSlotFromClientX(event.clientX));
  }, [disabled, draggingIndex, resolveSlotFromClientX, setDropSlotBoth, updateEdgeScroll]);

  const commitDrop = useCallback((fromRaw: string, insertBeforeSlot: number | null) => {
    stopEdgeScroll();
    setDraggingIndex(null);
    setDropSlotBoth(null);
    const fromIndex = Number.parseInt(fromRaw, 10);
    if (!Number.isInteger(fromIndex) || insertBeforeSlot == null) return;
    const toIndex = filmstripSlotToReorderIndex(fromIndex, insertBeforeSlot, items.length);
    if (toIndex == null) return;
    void onReorder(fromIndex, toIndex);
  }, [items.length, onReorder, setDropSlotBoth, stopEdgeScroll]);

  const handleDrop = useCallback((index: number) => (event: DragEvent<HTMLButtonElement>) => {
    if (disabled) return;
    event.preventDefault();
    event.stopPropagation();
    const slot = resolveSlotFromPoint(event.clientX, index);
    commitDrop(event.dataTransfer.getData("text/plain"), slot);
  }, [commitDrop, disabled, resolveSlotFromPoint]);

  const handleNavDrop = useCallback((event: DragEvent<HTMLElement>) => {
    if (disabled) return;
    event.preventDefault();
    const slot = dropSlotRef.current ?? resolveSlotFromClientX(event.clientX);
    commitDrop(event.dataTransfer.getData("text/plain"), slot);
  }, [commitDrop, disabled, resolveSlotFromClientX]);

  const handleDragEnd = useCallback(() => {
    stopEdgeScroll();
    setDraggingIndex(null);
    setDropSlotBoth(null);
    // Consume the synthetic post-drag click, then allow the next real click.
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  }, [setDropSlotBoth, stopEdgeScroll]);

  if (items.length === 0) return null;

  return (
    <nav
      ref={navRef}
      className={["deck-filmstrip", disabled ? "is-disabled" : ""].filter(Boolean).join(" ")}
      aria-label={ariaLabel}
      data-testid="deck-filmstrip"
      aria-disabled={disabled ? "true" : undefined}
      onDragOver={handleNavDragOver}
      onDrop={handleNavDrop}
    >
      <ol className="deck-filmstrip__list">
        {items.map((item) => {
          const slideNumber = item.index + 1;
          const title = slideLabelTemplate.replace("{{n}}", String(slideNumber));
          const heading = item.label.replace(/\s+/g, " ").trim();
          const showHeading = Boolean(heading) && heading !== String(slideNumber);
          const current = item.index === currentSlideIndex;
          const showGapBefore =
            draggingIndex != null && dropSlot === item.index;
          return (
            <li
              key={item.index}
              className={showGapBefore ? "is-drop-before" : undefined}
              data-drop-before={showGapBefore ? "true" : undefined}
            >
              <button
                type="button"
                ref={(node) => {
                  chipRefs.current[item.index] = node;
                }}
                className={[
                  "deck-filmstrip__chip",
                  showHeading ? "has-title" : "",
                  current ? "is-current" : "",
                  draggingIndex === item.index ? "is-dragging" : "",
                ].filter(Boolean).join(" ")}
                draggable={!disabled}
                disabled={disabled}
                aria-current={current ? "true" : undefined}
                aria-label={showHeading ? `${title} · ${heading}` : title}
                title={showHeading ? heading : title}
                data-testid={current ? "deck-filmstrip-current" : undefined}
                onClick={() => {
                  if (disabled) return;
                  if (suppressClickRef.current) {
                    suppressClickRef.current = false;
                    return;
                  }
                  onGo(item.index);
                }}
                onDragStart={handleDragStart(item.index)}
                onDragOver={handleChipDragOver(item.index)}
                onDrop={handleDrop(item.index)}
                onDragEnd={handleDragEnd}
              >
                <span className="deck-filmstrip__num" aria-hidden="true">{slideNumber}</span>
                {showHeading ? (
                  <span className="deck-filmstrip__title" aria-hidden="true">{heading}</span>
                ) : null}
              </button>
            </li>
          );
        })}
        {draggingIndex != null && dropSlot === items.length ? (
          <li className="is-drop-before is-drop-tail" data-drop-before="true" aria-hidden="true" />
        ) : null}
      </ol>
    </nav>
  );
}
