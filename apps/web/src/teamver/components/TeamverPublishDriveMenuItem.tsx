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
import {
  pickReadyPublishOutputs,
  publishTeamverDesignToDrive,
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
  label: "My Drive",
  description: "Default Drive destination",
  folderId: null,
  sharedDriveId: null,
};

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

  const handlePublish = useCallback(async () => {
    if (busy) return;
    onCloseMenu();
    setBusy(true);
    try {
      const result = await publishTeamverDesignToDrive({
        projectId,
        artifactFile,
        formats: ["html", "zip"],
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
  }, [artifactFile, busy, onCloseMenu, onError, onSuccess, projectId, selectedTarget]);

  const handleOpenPicker = useCallback(() => {
    setPickerOpen(true);
    // loop 176 — opening Browse is the natural retry hook when the initial
    // listTeamverDrivePublishTargets failed; refresh the cached targets so the
    // dropdown reflects the latest workspace state once the modal closes.
    if (targetsError) void refreshTargets();
  }, [refreshTargets, targetsError]);

  if (!isTeamverEmbedMode()) return null;

  const disabledForPublish = busy;
  const disabledForBrowse = busy;
  const targetSelectDisabled = busy;
  const errorHint =
    targetsError === "teamver_workspace_pending"
      ? "Drive 작업공간 연결 중 — 기본 위치로 발행됩니다."
      : targetsError
        ? "Drive 폴더 목록을 불러오지 못했습니다. Browse 로 다시 시도하세요."
        : null;

  return (
    <>
      <div className="teamver-drive-target-picker" role="presentation">
        <span className="teamver-drive-target-label">Save to</span>
        <select
          aria-label="Teamver Drive destination"
          value={selectedTargetId}
          disabled={targetSelectDisabled}
          data-testid="teamver-drive-target-select"
          onChange={(event) => setSelectedTargetId(event.currentTarget.value)}
        >
          {targets.map((target) => (
            <option key={target.id} value={target.id}>
              {loadingTargets && target.id === DEFAULT_PUBLISH_TARGET.id
                ? `${target.label} (loading…)`
                : target.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="teamver-drive-target-browse"
          disabled={disabledForBrowse}
          data-testid="teamver-drive-target-browse"
          onClick={handleOpenPicker}
        >
          Browse
        </button>
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
        <span>
          {busy
            ? "Publishing…"
            : selectedTarget?.sharedDriveId
              ? "Publish to selected team drive"
              : "Publish to Teamver Drive"}
        </span>
      </button>
    </>
  );
}
