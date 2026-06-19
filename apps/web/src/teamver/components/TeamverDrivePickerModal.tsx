import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../components/Icon";
import {
  TEAMVER_DRIVE_PUBLISH_SEARCH_MIN,
  type TeamverDrivePublishTarget,
} from "../drivePublishTargets";

type Props = {
  open: boolean;
  targets: TeamverDrivePublishTarget[];
  selectedTargetId: string;
  loading?: boolean;
  onSearch?: (query: string) => Promise<TeamverDrivePublishTarget[]>;
  onSelect: (target: TeamverDrivePublishTarget) => void;
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
  onSearch,
  onSelect,
  onClose,
}: Props) {
  const [query, setQuery] = useState("");
  const [searchTargets, setSearchTargets] = useState<TeamverDrivePublishTarget[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const filteredTargets = useMemo(
    () => targets.filter((target) => matchesTarget(target, query)),
    [query, targets],
  );
  const trimmedQuery = query.trim();
  const searching = Boolean(onSearch && trimmedQuery.length >= TEAMVER_DRIVE_PUBLISH_SEARCH_MIN);
  const displayedTargets = searching && searchTargets ? searchTargets : filteredTargets;

  useEffect(() => {
    if (!open || !onSearch || trimmedQuery.length < TEAMVER_DRIVE_PUBLISH_SEARCH_MIN) {
      setSearchTargets(null);
      setSearchLoading(false);
      setSearchError(null);
      return;
    }
    let canceled = false;
    setSearchLoading(true);
    setSearchError(null);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const results = await onSearch(trimmedQuery);
          if (!canceled) setSearchTargets(results);
        } catch {
          if (!canceled) {
            setSearchTargets([]);
            setSearchError("Drive search failed");
          }
        } finally {
          if (!canceled) setSearchLoading(false);
        }
      })();
    }, 250);
    return () => {
      canceled = true;
      window.clearTimeout(timer);
    };
  }, [onSearch, open, trimmedQuery]);

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
          {loading || (searchLoading && displayedTargets.length === 0) ? (
            <div className="teamver-drive-picker-empty">
              {searching ? "Searching Drive folders…" : "Loading Drive folders…"}
            </div>
          ) : searchError && displayedTargets.length === 0 ? (
            <div className="teamver-drive-picker-empty">{searchError}</div>
          ) : displayedTargets.length > 0 ? (
            displayedTargets.map((target) => {
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
                    onSelect(target);
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
