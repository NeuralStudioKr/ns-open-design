import { Icon } from "../../components/Icon";
import { useTeamverT } from "../branding/useTeamverT";
import type { TeamverDriveImportAsset } from "../importDriveAssets";
import type { TeamverCanvasLaunchHandoff } from "../canvasLaunchHandoff";
import { driveImportAssetIconName } from "../driveFileVisual";

export type TeamverCanvasSlideLaunchSource =
  | { kind: "drive"; asset: TeamverDriveImportAsset }
  | { kind: "canvas"; handoff: TeamverCanvasLaunchHandoff };

type Props = {
  open: boolean;
  source: TeamverCanvasSlideLaunchSource;
  confirming?: boolean;
  errorMessage?: string | null;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
};

function sourceDisplayName(source: TeamverCanvasSlideLaunchSource): string {
  if (source.kind === "drive") {
    return source.asset.filename?.trim() || source.asset.assetId;
  }
  return `canvas/${source.handoff.artifactId.slice(0, 8)}…`;
}

export function TeamverCanvasSlideLaunchModal({
  open,
  source,
  confirming = false,
  errorMessage = null,
  onConfirm,
  onClose,
}: Props) {
  const t = useTeamverT();
  if (!open) return null;

  const filename = sourceDisplayName(source);
  const iconName =
    source.kind === "drive"
      ? driveImportAssetIconName(filename, source.asset.mimeType)
      : "file";

  return (
    <div
      className="teamver-drive-picker-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !confirming) onClose();
      }}
    >
      <section
        className="teamver-drive-picker-modal teamver-canvas-slide-launch-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="teamver-canvas-slide-launch-title"
        data-testid="teamver-canvas-slide-launch-modal"
      >
        <header className="teamver-drive-picker-head">
          <div>
            <h2 id="teamver-canvas-slide-launch-title">
              {t("teamver.canvasSlideLaunch.title")}
            </h2>
            <p>{t("teamver.canvasSlideLaunch.description")}</p>
          </div>
          <button
            type="button"
            className="teamver-drive-picker-close"
            aria-label={t("teamver.canvasSlideLaunch.cancel")}
            disabled={confirming}
            onClick={onClose}
          >
            <Icon name="close" size={16} />
          </button>
        </header>

        <div className="teamver-canvas-slide-launch-source" data-testid="teamver-canvas-slide-launch-source">
          <span className="teamver-canvas-slide-launch-source-icon" aria-hidden="true">
            <Icon name={iconName} size={18} />
          </span>
          <div className="teamver-canvas-slide-launch-source-copy">
            <span className="teamver-canvas-slide-launch-source-label">
              {t("teamver.canvasSlideLaunch.sourceLabel")}
            </span>
            <strong>{filename}</strong>
          </div>
        </div>

        {errorMessage ? (
          <p
            className="teamver-canvas-slide-launch-error"
            role="alert"
            data-testid="teamver-canvas-slide-launch-error"
          >
            {errorMessage}
          </p>
        ) : null}

        <footer className="teamver-drive-import-footer">
          <div className="teamver-drive-import-actions">
            <button
              type="button"
              className="teamver-drive-import-cancel"
              disabled={confirming}
              onClick={onClose}
            >
              {t("teamver.canvasSlideLaunch.cancel")}
            </button>
            <button
              type="button"
              className="teamver-drive-import-attach"
              disabled={confirming}
              data-testid="teamver-canvas-slide-launch-confirm"
              onClick={() => void onConfirm()}
            >
              {confirming
                ? t("teamver.canvasSlideLaunch.working")
                : errorMessage
                  ? t("teamver.canvasSlideLaunch.retry")
                  : t("teamver.canvasSlideLaunch.confirm")}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
