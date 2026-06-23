import { isDesignSystemProject } from "../components/design-system-project";
import { isTeamverEmbedMode } from "./designApiBase";
import { HOME_RECENT_LIST_LIMIT } from "./projectListLimits";
import type { Project } from "../types";

type Options = {
  /** Most recently updated first; default unlimited when omitted. */
  limit?: number;
};

/** Project ids that show Drive publish chips on embed project cards. */
export function embedPublishChipProjectIds(
  projects: Project[],
  options: Options = {},
): string[] {
  if (!isTeamverEmbedMode()) return [];

  const sorted = [...projects]
    .filter((project) => !isDesignSystemProject(project))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const limited =
    typeof options.limit === "number" && options.limit > 0
      ? sorted.slice(0, options.limit)
      : sorted;

  return limited.map((project) => project.id);
}

/** Home recent rail — prefetch publish chips for at most six recent decks. */
export function homePublishChipPrefetchIds(projects: Project[]): string[] {
  return embedPublishChipProjectIds(projects, {
    limit: HOME_RECENT_LIST_LIMIT,
  });
}
