import type { ProjectMetadata } from "../types";
import { isTeamverEmbedMode } from "./designApiBase";

/** Embed users must not link host filesystem paths into project metadata. */
export function mayMutateProjectLinkedDirs(): boolean {
  return !isTeamverEmbedMode();
}

export function stripLinkedDirsFromMetadata<T extends { linkedDirs?: string[] | null }>(
  metadata: T,
): T {
  if (mayMutateProjectLinkedDirs()) return metadata;
  if (!("linkedDirs" in metadata)) return metadata;
  const { linkedDirs: _removed, ...rest } = metadata;
  return rest as T;
}

export function sanitizeProjectForEmbed<T extends { metadata?: ProjectMetadata | null }>(
  project: T,
): T {
  if (mayMutateProjectLinkedDirs() || !project.metadata || !("linkedDirs" in project.metadata)) {
    return project;
  }
  return {
    ...project,
    metadata: stripLinkedDirsFromMetadata(project.metadata),
  };
}
