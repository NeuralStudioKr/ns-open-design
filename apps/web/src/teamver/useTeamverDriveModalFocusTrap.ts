import { useEffect, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function listFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (node) => !node.hasAttribute("disabled") && node.getAttribute("aria-hidden") !== "true",
  );
}

/**
 * Trap Tab focus inside a Drive dialog while open, focus an initial control,
 * and restore the previously focused element on close.
 */
export function useTeamverDriveModalFocusTrap(
  open: boolean,
  containerRef: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const maybeContainer = containerRef.current;
    if (!maybeContainer) return;
    const container: HTMLElement = maybeContainer;

    // Snapshot before we move focus into the dialog (and before rAF).
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
      && !container.contains(document.activeElement)
        ? document.activeElement
        : null;

    const focusInitial = () => {
      const preferred =
        container.querySelector<HTMLElement>("[data-teamver-drive-autofocus='true']")
        ?? listFocusable(container)[0]
        ?? container;
      preferred.focus();
    };

    // After portal paint / autofocus props settle.
    const frame = window.requestAnimationFrame(focusInitial);

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Tab") return;
      // Nested Drive portals (picker over publish) own their own trap;
      // ignore Tab events that did not originate inside this dialog.
      if (!container.contains(event.target as Node | null)) return;
      const focusable = listFocusable(container);
      if (focusable.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;
      if (event.shiftKey) {
        if (active === first || !container.contains(active)) {
          event.preventDefault();
          last.focus();
        }
        return;
      }
      if (active === last || !container.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    }

    container.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      container.removeEventListener("keydown", onKeyDown);
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, [containerRef, open]);
}
