import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../components/Icon";
import {
  TEAMVER_DRIVE_PUBLISH_SEARCH_MIN,
  type TeamverDrivePublishTarget,
} from "../drivePublishTargets";
import { listTeamverDrivePublishHomeRecentTargets } from "../drivePublishHomeRecent";
import {
  listTeamverDriveImportRows,
  listTeamverDriveImportScopes,
  type TeamverDriveImportFolderRow,
  type TeamverDriveImportScope,
} from "../driveImportList";

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
  crumb: NavCrumb,
): TeamverDrivePublishTarget {
  if (crumb.folderId == null) return targetFromScope(scope);
  return targetFromFolder(scope, {
    folderId: crumb.folderId,
    name: crumb.name,
  });
}

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
  workspaceId,
  targets,
  recentTargets = [],
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
  const [scopes, setScopes] = useState<TeamverDriveImportScope[]>([]);
  const [scopeIndex, setScopeIndex] = useState(0);
  const [navStack, setNavStack] = useState<NavCrumb[]>([]);
  const [browseTargets, setBrowseTargets] = useState<TeamverDrivePublishTarget[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [homeRecentTargets, setHomeRecentTargets] = useState<TeamverDrivePublishTarget[]>([]);
  const [homeRecentLoading, setHomeRecentLoading] = useState(false);
  const filteredTargets = useMemo(
    () => targets.filter((target) => matchesTarget(target, query)),
    [query, targets],
  );
  const trimmedQuery = query.trim();
  const searching = Boolean(onSearch && trimmedQuery.length >= TEAMVER_DRIVE_PUBLISH_SEARCH_MIN);
  const activeScope = scopes[scopeIndex] ?? null;
  const currentCrumb = navStack[navStack.length - 1] ?? null;
  const currentFolderId = currentCrumb?.folderId ?? null;
  const currentTarget = activeScope && currentCrumb
    ? targetFromCurrentFolder(activeScope, currentCrumb)
    : null;
  const displayedTargets = searching && searchTargets
    ? searchTargets
    : browseTargets.length > 0
      ? browseTargets
      : filteredTargets;
  const showRecentSection =
    !searching
    && currentFolderId == null
    && recentTargets.length > 0;
  const displayedHomeRecentTargets = useMemo(() => {
    if (searching || currentFolderId != null) return [];
    const localIds = new Set(recentTargets.map((target) => target.id));
    return homeRecentTargets.filter((target) => !localIds.has(target.id));
  }, [currentFolderId, homeRecentTargets, recentTargets, searching]);
  const showHomeRecentSection = displayedHomeRecentTargets.length > 0;

  function selectTarget(target: TeamverDrivePublishTarget) {
    onSelect(target);
    onClose();
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

  useEffect(() => {
    if (!open || !workspaceId?.trim()) {
      setScopes([]);
      setNavStack([]);
      setBrowseTargets([]);
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
    if (!open || !workspaceId?.trim() || !activeScope || searching) return;
    let canceled = false;
    setBrowseLoading(true);
    setBrowseError(null);
    void (async () => {
      try {
        const sharedDriveId = activeScope.mode === "shared" ? activeScope.sharedDriveId : null;
        const rows = await listTeamverDriveImportRows({
          workspaceId,
          folderId: currentFolderId,
          sharedDriveId,
          limit: 80,
        });
        if (canceled) return;
        const folders = rows
          .filter((row): row is TeamverDriveImportFolderRow => row.kind === "folder")
          .map((row) => targetFromFolder(activeScope, row));
        const rootTarget = currentFolderId == null ? [targetFromScope(activeScope)] : [];
        setBrowseTargets([...rootTarget, ...folders]);
      } catch {
        if (!canceled) {
          setBrowseTargets([]);
          setBrowseError("드라이브 폴더를 불러오지 못했습니다");
        }
      } finally {
        if (!canceled) setBrowseLoading(false);
      }
    })();
    return () => {
      canceled = true;
    };
  }, [activeScope, currentFolderId, open, searching, workspaceId]);

  useEffect(() => {
    if (!open || !workspaceId?.trim() || searching || currentFolderId != null) {
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
  }, [currentFolderId, open, searching, workspaceId]);

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
            setSearchError("드라이브 검색에 실패했습니다");
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
                  setQuery("");
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
                      onClick={() => setNavStack(navStack.slice(0, index + 1))}
                    >
                      {crumb.name}
                    </button>
                  )}
                </span>
              );
            })}
          </nav>
        ) : null}

        <label className="teamver-drive-picker-search">
          <Icon name="search" size={14} />
          <input
            autoFocus
            value={query}
            aria-label="드라이브 폴더 검색"
            placeholder="폴더 검색"
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </label>

        <div className="teamver-drive-picker-list" role="listbox" aria-label="드라이브 폴더 목록">
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
          {homeRecentLoading && !showHomeRecentSection && !showRecentSection ? (
            <div className="teamver-drive-picker-empty">Drive 홈 최근 불러오는 중…</div>
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
          {(showRecentSection || showHomeRecentSection) && displayedTargets.length > 0 ? (
            <div className="teamver-drive-import-section-label">폴더 탐색</div>
          ) : null}
          {loading || browseLoading || (searchLoading && displayedTargets.length === 0 && !showRecentSection && !showHomeRecentSection) ? (
            <div className="teamver-drive-picker-empty">
              {searching ? "드라이브 폴더 검색 중…" : "드라이브 폴더 불러오는 중…"}
            </div>
          ) : browseError && displayedTargets.length === 0 ? (
            <div className="teamver-drive-picker-empty">{browseError}</div>
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
                    const canEnter = !searching && target.folderId && activeScope;
                    if (canEnter) {
                      setNavStack((current) => [
                        ...current,
                        {
                          folderId: target.folderId,
                          name: target.label.split(" / ").at(-1) ?? target.label,
                        },
                      ]);
                      return;
                    }
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
                  {selected ? <Icon name="check" size={15} /> : !searching && target.folderId ? <Icon name="chevron-right" size={14} /> : null}
                </button>
              );
            })
          ) : (
            <div className="teamver-drive-picker-empty">일치하는 폴더가 없습니다.</div>
          )}
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
  );
}
