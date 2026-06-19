import { useMemo, useState } from "react";
import { Icon } from "../../components/Icon";
import type { TeamverDrivePublishTarget } from "../drivePublishTargets";

type Props = {
  open: boolean;
  targets: TeamverDrivePublishTarget[];
  selectedTargetId: string;
  loading?: boolean;
  onSelect: (targetId: string) => void;
  onClose: () => void;
};

function matchesTarget(target: TeamverDrivePublishTarget, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [target.label, target.description, target.folderId ?? "", target.sharedDriveId ?? ""]
    .join(" ")
    .toLowerCase()
    .includes(q);
}

export function TeamverDrivePickerModal({
  open,
  targets,
  selectedTargetId,
  loading = false,
  onSelect,
  onClose,
}: Props) {
  const [query, setQuery] = useState("");
  const filteredTargets = useMemo(
    () => targets.filter((target) => matchesTarget(target, query)),
    [query, targets],
  );

  if (!open) return null;

  return (
    <div
      className="teamver-drive-picker-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="teamver-drive-picker-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="teamver-drive-picker-title"
        data-testid="teamver-drive-picker-modal"
      >
        <header className="teamver-drive-picker-head">
          <div>
            <h2 id="teamver-drive-picker-title">Choose Drive folder</h2>
            <p>Pick a personal or team Drive destination for this export.</p>
          </div>
          <button
            type="button"
            className="teamver-drive-picker-close"
            aria-label="Close Drive picker"
            onClick={onClose}
          >
            <Icon name="close" size={16} />
          </button>
        </header>

        <label className="teamver-drive-picker-search">
          <Icon name="search" size={14} />
          <input
            autoFocus
            value={query}
            aria-label="Search Drive folders"
            placeholder="Search folders"
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </label>

        <div className="teamver-drive-picker-list" role="listbox" aria-label="Drive folders">
          {loading ? (
            <div className="teamver-drive-picker-empty">Loading Drive folders…</div>
          ) : filteredTargets.length > 0 ? (
            filteredTargets.map((target) => {
              const selected = target.id === selectedTargetId;
              return (
                <button
                  key={target.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`teamver-drive-picker-row${selected ? " is-selected" : ""}`}
                  data-testid={`teamver-drive-picker-target-${target.id}`}
                  onClick={() => {
                    onSelect(target.id);
                    onClose();
                  }}
                >
                  <span className="teamver-drive-picker-row-icon">
                    <Icon name={target.sharedDriveId ? "folder-filled" : "folder"} size={15} />
                  </span>
                  <span className="teamver-drive-picker-row-copy">
                    <span>{target.label}</span>
                    <small>{target.description}</small>
                  </span>
                  {selected ? <Icon name="check" size={15} /> : null}
                </button>
              );
            })
          ) : (
            <div className="teamver-drive-picker-empty">No matching folders</div>
          )}
        </div>
      </section>
    </div>
  );
}
