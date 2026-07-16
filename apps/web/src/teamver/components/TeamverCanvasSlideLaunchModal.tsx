import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../components/Icon";
import { useTeamverT } from "../branding/useTeamverT";
import type { TeamverDriveImportAsset } from "../importDriveAssets";
import {
  mergeCanvasLaunchHandoffPreview,
  type TeamverCanvasLaunchHandoff,
} from "../canvasLaunchHandoff";
import { fetchTeamverCanvasPreview } from "../fetchCanvasPreview";
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

function formatUpdatedAt(raw: string | undefined, locale: string): string | null {
  if (!raw?.trim()) return null;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return raw.trim();
  try {
    return new Intl.DateTimeFormat(locale || "ko", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(ms));
  } catch {
    return raw.trim();
  }
}

function sourceHeadline(
  source: TeamverCanvasSlideLaunchSource,
  handoff: TeamverCanvasLaunchHandoff | null,
  untitled: string,
): string {
  if (source.kind === "drive") {
    return source.asset.filename?.trim() || source.asset.assetId;
  }
  return handoff?.title?.trim() || untitled;
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
  const [liveHandoff, setLiveHandoff] = useState<TeamverCanvasLaunchHandoff | null>(
    source.kind === "canvas" ? source.handoff : null,
  );
  const [enriching, setEnriching] = useState(false);

  useEffect(() => {
    if (!open || source.kind !== "canvas") {
      setLiveHandoff(null);
      setEnriching(false);
      return;
    }
    const base = source.handoff;
    setLiveHandoff(base);
    let cancelled = false;
    setEnriching(true);
    void fetchTeamverCanvasPreview(base)
      .then((live) => {
        if (cancelled || !live) return;
        setLiveHandoff(mergeCanvasLaunchHandoffPreview(base, live));
      })
      .finally(() => {
        if (!cancelled) setEnriching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, source]);

  const untitled = t("teamver.canvasSlideLaunch.untitled");
  const handoff = source.kind === "canvas" ? liveHandoff ?? source.handoff : null;
  const headline = sourceHeadline(source, handoff, untitled);
  const isCanvas = source.kind === "canvas";
  const preview = isCanvas ? handoff?.preview?.trim() : "";
  const threadTitle = isCanvas ? handoff?.threadTitle?.trim() : "";
  const sectionCount = isCanvas ? handoff?.sectionCount : undefined;
  const headings = isCanvas ? handoff?.headings ?? [] : [];
  const updatedLabel = isCanvas
    ? formatUpdatedAt(handoff?.updatedAt || handoff?.revision, "ko")
    : null;
  const iconName =
    source.kind === "drive"
      ? driveImportAssetIconName(headline, source.asset.mimeType)
      : "file";

  const metaBits = useMemo(() => {
    const bits: string[] = [];
    if (threadTitle) bits.push(threadTitle);
    if (sectionCount != null && sectionCount > 0) {
      bits.push(t("teamver.canvasSlideLaunch.sections", { count: sectionCount }));
    }
    if (updatedLabel) {
      bits.push(t("teamver.canvasSlideLaunch.updated", { when: updatedLabel }));
    }
    return bits;
  }, [sectionCount, t, threadTitle, updatedLabel]);

  const showTitleSkeleton = isCanvas && enriching && !handoff?.title?.trim();
  const showPreviewSkeleton = isCanvas && enriching && !preview;

  if (!open) return null;

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
        <header className="teamver-canvas-slide-launch-head">
          <div className="teamver-canvas-slide-launch-kicker">
            <span className="teamver-canvas-slide-launch-badge" aria-hidden="true">
              <Icon name={iconName} size={14} />
            </span>
            <span>{t("teamver.canvasSlideLaunch.badge")}</span>
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

        <div className="teamver-canvas-slide-launch-body">
          <h2 id="teamver-canvas-slide-launch-title" className="teamver-canvas-slide-launch-heading">
            {t("teamver.canvasSlideLaunch.title")}
          </h2>
          <p className="teamver-canvas-slide-launch-lead">
            {t("teamver.canvasSlideLaunch.description")}
          </p>
          <p className="teamver-canvas-slide-launch-hint">
            {t("teamver.canvasSlideLaunch.hint")}
          </p>

          <article
            className="teamver-canvas-slide-launch-card"
            data-testid="teamver-canvas-slide-launch-source"
            data-enriching={enriching ? "1" : "0"}
          >
            <div className="teamver-canvas-slide-launch-card-top">
              <span className="teamver-canvas-slide-launch-source-icon" aria-hidden="true">
                <Icon name={iconName} size={20} />
              </span>
              <div className="teamver-canvas-slide-launch-card-copy">
                <span className="teamver-canvas-slide-launch-source-label">
                  {t("teamver.canvasSlideLaunch.sourceLabel")}
                </span>
                {showTitleSkeleton ? (
                  <span
                    className="teamver-canvas-slide-launch-skeleton teamver-canvas-slide-launch-skeleton-title"
                    data-testid="teamver-canvas-slide-launch-skeleton"
                  />
                ) : (
                  <strong className="teamver-canvas-slide-launch-doc-title">{headline}</strong>
                )}
              </div>
            </div>

            {showPreviewSkeleton ? (
              <div className="teamver-canvas-slide-launch-skeleton-stack" aria-hidden="true">
                <span className="teamver-canvas-slide-launch-skeleton" />
                <span className="teamver-canvas-slide-launch-skeleton" />
              </div>
            ) : preview ? (
              <p
                className="teamver-canvas-slide-launch-preview"
                data-testid="teamver-canvas-slide-launch-preview"
              >
                {preview}
              </p>
            ) : null}

            {headings.length > 0 ? (
              <ol
                className="teamver-canvas-slide-launch-outline"
                data-testid="teamver-canvas-slide-launch-outline"
              >
                {headings.map((heading) => (
                  <li key={heading}>{heading}</li>
                ))}
              </ol>
            ) : null}

            {metaBits.length > 0 ? (
              <ul className="teamver-canvas-slide-launch-meta" data-testid="teamver-canvas-slide-launch-meta">
                {metaBits.map((bit) => (
                  <li key={bit}>{bit}</li>
                ))}
              </ul>
            ) : null}
          </article>

          {errorMessage ? (
            <p
              className="teamver-canvas-slide-launch-error"
              role="alert"
              data-testid="teamver-canvas-slide-launch-error"
            >
              {errorMessage}
            </p>
          ) : null}
        </div>

        <footer className="teamver-canvas-slide-launch-footer">
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
            className="teamver-drive-import-attach teamver-canvas-slide-launch-confirm"
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
        </footer>
      </section>
    </div>
  );
}
