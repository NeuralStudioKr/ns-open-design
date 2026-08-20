import { useT } from "../../i18n";
import type { Project } from "../../types";
import { useTeamverBranding } from "../branding/TeamverBrandingProvider";
import {
  projectListCardCategory,
  type ProjectListCardCategory,
} from "../projectListCardCategory";

export function ProjectListCardTag({
  project,
  category: categoryOverride,
}: {
  project?: Project;
  category?: ProjectListCardCategory;
}) {
  const t = useT();
  const { slideOnlyMvp } = useTeamverBranding();
  const category =
    categoryOverride
    ?? (project
      ? projectListCardCategory(project, { slideOnly: slideOnlyMvp })
      : "prototype");
  const label =
    category === "live-artifact"
      ? t("designs.tagLiveArtifact")
      : category === "slide"
        ? t("designs.tagSlide")
        : category === "media"
          ? t("designs.tagMedia")
          : t("designs.tagPrototype");
  return <span className={`design-card-tag tag-${category}`}>{label}</span>;
}

export function DesignSystemProjectTag() {
  return <span className="design-card-tag tag-design-system">Design System</span>;
}
