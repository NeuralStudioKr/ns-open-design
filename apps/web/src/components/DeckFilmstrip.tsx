import { useCallback, useState, type DragEvent } from "react";

export type DeckFilmstripItem = {
  index: number;
  label: string;
};

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
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const handleDragStart = useCallback((index: number) => (event: DragEvent<HTMLButtonElement>) => {
    if (disabled) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.setData("text/plain", String(index));
    event.dataTransfer.effectAllowed = "move";
    setDraggingIndex(index);
  }, [disabled]);

  const handleDragOver = useCallback((index: number) => (event: DragEvent<HTMLButtonElement>) => {
    if (disabled) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropIndex(index);
  }, [disabled]);

  const handleDrop = useCallback((index: number) => (event: DragEvent<HTMLButtonElement>) => {
    if (disabled) return;
    event.preventDefault();
    const raw = event.dataTransfer.getData("text/plain");
    const fromIndex = Number.parseInt(raw, 10);
    setDraggingIndex(null);
    setDropIndex(null);
    if (!Number.isInteger(fromIndex) || fromIndex === index) return;
    void onReorder(fromIndex, index);
  }, [disabled, onReorder]);

  const handleDragEnd = useCallback(() => {
    setDraggingIndex(null);
    setDropIndex(null);
  }, []);

  if (items.length === 0) return null;

  return (
    <nav
      className={["deck-filmstrip", disabled ? "is-disabled" : ""].filter(Boolean).join(" ")}
      aria-label={ariaLabel}
      data-testid="deck-filmstrip"
      aria-disabled={disabled ? "true" : undefined}
    >
      <ol className="deck-filmstrip__list">
        {items.map((item) => {
          const slideNumber = item.index + 1;
          const title = slideLabelTemplate.replace("{{n}}", String(slideNumber));
          const current = item.index === currentSlideIndex;
          return (
            <li key={item.index}>
              <button
                type="button"
                className={[
                  "deck-filmstrip__chip",
                  current ? "is-current" : "",
                  draggingIndex === item.index ? "is-dragging" : "",
                  dropIndex === item.index ? "is-drop-target" : "",
                ].filter(Boolean).join(" ")}
                draggable={!disabled}
                disabled={disabled}
                aria-current={current ? "true" : undefined}
                title={item.label}
                onClick={() => {
                  if (disabled) return;
                  onGo(item.index);
                }}
                onDragStart={handleDragStart(item.index)}
                onDragOver={handleDragOver(item.index)}
                onDrop={handleDrop(item.index)}
                onDragEnd={handleDragEnd}
              >
                <span className="deck-filmstrip__num" aria-hidden="true">{slideNumber}</span>
                <span className="sr-only">{title}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
