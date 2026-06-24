import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Icon } from "../../components/Icon";
import { isTeamverEmbedMode } from "../designApiBase";
import type { TeamverDrivePublishTarget } from "../drivePublishTargets";

type Props = {
  targets: readonly TeamverDrivePublishTarget[];
  selectedTargetId: string;
  disabled?: boolean;
  loading?: boolean;
  ariaLabel?: string;
  onChange: (targetId: string) => void;
};

/**
 * loop 173 — Custom listbox replacement for the native `<select>` used inside
 * the Teamver "Publish to Drive" share-menu row. The native control inherits
 * Chrome/Safari OS chrome and ignores our dark/light tokens, which made the
 * dropdown stand out as an unstyled OS popup on top of the Teamver embed
 * surface. The headless implementation mirrors the WAI-ARIA listbox pattern:
 *
 *   - button is the combobox-style trigger (`aria-haspopup="listbox"`,
 *     `aria-expanded`, `aria-controls`)
 *   - the popover is the listbox (`role="listbox"`)
 *   - each row is an option (`role="option"`, `aria-selected`)
 *
 * Keyboard: Arrow Up/Down moves the active option, Home/End jump to the
 * extremes, Enter / Space commits the active option, Escape closes the
 * popover, Tab closes and lets focus move naturally. Click-outside also
 * closes the popover so the share-menu doesn't trap focus.
 *
 * Tests keep using `data-testid="teamver-drive-target-select"` (now on the
 * button) plus the new `teamver-drive-target-option-{id}` hooks per row.
 */
export function TeamverDriveTargetSelect({
  targets,
  selectedTargetId,
  disabled = false,
  loading = false,
  ariaLabel = isTeamverEmbedMode() ? "Teamver 드라이브 저장 위치" : "Teamver Drive destination",
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const listboxId = useId();

  const selectedIndex = useMemo(() => {
    const idx = targets.findIndex((target) => target.id === selectedTargetId);
    return idx >= 0 ? idx : 0;
  }, [selectedTargetId, targets]);

  const selectedTarget = targets[selectedIndex];

  useEffect(() => {
    if (!open) setActiveIndex(selectedIndex);
  }, [open, selectedIndex]);

  useLayoutEffect(() => {
    if (!open) return;
    const list = listRef.current;
    if (!list) return;
    const node = list.querySelector<HTMLLIElement>(
      `[data-option-index="${activeIndex}"]`,
    );
    node?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  useEffect(() => {
    if (!open) return;
    function onDocPointer(event: PointerEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (buttonRef.current?.contains(target)) return;
      if (listRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", onDocPointer);
    return () => document.removeEventListener("pointerdown", onDocPointer);
  }, [open]);

  const commitIndex = useCallback(
    (index: number) => {
      const target = targets[index];
      if (!target) return;
      onChange(target.id);
      setOpen(false);
      // restore focus to the trigger so keyboard users keep their place
      // (the share-menu host doesn't manage focus across popover open/close).
      window.setTimeout(() => buttonRef.current?.focus(), 0);
    },
    [onChange, targets],
  );

  const handleButtonKey = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (disabled || targets.length === 0) return;
      switch (event.key) {
        case "ArrowDown":
        case "ArrowUp":
        case "Enter":
        case " ":
          event.preventDefault();
          setOpen(true);
          setActiveIndex(selectedIndex);
          break;
        case "Home":
          event.preventDefault();
          setOpen(true);
          setActiveIndex(0);
          break;
        case "End":
          event.preventDefault();
          setOpen(true);
          setActiveIndex(targets.length - 1);
          break;
      }
    },
    [disabled, selectedIndex, targets.length],
  );

  const handleListKey = useCallback(
    (event: React.KeyboardEvent<HTMLUListElement>) => {
      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          setActiveIndex((current) => (current + 1) % targets.length);
          break;
        case "ArrowUp":
          event.preventDefault();
          setActiveIndex((current) => (current - 1 + targets.length) % targets.length);
          break;
        case "Home":
          event.preventDefault();
          setActiveIndex(0);
          break;
        case "End":
          event.preventDefault();
          setActiveIndex(targets.length - 1);
          break;
        case "Enter":
        case " ":
          event.preventDefault();
          commitIndex(activeIndex);
          break;
        case "Escape":
          event.preventDefault();
          setOpen(false);
          buttonRef.current?.focus();
          break;
        case "Tab":
          setOpen(false);
          break;
      }
    },
    [activeIndex, commitIndex, targets.length],
  );

  const buttonLabel = useMemo(() => {
    if (!selectedTarget) return "선택된 위치 없음";
    if (loading) return `${selectedTarget.label} (불러오는 중…)`;
    return selectedTarget.label;
  }, [loading, selectedTarget]);

  return (
    <div
      className={`teamver-drive-select${open ? " teamver-drive-select--open" : ""}`}
    >
      <button
        ref={buttonRef}
        type="button"
        className="teamver-drive-select__button"
        data-testid="teamver-drive-target-select"
        data-state={open ? "open" : "closed"}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((prev) => !prev);
          setActiveIndex(selectedIndex);
        }}
        onKeyDown={handleButtonKey}
      >
        <span className="teamver-drive-select__value" title={selectedTarget?.label}>
          {buttonLabel}
        </span>
        <span className="teamver-drive-select__chevron" aria-hidden="true">
          <Icon name="chevron-down" size={14} />
        </span>
      </button>
      {open ? (
        <ul
          id={listboxId}
          ref={listRef}
          className="teamver-drive-select__listbox"
          data-testid="teamver-drive-target-popover"
          role="listbox"
          aria-label={ariaLabel}
          tabIndex={-1}
          onKeyDown={handleListKey}
        >
          {targets.map((target, index) => {
            const selected = target.id === selectedTargetId;
            const active = index === activeIndex;
            return (
              <li
                key={target.id}
                role="option"
                aria-selected={selected}
                data-option-index={index}
                data-testid={`teamver-drive-target-option-${target.id}`}
                className={
                  `teamver-drive-select__option${active ? " teamver-drive-select__option--active" : ""}`
                  + `${selected ? " teamver-drive-select__option--selected" : ""}`
                }
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => commitIndex(index)}
              >
                <span className="teamver-drive-select__option-label" title={target.label}>
                  {target.label}
                </span>
                {target.description ? (
                  <span className="teamver-drive-select__option-desc">{target.description}</span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
