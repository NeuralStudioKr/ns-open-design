import { useCallback, useState } from "react";
import { Icon } from "../../components/Icon";
import { isTeamverEmbedMode, resolveTeamverDriveAssetUrl } from "../designApiBase";
import {
  findLatestReadyPublishOutput,
  listTeamverProjectOutputs,
} from "../listProjectOutputs";

type Props = {
  projectId: string;
  kind?: string;
  onCloseMenu: () => void;
  onOpen?: (driveAssetId: string) => void;
  onNotFound?: () => void;
  onError?: (err: unknown) => void;
};

export function TeamverOpenDrivePublishMenuItem({
  projectId,
  kind = "html",
  onCloseMenu,
  onOpen,
  onNotFound,
  onError,
}: Props) {
  const [busy, setBusy] = useState(false);

  const handleOpen = useCallback(async () => {
    if (busy) return;
    onCloseMenu();
    setBusy(true);
    try {
      const history = await listTeamverProjectOutputs(projectId);
      const output = findLatestReadyPublishOutput(history?.outputs ?? [], kind);
      if (!output?.driveAssetId?.trim()) {
        onNotFound?.();
        return;
      }
      const driveUrl = resolveTeamverDriveAssetUrl(output.driveAssetId);
      onOpen?.(output.driveAssetId);
      window.open(driveUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      onError?.(err);
    } finally {
      setBusy(false);
    }
  }, [busy, kind, onCloseMenu, onError, onNotFound, onOpen, projectId]);

  if (!isTeamverEmbedMode()) return null;

  return (
    <button
      type="button"
      className="share-menu-item"
      role="menuitem"
      disabled={busy}
      data-testid="teamver-open-drive-publish-menu-item"
      onClick={() => void handleOpen()}
    >
      <span className="share-menu-icon">
        <Icon name="external-link" size={15} />
      </span>
      <span>{busy ? "Opening…" : "Open in Teamver Drive"}</span>
    </button>
  );
}
