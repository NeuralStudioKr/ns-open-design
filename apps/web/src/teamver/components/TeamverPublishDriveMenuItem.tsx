import { useCallback, useState } from "react";
import { Icon } from "../../components/Icon";
import { isTeamverEmbedMode } from "../designApiBase";
import {
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
      const output = result.outputs[0];
      if (output) onSuccess?.(output);
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
