import { Icon } from "../../components/Icon";
import { useTeamverT } from "../branding/useTeamverT";
import type { TeamverDriveImportAsset } from "../importDriveAssets";
import { driveImportAssetIconName } from "../driveFileVisual";

type Props = {
  open: boolean;
  asset: TeamverDriveImportAsset;
  confirming?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
};

export function TeamverCanvasSlideLaunchModal({
  open,
  asset,
  confirming = false,
  onConfirm,
  onClose,
}: Props) {
  const t = useTeamverT();
  if (!open) return null;

  const filename = asset.filename?.trim() || asset.assetId;
  const iconName = driveImportAssetIconName(filename, asset.mimeType);

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
                : t("teamver.canvasSlideLaunch.confirm")}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
