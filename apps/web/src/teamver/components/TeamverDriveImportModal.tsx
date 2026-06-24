import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAnalytics } from "../../analytics/provider";
import { Icon } from "../../components/Icon";
import type { TeamverDriveImportAsset, TeamverDriveImportPartialResult } from "../importDriveAssets";
import { formatDriveImportErrorForUser, formatTeamverDriveImportErrorMessage } from "../importDriveAssets";
import { useTeamverT } from "../branding/useTeamverT";
import { useTeamverBranding } from "../branding/TeamverBrandingProvider";
import {
  embedAttachBlockReason,
  shouldApplyEmbedFileAttachPolicy,
} from "../branding/embedFileAttachPolicy";
import {
  driveImportAssetIconName,
  formatDriveFileSize,
  isDriveImageAsset,
} from "../driveFileVisual";
import { fetchTeamverDriveImportThumbnails } from "../driveImportThumbnails";
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
import {
  trackTeamverDriveImportModalSurfaceView,
  trackTeamverDriveImportPickClick,
} from "../teamverDriveImportAnalytics";

const MAX_PICK = 12;
const SEARCH_DEBOUNCE_MS = 300;
const EMPTY_INITIAL_ASSETS: TeamverDriveImportAsset[] = [];

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
  initialAssets?: TeamverDriveImportAsset[];
  partialResult?: TeamverDriveImportPartialResult | null;
  onRetryFailed?: () => void;
  onDismissPartial?: () => void;
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
  initialAssets = EMPTY_INITIAL_ASSETS,
  partialResult = null,
  onRetryFailed,
  onDismissPartial,
}: Props) {
  const t = useTeamverT();
  const branding = useTeamverBranding();
  const analytics = useAnalytics();
  const attachPolicyActive = shouldApplyEmbedFileAttachPolicy(branding);
  const surfaceTrackedRef = useRef(false);
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
  const [thumbUrls, setThumbUrls] = useState<Map<string, string>>(new Map());

  const activeScope = scopes[scopeIndex] ?? null;
  const currentFolderId = navStack[navStack.length - 1]?.folderId ?? null;
  const searchMode = debouncedQuery.trim().length >= TEAMVER_DRIVE_IMPORT_SEARCH_MIN;
  const showRecent = !searchMode && currentFolderId == null;

  useEffect(() => {
    if (!open) {
      surfaceTrackedRef.current = false;
      return;
    }
    if (surfaceTrackedRef.current) return;
    surfaceTrackedRef.current = true;
    trackTeamverDriveImportModalSurfaceView(analytics.track, {
      page_name: "chat_panel",
      area: "drive_import_modal",
    });
  }, [analytics.track, open]);

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
      setError(formatTeamverDriveImportErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [activeScope, currentFolderId, debouncedQuery, open, workspaceId]);

  useEffect(() => {
    if (!open) return;
    const initial = new Map<string, TeamverDriveImportAsset>();
    for (const asset of initialAssets.slice(0, MAX_PICK)) {
      const blocked = embedAttachBlockReason(asset.filename ?? asset.assetId, {
        mimeType: asset.mimeType,
        slideOnlyMvp: attachPolicyActive,
      });
      if (!blocked) initial.set(asset.assetId, asset);
    }
    setSelected(initial);
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
            nextScopes.length > 0 ? nextScopes : [{ mode: "personal", folderId: null, label: "내 드라이브" }],
          );
        }
      } catch {
        if (!cancelled) setScopes([{ mode: "personal", folderId: null, label: "내 드라이브" }]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attachPolicyActive, initialAssets, open, workspaceId]);

  useEffect(() => {
    if (!open || !partialResult || partialResult.failures.length === 0) return;
    const retry = new Map<string, TeamverDriveImportAsset>();
    for (const failure of partialResult.failures) {
      retry.set(failure.asset.assetId, failure.asset);
    }
    setSelected(retry);
  }, [open, partialResult]);

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

  const browseAssetRows = useMemo(
    () => filteredRows.filter((row): row is TeamverDriveImportAssetRow => row.kind === "asset"),
    [filteredRows],
  );

  const folderRows = useMemo(
    () => filteredRows.filter((row): row is Extract<TeamverDriveImportListRow, { kind: "folder" }> => row.kind === "folder"),
    [filteredRows],
  );

  const thumbnailTargets = useMemo(() => {
    const seen = new Set<string>();
    const items: TeamverDriveImportAssetRow[] = [];
    for (const row of [...recentRows, ...browseAssetRows]) {
      if (seen.has(row.assetId)) continue;
      seen.add(row.assetId);
      if (!isDriveImageAsset(row.name, row.mimeType)) continue;
      items.push(row);
    }
    return items;
  }, [browseAssetRows, recentRows]);

  useEffect(() => {
    if (!open || !workspaceId.trim() || thumbnailTargets.length === 0) {
      setThumbUrls(new Map());
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const next = await fetchTeamverDriveImportThumbnails({
          workspaceId,
          items: thumbnailTargets,
        });
        if (!cancelled) setThumbUrls(next);
      } catch {
        if (!cancelled) setThumbUrls(new Map());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, thumbnailTargets, workspaceId]);

  if (!open) return null;

  const selectedCount = selected.size;
  const canAttach = selectedCount > 0 && !confirming;

  function toggleAsset(row: TeamverDriveImportAssetRow) {
    const blockReason = embedAttachBlockReason(row.name, {
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      slideOnlyMvp: attachPolicyActive,
    });
    if (blockReason) return;

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

  function renderAssetCard(row: TeamverDriveImportAssetRow, keyPrefix: string) {
    const picked = selected.has(row.assetId);
    const blockReason = embedAttachBlockReason(row.name, {
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      slideOnlyMvp: attachPolicyActive,
    });
    const blocked = blockReason != null;
    const thumbUrl = thumbUrls.get(row.assetId);
    const iconName = driveImportAssetIconName(row.name, row.mimeType);
    const sizeLabel = formatDriveFileSize(row.sizeBytes);
    const meta = blocked ? "슬라이드에서 지원하지 않음" : sizeLabel ?? row.mimeType ?? "파일";

    return (
      <button
        key={`${keyPrefix}:${row.assetId}`}
        type="button"
        role="option"
        aria-selected={picked}
        title={blockReason ?? row.name}
        className={`teamver-drive-import-card${picked ? " is-selected" : ""}${blocked ? " is-blocked" : ""}`}
        data-testid={`teamver-drive-import-asset-${row.assetId}`}
        disabled={confirming || blocked || (!picked && selectedCount >= MAX_PICK)}
        onClick={() => toggleAsset(row)}
      >
        <span className="teamver-drive-import-card-visual" aria-hidden>
          {thumbUrl ? (
            <img src={thumbUrl} alt="" className="teamver-drive-import-card-thumb" loading="lazy" />
          ) : (
            <Icon name={picked ? "check" : iconName} size={22} />
          )}
        </span>
        <span className="teamver-drive-import-card-copy">
          <span className="teamver-drive-import-card-name" title={row.name}>
            {row.name}
          </span>
          <small>{meta}</small>
        </span>
      </button>
    );
  }

  function renderAssetGrid(rowsToRender: TeamverDriveImportAssetRow[], keyPrefix: string) {
    if (rowsToRender.length === 0) return null;
    return (
      <div className="teamver-drive-import-grid" role="group">
        {rowsToRender.map((row) => renderAssetCard(row, keyPrefix))}
      </div>
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
            <h2 id="teamver-drive-import-title">팀버 드라이브에서 가져오기</h2>
            <p>최대 {MAX_PICK}개 파일을 이 프로젝트로 가져올 수 있습니다.</p>
          </div>
          <button
            type="button"
            className="teamver-drive-picker-close"
            aria-label="드라이브 가져오기 닫기"
            disabled={confirming}
            onClick={onClose}
          >
            <Icon name="close" size={16} />
          </button>
        </header>

        {scopes.length > 1 ? (
          <div className="teamver-drive-import-tabs" role="tablist" aria-label="드라이브 범위">
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

        <nav className="teamver-drive-import-crumb" aria-label="드라이브 폴더 경로">
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
            aria-label="드라이브 파일 검색"
            placeholder={
              searchMode || query.trim().length >= TEAMVER_DRIVE_IMPORT_SEARCH_MIN
                ? "드라이브 전체 검색"
                : "이 폴더에서 검색"
            }
            disabled={confirming}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </label>

        <div className="teamver-drive-picker-list teamver-drive-import-list" role="listbox" aria-label="드라이브 파일 목록">
          {loading ? (
            <div className="teamver-drive-picker-empty">드라이브 파일 불러오는 중…</div>
          ) : error ? (
            <div className="teamver-drive-picker-empty">{error}</div>
          ) : (
            <>
              {showRecent && recentRows.length > 0 ? (
                <div className="teamver-drive-import-section" data-testid="teamver-drive-import-recent">
                  <div className="teamver-drive-import-section-label">최근</div>
                  {renderAssetGrid(recentRows, "recent")}
                </div>
              ) : null}

              {folderRows.length > 0 || browseAssetRows.length > 0 ? (
                <>
                  {showRecent && recentRows.length > 0 && (folderRows.length > 0 || browseAssetRows.length > 0) ? (
                    <div className="teamver-drive-import-section-label">탐색</div>
                  ) : null}
                  {folderRows.map((row) => (
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
                        <small>폴더</small>
                      </span>
                      <Icon name="chevron-right" size={14} />
                    </button>
                  ))}
                  {renderAssetGrid(browseAssetRows, "browse")}
                </>
              ) : showRecent && recentRows.length > 0 ? null : (
                <div className="teamver-drive-picker-empty">
                  {searchMode ? "일치하는 드라이브 파일이 없습니다" : "이 폴더에 파일이 없습니다"}
                </div>
              )}
            </>
          )}
        </div>

        {partialResult && partialResult.failures.length > 0 ? (
          <div className="teamver-drive-import-partial" data-testid="teamver-drive-import-partial">
            {partialResult.importedCount > 0 ? (
              <p className="teamver-drive-import-partial-summary">
                {t("teamver.driveImport.partialSuccess", { n: partialResult.importedCount })}
              </p>
            ) : null}
            <p className="teamver-drive-import-partial-lead">
              {t("teamver.driveImport.partialFailedLead", { n: partialResult.failures.length })}
            </p>
            <ul className="teamver-drive-import-partial-list">
              {partialResult.failures.map((failure) => (
                <li key={failure.asset.assetId} className="teamver-drive-import-partial-item">
                  <span className="teamver-drive-import-partial-name">
                    {failure.asset.filename ?? failure.asset.assetId}
                  </span>
                  <span className="teamver-drive-import-partial-reason">
                    {formatDriveImportErrorForUser(failure.errorCode)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <footer className="teamver-drive-import-footer">
          <span className="teamver-drive-import-count">
            {selectedCount}개 선택됨 (최대 {MAX_PICK}개)
          </span>
          <div className="teamver-drive-import-actions">
            <button type="button" className="teamver-drive-import-cancel" disabled={confirming} onClick={onClose}>
              취소
            </button>
            {partialResult && partialResult.importedCount > 0 ? (
              <button
                type="button"
                className="teamver-drive-import-done"
                disabled={confirming}
                data-testid="teamver-drive-import-done"
                onClick={() => onDismissPartial?.()}
              >
                {t("teamver.driveImport.done")}
              </button>
            ) : null}
            {partialResult && partialResult.failures.length > 0 ? (
              <button
                type="button"
                className="teamver-drive-import-retry"
                disabled={confirming}
                data-testid="teamver-drive-import-retry"
                onClick={() => onRetryFailed?.()}
              >
                {t("teamver.driveImport.retryFailed", { n: partialResult.failures.length })}
              </button>
            ) : null}
            {!partialResult ? (
            <button
              type="button"
              className="teamver-drive-import-attach"
              disabled={!canAttach}
              data-testid="teamver-drive-import-attach"
              onClick={() => {
                const assets = Array.from(selected.values());
                trackTeamverDriveImportPickClick(analytics.track, {
                  page_name: "chat_panel",
                  area: "drive_import_modal",
                  element: "drive_import_pick",
                  asset_count: assets.length,
                });
                void onConfirm(assets);
              }}
            >
              {confirming ? "가져오는 중…" : "첨부"}
            </button>
            ) : null}
          </div>
        </footer>
      </section>
    </div>
  );
}
