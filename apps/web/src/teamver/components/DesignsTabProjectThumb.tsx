import type { Project } from "../../types";
import { useEffect } from "react";
import { useTeamverBranding } from "../branding/TeamverBrandingProvider";
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

/** DesignsTab grid card thumb — cover-hints first, `/files` if hints miss (visible only). */
export function DesignsTabProjectThumb({
  project,
  liveCount = 0,
  liveCountLabel,
  className,
  onCoverOverride,
}: Props) {
  const { slideOnlyMvp } = useTeamverBranding();
  const { anchorRef, cover, override } = useLazyProjectCover(project, {
    deferUntilVisible: true,
    allowFilesFallback: true,
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
          deckCoverOnly={slideOnlyMvp || project.metadata?.kind === "deck"}
          // Parent useLazyProjectCover already defers until the card is near
          // the viewport — a second IntersectionObserver only delayed /raw.
          deferUntilVisible={false}
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
