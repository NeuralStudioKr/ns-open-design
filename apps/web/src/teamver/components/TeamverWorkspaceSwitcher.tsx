import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceListItem } from "@teamver/app-sdk";
import { Icon } from "../../components/Icon";
import { TeamverAvatarGlyph } from "./TeamverAvatarGlyph";
import {
  readWorkspaceId,
  readWorkspaceLabel,
  formatWorkspaceMenuLabel,
  isWorkspaceAppEnabled,
} from "../workspaceUtils";
import {
  readWorkspaceImageUrl,
  workspaceNameInitial,
} from "../teamverEmbedVisuals";

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
  const rootRef = useRef<HTMLDivElement | null>(null);

  const active =
    workspaces.find((workspace) => readWorkspaceId(workspace) === activeWorkspaceId) ??
    workspaces[0] ??
    null;

  const multiple = workspaces.length > 1;
  const activeLabel = readWorkspaceLabel(active);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
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

  if (!multiple) {
    return (
      <div
        className="teamver-workspace-switcher teamver-workspace-switcher--static"
        data-testid="teamver-workspace-switcher"
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
        type="button"
        className="teamver-workspace-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`워크스페이스: ${activeLabel}`}
        title={activeLabel}
        disabled={disabled}
        data-testid="teamver-workspace-chip"
        onClick={() => setOpen((value) => !value)}
      >
        <WorkspaceTriggerContent workspace={active} multiple={multiple} open={open} />
      </button>
      {open ? (
        <div className="teamver-workspace-menu" role="listbox" aria-label="워크스페이스 선택">
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
