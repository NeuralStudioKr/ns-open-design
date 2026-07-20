import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import type { WorkspaceListItem } from "@teamver/app-sdk";
import { Icon } from "../../components/Icon";
import { TeamverAvatarGlyph } from "./TeamverAvatarGlyph";
import {
  readWorkspaceId,
  readWorkspaceLabel,
  formatWorkspaceMenuLabel,
  isWorkspaceAppEnabled,
  readAppDisabledReason,
} from "../workspaceUtils";
import { readWorkspaceImageUrl } from "../teamverEmbedVisuals";
import { computeWorkspaceMenuLayout } from "../teamverWorkspaceMenuLayout";

type Props = {
  workspaces: WorkspaceListItem[];
  activeWorkspaceId: string | null;
  onSwitch: (workspaceId: string) => void | Promise<void>;
  disabled?: boolean;
};

function WorkspaceTriggerContent({
  workspace,
  multiple,
  open,
}: {
  workspace: WorkspaceListItem | null;
  multiple: boolean;
  open: boolean;
}) {
  const label = readWorkspaceLabel(workspace);
  return (
    <>
      <TeamverAvatarGlyph
        imageUrl={readWorkspaceImageUrl(workspace)}
        label={label}
        size="md"
        className="teamver-workspace-trigger__glyph"
      />
      <span className="teamver-workspace-trigger__label" title={label}>
        {label}
      </span>
      {multiple ? (
        <Icon
          name="chevron-down"
          size={14}
          className={`teamver-workspace-trigger__chevron${open ? " is-open" : ""}`}
        />
      ) : null}
    </>
  );
}

function collectSelectableIds(workspaces: WorkspaceListItem[]): string[] {
  const ids: string[] = [];
  for (const workspace of workspaces) {
    const id = readWorkspaceId(workspace);
    if (!id || !isWorkspaceAppEnabled(workspace)) continue;
    ids.push(id);
  }
  return ids;
}

