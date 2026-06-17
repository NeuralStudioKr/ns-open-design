import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceListItem } from "@teamver/app-sdk";
import { readWorkspaceId, readWorkspaceLabel, workspaceInitial, formatWorkspaceMenuLabel, isWorkspaceAppEnabled } from "../workspaceUtils";

type Props = {
  workspaces: WorkspaceListItem[];
  activeWorkspaceId: string | null;
  onSwitch: (workspaceId: string) => void | Promise<void>;
  disabled?: boolean;
};

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
    (workspaceId: string) => {
      setOpen(false);
      void onSwitch(workspaceId);
    },
    [onSwitch],
  );

  if (workspaces.length === 0) return null;

  const activeLabel = readWorkspaceLabel(active);

  if (workspaces.length === 1) {
    return (
      <span
        className="teamver-workspace-chip"
        title={activeLabel}
        aria-label={activeLabel}
        data-testid="teamver-workspace-chip"
      >
        {workspaceInitial(active)}
      </span>
    );
  }

  return (
    <div className="teamver-workspace-switcher" ref={rootRef} data-testid="teamver-workspace-switcher">
      <button
        type="button"
        className="teamver-workspace-chip"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Workspace: ${activeLabel}`}
        title={activeLabel}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        {workspaceInitial(active)}
      </button>
      {open ? (
        <div className="teamver-workspace-menu" role="listbox" aria-label="Select workspace">
          {workspaces.map((workspace) => {
            const id = readWorkspaceId(workspace);
            if (!id) return null;
            const menuLabel = formatWorkspaceMenuLabel(workspace);
            const appEnabled = isWorkspaceAppEnabled(workspace);
            const selected = id === activeWorkspaceId;
            return (
              <button
                key={id}
                type="button"
                role="option"
                aria-selected={selected}
                aria-disabled={!appEnabled}
                className={`teamver-workspace-menu__item${selected ? " is-active" : ""}${appEnabled ? "" : " is-disabled"}`}
                title={menuLabel}
                onClick={() => handleSelect(id)}
              >
                <span className="teamver-workspace-menu__initial" aria-hidden>
                  {workspaceInitial(workspace)}
                </span>
                <span className="teamver-workspace-menu__label">{menuLabel}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
