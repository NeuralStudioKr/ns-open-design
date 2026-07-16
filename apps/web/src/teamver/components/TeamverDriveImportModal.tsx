import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  browseTeamverDriveImportPage,
  importRowMatchesScope,
  invalidateTeamverDriveImportCaches,
  listTeamverDriveImportRecent,
  listTeamverDriveImportScopes,
  searchTeamverDriveImportRows,
  TEAMVER_DRIVE_IMPORT_BROWSE_PAGE_SIZE,
  TEAMVER_DRIVE_IMPORT_SEARCH_MIN,
  type TeamverDriveImportAssetRow,
  type TeamverDriveImportListRow,
  type TeamverDriveImportScope,
} from "../driveImportList";
import {
  trackTeamverDriveImportModalSurfaceView,
  trackTeamverDriveImportPickClick,
} from "../teamverDriveImportAnalytics";
import {
  getTeamverDriveBrowsePageCached,
  loadTeamverDriveBrowsePageCachedForSignal,
  type TeamverDriveBrowsePageCacheEntry,
} from "../driveBrowsePageCache";
import { isTeamverDriveAbortError } from "../driveApi";
import {
  handleTeamverBffAuthFailure,
  redirectToTeamverLoginFromEmbed,
  TEAMVER_EMBED_TRANSIENT_AUTH_MESSAGE,
} from "../teamverBffAuthError";
import { formatTeamverDriveBrowseReloginMessage } from "../teamverDriveAuthCopy";
import { TeamverDriveModalNav, TeamverDriveListSkeleton } from "./TeamverDriveModalNav";
import { TeamverDriveScopeSidebar } from "./TeamverDriveScopeSidebar";
import { TeamverDriveSearchField } from "./TeamverDriveSearchField";
import { driveSearchTextMatches, useSubmittedDriveSearch } from "../useSubmittedDriveSearch";
import { useTeamverDriveModalFocusTrap } from "../useTeamverDriveModalFocusTrap";
import type { TeamverDrivePublishRecentAsset } from "../drivePublishRecentAssets";
import type { TeamverDrivePublishTarget } from "../drivePublishTargets";


const MAX_PICK = 12;
const SEARCH_LIMIT = 40;
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
  /** Home composer stages assets before a project exists; default is project attach. */
  stagingMode?: "project" | "home";
  analyticsPageName?: "home" | "chat_panel";
};

function scopeKey(scope: TeamverDriveImportScope, folderId: string | null): string {
  if (scope.mode === "personal") return `personal:${folderId ?? "root"}`;
  return `shared:${scope.sharedDriveId}:${folderId ?? "root"}`;
}

function rootCrumb(scope: TeamverDriveImportScope): NavCrumb {
  return { folderId: null, name: scope.label };
}

function matchesLocalQuery(row: TeamverDriveImportListRow, query: string): boolean {
  if (row.kind === "folder") return driveSearchTextMatches(query, row.name);
  return driveSearchTextMatches(query, row.name, row.assetId);
}

function assetFromRow(row: TeamverDriveImportAssetRow): TeamverDriveImportAsset {
  return {
    assetId: row.assetId,
    filename: row.name,
    mimeType: row.mimeType,
  };
}

function browseCacheKey(
  workspaceId: string,
  scope: TeamverDriveImportScope,
  folderId: string | null,
  before: string | null,
): string {
  return [
    workspaceId.trim(),
    scope.mode === "shared" ? scope.sharedDriveId : "personal",
    folderId ?? "root",
    before ?? "start",
  ].join(":");
}

function targetsFromImportFolders(
  scope: TeamverDriveImportScope,
  rows: TeamverDriveImportListRow[],
): TeamverDrivePublishTarget[] {
  return rows
    .filter((row): row is Extract<TeamverDriveImportListRow, { kind: "folder" }> => row.kind === "folder")
    .map((folder) => {
      const sharedDriveId = scope.mode === "shared" ? scope.sharedDriveId : folder.sharedDriveId ?? null;
      return {
        id: sharedDriveId ? `shared:${sharedDriveId}:${folder.folderId}` : `personal:${folder.folderId}`,
        label: scope.mode === "shared" ? `${scope.label} / ${folder.name}` : folder.name,
        description: scope.mode === "shared" ? "팀 드라이브 폴더" : "내 드라이브 폴더",
        folderId: folder.folderId,
        sharedDriveId,
      };
    });
}

