import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "../../components/Icon";
import { isTeamverEmbedMode } from "../designApiBase";
import { getDesignBffClient } from "../designBffClient";
import {
  listTeamverDrivePublishTargets,
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

export function TeamverPublishDriveMenuItem({
  projectId,
  artifactFile,
  onCloseMenu,
  onSuccess,
  onError,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [loadingTargets, setLoadingTargets] = useState(false);
  const [targets, setTargets] = useState<TeamverDrivePublishTarget[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState<string>("personal-default");
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (!isTeamverEmbedMode()) return;
    let canceled = false;
    setLoadingTargets(true);
    void (async () => {
      try {
        const workspaceId = await getDesignBffClient()?.workspaceStore?.get();
        const nextTargets = workspaceId
          ? await listTeamverDrivePublishTargets(workspaceId, { limit: 200 })
          : [];
        if (canceled) return;
        setTargets(nextTargets);
        setSelectedTargetId(nextTargets[0]?.id ?? "personal-default");
      } catch {
        if (!canceled) setTargets([]);
      } finally {
        if (!canceled) setLoadingTargets(false);
      }
    })();
    return () => {
      canceled = true;
    };
  }, []);

  const selectedTarget = useMemo(
    () => targets.find((target) => target.id === selectedTargetId) ?? null,
    [selectedTargetId, targets],
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

  if (!isTeamverEmbedMode()) return null;

  return (
    <>
      <div className="teamver-drive-target-picker" role="presentation">
        <span className="teamver-drive-target-label">Save to</span>
        <select
          aria-label="Teamver Drive destination"
          value={selectedTargetId}
          disabled={busy || loadingTargets || targets.length === 0}
          data-testid="teamver-drive-target-select"
          onChange={(event) => setSelectedTargetId(event.currentTarget.value)}
        >
          {targets.length === 0 ? (
            <option value="personal-default">
              {loadingTargets ? "Loading Drive…" : "My Drive"}
            </option>
          ) : (
            targets.map((target) => (
              <option key={target.id} value={target.id}>
                {target.label}
              </option>
            ))
          )}
        </select>
        <button
          type="button"
          className="teamver-drive-target-browse"
          disabled={busy || loadingTargets || targets.length === 0}
          onClick={() => setPickerOpen(true)}
        >
          Browse
        </button>
      </div>
      <TeamverDrivePickerModal
        open={pickerOpen}
        targets={targets}
        selectedTargetId={selectedTargetId}
        loading={loadingTargets}
        onSelect={setSelectedTargetId}
        onClose={() => setPickerOpen(false)}
      />
      <button
        type="button"
        className="share-menu-item"
        role="menuitem"
        disabled={busy}
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
