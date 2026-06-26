import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../../components/Icon";
import {
  TEAMVER_DRIVE_PUBLISH_SEARCH_MIN,
  type TeamverDrivePublishTarget,
} from "../drivePublishTargets";
import { listTeamverDrivePublishHomeRecentTargets } from "../drivePublishHomeRecent";
import {
  listTeamverDrivePublishRecentAssets,
  type TeamverDrivePublishRecentAsset,
} from "../drivePublishRecentAssets";
import {
  browseTeamverDriveImportPage,
  listTeamverDriveImportScopes,
  TEAMVER_DRIVE_IMPORT_BROWSE_PAGE_SIZE,
  type TeamverDriveImportAssetRow,
  type TeamverDriveImportFolderRow,
  type TeamverDriveImportScope,
} from "../driveImportList";
import {
  driveImportAssetIconName,
  formatDriveFileSize,
  isDriveImageAsset,
} from "../driveFileVisual";
import { fetchTeamverDriveImportThumbnails } from "../driveImportThumbnails";
import { TeamverDriveSearchField } from "./TeamverDriveSearchField";
import { driveSearchTextMatches, useSubmittedDriveSearch } from "../useSubmittedDriveSearch";

type NavCrumb = {
  folderId: string | null;
  name: string;
};

type Props = {
  open: boolean;
  workspaceId?: string | null;
  targets: TeamverDrivePublishTarget[];
  recentTargets?: TeamverDrivePublishTarget[];
  selectedTargetId: string;
  loading?: boolean;
  onSearch?: (query: string) => Promise<TeamverDrivePublishTarget[]>;
  onSelect: (target: TeamverDrivePublishTarget) => void;
  onClose: () => void;
};

function rootCrumb(scope: TeamverDriveImportScope): NavCrumb {
  return { folderId: scope.folderId ?? null, name: scope.label };
}

function targetFromScope(scope: TeamverDriveImportScope): TeamverDrivePublishTarget {
  if (scope.mode === "shared") {
    return {
      id: `shared:${scope.sharedDriveId}`,
      label: scope.label,
      description: "팀 드라이브 루트",
      folderId: scope.folderId,
      sharedDriveId: scope.sharedDriveId,
    };
  }
  return {
    id: "personal-root",
    label: scope.label,
    description: "개인 드라이브 루트",
    folderId: scope.folderId,
    sharedDriveId: null,
  };
}

function targetFromFolder(
  scope: TeamverDriveImportScope,
  folder: { folderId: string; name: string; sharedDriveId?: string | null },
): TeamverDrivePublishTarget {
  const sharedDriveId = scope.mode === "shared" ? scope.sharedDriveId : folder.sharedDriveId ?? null;
  return {
    id: sharedDriveId ? `shared:${sharedDriveId}:${folder.folderId}` : `personal:${folder.folderId}`,
    label: scope.mode === "shared" ? `${scope.label} / ${folder.name}` : folder.name,
    description: scope.mode === "shared" ? "팀 드라이브 폴더" : "내 드라이브 폴더",
    folderId: folder.folderId,
    sharedDriveId,
  };
}

function targetFromCurrentFolder(
  scope: TeamverDriveImportScope,
  navStack: NavCrumb[],
): TeamverDrivePublishTarget {
  const last = navStack[navStack.length - 1] ?? rootCrumb(scope);
  const base = last.folderId == null
    ? targetFromScope(scope)
    : targetFromFolder(scope, { folderId: last.folderId, name: last.name });
  const label = navStack.map((crumb) => crumb.name).join(" / ");
  return { ...base, label };
}

function targetFromRecentAsset(asset: TeamverDrivePublishRecentAsset): TeamverDrivePublishTarget {
  const sharedDriveId = asset.sharedDriveId;
  return {
    id: sharedDriveId ? `shared:${sharedDriveId}:${asset.folderId}` : `personal:${asset.folderId}`,
    label: sharedDriveId ? "팀 드라이브" : "내 드라이브",
    description: `최근: ${asset.name}`,
    folderId: asset.folderId,
    sharedDriveId,
  };
}

function matchesAssetQuery(row: TeamverDriveImportAssetRow, query: string): boolean {
  return driveSearchTextMatches(query, row.name, row.assetId);
}

