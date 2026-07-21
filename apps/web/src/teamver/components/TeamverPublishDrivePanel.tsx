import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../components/Icon";
import { isTeamverEmbedMode } from "../designApiBase";
import { readActiveTeamverWorkspaceId } from "../activeTeamverWorkspace";
import {
  clearPdfExportBlocked,
  isPdfExportBlocked,
  markPdfExportBlocked,
} from "../drivePublishFormatHealth";
import {
  resolveInitialPublishFormat,
  writeLastPublishFormat,
} from "../drivePublishLastFormat";
import {
  DEFAULT_PUBLISH_TARGET,
  ensureDefaultPublishTarget,
  readLastPublishTargetId,
  resolvePublishTargetById,
  writeLastPublishTargetId,
} from "../drivePublishLastTarget";
import {
  listTeamverDrivePublishTargets,
  publishTargetsFromImportScopes,
  searchTeamverDrivePublishTargets,
  type TeamverDrivePublishTarget,
} from "../drivePublishTargets";
import {
  pushRecentPublishTarget,
  readRecentPublishTargets,
} from "../drivePublishRecentTargets";
import {
  DRIVE_PUBLISH_FORMAT_OPTIONS,
  formatBenefitForSelection,
  publishLabelForFormat,
  type DrivePublishFormat,
  type PublishBusyPhase,
} from "../drivePublishMessaging";
import { TeamverDrivePickerModal } from "./TeamverDrivePickerModal";
import { TeamverDrivePublishHistory } from "./TeamverDrivePublishHistory";
import { TeamverDriveTargetSelect } from "./TeamverDriveTargetSelect";
import {
  pickReadyPublishOutputs,
  publishTeamverDesignToDrive,
  formatPublishErrorCodeForUser,
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
import {
  invalidateTeamverDriveImportCaches,
  peekTeamverDriveImportScopesCache,
} from "../driveImportList";
import {
  handleTeamverDriveAuthFailure,
  redirectToTeamverLoginFromEmbed,
  TEAMVER_EMBED_TRANSIENT_AUTH_MESSAGE,
} from "../teamverBffAuthError";
import { formatTeamverDrivePanelReloginMessage } from "../teamverDriveAuthCopy";

export type TeamverPublishDriveSuccessMeta = {
  partial: boolean;
  selectedFormat: DrivePublishFormat;
  outputs: TeamverPublishDriveOutput[];
};

export type TeamverPublishDrivePanelProps = {
  projectId: string;
  artifactFile: string;
  exportTitle?: string;
  /** Pass FE slide detection so PDF/HTML flatten and PPTX stay in sync. */
  deck?: boolean;
  /** When false, hide PPTX (non-slide artifacts). Defaults to `deck`. */
  allowPptx?: boolean;
  initialFormat?: DrivePublishFormat | null;
  /** When false, skip target/history fetches (modal closed). */
  active?: boolean;
  onClose: () => void;
  onSuccess?: (meta: TeamverPublishDriveSuccessMeta) => void;
  onError?: (err: unknown) => void;
  focusTargetSelectNonce?: number | null;
};

type LastTargetRestore = "none" | "restored" | "missing";

export function TeamverPublishDrivePanel({
  projectId,
  artifactFile,
  exportTitle,
  deck = true,
  allowPptx,
  initialFormat = null,
  active = true,
  onClose,
  onSuccess,
  onError,
  focusTargetSelectNonce = null,
}: TeamverPublishDrivePanelProps) {
  const pptxAllowed = allowPptx ?? deck;
  const formatOptions = useMemo(
    () => DRIVE_PUBLISH_FORMAT_OPTIONS.filter((option) => option.value !== "pptx" || pptxAllowed),
    [pptxAllowed],
  );
  const [busy, setBusy] = useState(false);
  const [publishPhase, setPublishPhase] = useState<PublishBusyPhase>("idle");
  const [loadingTargets, setLoadingTargets] = useState(false);
  const [targetsError, setTargetsError] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [authUserMismatch, setAuthUserMismatch] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [targets, setTargets] = useState<TeamverDrivePublishTarget[]>(() => [
    DEFAULT_PUBLISH_TARGET,
  ]);
  const [selectedTargetId, setSelectedTargetId] = useState<string>(DEFAULT_PUBLISH_TARGET.id);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [recentTargets, setRecentTargets] = useState<TeamverDrivePublishTarget[]>([]);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const consumedFocusNonceRef = useRef<number | null>(null);
  const [lastTargetRestore, setLastTargetRestore] = useState<LastTargetRestore>("none");
  const [designAppEnabled, setDesignAppEnabled] = useState(
    () => readTeamverDesignAccessSnapshot()?.appEnabled ?? true,
  );
  const [pdfBlocked, setPdfBlocked] = useState(() => isPdfExportBlocked(projectId));
  const [selectedFormat, setSelectedFormat] = useState<DrivePublishFormat>(() =>
    resolveInitialPublishFormat(null, projectId, initialFormat, isPdfExportBlocked(projectId)),
  );
  const userSelectedFormatRef = useRef(false);

  useEffect(() => {
    if (!active) {
      userSelectedFormatRef.current = false;
      return;
    }
    const blocked = isPdfExportBlocked(projectId);
    setPdfBlocked(blocked);
    if (initialFormat) {
      userSelectedFormatRef.current = false;
      setSelectedFormat(resolveInitialPublishFormat(workspaceId, projectId, initialFormat, blocked));
    }
  }, [active, initialFormat, projectId, workspaceId]);

  useEffect(() => {
    if (!active || !workspaceId || userSelectedFormatRef.current || initialFormat) return;
    const blocked = isPdfExportBlocked(projectId);
    setSelectedFormat(resolveInitialPublishFormat(workspaceId, projectId, null, blocked));
  }, [active, initialFormat, projectId, workspaceId]);

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
    if (!isTeamverEmbedMode() || !active) return;
    const seq = ++fetchSeqRef.current;
    setTargetsError(null);
    setAuthRequired(false);
    setAuthUserMismatch(false);
    try {
      const ws = (await readActiveTeamverWorkspaceId())?.trim() || null;
      if (seq !== fetchSeqRef.current) return;
      setWorkspaceId(ws);
      if (!ws) {
        setTargets(ensureDefaultPublishTarget([]));
        setLastTargetRestore("none");
        setTargetsError("teamver_workspace_pending");
        setLoadingTargets(false);
        return;
      }

      const warmScopes = peekTeamverDriveImportScopesCache(ws);
      if (warmScopes && warmScopes.length > 0) {
        setTargets(ensureDefaultPublishTarget(publishTargetsFromImportScopes(warmScopes)));
        setLoadingTargets(false);
      } else {
        setLoadingTargets(true);
      }

      const next = await listTeamverDrivePublishTargets(ws);
      if (seq !== fetchSeqRef.current) return;
      let merged = ensureDefaultPublishTarget(next);
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
      if (
        handleTeamverDriveAuthFailure(err, {
          onRelogin: (opts) => {
            setAuthRequired(true);
            setAuthUserMismatch(opts?.userMismatch === true);
          },
          onTransient: () => {
            setAuthRequired(false);
            setAuthUserMismatch(false);
            setTargetsError(TEAMVER_EMBED_TRANSIENT_AUTH_MESSAGE);
          },
        })
      ) {
        // handled
      } else {
        setTargetsError(err instanceof Error ? err.message : "drive_publish_targets_failed");
      }
    } finally {
      if (seq === fetchSeqRef.current) setLoadingTargets(false);
    }
  }, [active, projectId]);

  useEffect(() => {
    void refreshTargets();
  }, [refreshTargets]);

  useEffect(() => {
    if (!active) return;
    setRecentTargets(readRecentPublishTargets(workspaceId));
  }, [active, workspaceId, pickerOpen, historyRefreshKey]);

  useEffect(() => {
    if (!isTeamverEmbedMode() || !active) return;
    return subscribeTeamverWorkspaceChanged(() => {
      invalidateTeamverDriveImportCaches();
      setPickerOpen(false);
      setSelectedTargetId(DEFAULT_PUBLISH_TARGET.id);
      setTargets([DEFAULT_PUBLISH_TARGET]);
      setLastTargetRestore("none");
      setHistoryRefreshKey((key) => key + 1);
      void refreshTargets();
    });
  }, [active, refreshTargets]);

  const selectedTarget = useMemo(
    () => targets.find((target) => target.id === selectedTargetId) ?? targets[0] ?? DEFAULT_PUBLISH_TARGET,
    [selectedTargetId, targets],
  );
  const rememberedTargetMissing = lastTargetRestore === "missing";

  const shouldFocusTargetSelect =
    active
    && focusTargetSelectNonce != null
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

  const handleQuickPickHydrated = useCallback(
    (hydrated: TeamverDrivePublishTarget[]) => {
      if (hydrated.length === 0) return;
      setTargets((current) => {
        const recent = workspaceId ? readRecentPublishTargets(workspaceId) : [];
        const byId = new Map(
          current
            .filter((target) => target.id !== DEFAULT_PUBLISH_TARGET.id)
            .map((target) => [target.id, target] as const),
        );
        for (const target of hydrated) byId.set(target.id, target);
        for (const target of recent) byId.set(target.id, target);
        return ensureDefaultPublishTarget([...byId.values()]);
      });
      setTargetsError(null);
      setAuthRequired(false);
      setAuthUserMismatch(false);
    },
    [workspaceId],
  );

  const handleClosePicker = useCallback(() => {
    setPickerOpen(false);
  }, []);

  const handleSelectFormat = useCallback((format: DrivePublishFormat) => {
    if (busy) return;
    if (format === "pdf" && pdfBlocked) return;
    if (format === "pptx" && !pptxAllowed) return;
    userSelectedFormatRef.current = true;
    setSelectedFormat(format);
  }, [busy, pdfBlocked, pptxAllowed]);

  useEffect(() => {
    if (selectedFormat !== "pptx" || pptxAllowed) return;
    setSelectedFormat(pdfBlocked ? "html" : "pdf");
  }, [pdfBlocked, pptxAllowed, selectedFormat]);

  const handleSearchTargets = useCallback(
    async (query: string, options?: { signal?: AbortSignal }) => {
      if (!workspaceId) return [];
      return searchTeamverDrivePublishTargets(workspaceId, query, {
        limit: 80,
        signal: options?.signal,
      });
    },
    [workspaceId],
  );

  const handlePublish = useCallback(async () => {
    if (busy) return;
    if (rememberedTargetMissing) return;
    setBusy(true);
    setPublishPhase(selectedFormat === "html" ? "uploading" : "generating");
    try {
      const result = await publishTeamverDesignToDrive({
        projectId,
        artifactFile,
        formats: [selectedFormat],
        folderId: selectedTarget?.folderId ?? null,
        sharedDriveId: selectedTarget?.sharedDriveId ?? null,
        deck,
        ...(exportTitle?.trim() ? { title: exportTitle.trim() } : {}),
      });
      const ready = pickReadyPublishOutputs(result.outputs);
      if (ready.length > 0) {
        if (selectedFormat === "pdf") clearPdfExportBlocked(projectId);
        writeLastPublishTargetId(workspaceId, projectId, selectedTarget?.id ?? null);
        writeLastPublishFormat(workspaceId, projectId, selectedFormat);
        if (selectedTarget) pushRecentPublishTarget(workspaceId, selectedTarget);
        setRecentTargets(readRecentPublishTargets(workspaceId));
        setHistoryRefreshKey((current) => current + 1);
        clearLatestPublishSummaryCache(projectId);
        notifyTeamverPublishOutputsChanged(projectId);
        void prefetchLatestPublishSummaries([projectId]);
        onClose();
        onSuccess?.({
          partial: result.partial,
          selectedFormat,
          outputs: result.outputs,
        });
      } else {
        const failed = result.outputs.find((output) => output.publishStatus === "failed");
        if (selectedFormat === "pdf" && failed?.errorCode?.includes("od_daemon_export_failed")) {
          markPdfExportBlocked(projectId);
          setPdfBlocked(true);
          setSelectedFormat("html");
        }
        onError?.(new Error(formatPublishErrorCodeForUser(failed?.errorCode ?? "publish_failed")));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (selectedFormat === "pdf" && message.includes("od_daemon_export_failed")) {
        markPdfExportBlocked(projectId);
        setPdfBlocked(true);
        setSelectedFormat("html");
      }
      const authHandled = handleTeamverDriveAuthFailure(err, {
        onRelogin: (opts) => {
          setAuthRequired(true);
          setAuthUserMismatch(opts?.userMismatch === true);
        },
        onTransient: () => {
          setAuthRequired(false);
          setAuthUserMismatch(false);
          onError?.(new Error(TEAMVER_EMBED_TRANSIENT_AUTH_MESSAGE));
        },
      });
      if (!authHandled) {
        onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      setBusy(false);
      setPublishPhase("idle");
    }
  }, [
    artifactFile,
    busy,
    deck,
    exportTitle,
    onClose,
    onError,
    onSuccess,
    projectId,
    rememberedTargetMissing,
    selectedFormat,
    selectedTarget,
    workspaceId,
  ]);

  useEffect(() => {
    if (publishPhase !== "generating" || !busy) return;
    const id = window.setTimeout(() => {
      setPublishPhase((phase) => (phase === "generating" ? "uploading" : phase));
    }, 1500);
    return () => window.clearTimeout(id);
  }, [busy, publishPhase]);

  const handleOpenPicker = useCallback(() => {
    setPickerOpen(true);
    // Soft recovery only — avoid wiping warm scopes/shallow caches on every browse.
    if (targetsError || authRequired) void refreshTargets();
  }, [authRequired, refreshTargets, targetsError]);

  const showPostRunHint =
    active
    && focusTargetSelectNonce != null
    && !loadingTargets
    && !targetsError;

  const postRunHintText = useMemo(() => {
    if (!showPostRunHint) return null;
    if (lastTargetRestore === "missing") {
      return "이전 저장 위치를 목록에서 찾을 수 없습니다. 「찾아보기」에서 폴더를 선택한 뒤 올려 주세요.";
    }
    if (lastTargetRestore === "restored" && selectedTarget) {
      return `「${selectedTarget.label}」(으)로 올릴 예정입니다. 위치를 바꾸거나 아래 버튼을 눌러 주세요.`;
    }
    return "저장 위치를 확인한 뒤 아래 버튼으로 올려 주세요.";
  }, [lastTargetRestore, selectedTarget, showPostRunHint]);

  if (!isTeamverEmbedMode()) return null;
  if (workspaceId && !isTeamverDesignAppEnabled(workspaceId)) return null;
  if (!designAppEnabled) return null;

  const disabledForPublish = busy || rememberedTargetMissing || authRequired;
  const disabledForBrowse = busy || authRequired;
  const targetSelectDisabled = busy || authRequired;
  const errorHint = !authRequired && targetsError
    ? formatPublishErrorCodeForUser(targetsError)
    : null;

  const publishLabel = publishLabelForFormat(
    selectedFormat,
    Boolean(selectedTarget?.sharedDriveId),
    publishPhase,
  );
  const formatBenefit = formatBenefitForSelection(selectedFormat);

  return (
    <div className="teamver-drive-publish-panel" data-testid="teamver-publish-drive-panel">
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
      <div className="teamver-drive-format-row">
        <span className="teamver-drive-format-row__label">형식</span>
        <div
          className="teamver-drive-format-segment"
          role="radiogroup"
          aria-label="드라이브 업로드 형식"
        >
          {formatOptions.map(({ value, label }) => {
            const disabled = busy || (value === "pdf" && pdfBlocked);
            const checked = selectedFormat === value;
            return (
              <label
                key={value}
                className="teamver-drive-format-segment__option"
                data-checked={checked ? "true" : "false"}
                data-disabled={disabled ? "true" : "false"}
                data-testid={`teamver-drive-format-option-${value}`}
                title={value === "pdf" && pdfBlocked ? "PDF 생성을 사용할 수 없습니다 — HTML을 선택하세요." : undefined}
              >
                <input
                  type="radio"
                  name="teamver-drive-publish-format"
                  value={value}
                  checked={checked}
                  disabled={disabled}
                  onChange={() => handleSelectFormat(value)}
                />
                <span>{label}</span>
              </label>
            );
          })}
        </div>
      </div>
      {formatBenefit ? (
        <div className="teamver-drive-format-benefit" data-testid="teamver-drive-format-hint">
          <span className="teamver-drive-format-benefit__example">
            예: {formatBenefit.example}
          </span>
          <span className="teamver-drive-format-benefit__detail">{formatBenefit.benefit}</span>
        </div>
      ) : null}
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
      {authRequired ? (
        <p
          className="teamver-drive-target-hint teamver-drive-target-hint--auth"
          role="status"
          aria-live="polite"
          data-testid="teamver-drive-panel-auth-required"
        >
          {formatTeamverDrivePanelReloginMessage({ userMismatch: authUserMismatch })}{" "}
          <button
            type="button"
            className="teamver-drive-target-hint__login"
            data-testid="teamver-drive-panel-login"
            onClick={redirectToTeamverLoginFromEmbed}
          >
            다시 로그인
          </button>
        </p>
      ) : errorHint ? (
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
        onClose={handleClosePicker}
        onQuickPickTargetsHydrated={handleQuickPickHydrated}
      />
      <button
        type="button"
        className="teamver-drive-publish-action"
        disabled={disabledForPublish}
        data-testid="teamver-publish-drive-menu-item"
        onClick={() => void handlePublish()}
      >
        <Icon name="upload" size={15} />
        <span>{publishLabel}</span>
      </button>
      <TeamverDrivePublishHistory
        projectId={projectId}
        refreshKey={historyRefreshKey}
        defaultCollapsed
      />
    </div>
  );
}
