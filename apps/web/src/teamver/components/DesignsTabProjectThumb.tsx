import type { Project } from "../../types";
import { useEffect } from "react";
import { useLazyProjectCover } from "../useLazyProjectCover";
import type { ProjectCoverFile } from "../projectPreviewFile";
import { ProjectCardHtmlCover } from "./ProjectCardHtmlCover";
import { AuthenticatedProjectFileImage } from "../../components/AuthenticatedProjectFileImage";

type Props = {
  project: Project;
  liveCount?: number;
  liveCountLabel?: string;
  className?: string;
  onCoverOverride?: (cover: ProjectCoverFile | null) => void;
};

/** DesignsTab grid card thumb — cover-hints batch; Teamver embed stays hints-only. */
export function DesignsTabProjectThumb({
  project,
  liveCount = 0,
  liveCountLabel,
  className,
  onCoverOverride,
}: Props) {
  const { anchorRef, cover, override } = useLazyProjectCover(project, {
    deferUntilVisible: true,
  });

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

  const glyph = <span className="project-thumb-glyph">{cover.initial}</span>;

  return (
    <div
      ref={anchorRef}
      className={thumbClassName}
      style={cover.style}
      aria-hidden
    >
      {(cover.kind === "image" || cover.kind === "logo") && cover.filePath ? (
        <AuthenticatedProjectFileImage
          projectId={project.id}
          path={cover.filePath}
          rev={cover.version}
          className="thumb-media"
          trustExists
          failedFallback={glyph}
        />
      ) : cover.kind === "video" && cover.src ? (
        <video className="thumb-media" src={cover.src} muted preload="metadata" playsInline />
      ) : cover.kind === "html" && cover.src ? (
        <ProjectCardHtmlCover
          src={cover.src}
          deckCoverOnly={project.metadata?.kind === "deck"}
        />
      ) : (
        glyph
      )}
      {liveCount > 0 && liveCountLabel ? (
        <span className="design-live-count">{liveCountLabel}</span>
      ) : null}
    </div>
  );
}
