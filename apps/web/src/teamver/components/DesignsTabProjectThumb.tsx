import { useEffect } from "react";
import type { Project } from "../../types";
import { useLazyProjectCover } from "../useLazyProjectCover";
import type { ProjectCoverFile } from "../projectPreviewFile";

type Props = {
  project: Project;
  liveCount?: number;
  liveCountLabel?: string;
  className?: string;
  onCoverOverride?: (cover: ProjectCoverFile | null) => void;
};

/** DesignsTab grid card thumb — loads cover via cover-hints batch, then `/files` if needed. */
export function DesignsTabProjectThumb({
  project,
  liveCount = 0,
  liveCountLabel,
  className,
  onCoverOverride,
}: Props) {
  const { anchorRef, cover, override } = useLazyProjectCover(project, { deferUntilVisible: true });

  useEffect(() => {
    onCoverOverride?.(override);
  }, [override, onCoverOverride]);

  const thumbClassName = [
    "design-card-thumb",
    "project-thumb",
    `project-thumb-${cover.kind}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={anchorRef}
      className={thumbClassName}
      style={cover.style}
      aria-hidden
    >
      {(cover.kind === "image" || cover.kind === "logo") && cover.src ? (
        <img className="thumb-media" src={cover.src} alt="" loading="lazy" />
      ) : cover.kind === "video" && cover.src ? (
        <video className="thumb-media" src={cover.src} muted preload="metadata" playsInline />
      ) : cover.kind === "html" && cover.src ? (
        <iframe
          className="thumb-iframe"
          src={cover.src}
          title=""
          loading="lazy"
          sandbox="allow-scripts"
          tabIndex={-1}
        />
      ) : (
        <span className="project-thumb-glyph">{cover.initial}</span>
      )}
      {liveCount > 0 && liveCountLabel ? (
        <span className="design-live-count">{liveCountLabel}</span>
      ) : null}
    </div>
  );
}
