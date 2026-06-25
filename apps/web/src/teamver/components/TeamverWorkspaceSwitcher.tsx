import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { WorkspaceListItem } from "@teamver/app-sdk";
import { Icon } from "../../components/Icon";
import { TeamverAvatarGlyph } from "./TeamverAvatarGlyph";
import {
  readWorkspaceId,
  readWorkspaceLabel,
  formatWorkspaceMenuLabel,
  isWorkspaceAppEnabled,
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

export function TeamverWorkspaceSwitcher({
  workspaces,
  activeWorkspaceId,
  onSwitch,
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | undefined>();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const active = activeWorkspaceId
    ? workspaces.find((workspace) => readWorkspaceId(workspace) === activeWorkspaceId) ?? null
    : null;
  const multiple = workspaces.length > 1;
  const activeLabel = active ? readWorkspaceLabel(active) : "워크스페이스 준비 중…";

  useLayoutEffect(() => {
    if (!open) {
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
      setMenuStyle({
        position: "fixed",
        ...(layout.top !== undefined
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

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
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

  const handleSelect = useCallback(
    (workspaceId: string, appEnabled: boolean) => {
      if (!appEnabled) return;
      setOpen(false);
      void onSwitch(workspaceId);
    },
    [onSwitch],
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
        aria-label={`워크스페이스: ${activeLabel}`}
        title={activeLabel}
        disabled={disabled || !active}
        data-testid="teamver-workspace-chip"
        onClick={() => setOpen((value) => !value)}
      >
        <WorkspaceTriggerContent workspace={active} multiple={multiple} open={open} />
      </button>
      {open && menuStyle ? (
        <div
          className="teamver-workspace-menu teamver-workspace-menu--floating"
          role="listbox"
          aria-label="워크스페이스 선택"
          style={menuStyle}
          data-testid="teamver-workspace-menu"
        >
          <p className="teamver-workspace-menu__heading">워크스페이스</p>
          {workspaces.map((workspace) => {
            const id = readWorkspaceId(workspace);
            if (!id) return null;
            const menuLabel = formatWorkspaceMenuLabel(workspace);
            const appEnabled = isWorkspaceAppEnabled(workspace);
            const selected = id === activeWorkspaceId;
            const itemLabel = readWorkspaceLabel(workspace);
            return (
              <button
                key={id}
                type="button"
                role="option"
                aria-selected={selected}
                aria-disabled={!appEnabled}
                className={`teamver-workspace-menu__item${selected ? " is-active" : ""}${appEnabled ? "" : " is-disabled"}`}
                title={menuLabel}
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
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
