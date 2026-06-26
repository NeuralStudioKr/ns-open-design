import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../components/Icon";
import { isTeamverEmbedMode } from "../designApiBase";
import { getDesignBffClient } from "../designBffClient";
import { readActiveTeamverWorkspaceId } from "../activeTeamverWorkspace";
import {
  DEFAULT_PUBLISH_TARGET,
  ensureDefaultPublishTarget,
  readLastPublishTargetId,
  resolvePublishTargetById,
  writeLastPublishTargetId,
} from "../drivePublishLastTarget";
import {
  listTeamverDrivePublishTargets,
  searchTeamverDrivePublishTargets,
  type TeamverDrivePublishTarget,
} from "../drivePublishTargets";
import {
  pushRecentPublishTarget,
  readRecentPublishTargets,
} from "../drivePublishRecentTargets";
import { TeamverDrivePickerModal } from "./TeamverDrivePickerModal";
import { TeamverDrivePublishHistory } from "./TeamverDrivePublishHistory";
import { TeamverDriveTargetSelect } from "./TeamverDriveTargetSelect";
import {
  pickReadyPublishOutputs,
  publishTeamverDesignToDrive,
  formatPublishErrorCodeForUser,
  type TeamverPublishDriveFormat,
  type TeamverPublishDriveOutput,
} from "../publishToDrive";
import { clearLatestPublishSummaryCache, prefetchLatestPublishSummaries } from "../latestPublishSummary";
import { notifyTeamverPublishOutputsChanged } from "../teamverPublishEvents";
import {
  isTeamverDesignAppEnabled,
  readTeamverDesignAccessSnapshot,
  subscribeTeamverDesignAccessChanged,
} from "../teamverDesignAccess";
import { subscribeTeamverWorkspaceChanged } from "../teamverWorkspaceEvents";
import { invalidateTeamverDriveImportCaches } from "../driveImportList";

type Props = {
  projectId: string;
  artifactFile: string;
  onCloseMenu: () => void;
  onSuccess?: (output: TeamverPublishDriveOutput, meta?: { partial: boolean }) => void;
  onError?: (err: unknown) => void;
  /** Focus the destination picker once after post-run menu entry (nonce dedupes). */
  focusTargetSelectNonce?: number | null;
};

type LastTargetRestore = "none" | "restored" | "missing";

/**
 * loop 174 — Publish format policy:
 *
 *   - **HTML** is the only output we send to Drive. Main Teamver consumers
 *     (AI Q&A, personal assistant context) expect a single file they can
 *     ingest directly; a ZIP archive forces an unzip pass on every consumer
 *     and was reported as friction by the embed operators (loop 174).
 *   - **ZIP** is intentionally dropped from the Drive publish surface even
 *     though the BE still supports `formats=["zip"]` for backwards-compat
 *     with external scripted callers. If we ever need ZIP back, the format
 *     chip block can return — the publish helper is already format-aware.
 *   - **PDF** is not available because the daemon's PDF exporter is
 *     desktop-only (`apps/daemon/src/import-export-routes.ts:534`), so the
 *     headless staging/prod servers can't generate one server-side. Adding
 *     a BE-side renderer (Playwright/Puppeteer) is a separate track. Until
 *     then we surface a one-line hint pointing operators at the local
 *     "PDF로 내보내기" download.
 *
 * Keeping the union narrow here also forces the typechecker to flag any
 * future format additions in `publishToDrive.ts`.
 */
const PUBLISH_FORMATS: readonly TeamverPublishDriveFormat[] = ["html"];

