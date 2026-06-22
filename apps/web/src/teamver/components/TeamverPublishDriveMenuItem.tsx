import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../components/Icon";
import { isTeamverEmbedMode } from "../designApiBase";
import { getDesignBffClient } from "../designBffClient";
import {
  listTeamverDrivePublishTargets,
  searchTeamverDrivePublishTargets,
  type TeamverDrivePublishTarget,
} from "../drivePublishTargets";
import { TeamverDrivePickerModal } from "./TeamverDrivePickerModal";
import { TeamverDriveTargetSelect } from "./TeamverDriveTargetSelect";
import {
  pickReadyPublishOutputs,
  publishTeamverDesignToDrive,
  type TeamverPublishDriveFormat,
  type TeamverPublishDriveOutput,
} from "../publishToDrive";

type Props = {
  projectId: string;
  artifactFile: string;
  onCloseMenu: () => void;
  onSuccess?: (output: TeamverPublishDriveOutput, meta?: { partial: boolean }) => void;
  onError?: (err: unknown) => void;
};

/**
 * loop 176 — Always-available default destination so the menu never deadlocks
 * when the workspace bridge or `listTeamverDrivePublishTargets` fail. Picking
 * this option publishes to the user's Drive root (BE falls back to
 * `settings.teamver_drive_publish_folder_id` env or the personal root).
 */
const DEFAULT_PUBLISH_TARGET: TeamverDrivePublishTarget = {
  id: "personal-default",
  label: "내 드라이브",
  description: "기본 드라이브 위치",
  folderId: null,
  sharedDriveId: null,
};

/**
 * loop 173 — Format selection contract. Default is HTML only because that's
 * the single deliverable embedders ask for in 95% of publish flows; ZIP is
 * opt-in for users who want the full archive (assets + sources) alongside.
 * PDF is intentionally absent: the daemon's PDF exporter is desktop-only
 * (`apps/daemon/src/import-export-routes.ts:534`), so headless staging/prod
 * cannot fulfil a PDF publish today. Until BE grows a server-side renderer
 * (Puppeteer/headless Chrome) we keep PDF on the local `PDF로 내보내기`
 * surface in `FileViewer`.
 */
type PublishFormatOption = {
  id: TeamverPublishDriveFormat;
  label: string;
  description: string;
};

const PUBLISH_FORMAT_OPTIONS: readonly PublishFormatOption[] = [
  { id: "html", label: "HTML", description: "단일 파일" },
  { id: "zip", label: "ZIP", description: "에셋·소스 포함 아카이브" },
];

const DEFAULT_PUBLISH_FORMATS: readonly TeamverPublishDriveFormat[] = ["html"];

function ensureDefaultTarget(
  targets: readonly TeamverDrivePublishTarget[],
): TeamverDrivePublishTarget[] {
  if (targets.length === 0) return [DEFAULT_PUBLISH_TARGET];
  if (targets.some((target) => target.folderId == null && target.sharedDriveId == null)) {
    return [...targets];
  }
  return [DEFAULT_PUBLISH_TARGET, ...targets];
}

