import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "../../components/Icon";
import type { TeamverDriveImportAsset } from "../importDriveAssets";
import {
  listTeamverDriveImportRecent,
  listTeamverDriveImportRows,
  listTeamverDriveImportScopes,
  searchTeamverDriveImportRows,
  TEAMVER_DRIVE_IMPORT_SEARCH_MIN,
  type TeamverDriveImportAssetRow,
  type TeamverDriveImportListRow,
  type TeamverDriveImportScope,
} from "../driveImportList";

const MAX_PICK = 12;
const SEARCH_DEBOUNCE_MS = 300;

type NavCrumb = {
  folderId: string | null;
  name: string;
};

type Props = {
  open: boolean;
  workspaceId: string;
  onClose: () => void;
  onConfirm: (assets: TeamverDriveImportAsset[]) => void | Promise<void>;
  confirming?: boolean;
};

function scopeKey(scope: TeamverDriveImportScope, folderId: string | null): string {
  if (scope.mode === "personal") return `personal:${folderId ?? "root"}`;
  return `shared:${scope.sharedDriveId}:${folderId ?? "root"}`;
}

function rootCrumb(scope: TeamverDriveImportScope): NavCrumb {
  return { folderId: null, name: scope.label };
}

function matchesLocalQuery(row: TeamverDriveImportListRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (row.kind === "folder") return row.name.toLowerCase().includes(q);
  return row.name.toLowerCase().includes(q) || row.assetId.toLowerCase().includes(q);
}