export function TeamverPublishDriveMenuItem({
  projectId,
  artifactFile,
  onCloseMenu,
  onSuccess,
  onError,
  focusTargetSelectNonce = null,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [loadingTargets, setLoadingTargets] = useState(false);
  const [targetsError, setTargetsError] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [targets, setTargets] = useState<TeamverDrivePublishTarget[]>(() => [
    DEFAULT_PUBLISH_TARGET,
  ]);
  const [selectedTargetId, setSelectedTargetId] = useState<string>(DEFAULT_PUBLISH_TARGET.id);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [recentTargets, setRecentTargets] = useState<TeamverDrivePublishTarget[]>([]);
  // loop 174 — bumped after every successful publish so the embedded
  // `TeamverDrivePublishHistory` refetches and shows the new row in place
  // (otherwise the operator wouldn't see their just-uploaded artifact
  // appear in the history until they reopen the menu).
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const consumedFocusNonceRef = useRef<number | null>(null);
  const [lastTargetRestore, setLastTargetRestore] = useState<LastTargetRestore>("none");
  const [designAppEnabled, setDesignAppEnabled] = useState(
    () => readTeamverDesignAccessSnapshot()?.appEnabled ?? true,
  );

  useEffect(() => {
    if (!isTeamverEmbedMode()) return;
    const sync = () => {
      setDesignAppEnabled(readTeamverDesignAccessSnapshot()?.appEnabled ?? true);
    };
    sync();
    return subscribeTeamverDesignAccessChanged(sync);
  }, []);

  const fetchSeqRef = useRef(0);
  const refreshTargets = useCallback(async () => {
    if (!isTeamverEmbedMode()) return;
    const seq = ++fetchSeqRef.current;
    setLoadingTargets(true);
    setTargetsError(null);
    try {
      const ws = (await readActiveTeamverWorkspaceId())?.trim() || null;
      if (seq !== fetchSeqRef.current) return;
      setWorkspaceId(ws);
      if (!ws) {
        // Workspace bridge isn't ready yet — keep the default option active and
        // surface a soft hint instead of locking the menu (loop 176 deadlock fix).
        setTargets(ensureDefaultPublishTarget([]));
        setLastTargetRestore("none");
        setTargetsError("teamver_workspace_pending");
        return;
      }
      const next = await listTeamverDrivePublishTargets(ws);
      if (seq !== fetchSeqRef.current) return;
      let merged = ensureDefaultPublishTarget(next);
      // loop 174/411 — restore the last-used destination once we know which
      // targets are available. Browse-only folders may sit outside the shallow
      // 200-row list; merge from recent targets before declaring "missing".
      const remembered = readLastPublishTargetId(ws, projectId);
      let restoreState: LastTargetRestore = "none";
      if (remembered) {
        let resolved = resolvePublishTargetById(merged, remembered);
        if (!resolved) {
          const fromRecent = readRecentPublishTargets(ws).find((target) => target.id === remembered);
          if (fromRecent) {
            merged = [...merged, fromRecent];
            resolved = fromRecent;
          }
        }
        if (resolved) {
          setSelectedTargetId(resolved.id);
          restoreState = "restored";
        } else {
          restoreState = "missing";
        }
      }
      setLastTargetRestore(restoreState);
      setTargets(merged);
    } catch (err) {
      if (seq !== fetchSeqRef.current) return;
      setTargets(ensureDefaultPublishTarget([]));
      setLastTargetRestore("none");
      setTargetsError(err instanceof Error ? err.message : "drive_publish_targets_failed");
    } finally {
      if (seq === fetchSeqRef.current) setLoadingTargets(false);
    }
  }, [projectId]);

  useEffect(() => {
    void refreshTargets();
  }, [refreshTargets]);

  useEffect(() => {
    setRecentTargets(readRecentPublishTargets(workspaceId));
  }, [workspaceId, pickerOpen, historyRefreshKey]);

  // Workspace switch — refetch targets and drop the previous tenant's
  // selection. Without this the menu keeps the prior workspace's folder tree
  // (or a `folderId` from `localStorage` keyed under another workspace) and
  // the next publish lands in the wrong tenant.
  useEffect(() => {
    if (!isTeamverEmbedMode()) return;
    return subscribeTeamverWorkspaceChanged(() => {
      invalidateTeamverDriveImportCaches();
      setPickerOpen(false);
      setSelectedTargetId(DEFAULT_PUBLISH_TARGET.id);
      setTargets([DEFAULT_PUBLISH_TARGET]);
      setLastTargetRestore("none");
      setHistoryRefreshKey((key) => key + 1);
      void refreshTargets();
    });
  }, [refreshTargets]);

  const selectedTarget = useMemo(
    () => targets.find((target) => target.id === selectedTargetId) ?? targets[0] ?? DEFAULT_PUBLISH_TARGET,
    [selectedTargetId, targets],
  );
  const rememberedTargetMissing = lastTargetRestore === "missing";

  const shouldFocusTargetSelect =
    focusTargetSelectNonce != null
    && consumedFocusNonceRef.current !== focusTargetSelectNonce
    && !loadingTargets
    && !busy;

  useEffect(() => {
    if (!shouldFocusTargetSelect) return;
    consumedFocusNonceRef.current = focusTargetSelectNonce;
  }, [focusTargetSelectNonce, shouldFocusTargetSelect]);

  const handleChangeTarget = useCallback((nextId: string) => {
    setSelectedTargetId(nextId);
    setLastTargetRestore("none");
  }, []);

  const handleSelectTarget = useCallback((target: TeamverDrivePublishTarget) => {
    setTargets((current) => {
      if (current.some((item) => item.id === target.id)) return current;
      return [...current, target];
    });
    setSelectedTargetId(target.id);
    setLastTargetRestore("none");
  }, []);

  const handleSearchTargets = useCallback(
    async (query: string) => {
      if (!workspaceId) return [];
      return searchTeamverDrivePublishTargets(workspaceId, query, { limit: 80 });
    },
    [workspaceId],
  );

  const handlePublish = useCallback(async () => {
    if (busy) return;
    if (rememberedTargetMissing) return;
    onCloseMenu();
    setBusy(true);
    try {
      const result = await publishTeamverDesignToDrive({
        projectId,
        artifactFile,
        formats: [...PUBLISH_FORMATS],
        folderId: selectedTarget?.folderId ?? null,
        sharedDriveId: selectedTarget?.sharedDriveId ?? null,
      });
      // Remember the destination on success so the next publish defaults to
      // it. We only persist after a green publish — if the request fails we
      // want the operator to revisit their target choice on retry instead of
      // silently locking in a broken folder.
      writeLastPublishTargetId(workspaceId, projectId, selectedTarget?.id ?? null);
      if (selectedTarget) pushRecentPublishTarget(workspaceId, selectedTarget);
      setRecentTargets(readRecentPublishTargets(workspaceId));
      setHistoryRefreshKey((current) => current + 1);
      clearLatestPublishSummaryCache(projectId);
      notifyTeamverPublishOutputsChanged(projectId);
      void prefetchLatestPublishSummaries([projectId]);
      const output = pickReadyPublishOutputs(result.outputs)[0] ?? result.outputs[0];
      if (output?.publishStatus === "ready") onSuccess?.(output, { partial: result.partial });
      else if (result.partial && pickReadyPublishOutputs(result.outputs).length > 0) {
        onSuccess?.(pickReadyPublishOutputs(result.outputs)[0]!, { partial: true });
      } else onError?.(new Error(output?.errorCode ?? "publish_failed"));
    } catch (err) {
      onError?.(err);
    } finally {
      setBusy(false);
    }
  }, [artifactFile, busy, onCloseMenu, onError, onSuccess, projectId, rememberedTargetMissing, selectedTarget, workspaceId]);

  const handleOpenPicker = useCallback(() => {
    setPickerOpen(true);
    // loop 176 — opening Browse is the natural retry hook when the initial
    // listTeamverDrivePublishTargets failed; refresh the cached targets so the
    // dropdown reflects the latest workspace state once the modal closes.
    if (targetsError) void refreshTargets();
  }, [refreshTargets, targetsError]);

  if (!isTeamverEmbedMode()) return null;
  if (workspaceId && !isTeamverDesignAppEnabled(workspaceId)) return null;
  if (!designAppEnabled) return null;

  const disabledForPublish = busy || rememberedTargetMissing;
  const disabledForBrowse = busy;
  const targetSelectDisabled = busy;
  const errorHint = targetsError
    ? formatPublishErrorCodeForUser(targetsError)
    : null;

  const showPostRunHint =
    focusTargetSelectNonce != null && !loadingTargets && !targetsError;

  const postRunHintText = useMemo(() => {
    if (!showPostRunHint) return null;
    if (lastTargetRestore === "missing") {
      return "이전 저장 위치를 목록에서 찾을 수 없습니다. 「찾아보기」에서 폴더를 선택한 뒤 발행하세요.";
    }
    if (lastTargetRestore === "restored" && selectedTarget) {
      return `「${selectedTarget.label}」(으)로 발행 예정입니다. 위치를 바꾸거나 아래 버튼을 눌러 주세요.`;
    }
    return "저장 위치를 확인한 뒤 아래 버튼으로 발행하세요.";
  }, [lastTargetRestore, selectedTarget, showPostRunHint]);

  const publishLabel = busy
    ? "발행 중…"
    : selectedTarget?.sharedDriveId
      ? "선택한 팀 드라이브로 HTML 발행"
      : "Teamver 드라이브로 HTML 발행";

  return (
    <>
      <TeamverDrivePublishHistory
        projectId={projectId}
        refreshKey={historyRefreshKey}
      />
      <div className="teamver-drive-target-picker" role="presentation">
        <span className="teamver-drive-target-label">저장 위치</span>
        <TeamverDriveTargetSelect
          targets={targets}
          selectedTargetId={selectedTargetId}
          disabled={targetSelectDisabled}
          loading={loadingTargets}
          ariaLabel="Teamver 드라이브 저장 위치"
          onChange={handleChangeTarget}
          requestFocus={shouldFocusTargetSelect}
        />
        <button
          type="button"
          className="teamver-drive-target-browse"
          disabled={disabledForBrowse}
          data-testid="teamver-drive-target-browse"
          onClick={handleOpenPicker}
        >
          찾아보기
        </button>
      </div>
      {postRunHintText ? (
        <p
          className="teamver-drive-post-run-hint"
          role="status"
          aria-live="polite"
          data-testid="teamver-drive-post-run-hint"
        >
          {postRunHintText}
        </p>
      ) : null}
      <p
        className="teamver-drive-format-note"
        data-testid="teamver-drive-format-note"
      >
        HTML 한 파일로 발행됩니다. PDF/ZIP 추출은 다운로드 메뉴에서 로컬 저장하세요.
      </p>
      {errorHint ? (
        <p
          className="teamver-drive-target-hint"
          role="status"
          aria-live="polite"
          data-testid="teamver-drive-target-error"
        >
          {errorHint}
        </p>
      ) : null}
      <TeamverDrivePickerModal
        open={pickerOpen}
        workspaceId={workspaceId}
        targets={targets}
        recentTargets={recentTargets}
        selectedTargetId={selectedTargetId}
        loading={loadingTargets}
        onSearch={workspaceId ? handleSearchTargets : undefined}
        onSelect={handleSelectTarget}
        onClose={() => setPickerOpen(false)}
      />
      <button
        type="button"
        className="share-menu-item"
        role="menuitem"
        disabled={disabledForPublish}
        data-testid="teamver-publish-drive-menu-item"
        onClick={() => void handlePublish()}
      >
        <span className="share-menu-icon">
          <Icon name="upload" size={15} />
        </span>
        <span>{publishLabel}</span>
      </button>
    </>
  );
}
