import { useCallback, useState } from "react";
import { Icon } from "../../components/Icon";
import { isTeamverEmbedMode } from "../designApiBase";
import {
  pickReadyPublishOutputs,
  publishTeamverDesignToDrive,
  type TeamverPublishDriveOutput,
} from "../publishToDrive";

type Props = {
  projectId: string;
  artifactFile: string;
  onCloseMenu: () => void;
  onSuccess?: (output: TeamverPublishDriveOutput) => void;
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

  const handlePublish = useCallback(async () => {
    if (busy) return;
    onCloseMenu();
    setBusy(true);
    try {
      const result = await publishTeamverDesignToDrive({
        projectId,
        artifactFile,
        formats: ["html"],
      });
      const output = pickReadyPublishOutputs(result.outputs)[0] ?? result.outputs[0];
      if (output?.publishStatus === "ready") onSuccess?.(output);
      else onError?.(new Error(output?.errorCode ?? "publish_failed"));
    } catch (err) {
      onError?.(err);
    } finally {
      setBusy(false);
    }
  }, [artifactFile, busy, onCloseMenu, onError, onSuccess, projectId]);

  if (!isTeamverEmbedMode()) return null;

  return (
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
      <span>{busy ? "Publishing…" : "Publish to Teamver Drive"}</span>
    </button>
  );
}