export function TeamverPublishDriveMenuItem({
  projectId,
  artifactFile,
  onCloseMenu,
  onSuccess,
  onError,
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
  const [selectedFormats, setSelectedFormats] = useState<TeamverPublishDriveFormat[]>(() => [
    ...DEFAULT_PUBLISH_FORMATS,
  ]);

  const fetchSeqRef = useRef(0);
  const refreshTargets = useCallback(async () => {
    if (!isTeamverEmbedMode()) return;
    const seq = ++fetchSeqRef.current;
    setLoadingTargets(true);
    setTargetsError(null);
    try {
      const wsRaw = await getDesignBffClient()?.workspaceStore?.get();
      const ws = wsRaw?.trim() || null;
      if (seq !== fetchSeqRef.current) return;
      setWorkspaceId(ws);
      if (!ws) {
        // Workspace bridge isn't ready yet — keep the default option active and
        // surface a soft hint instead of locking the menu (loop 176 deadlock fix).
        setTargets(ensureDefaultTarget([]));
        setTargetsError("teamver_workspace_pending");
        return;
      }
      const next = await listTeamverDrivePublishTargets(ws, { limit: 200 });
      if (seq !== fetchSeqRef.current) return;
      setTargets(ensureDefaultTarget(next));
    } catch (err) {
      if (seq !== fetchSeqRef.current) return;
      setTargets(ensureDefaultTarget([]));
      setTargetsError(err instanceof Error ? err.message : "drive_publish_targets_failed");
    } finally {
      if (seq === fetchSeqRef.current) setLoadingTargets(false);
    }
  }, []);

  useEffect(() => {
    void refreshTargets();
  }, [refreshTargets]);

  const selectedTarget = useMemo(
    () => targets.find((target) => target.id === selectedTargetId) ?? targets[0] ?? DEFAULT_PUBLISH_TARGET,
    [selectedTargetId, targets],
  );

  const handleSelectTarget = useCallback((target: TeamverDrivePublishTarget) => {
    setTargets((current) => {
      if (current.some((item) => item.id === target.id)) return current;
      return [...current, target];
    });
    setSelectedTargetId(target.id);
  }, []);

  const handleSearchTargets = useCallback(
    async (query: string) => {
      if (!workspaceId) return [];
      return searchTeamverDrivePublishTargets(workspaceId, query, { limit: 80 });
    },
    [workspaceId],
  );

  const toggleFormat = useCallback((format: TeamverPublishDriveFormat) => {
    setSelectedFormats((current) => {
      const has = current.includes(format);
      if (has) {
        // Prevent unchecking the last remaining format — BE requires
        // `min_length=1` on the formats list and would 400 with
        // `formats_required` otherwise.
        if (current.length === 1) return current;
        return current.filter((entry) => entry !== format);
      }
      // Preserve declaration order (HTML before ZIP) so the BE-side
      // result row order is stable in toasts and tests.
      return PUBLISH_FORMAT_OPTIONS
        .map((option) => option.id)
        .filter((id) => id === format || current.includes(id));
    });
  }, []);

  const handlePublish = useCallback(async () => {
    if (busy) return;
    if (selectedFormats.length === 0) return;
    onCloseMenu();
    setBusy(true);
    try {
      const result = await publishTeamverDesignToDrive({
        projectId,
        artifactFile,
        formats: selectedFormats,
        folderId: selectedTarget?.folderId ?? null,
        sharedDriveId: selectedTarget?.sharedDriveId ?? null,
      });
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
  }, [artifactFile, busy, onCloseMenu, onError, onSuccess, projectId, selectedFormats, selectedTarget]);

  const handleOpenPicker = useCallback(() => {
    setPickerOpen(true);
    // loop 176 — opening Browse is the natural retry hook when the initial
    // listTeamverDrivePublishTargets failed; refresh the cached targets so the
    // dropdown reflects the latest workspace state once the modal closes.
    if (targetsError) void refreshTargets();
  }, [refreshTargets, targetsError]);

  if (!isTeamverEmbedMode()) return null;

  const disabledForPublish = busy || selectedFormats.length === 0;
  const disabledForBrowse = busy;
  const targetSelectDisabled = busy;
  const errorHint =
    targetsError === "teamver_workspace_pending"
      ? "Drive 작업공간 연결 중 — 기본 위치로 발행됩니다."
      : targetsError
        ? "Drive 폴더 목록을 불러오지 못했습니다. 찾아보기로 다시 시도하세요."
        : null;

  const publishLabel = busy
    ? "발행 중…"
    : selectedTarget?.sharedDriveId
      ? "선택한 팀 드라이브로 발행"
      : "Teamver 드라이브로 발행";

  return (
    <>
      <div className="teamver-drive-target-picker" role="presentation">
        <span className="teamver-drive-target-label">저장 위치</span>
        <TeamverDriveTargetSelect
          targets={targets}
          selectedTargetId={selectedTargetId}
          disabled={targetSelectDisabled}
          loading={loadingTargets}
          ariaLabel="Teamver 드라이브 저장 위치"
          onChange={setSelectedTargetId}
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
      <div
        className="teamver-drive-format-row"
        role="group"
        aria-label="발행 포맷"
        data-testid="teamver-drive-format-row"
      >
        <span className="teamver-drive-format-row__label">포맷</span>
        <div className="teamver-drive-format-row__options">
          {PUBLISH_FORMAT_OPTIONS.map((option) => {
            const checked = selectedFormats.includes(option.id);
            // Last-remaining format can't be unchecked (BE requires ≥1 format).
            const lockedOn = checked && selectedFormats.length === 1;
            return (
              <label
                key={option.id}
                className="teamver-drive-format-chip"
                data-checked={checked}
                data-disabled={lockedOn || busy}
                data-testid={`teamver-drive-format-chip-${option.id}`}
                title={option.description}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={lockedOn || busy}
                  data-testid={`teamver-drive-format-input-${option.id}`}
                  onChange={() => toggleFormat(option.id)}
                />
                <span>{option.label}</span>
              </label>
            );
          })}
        </div>
      </div>
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