function rowsFromBrowseCache(entry: TeamverDriveBrowsePageCacheEntry): TeamverDriveImportListRow[] {
  if (entry.rows && entry.rows.length > 0) return entry.rows;
  const folders: TeamverDriveImportListRow[] = entry.targets
    .filter((target) => Boolean(target.folderId?.trim()))
    .map((target) => {
      const label = target.label.includes(" / ")
        ? target.label.slice(target.label.lastIndexOf(" / ") + 3)
        : target.label;
      return {
        kind: "folder" as const,
        folderId: target.folderId!,
        name: label,
        sharedDriveId: target.sharedDriveId,
      };
    });
  return [...folders, ...entry.assets];
}

function importRecentFromPublish(
  assets: TeamverDrivePublishRecentAsset[],
): TeamverDriveImportAssetRow[] {
  return assets.map((asset) => ({
    kind: "asset" as const,
    assetId: asset.assetId,
    name: asset.name,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes,
    sharedDriveId: asset.sharedDriveId,
  }));
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
  stagingMode = "project",
  analyticsPageName = "chat_panel",
}: Props) {
  const t = useTeamverT();
  const branding = useTeamverBranding();
  const analytics = useAnalytics();
  const attachPolicyActive = shouldApplyEmbedFileAttachPolicy(branding);
  const surfaceTrackedRef = useRef(false);
  const openSessionRef = useRef(false);
  const modalRef = useRef<HTMLElement | null>(null);
  const listHasContentRef = useRef(false);
  // Track whether the *mousedown* started on the backdrop itself so a drag
  // that begins inside the list (e.g. selecting a long file name) and ends
  // on the backdrop doesn't dismiss the modal.
  const backdropMouseDownRef = useRef(false);
  const browseFetchSeqRef = useRef(0);
  const browseAbortRef = useRef<AbortController | null>(null);
  const [scopes, setScopes] = useState<TeamverDriveImportScope[]>([]);
  const [scopeIndex, setScopeIndex] = useState(0);
  const [navStack, setNavStack] = useState<NavCrumb[]>([]);
  const [rows, setRows] = useState<TeamverDriveImportListRow[]>([]);
  const [recentRows, setRecentRows] = useState<TeamverDriveImportAssetRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [scopesHydrated, setScopesHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [actionHint, setActionHint] = useState<string | null>(null);
  const {
    query,
    setQuery,
    submittedQuery,
    searchMode,
    submitSearch,
    resetSearch,
  } = useSubmittedDriveSearch(TEAMVER_DRIVE_IMPORT_SEARCH_MIN);
  const [selected, setSelected] = useState<Map<string, TeamverDriveImportAsset>>(new Map());
  const [thumbUrls, setThumbUrls] = useState<Map<string, string>>(new Map());
  const [browseNextCursor, setBrowseNextCursor] = useState<string | null>(null);
  const [browseHasMore, setBrowseHasMore] = useState(false);

  const selectedAssets = useMemo(() => Array.from(selected.values()), [selected]);
  const selectedCount = selectedAssets.length;
  const canAttach = selectedCount > 0 && !confirming;
  const [searchFieldFocused, setSearchFieldFocused] = useState(false);
  const activeScope = scopes[scopeIndex] ?? null;
  const awaitingScopes = open && (!scopesHydrated || !activeScope);
  const showFullLoader =
    (loading || awaitingScopes) && rows.length === 0 && recentRows.length === 0;
  const currentFolderId = navStack[navStack.length - 1]?.folderId ?? null;
  // `showRecent` still controls whether recent rows are FETCHED (personal root),
  // matching the picker's home-recent semantics. Actual visibility below is
  // additionally gated on search focus / empty state so the list is not always
  // pushed down by the "최근" strip.
  const showRecent =
    !searchMode && currentFolderId == null && activeScope?.mode === "personal";
  const hasBrowseImportContent =
    (rows.length > 0);
  const recentSectionRevealed =
    showRecent && (searchFieldFocused || !hasBrowseImportContent || selectedCount > 0);

  useTeamverDriveModalFocusTrap(open, modalRef);

  useEffect(() => {
    if (!authRequired) return;
    invalidateTeamverDriveImportCaches(workspaceId);
  }, [authRequired, workspaceId]);

  useEffect(() => {
    if (!open) {
      surfaceTrackedRef.current = false;
      return;
    }
    if (surfaceTrackedRef.current) return;
    surfaceTrackedRef.current = true;
    trackTeamverDriveImportModalSurfaceView(analytics.track, {
      page_name: analyticsPageName,
      area: "drive_import_modal",
    });
  }, [analytics.track, analyticsPageName, open]);

  useEffect(() => {
    if (!open) return;
    setBrowseNextCursor(null);
  }, [activeScope, currentFolderId, open, scopeIndex, submittedQuery]);

  useEffect(() => {
    listHasContentRef.current = rows.length > 0 || recentRows.length > 0;
  }, [recentRows.length, rows.length]);

  const refreshRows = useCallback(
    async (options?: { append?: boolean; before?: string | null }) => {
      if (!open || !workspaceId.trim() || !activeScope) return;
      const append = options?.append ?? false;
      const before = options?.before ?? null;
      const seq = ++browseFetchSeqRef.current;
      browseAbortRef.current?.abort();
      const abortController = new AbortController();
      browseAbortRef.current = abortController;
      const signal = abortController.signal;
      if (listHasContentRef.current && !append) setRefreshing(true);
      else if (!append) setLoading(true);
      setError(null);
      try {
        const sharedDriveId = activeScope.mode === "shared" ? activeScope.sharedDriveId : null;
        const trimmedQuery = submittedQuery.trim();

        if (trimmedQuery.length >= TEAMVER_DRIVE_IMPORT_SEARCH_MIN) {
          const searchRows = await searchTeamverDriveImportRows({
            workspaceId,
            query: trimmedQuery,
            sharedDriveId,
            limit: SEARCH_LIMIT,
            signal,
          });
          if (seq !== browseFetchSeqRef.current) return;
          setAuthRequired(false);
          setRecentRows([]);
          setRows(searchRows.filter((row) => importRowMatchesScope(row, activeScope)));
          setBrowseHasMore(false);
          setBrowseNextCursor(null);
          return;
        }

        const cacheKey = browseCacheKey(workspaceId, activeScope, currentFolderId, before);

        // Soft-expire: keep auth banner if scopes/browse already proved 401;
        // do not paint cached rows over a known-expired session.
        if (!append && !authRequired) {
          const cached = getTeamverDriveBrowsePageCached(cacheKey);
          if (cached) {
            if (seq !== browseFetchSeqRef.current) return;
            const cachedRows = rowsFromBrowseCache(cached);
            setBrowseHasMore(cached.hasMore);
            setBrowseNextCursor(cached.nextCursor);
            setRows(cachedRows);
            if (showRecent) {
              const browseAssetIds = new Set(
                cachedRows.filter((row) => row.kind === "asset").map((row) => row.assetId),
              );
              const fromPublish = importRecentFromPublish(cached.recentAssets)
                .filter((row) => !browseAssetIds.has(row.assetId));
              if (fromPublish.length > 0) {
                setRecentRows(fromPublish);
              } else {
                const recent = await listTeamverDriveImportRecent({ workspaceId, limit: 16 }).catch(
                  () => [] as TeamverDriveImportAssetRow[],
                );
                if (seq !== browseFetchSeqRef.current) return;
                setRecentRows(recent.filter((row) => !browseAssetIds.has(row.assetId)));
              }
            } else {
              setRecentRows([]);
            }
            return;
          }
        }

        const recentPromise =
          showRecent && !append
            ? listTeamverDriveImportRecent({ workspaceId, limit: 16 }).catch(
              () => [] as TeamverDriveImportAssetRow[],
            )
            : Promise.resolve([] as TeamverDriveImportAssetRow[]);

        const browsePromise = append
          ? browseTeamverDriveImportPage({
            workspaceId,
            scope: activeScope,
            navFolderId: currentFolderId,
            limit: TEAMVER_DRIVE_IMPORT_BROWSE_PAGE_SIZE,
            before,
            signal,
          }).then((page) => ({
            rows: page.rows,
            targets: targetsFromImportFolders(activeScope, page.rows),
            assets: page.rows.filter(
              (row): row is TeamverDriveImportAssetRow => row.kind === "asset",
            ),
            recentAssets: [] as TeamverDrivePublishRecentAsset[],
            hasMore: page.hasMore,
            nextCursor: page.nextCursor,
          }))
          : loadTeamverDriveBrowsePageCachedForSignal(cacheKey, signal, async () => {
            const page = await browseTeamverDriveImportPage({
              workspaceId,
              scope: activeScope,
              navFolderId: currentFolderId,
              limit: TEAMVER_DRIVE_IMPORT_BROWSE_PAGE_SIZE,
              before,
              signal,
            });
            return {
              rows: page.rows,
              targets: targetsFromImportFolders(activeScope, page.rows),
              assets: page.rows.filter(
                (row): row is TeamverDriveImportAssetRow => row.kind === "asset",
              ),
              recentAssets: [] as TeamverDrivePublishRecentAsset[],
              hasMore: page.hasMore,
              nextCursor: page.nextCursor,
            };
          });

        const [entry, recent] = await Promise.all([browsePromise, recentPromise]);
        if (seq !== browseFetchSeqRef.current) return;

        setAuthRequired(false);
        const nextRows = rowsFromBrowseCache(entry);
        setBrowseHasMore(entry.hasMore);
        setBrowseNextCursor(entry.nextCursor);
        setRows((current) => (append ? [...current, ...nextRows] : nextRows));

        if (showRecent && !append) {
          const browseAssetIds = new Set(
            nextRows.filter((row) => row.kind === "asset").map((row) => row.assetId),
          );
          setRecentRows(recent.filter((row) => !browseAssetIds.has(row.assetId)));
        } else if (!append) {
          setRecentRows([]);
        }
      } catch (err) {
        if (seq !== browseFetchSeqRef.current) return;
        if (isTeamverDriveAbortError(err)) return;
        if (!append) {
          setRows([]);
          setRecentRows([]);
        }
        setBrowseHasMore(false);
        setBrowseNextCursor(null);
        if (
          handleTeamverBffAuthFailure(err, {
            onRelogin: () => {
              setAuthRequired(true);
              setError(null);
            },
            onTransient: () => {
              setAuthRequired(false);
              setError(TEAMVER_EMBED_TRANSIENT_AUTH_MESSAGE);
            },
          })
        ) {
          // handled
        } else {
          setAuthRequired(false);
          setError(formatTeamverDriveImportErrorMessage(err));
        }
      } finally {
        if (seq === browseFetchSeqRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [activeScope, authRequired, currentFolderId, open, showRecent, submittedQuery, workspaceId],
  );

  useEffect(() => {
    if (!open) {
      openSessionRef.current = false;
      browseAbortRef.current?.abort();
      browseAbortRef.current = null;
      return;
    }
    if (openSessionRef.current) return;
    openSessionRef.current = true;

    const initial = new Map<string, TeamverDriveImportAsset>();
    for (const asset of initialAssets.slice(0, MAX_PICK)) {
      const blocked = embedAttachBlockReason(asset.filename ?? asset.assetId, {
        mimeType: asset.mimeType,
        slideOnlyMvp: attachPolicyActive,
      });
      if (!blocked) initial.set(asset.assetId, asset);
    }
    setSelected(initial);
    resetSearch();
    setScopeIndex(0);
    setNavStack([]);
    setRows([]);
    setRecentRows([]);
    setError(null);
    setAuthRequired(false);
    setActionHint(null);
    setBrowseNextCursor(null);
    setBrowseHasMore(false);
    setScopesHydrated(false);
    listHasContentRef.current = false;

    let cancelled = false;
    void (async () => {
      try {
        const nextScopes = await listTeamverDriveImportScopes(workspaceId);
        if (!cancelled) {
          setScopes(
            nextScopes.length > 0 ? nextScopes : [{ mode: "personal", folderId: null, label: "내 드라이브" }],
          );
        }
      } catch (err) {
        if (!cancelled) {
          if (
            handleTeamverBffAuthFailure(err, {
              onRelogin: () => setAuthRequired(true),
              onTransient: () => {
                setAuthRequired(false);
                setError(TEAMVER_EMBED_TRANSIENT_AUTH_MESSAGE);
              },
            })
          ) {
            // handled
          }
          setScopes([{ mode: "personal", folderId: null, label: "내 드라이브" }]);
        }
      } finally {
        if (!cancelled) setScopesHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attachPolicyActive, initialAssets, open, resetSearch, workspaceId]);

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
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const next = await fetchTeamverDriveImportThumbnails({
          workspaceId,
          items: thumbnailTargets,
        });
        if (cancelled) return;
        setThumbUrls((current) => {
          const merged = new Map(current);
          for (const [assetId, url] of next) merged.set(assetId, url);
          return merged;
        });
      } catch {
        /* keep prior thumbs */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, thumbnailTargets, workspaceId]);

  const confirmAssets = useCallback(
    (assets: TeamverDriveImportAsset[]) => {
      if (assets.length === 0 || confirming || partialResult) return;
      trackTeamverDriveImportPickClick(analytics.track, {
        page_name: analyticsPageName,
        area: "drive_import_modal",
        element: "drive_import_pick",
        asset_count: assets.length,
      });
      void onConfirm(assets);
    },
    [analytics.track, analyticsPageName, confirming, onConfirm, partialResult],
  );

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !confirming) {
        event.preventDefault();
        if (searchMode || query.trim()) {
          resetSearch();
          return;
        }
        if (navStack.length > 1) {
          setNavStack((stack) => stack.slice(0, -1));
          return;
        }
        onClose();
        return;
      }
      if (event.key === "Enter" && !confirming && !partialResult && selectedCount > 0) {
        const target = event.target;
        if (target instanceof HTMLElement && target.closest(".teamver-drive-picker-search")) {
          return;
        }
        event.preventDefault();
        confirmAssets(selectedAssets);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    confirmAssets,
    confirming,
    navStack.length,
    onClose,
    open,
    partialResult,
    query,
    resetSearch,
    searchMode,
    selectedAssets,
    selectedCount,
  ]);

  useEffect(() => {
    if (!actionHint) return;
    const timer = window.setTimeout(() => setActionHint(null), 3200);
    return () => window.clearTimeout(timer);
  }, [actionHint]);

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

  if (!open) return null;

  function assetBlockReason(row: TeamverDriveImportAssetRow): string | null {
    return embedAttachBlockReason(row.name, {
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      slideOnlyMvp: attachPolicyActive,
    });
  }

  function toggleAsset(row: TeamverDriveImportAssetRow) {
    const blockReason = assetBlockReason(row);
    if (blockReason) {
      setActionHint(blockReason);
      return;
    }

    setSelected((current) => {
      const next = new Map(current);
      if (next.has(row.assetId)) {
        next.delete(row.assetId);
        setActionHint(null);
        return next;
      }
      if (next.size >= MAX_PICK) {
        setActionHint(t("teamver.driveImport.maxPickReached", { max: MAX_PICK }));
        return current;
      }
      next.set(row.assetId, assetFromRow(row));
      setActionHint(null);
      return next;
    });
  }

  function confirmAssetRow(row: TeamverDriveImportAssetRow) {
    const blockReason = assetBlockReason(row);
    if (blockReason) {
      setActionHint(blockReason);
      return;
    }
    if (confirming || partialResult) return;

    let assets = selectedAssets;
    if (!selected.has(row.assetId)) {
      if (selectedCount >= MAX_PICK) {
        setActionHint(t("teamver.driveImport.maxPickReached", { max: MAX_PICK }));
        return;
      }
      assets = [...selectedAssets, assetFromRow(row)];
      setSelected((current) => {
        const next = new Map(current);
        next.set(row.assetId, assetFromRow(row));
        return next;
      });
    }
    confirmAssets(assets);
  }

  function enterFolder(row: Extract<TeamverDriveImportListRow, { kind: "folder" }>) {
    setNavStack((current) => [...current, { folderId: row.folderId, name: row.name }]);
    resetSearch();
  }

  function renderAssetCard(row: TeamverDriveImportAssetRow, keyPrefix: string) {
    const picked = selected.has(row.assetId);
    const blockReason = assetBlockReason(row);
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
        disabled={confirming || (!picked && !blocked && selectedCount >= MAX_PICK)}
        onMouseDown={(event) => {
          if (event.button !== 0 || confirming || partialResult) return;
          event.preventDefault();
          if (blocked) {
            if (blockReason) setActionHint(blockReason);
            return;
          }
          toggleAsset(row);
        }}
        onClick={(event) => {
          event.preventDefault();
        }}
        onDoubleClick={(event) => {
          event.preventDefault();
          confirmAssetRow(row);
        }}
      >
        <span className="teamver-drive-import-card-visual" aria-hidden>
          {thumbUrl ? (
            <img src={thumbUrl} alt="" className="teamver-drive-import-card-thumb" loading="lazy" />
          ) : (
            <Icon name={iconName} size={22} />
          )}
          {picked ? (
            <span className="teamver-drive-import-card-check" aria-hidden>
              <Icon name="check" size={14} />
            </span>
          ) : null}
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

  return createPortal(
    (
    <div
      className="teamver-drive-picker-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        backdropMouseDownRef.current = event.target === event.currentTarget;
      }}
      onMouseUp={(event) => {
        if (
          event.target === event.currentTarget
          && backdropMouseDownRef.current
          && !confirming
        ) {
          onClose();
        }
        backdropMouseDownRef.current = false;
      }}
    >
      <section
        ref={modalRef}
        className="teamver-drive-picker-modal teamver-drive-import-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="teamver-drive-import-title"
        data-testid="teamver-drive-import-modal"
        tabIndex={-1}
      >
        <header className="teamver-drive-picker-head">
          <div>
            <h2 id="teamver-drive-import-title">teamver Drive에서 가져오기</h2>
            <p>
              {stagingMode === "home"
                ? `최대 ${MAX_PICK}개 · 클릭으로 선택, 더블클릭으로 바로 첨부`
                : `최대 ${MAX_PICK}개 · 클릭으로 선택, 더블클릭으로 바로 가져오기`}
            </p>
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

        <div className="teamver-drive-modal-body">
          {scopes.length > 0 ? (
            <TeamverDriveScopeSidebar
              scopes={scopes}
              activeIndex={scopeIndex}
              disabled={confirming}
              onSelect={(index) => {
                const scope = scopes[index];
                if (!scope) return;
                setScopeIndex(index);
                setNavStack([rootCrumb(scope)]);
                resetSearch();
                setRows([]);
                setRecentRows([]);
                setBrowseNextCursor(null);
              }}
            />
          ) : null}

          <div className="teamver-drive-modal-content">
            <TeamverDriveModalNav
              crumbs={navStack}
              disabled={confirming}
              onBack={() => {
                setNavStack((stack) => (stack.length > 1 ? stack.slice(0, -1) : stack));
                resetSearch();
              }}
              onNavigate={(index) => {
                setNavStack(navStack.slice(0, index + 1));
                resetSearch();
              }}
            />

            <TeamverDriveSearchField
              autoFocus
              value={query}
              ariaLabel="드라이브 파일 검색"
              minSearchLength={TEAMVER_DRIVE_IMPORT_SEARCH_MIN}
              placeholder={
                searchMode
                  ? "드라이브 전체 검색 결과"
                  : "이 폴더에서 필터 · Enter로 전체 검색"
              }
              disabled={confirming}
              onChange={setQuery}
              onSubmit={submitSearch}
              onClear={resetSearch}
              onFocus={() => setSearchFieldFocused(true)}
              onBlur={() => setSearchFieldFocused(false)}
            />

        <div
          className={`teamver-drive-picker-list teamver-drive-import-list${refreshing ? " is-refreshing" : ""}`}
          role="listbox"
          aria-label="드라이브 파일 목록"
          aria-busy={refreshing || showFullLoader}
        >
          {showFullLoader ? (
            <TeamverDriveListSkeleton />
          ) : authRequired ? (
            <div
              className="teamver-drive-picker-empty teamver-drive-picker-empty--auth"
              role="status"
              aria-live="polite"
              data-testid="teamver-drive-import-auth-required"
            >
              {formatTeamverDriveBrowseReloginMessage()}{" "}
              <button
                type="button"
                className="teamver-drive-picker-empty__login"
                data-testid="teamver-drive-import-login"
                onClick={redirectToTeamverLoginFromEmbed}
              >
                다시 로그인
              </button>
            </div>
          ) : error ? (
            <div
              className="teamver-drive-picker-empty"
              role="status"
              data-testid="teamver-drive-import-error"
            >
              <p>{error}</p>
              <button
                type="button"
                className="teamver-drive-picker-empty__retry"
                data-testid="teamver-drive-import-retry"
                disabled={confirming || loading}
                onClick={() => void refreshRows()}
              >
                다시 시도
              </button>
            </div>
          ) : (
            <>
              {recentSectionRevealed && recentRows.length > 0 ? (
                <div className="teamver-drive-import-section" data-testid="teamver-drive-import-recent">
                  <div className="teamver-drive-import-section-label">최근</div>
                  {renderAssetGrid(recentRows, "recent")}
                </div>
              ) : null}

              {folderRows.length > 0 || browseAssetRows.length > 0 ? (
                <>
                  {recentSectionRevealed && recentRows.length > 0 && (folderRows.length > 0 || browseAssetRows.length > 0) ? (
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
              ) : recentSectionRevealed && recentRows.length > 0 ? null : (
                <div className="teamver-drive-picker-empty">
                  {searchMode ? "일치하는 드라이브 파일이 없습니다" : "이 폴더에 파일이 없습니다"}
                </div>
              )}
              {!searchMode && browseHasMore ? (
                <button
                  type="button"
                  className="teamver-drive-import-load-more"
                  disabled={confirming || loading}
                  data-testid="teamver-drive-import-load-more"
                  onClick={() => void refreshRows({ append: true, before: browseNextCursor })}
                >
                  {t("teamver.driveImport.loadMore")}
                </button>
              ) : null}
            </>
          )}
        </div>
          </div>
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

        {actionHint ? (
          <p className="teamver-drive-import-action-hint" role="status" data-testid="teamver-drive-import-action-hint">
            {actionHint}
          </p>
        ) : null}

        {selectedCount > 0 && !partialResult ? (
          <div className="teamver-drive-import-selected" data-testid="teamver-drive-import-selected">
            {selectedAssets.map((asset) => (
              <button
                key={asset.assetId}
                type="button"
                className="teamver-drive-import-selected-chip"
                disabled={confirming}
                title={asset.filename ?? asset.assetId}
                onClick={() => {
                  setSelected((current) => {
                    const next = new Map(current);
                    next.delete(asset.assetId);
                    return next;
                  });
                }}
              >
                <span className="teamver-drive-import-selected-name">
                  {asset.filename ?? asset.assetId}
                </span>
                <Icon name="close" size={12} />
              </button>
            ))}
          </div>
        ) : null}

        <footer className="teamver-drive-import-footer">
          <span className="teamver-drive-import-count">
            {t("teamver.driveImport.selectedCount", { n: selectedCount, max: MAX_PICK })}
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
              onClick={() => confirmAssets(selectedAssets)}
            >
              {confirming
                ? "가져오는 중…"
                : selectedCount > 0
                  ? t("teamver.driveImport.attachCount", { n: selectedCount })
                  : "첨부"}
            </button>
            ) : null}
          </div>
        </footer>
      </section>
    </div>
    ),
    document.body,
  );
}