export function TeamverDriveImportModal({
  open,
  workspaceId,
  onClose,
  onConfirm,
  confirming = false,
}: Props) {
  const [scopes, setScopes] = useState<TeamverDriveImportScope[]>([]);
  const [scopeIndex, setScopeIndex] = useState(0);
  const [navStack, setNavStack] = useState<NavCrumb[]>([]);
  const [rows, setRows] = useState<TeamverDriveImportListRow[]>([]);
  const [recentRows, setRecentRows] = useState<TeamverDriveImportAssetRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selected, setSelected] = useState<Map<string, TeamverDriveImportAsset>>(new Map());

  const activeScope = scopes[scopeIndex] ?? null;
  const currentFolderId = navStack[navStack.length - 1]?.folderId ?? null;
  const searchMode = debouncedQuery.trim().length >= TEAMVER_DRIVE_IMPORT_SEARCH_MIN;
  const showRecent = !searchMode && currentFolderId == null;

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [open, query]);

  const refreshRows = useCallback(async () => {
    if (!open || !workspaceId.trim() || !activeScope) return;
    setLoading(true);
    setError(null);
    try {
      const sharedDriveId = activeScope.mode === "shared" ? activeScope.sharedDriveId : null;
      const trimmedQuery = debouncedQuery.trim();

      if (trimmedQuery.length >= TEAMVER_DRIVE_IMPORT_SEARCH_MIN) {
        const searchRows = await searchTeamverDriveImportRows({
          workspaceId,
          query: trimmedQuery,
          sharedDriveId,
          limit: 80,
        });
        setRecentRows([]);
        setRows(searchRows);
        return;
      }

      const browseRows = await listTeamverDriveImportRows({
        workspaceId,
        folderId: currentFolderId,
        sharedDriveId,
        limit: 80,
      });
      setRows(browseRows);

      if (currentFolderId == null) {
        try {
          const recent = await listTeamverDriveImportRecent({ workspaceId, limit: 16 });
          const browseAssetIds = new Set(
            browseRows.filter((row) => row.kind === "asset").map((row) => row.assetId),
          );
          setRecentRows(recent.filter((row) => !browseAssetIds.has(row.assetId)));
        } catch {
          setRecentRows([]);
        }
      } else {
        setRecentRows([]);
      }
    } catch (err) {
      setRows([]);
      setRecentRows([]);
      setError(err instanceof Error ? err.message : "drive_import_list_failed");
    } finally {
      setLoading(false);
    }
  }, [activeScope, currentFolderId, debouncedQuery, open, workspaceId]);

  useEffect(() => {
    if (!open) return;
    setSelected(new Map());
    setQuery("");
    setDebouncedQuery("");
    setScopeIndex(0);
    setNavStack([]);
    let cancelled = false;
    void (async () => {
      try {
        const nextScopes = await listTeamverDriveImportScopes(workspaceId);
        if (!cancelled) {
          setScopes(
            nextScopes.length > 0 ? nextScopes : [{ mode: "personal", folderId: null, label: "My Drive" }],
          );
        }
      } catch {
        if (!cancelled) setScopes([{ mode: "personal", folderId: null, label: "My Drive" }]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, workspaceId]);

  useEffect(() => {
    if (!activeScope) return;
    setNavStack((current) => {
      if (current.length === 0) return [rootCrumb(activeScope)];
      const next = [...current];
      next[0] = rootCrumb(activeScope);
      return next;
    });
  }, [activeScope]);

  useEffect(() => {
    void refreshRows();
  }, [refreshRows]);

  const filteredRows = useMemo(() => {
    if (searchMode) return rows;
    return rows.filter((row) => matchesLocalQuery(row, query));
  }, [query, rows, searchMode]);

  if (!open) return null;

  const selectedCount = selected.size;
  const canAttach = selectedCount > 0 && !confirming;

  function toggleAsset(row: TeamverDriveImportAssetRow) {
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(row.assetId)) {
        next.delete(row.assetId);
        return next;
      }
      if (next.size >= MAX_PICK) return current;
      next.set(row.assetId, {
        assetId: row.assetId,
        filename: row.name,
        mimeType: row.mimeType,
      });
      return next;
    });
  }

  function enterFolder(row: Extract<TeamverDriveImportListRow, { kind: "folder" }>) {
    setNavStack((current) => [...current, { folderId: row.folderId, name: row.name }]);
    setQuery("");
    setDebouncedQuery("");
  }

  function renderAssetRow(row: TeamverDriveImportAssetRow, keyPrefix: string) {
    const picked = selected.has(row.assetId);
    return (
      <button
        key={`${keyPrefix}:${row.assetId}`}
        type="button"
        role="option"
        aria-selected={picked}
        className={`teamver-drive-picker-row${picked ? " is-selected" : ""}`}
        data-testid={`teamver-drive-import-asset-${row.assetId}`}
        disabled={confirming || (!picked && selectedCount >= MAX_PICK)}
        onClick={() => toggleAsset(row)}
      >
        <span className="teamver-drive-picker-row-icon">
          <Icon name={picked ? "check" : "file"} size={15} />
        </span>
        <span className="teamver-drive-picker-row-copy">
          <span>{row.name}</span>
          <small>{row.mimeType ?? "file"}</small>
        </span>
      </button>
    );
  }

  return (
    <div
      className="teamver-drive-picker-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !confirming) onClose();
      }}
    >
      <section
        className="teamver-drive-picker-modal teamver-drive-import-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="teamver-drive-import-title"
        data-testid="teamver-drive-import-modal"
      >
        <header className="teamver-drive-picker-head">
          <div>
            <h2 id="teamver-drive-import-title">Attach from Teamver Drive</h2>
            <p>Select up to {MAX_PICK} files to import into this project.</p>
          </div>
          <button
            type="button"
            className="teamver-drive-picker-close"
            aria-label="Close Drive import"
            disabled={confirming}
            onClick={onClose}
          >
            <Icon name="close" size={16} />
          </button>
        </header>

        {scopes.length > 1 ? (
          <div className="teamver-drive-import-tabs" role="tablist" aria-label="Drive scope">
            {scopes.map((scope, index) => (
              <button
                key={scope.mode === "personal" ? "personal" : scope.sharedDriveId}
                type="button"
                role="tab"
                aria-selected={index === scopeIndex}
                className={`teamver-drive-import-tab${index === scopeIndex ? " is-active" : ""}`}
                disabled={confirming}
                onClick={() => {
                  setScopeIndex(index);
                  setNavStack([rootCrumb(scope)]);
                  setQuery("");
                  setDebouncedQuery("");
                }}
              >
                {scope.label}
              </button>
            ))}
          </div>
        ) : null}

        <nav className="teamver-drive-import-crumb" aria-label="Drive folder path">
          {navStack.map((crumb, index) => {
            const isLast = index === navStack.length - 1;
            return (
              <span key={`${crumb.folderId ?? "root"}:${index}`} className="teamver-drive-import-crumb-item">
                {index > 0 ? <span className="teamver-drive-import-crumb-sep">/</span> : null}
                {isLast ? (
                  <span className="teamver-drive-import-crumb-current">{crumb.name}</span>
                ) : (
                  <button
                    type="button"
                    className="teamver-drive-import-crumb-btn"
                    disabled={confirming}
                    onClick={() => {
                      setNavStack(navStack.slice(0, index + 1));
                      setQuery("");
                      setDebouncedQuery("");
                    }}
                  >
                    {crumb.name}
                  </button>
                )}
              </span>
            );
          })}
        </nav>

        <label className="teamver-drive-picker-search">
          <Icon name="search" size={14} />
          <input
            value={query}
            aria-label="Search Drive files"
            placeholder={
              searchMode || query.trim().length >= TEAMVER_DRIVE_IMPORT_SEARCH_MIN
                ? "Search Drive"
                : "Search in this folder"
            }
            disabled={confirming}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </label>

        <div className="teamver-drive-picker-list teamver-drive-import-list" role="listbox" aria-label="Drive files">
          {loading ? (
            <div className="teamver-drive-picker-empty">Loading Drive files…</div>
          ) : error ? (
            <div className="teamver-drive-picker-empty">{error}</div>
          ) : (
            <>
              {showRecent && recentRows.length > 0 ? (
                <div className="teamver-drive-import-section" data-testid="teamver-drive-import-recent">
                  <div className="teamver-drive-import-section-label">Recent</div>
                  {recentRows.map((row) => renderAssetRow(row, "recent"))}
                </div>
              ) : null}

              {filteredRows.length > 0 ? (
                <>
                  {showRecent && recentRows.length > 0 ? (
                    <div className="teamver-drive-import-section-label">Browse</div>
                  ) : null}
                  {filteredRows.map((row) => {
                    if (row.kind === "folder") {
                      return (
                        <button
                          key={`folder:${scopeKey(activeScope!, currentFolderId)}:${row.folderId}`}
                          type="button"
                          className="teamver-drive-picker-row"
                          data-testid={`teamver-drive-import-folder-${row.folderId}`}
                          disabled={confirming}
                          onClick={() => enterFolder(row)}
                        >
                          <span className="teamver-drive-picker-row-icon">
                            <Icon name="folder" size={15} />
                          </span>
                          <span className="teamver-drive-picker-row-copy">
                            <span>{row.name}</span>
                            <small>Folder</small>
                          </span>
                          <Icon name="chevron-right" size={14} />
                        </button>
                      );
                    }
                    return renderAssetRow(row, "browse");
                  })}
                </>
              ) : showRecent && recentRows.length > 0 ? null : (
                <div className="teamver-drive-picker-empty">
                  {searchMode ? "No matching Drive files" : "No files in this folder"}
                </div>
              )}
            </>
          )}
        </div>

        <footer className="teamver-drive-import-footer">
          <span className="teamver-drive-import-count">
            {selectedCount} selected (max {MAX_PICK})
          </span>
          <div className="teamver-drive-import-actions">
            <button type="button" className="teamver-drive-import-cancel" disabled={confirming} onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="teamver-drive-import-attach"
              disabled={!canAttach}
              data-testid="teamver-drive-import-attach"
              onClick={() => void onConfirm(Array.from(selected.values()))}
            >
              {confirming ? "Importing…" : "Attach"}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