export function TeamverDrivePickerModal({
  open,
  workspaceId,
  targets,
  recentTargets = [],
  selectedTargetId,
  loading = false,
  onSearch,
  onSelect,
  onClose,
}: Props) {
  const {
    query,
    setQuery,
    submittedQuery,
    searchMode,
    submitSearch,
    resetSearch,
  } = useSubmittedDriveSearch(TEAMVER_DRIVE_PUBLISH_SEARCH_MIN);
  const [searchTargets, setSearchTargets] = useState<TeamverDrivePublishTarget[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [scopes, setScopes] = useState<TeamverDriveImportScope[]>([]);
  const [scopeIndex, setScopeIndex] = useState(0);
  const [navStack, setNavStack] = useState<NavCrumb[]>([]);
  const [browseTargets, setBrowseTargets] = useState<TeamverDrivePublishTarget[]>([]);
  const [browseAssetRows, setBrowseAssetRows] = useState<TeamverDriveImportAssetRow[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [browseHasMore, setBrowseHasMore] = useState(false);
  const [browseNextCursor, setBrowseNextCursor] = useState<string | null>(null);
  const [homeRecentTargets, setHomeRecentTargets] = useState<TeamverDrivePublishTarget[]>([]);
  const [homeRecentLoading, setHomeRecentLoading] = useState(false);
  const [recentAssetRows, setRecentAssetRows] = useState<TeamverDrivePublishRecentAsset[]>([]);
  const [thumbUrls, setThumbUrls] = useState<Map<string, string>>(new Map());
  const browseFetchSeqRef = useRef(0);
  const searchFetchSeqRef = useRef(0);
  const browsePageCacheRef = useRef(new Map<string, {
    targets: TeamverDrivePublishTarget[];
    assets: TeamverDriveImportAssetRow[];
    recentAssets: TeamverDrivePublishRecentAsset[];
    hasMore: boolean;
    nextCursor: string | null;
  }>());
  const trimmedQuery = query.trim();
  const searching = Boolean(onSearch && searchMode);
  const activeScope = scopes[scopeIndex] ?? null;
  const currentCrumb = navStack[navStack.length - 1] ?? null;
  const currentFolderId = currentCrumb?.folderId ?? null;
  const atScopeRoot = navStack.length <= 1;
  const currentTarget = activeScope && navStack.length > 0
    ? targetFromCurrentFolder(activeScope, navStack)
    : null;
  const displayedTargets = useMemo(() => {
    if (searching) return searchTargets ?? [];
    if (trimmedQuery) {
      return browseTargets.filter((target) =>
        driveSearchTextMatches(trimmedQuery, target.label, target.description),
      );
    }
    return browseTargets;
  }, [browseTargets, searchTargets, searching, trimmedQuery]);
  const displayedBrowseAssets = useMemo(() => {
    if (searching) return [];
    if (trimmedQuery) {
      return browseAssetRows.filter((row) => matchesAssetQuery(row, trimmedQuery));
    }
    return browseAssetRows;
  }, [browseAssetRows, searching, trimmedQuery]);
  const showRecentSection =
    !searching
    && atScopeRoot
    && recentTargets.length > 0;
  const showRecentAssetSection =
    !searching
    && atScopeRoot
    && activeScope?.mode === "personal"
    && recentAssetRows.length > 0;
  const displayedHomeRecentTargets = useMemo(() => {
    if (searching || !atScopeRoot) return [];
    const localIds = new Set(recentTargets.map((target) => target.id));
    return homeRecentTargets.filter((target) => !localIds.has(target.id));
  }, [atScopeRoot, homeRecentTargets, recentTargets, searching]);
  const showHomeRecentSection = displayedHomeRecentTargets.length > 0;
  const hasBrowseContent = displayedTargets.length > 0 || displayedBrowseAssets.length > 0;
  const showInitialLoading =
    !searching
    && !showRecentSection
    && !showHomeRecentSection
    && !showRecentAssetSection
    && (loading || browseLoading || homeRecentLoading);

  const thumbnailTargets = useMemo(() => {
    const seen = new Set<string>();
    const items: Array<{
      assetId: string;
      name: string;
      mimeType?: string;
      sharedDriveId?: string | null;
    }> = [];
    for (const row of [...recentAssetRows, ...displayedBrowseAssets]) {
      if (seen.has(row.assetId)) continue;
      seen.add(row.assetId);
      if (!isDriveImageAsset(row.name, row.mimeType)) continue;
      items.push({
        assetId: row.assetId,
        name: row.name,
        mimeType: row.mimeType,
        sharedDriveId: "sharedDriveId" in row ? row.sharedDriveId ?? null : null,
      });
    }
    return items;
  }, [displayedBrowseAssets, recentAssetRows]);

  function selectTarget(target: TeamverDrivePublishTarget) {
    onSelect(target);
    onClose();
  }

  function selectCurrentFolderFromAsset() {
    if (!currentTarget) return;
    selectTarget(currentTarget);
  }

  function selectFolderFromRecentAsset(asset: TeamverDrivePublishRecentAsset) {
    selectTarget(targetFromRecentAsset(asset));
  }

  function enterFolder(target: TeamverDrivePublishTarget) {
    if (!target.folderId) return;
    setNavStack((current) => [
      ...current,
      {
        folderId: target.folderId,
        name: target.label.split(" / ").at(-1) ?? target.label,
      },
    ]);
    resetSearch();
  }

  function renderFolderGrid(
    targets: TeamverDrivePublishTarget[],
    keyPrefix: string,
    testIdPrefix: string,
  ) {
    return (
      <div className="teamver-drive-import-grid" role="group">
        {targets.map((target) => {
          const selected = target.id === selectedTargetId;
          return (
            <button
              key={`${keyPrefix}:${target.id}`}
              type="button"
              role="option"
              aria-selected={selected}
              className={`teamver-drive-import-card${selected ? " is-selected" : ""}`}
              data-testid={`${testIdPrefix}-${target.id}`}
              onClick={() => selectTarget(target)}
            >
              <span className="teamver-drive-import-card-visual" aria-hidden>
                <Icon name={target.sharedDriveId ? "folder-filled" : "folder"} size={18} />
              </span>
              <span className="teamver-drive-import-card-copy">
                <span>{target.label}</span>
                <small>{target.description}</small>
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  function renderPublishAssetCard(
    row: TeamverDriveImportAssetRow | TeamverDrivePublishRecentAsset,
    keyPrefix: string,
    onPick: () => void,
  ) {
    const iconName = driveImportAssetIconName(row.name, row.mimeType);
    const thumbUrl = thumbUrls.get(row.assetId);
    const meta = row.sizeBytes != null ? formatDriveFileSize(row.sizeBytes) : "파일";
    return (
      <button
        key={`${keyPrefix}:${row.assetId}`}
        type="button"
        role="option"
        title={`${row.name} · 이 폴더에 저장`}
        className="teamver-drive-import-card"
        data-testid={`teamver-drive-picker-asset-${row.assetId}`}
        onClick={onPick}
      >
        <span className="teamver-drive-import-card-visual" aria-hidden>
          {thumbUrl ? (
            <img src={thumbUrl} alt="" className="teamver-drive-import-card-thumb" loading="lazy" />
          ) : (
            <Icon name={iconName} size={22} />
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

  function renderAssetGrid(
    rows: Array<TeamverDriveImportAssetRow | TeamverDrivePublishRecentAsset>,
    keyPrefix: string,
    onPick: (row: TeamverDriveImportAssetRow | TeamverDrivePublishRecentAsset) => void,
  ) {
    if (rows.length === 0) return null;
    return (
      <div className="teamver-drive-import-grid" role="group">
        {rows.map((row) => renderPublishAssetCard(row, keyPrefix, () => onPick(row)))}
      </div>
    );
  }

  useEffect(() => {
    if (!open || !workspaceId?.trim()) {
      setScopes([]);
      setNavStack([]);
      setBrowseTargets([]);
      setBrowseAssetRows([]);
      browsePageCacheRef.current.clear();
      return;
    }
    let canceled = false;
    void (async () => {
      try {
        const nextScopes = await listTeamverDriveImportScopes(workspaceId);
        if (canceled) return;
        const resolved = nextScopes.length > 0
          ? nextScopes
          : [{ mode: "personal", folderId: null, label: "내 드라이브" } satisfies TeamverDriveImportScope];
        setScopes(resolved);
        setScopeIndex(0);
        setNavStack([rootCrumb(resolved[0]!)]);
      } catch {
        if (canceled) return;
        const fallback = [{ mode: "personal", folderId: null, label: "내 드라이브" } satisfies TeamverDriveImportScope];
        setScopes(fallback);
        setScopeIndex(0);
        setNavStack([rootCrumb(fallback[0]!)]);
      }
    })();
    return () => {
      canceled = true;
    };
  }, [open, workspaceId]);

  useEffect(() => {
    if (!open) return;
    resetSearch();
    setSearchTargets(null);
    setSearchLoading(false);
    setSearchError(null);
  }, [open, resetSearch, workspaceId]);

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
    setBrowseNextCursor(null);
    setBrowseHasMore(false);
  }, [activeScope, currentFolderId, scopeIndex]);

  const refreshBrowse = useCallback(
    async (options?: { append?: boolean; before?: string | null }) => {
      if (!open || !workspaceId?.trim() || !activeScope || searching) return;
      const append = options?.append ?? false;
      const before = options?.before ?? null;
      const cacheKey = [
        workspaceId.trim(),
        activeScope.mode === "shared" ? activeScope.sharedDriveId : "personal",
        currentFolderId ?? "root",
        before ?? "start",
      ].join(":");
      if (!append) {
        const cached = browsePageCacheRef.current.get(cacheKey);
        if (cached) {
          setBrowseTargets(cached.targets);
          setBrowseAssetRows(cached.assets);
          setRecentAssetRows(cached.recentAssets);
          setBrowseHasMore(cached.hasMore);
          setBrowseNextCursor(cached.nextCursor);
          setBrowseLoading(false);
          setBrowseError(null);
          return;
        }
      }
      const seq = ++browseFetchSeqRef.current;
      if (!append) {
        setBrowseLoading(true);
        setBrowseError(null);
      }
      try {
        const page = await browseTeamverDriveImportPage({
          workspaceId,
          scope: activeScope,
          navFolderId: currentFolderId,
          limit: TEAMVER_DRIVE_IMPORT_BROWSE_PAGE_SIZE,
          before,
        });
        if (seq !== browseFetchSeqRef.current) return;
        const folders = page.rows
          .filter((row): row is TeamverDriveImportFolderRow => row.kind === "folder")
          .map((row) => targetFromFolder(activeScope, row));
        const assets = page.rows.filter(
          (row): row is TeamverDriveImportAssetRow => row.kind === "asset",
        );
        let recentAssets: TeamverDrivePublishRecentAsset[] = [];
        if (!append && activeScope.mode === "personal" && currentFolderId == null) {
          try {
            recentAssets = await listTeamverDrivePublishRecentAssets(workspaceId, { limit: 16 });
            if (seq !== browseFetchSeqRef.current) return;
            const browseAssetIds = new Set(assets.map((row) => row.assetId));
            recentAssets = recentAssets.filter((row) => !browseAssetIds.has(row.assetId));
          } catch {
            recentAssets = [];
          }
        }
        if (!append) {
          browsePageCacheRef.current.set(cacheKey, {
            targets: folders,
            assets,
            recentAssets,
            hasMore: page.hasMore,
            nextCursor: page.nextCursor,
          });
        }
        setBrowseTargets((current) => (append ? [...current, ...folders] : folders));
        setBrowseAssetRows((current) => (append ? [...current, ...assets] : assets));
        setBrowseHasMore(page.hasMore);
        setBrowseNextCursor(page.nextCursor);
        if (!append) setRecentAssetRows(recentAssets);
      } catch {
        if (seq !== browseFetchSeqRef.current) return;
        if (!append) {
          setBrowseTargets([]);
          setBrowseAssetRows([]);
          setBrowseError("드라이브 폴더를 불러오지 못했습니다");
        }
        setBrowseHasMore(false);
        setBrowseNextCursor(null);
      } finally {
        if (seq === browseFetchSeqRef.current && !append) setBrowseLoading(false);
      }
    },
    [activeScope, currentFolderId, open, searching, workspaceId],
  );

  useEffect(() => {
    if (!open || !workspaceId?.trim() || !activeScope) return;
    if (searching) {
      setBrowseLoading(false);
      return;
    }
    void refreshBrowse();
  }, [activeScope, open, refreshBrowse, searching, workspaceId]);

  useEffect(() => {
    if (!open || !workspaceId?.trim() || searching || !atScopeRoot || recentTargets.length > 0) {
      setHomeRecentTargets([]);
      setHomeRecentLoading(false);
      return;
    }
    let canceled = false;
    setHomeRecentLoading(true);
    void (async () => {
      try {
        const targets = await listTeamverDrivePublishHomeRecentTargets(workspaceId, { limit: 12 });
        if (!canceled) setHomeRecentTargets(targets);
      } catch {
        if (!canceled) setHomeRecentTargets([]);
      } finally {
        if (!canceled) setHomeRecentLoading(false);
      }
    })();
    return () => {
      canceled = true;
    };
  }, [atScopeRoot, open, recentTargets.length, searching, workspaceId]);

  useEffect(() => {
    if (!open || !workspaceId?.trim() || thumbnailTargets.length === 0) {
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

  // Backdrop dismissal must distinguish click-from-backdrop vs.
  // drag-from-inside-released-on-backdrop. Without `mousedown` source check
  // a text selection inside the list collapses the modal when the user
  // releases over the backdrop (very common with long folder labels).
  const backdropMouseDownRef = useRef(false);

  // ESC + portal+ scroll lock parity with TeamverDriveImportModal so the
  // publish picker doesn't let the host (Home recents / project panel)
  // scroll while it's open or stack underneath embed preview cards.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  useEffect(() => {
    if (!open) return;
    const prevBodyOverflow = document.body.style.overflow;
    const scrollContainers = Array.from(document.querySelectorAll(".entry-main--scroll"));
    const prevScrollOverflows = scrollContainers.map(
      (node) => (node as HTMLElement).style.overflow,
    );
    document.body.style.overflow = "hidden";
    scrollContainers.forEach((node) => {
      (node as HTMLElement).style.overflow = "hidden";
    });
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      scrollContainers.forEach((node, index) => {
        (node as HTMLElement).style.overflow = prevScrollOverflows[index] ?? "";
      });
    };
  }, [open]);

  useEffect(() => {
    if (!open || !onSearch || submittedQuery.length < TEAMVER_DRIVE_PUBLISH_SEARCH_MIN) {
      setSearchTargets(null);
      setSearchLoading(false);
      setSearchError(null);
      return;
    }
    let canceled = false;
    const seq = ++searchFetchSeqRef.current;
    setSearchLoading(true);
    setSearchError(null);
    setSearchTargets(null);
    void (async () => {
      try {
        const results = await onSearch(submittedQuery);
        if (canceled || seq !== searchFetchSeqRef.current) return;
        setSearchTargets(results);
      } catch {
        if (canceled || seq !== searchFetchSeqRef.current) return;
        setSearchTargets([]);
        setSearchError("드라이브 검색에 실패했습니다");
      } finally {
        if (!canceled && seq === searchFetchSeqRef.current) setSearchLoading(false);
      }
    })();
    return () => {
      canceled = true;
    };
  }, [onSearch, open, submittedQuery]);

  if (!open) return null;

  return createPortal(
    (
    <div
      className="teamver-drive-picker-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        backdropMouseDownRef.current = event.target === event.currentTarget;
      }}
      onMouseUp={(event) => {
        if (event.target === event.currentTarget && backdropMouseDownRef.current) onClose();
        backdropMouseDownRef.current = false;
      }}
    >
      <section
        className="teamver-drive-picker-modal teamver-drive-import-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="teamver-drive-picker-title"
        data-testid="teamver-drive-picker-modal"
      >
        <header className="teamver-drive-picker-head">
          <div>
            <h2 id="teamver-drive-picker-title">드라이브 폴더 선택</h2>
            <p>이 내보내기를 저장할 개인/팀 드라이브 폴더를 선택하세요.</p>
          </div>
          <button
            type="button"
            className="teamver-drive-picker-close"
            aria-label="드라이브 선택 닫기"
            onClick={onClose}
          >
            <Icon name="close" size={16} />
          </button>
        </header>

        {scopes.length > 1 && !searching ? (
          <div className="teamver-drive-import-tabs" role="tablist" aria-label="드라이브 범위">
            {scopes.map((scope, index) => (
              <button
                key={scope.mode === "personal" ? "personal" : scope.sharedDriveId}
                type="button"
                role="tab"
                aria-selected={index === scopeIndex}
                className={`teamver-drive-import-tab${index === scopeIndex ? " is-active" : ""}`}
                onClick={() => {
                  setScopeIndex(index);
                  setNavStack([rootCrumb(scope)]);
                  resetSearch();
                  setRecentAssetRows([]);
                }}
              >
                {scope.label}
              </button>
            ))}
          </div>
        ) : null}

        {navStack.length > 0 && !searching ? (
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
                      onClick={() => {
                        setNavStack(navStack.slice(0, index + 1));
                        resetSearch();
                      }}
                    >
                      {crumb.name}
                    </button>
                  )}
                </span>
              );
            })}
          </nav>
        ) : null}

        <TeamverDriveSearchField
          autoFocus
          value={query}
          ariaLabel="드라이브 폴더 검색"
          minSearchLength={TEAMVER_DRIVE_PUBLISH_SEARCH_MIN}
          placeholder={
            searchMode
              ? "드라이브 전체 검색"
              : "폴더 검색 · Enter로 전체 검색"
          }
          onChange={setQuery}
          onSubmit={submitSearch}
        />

        <div
          className="teamver-drive-picker-list teamver-drive-import-list"
          role="listbox"
          aria-label="드라이브 폴더 목록"
        >
          {showRecentSection ? (
            <div
              className="teamver-drive-import-section"
              data-testid="teamver-drive-picker-recent"
            >
              <div className="teamver-drive-import-section-label">최근 위치</div>
              {recentTargets.map((target) => {
                const selected = target.id === selectedTargetId;
                return (
                  <button
                    key={`recent:${target.id}`}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={`teamver-drive-picker-row${selected ? " is-selected" : ""}`}
                    data-testid={`teamver-drive-picker-target-${target.id}`}
                    onClick={() => selectTarget(target)}
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
              })}
            </div>
          ) : null}
          {showInitialLoading ? (
            <div className="teamver-drive-picker-empty">드라이브 불러오는 중…</div>
          ) : null}
          {showHomeRecentSection ? (
            <div
              className="teamver-drive-import-section"
              data-testid="teamver-drive-picker-home-recent"
            >
              <div className="teamver-drive-import-section-label">Drive 홈 최근</div>
              {renderFolderGrid(
                displayedHomeRecentTargets,
                "home-recent",
                "teamver-drive-picker-home-recent",
              )}
            </div>
          ) : null}
          {showRecentAssetSection ? (
            <div
              className="teamver-drive-import-section"
              data-testid="teamver-drive-picker-recent-assets"
            >
              <div className="teamver-drive-import-section-label">최근 파일</div>
              {renderAssetGrid(recentAssetRows, "recent-asset", (row) => {
                selectFolderFromRecentAsset(row as TeamverDrivePublishRecentAsset);
              })}
            </div>
          ) : null}
          {(showRecentSection || showHomeRecentSection || showRecentAssetSection) && hasBrowseContent ? (
            <div className="teamver-drive-import-section-label">폴더 탐색</div>
          ) : null}
          {showInitialLoading ? null : loading || browseLoading || (searchLoading && searching) ? (
            <div className="teamver-drive-picker-empty">
              {searching ? "드라이브 폴더 검색 중…" : "드라이브 폴더 불러오는 중…"}
            </div>
          ) : browseError && !hasBrowseContent ? (
            <div className="teamver-drive-picker-empty">{browseError}</div>
          ) : searchError && !hasBrowseContent ? (
            <div className="teamver-drive-picker-empty">{searchError}</div>
          ) : hasBrowseContent ? (
            <>
              {displayedTargets.map((target) => {
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
                      if (searching) {
                        selectTarget(target);
                        return;
                      }
                      enterFolder(target);
                    }}
                  >
                    <span className="teamver-drive-picker-row-icon">
                      <Icon name={target.sharedDriveId ? "folder-filled" : "folder"} size={15} />
                    </span>
                    <span className="teamver-drive-picker-row-copy">
                      <span>{target.label}</span>
                      <small>{target.description}</small>
                    </span>
                    {selected ? <Icon name="check" size={15} /> : !searching && target.folderId ? <Icon name="chevron-right" size={14} /> : null}
                  </button>
                );
              })}
              {renderAssetGrid(displayedBrowseAssets, "browse", () => selectCurrentFolderFromAsset())}
            </>
          ) : (
            <div className="teamver-drive-picker-empty">
              {searching
                ? "일치하는 폴더가 없습니다."
                : "이 폴더에 하위 폴더나 파일이 없습니다. 아래 「이 폴더 사용」으로 저장하세요."}
            </div>
          )}
          {!searching && browseHasMore ? (
            <button
              type="button"
              className="teamver-drive-import-load-more"
              disabled={browseLoading}
              data-testid="teamver-drive-picker-load-more"
              onClick={() => void refreshBrowse({ append: true, before: browseNextCursor })}
            >
              더 보기
            </button>
          ) : null}
        </div>
        {!searching && currentTarget ? (
          <footer className="teamver-drive-picker-footer">
            <span className="teamver-drive-picker-current" title={currentTarget.label}>
              {currentTarget.label}
            </span>
            <button
              type="button"
              className="teamver-drive-picker-use"
              data-testid="teamver-drive-picker-use-current"
              onClick={() => {
                onSelect(currentTarget);
                onClose();
              }}
            >
              이 폴더 사용
            </button>
          </footer>
        ) : null}
      </section>
    </div>
    ),
    document.body,
  );
}