export function TeamverWorkspaceSwitcher({
  workspaces,
  activeWorkspaceId,
  onSwitch,
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | undefined>();
  const [menuPlacement, setMenuPlacement] = useState<"below" | "above">("below");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const itemRefs = useRef(new Map<string, HTMLButtonElement>());
  const focusedOnOpenRef = useRef(false);
  const menuId = useId();
  const headingId = useId();

  const active = activeWorkspaceId
    ? workspaces.find((workspace) => readWorkspaceId(workspace) === activeWorkspaceId) ?? null
    : null;
  const multiple = workspaces.length > 1;
  const activeLabel = active ? readWorkspaceLabel(active) : "워크스페이스 준비 중…";

  const focusOption = useCallback((workspaceId: string | null | undefined) => {
    if (!workspaceId) return;
    itemRefs.current.get(workspaceId)?.focus();
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      focusedOnOpenRef.current = false;
      setMenuStyle(undefined);
      return;
    }

    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const layout = computeWorkspaceMenuLayout(rect, {
        width: window.innerWidth,
        height: window.innerHeight,
      });
      const opensBelow = layout.top !== undefined;
      setMenuPlacement(opensBelow ? "below" : "above");
      setMenuStyle({
        position: "fixed",
        ...(opensBelow
          ? { top: layout.top, bottom: "auto" }
          : { top: "auto", bottom: layout.bottom }),
        left: layout.left,
        width: layout.width,
        maxHeight: layout.maxHeight,
        overflowY: "auto",
        zIndex: 1000,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  // Focus once when the menu first mounts — do not steal focus on scroll/resize
  // reposition (menuStyle identity changes every updatePosition call).
  useLayoutEffect(() => {
    if (!open || !menuStyle || focusedOnOpenRef.current) return;
    focusedOnOpenRef.current = true;
    const selectable = collectSelectableIds(workspaces);
    const preferred =
      (activeWorkspaceId && selectable.includes(activeWorkspaceId) ? activeWorkspaceId : null) ??
      selectable[0] ??
      null;
    focusOption(preferred);
  }, [open, menuStyle, workspaces, activeWorkspaceId, focusOption]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (workspaces.length < 2) setOpen(false);
  }, [workspaces.length]);

  const handleSelect = useCallback(
    (workspaceId: string, appEnabled: boolean) => {
      if (!appEnabled) return;
      setOpen(false);
      triggerRef.current?.focus();
      if (workspaceId === activeWorkspaceId) return;
      void onSwitch(workspaceId);
    },
    [onSwitch, activeWorkspaceId],
  );

  const moveFocus = useCallback(
    (delta: 1 | -1 | "start" | "end") => {
      const selectable = collectSelectableIds(workspaces);
      if (selectable.length === 0) return;
      const activeEl = document.activeElement;
      const currentId =
        activeEl instanceof HTMLElement
          ? activeEl.getAttribute("data-workspace-id")
          : null;
      const currentIndex = currentId ? selectable.indexOf(currentId) : -1;
      let nextIndex = 0;
      if (delta === "start") nextIndex = 0;
      else if (delta === "end") nextIndex = selectable.length - 1;
      else if (currentIndex < 0) nextIndex = delta === 1 ? 0 : selectable.length - 1;
      else nextIndex = (currentIndex + delta + selectable.length) % selectable.length;
      focusOption(selectable[nextIndex]);
    },
    [workspaces, focusOption],
  );

  const handleMenuKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          moveFocus(1);
          break;
        case "ArrowUp":
          event.preventDefault();
          moveFocus(-1);
          break;
        case "Home":
          event.preventDefault();
          moveFocus("start");
          break;
        case "End":
          event.preventDefault();
          moveFocus("end");
          break;
        case "Tab":
          // Return focus to the trigger before unmount so Tab continues from there.
          setOpen(false);
          triggerRef.current?.focus();
          break;
        default:
          break;
      }
    },
    [moveFocus],
  );

  const handleTriggerKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (event.key === "ArrowDown" && !open) {
        event.preventDefault();
        setOpen(true);
      }
    },
    [open],
  );

  if (workspaces.length === 0) return null;

  if (!active) {
    return (
      <div
        className="teamver-workspace-switcher teamver-workspace-switcher--static teamver-workspace-switcher--pending"
        data-testid="teamver-workspace-switcher"
        data-workspace-ready="false"
      >
        <span
          className="teamver-workspace-trigger teamver-workspace-trigger--pending"
          title={activeLabel}
          aria-label={`워크스페이스: ${activeLabel}`}
          data-testid="teamver-workspace-chip"
        >
          <span className="teamver-workspace-trigger__label">{activeLabel}</span>
        </span>
      </div>
    );
  }

  if (!multiple) {
    return (
      <div
        className="teamver-workspace-switcher teamver-workspace-switcher--static"
        data-testid="teamver-workspace-switcher"
        data-workspace-ready="true"
      >
        <span
          className="teamver-workspace-trigger"
          title={activeLabel}
          aria-label={`워크스페이스: ${activeLabel}`}
          data-testid="teamver-workspace-chip"
        >
          <WorkspaceTriggerContent workspace={active} multiple={false} open={false} />
        </span>
      </div>
    );
  }

  return (
    <div className="teamver-workspace-switcher" ref={rootRef} data-testid="teamver-workspace-switcher">
      <button
        ref={triggerRef}
        type="button"
        className="teamver-workspace-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`워크스페이스: ${activeLabel}`}
        title={activeLabel}
        disabled={disabled || !active}
        data-testid="teamver-workspace-chip"
        onClick={() => setOpen((value) => !value)}
        onKeyDown={handleTriggerKeyDown}
      >
        <WorkspaceTriggerContent workspace={active} multiple={multiple} open={open} />
      </button>
      {open && menuStyle ? (
        <div
          id={menuId}
          className="teamver-workspace-menu teamver-workspace-menu--floating"
          role="listbox"
          aria-labelledby={headingId}
          style={menuStyle}
          data-placement={menuPlacement}
          data-testid="teamver-workspace-menu"
          onKeyDown={handleMenuKeyDown}
        >
          <div id={headingId} className="teamver-workspace-menu__heading">
            워크스페이스
          </div>
          {workspaces.map((workspace) => {
            const id = readWorkspaceId(workspace);
            if (!id) return null;
            const menuLabel = formatWorkspaceMenuLabel(workspace, "비활성");
            const appEnabled = isWorkspaceAppEnabled(workspace);
            const selected = id === activeWorkspaceId;
            const itemLabel = readWorkspaceLabel(workspace);
            const disabledReason = readAppDisabledReason(workspace);
            return (
              <button
                key={id}
                ref={(node) => {
                  if (node) itemRefs.current.set(id, node);
                  else itemRefs.current.delete(id);
                }}
                type="button"
                role="option"
                data-workspace-id={id}
                tabIndex={selected && appEnabled ? 0 : -1}
                aria-selected={selected}
                aria-disabled={!appEnabled}
                className={`teamver-workspace-menu__item${selected ? " is-active" : ""}${appEnabled ? "" : " is-disabled"}`}
                title={appEnabled ? menuLabel : disabledReason || menuLabel}
                onClick={() => handleSelect(id, appEnabled)}
                disabled={!appEnabled}
              >
                <TeamverAvatarGlyph
                  imageUrl={readWorkspaceImageUrl(workspace)}
                  label={itemLabel}
                  size="sm"
                  className="teamver-workspace-menu__glyph"
                />
                <span className="teamver-workspace-menu__label">{menuLabel}</span>
                {selected ? (
                  <Icon name="check" size={14} className="teamver-workspace-menu__check" />
                ) : (
                  <span className="teamver-workspace-menu__check-slot" aria-hidden />
                )}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
