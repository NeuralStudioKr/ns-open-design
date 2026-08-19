import type { Project } from "../types";

export type ProjectListCardCategory = "prototype" | "live-artifact" | "slide" | "media";

/**
 * Home / Projects card kind badge.
 *
 * Teamver slide-only lists have no prototype/media/live-artifact create path.
 * Registry rows also omit `metadata.kind`, so the Open Design fallback
 * ("prototype") would paint on every card unless we force slide here.
 */
export function projectListCardCategory(
  project: Project,
  options?: { slideOnly?: boolean },
): ProjectListCardCategory {
  if (options?.slideOnly) return "slide";
  const meta = project.metadata;
  if (meta?.intent === "live-artifact" || project.skillId === "live-artifact") {
    return "live-artifact";
  }
  if (meta?.kind === "deck") return "slide";
  if (meta?.kind === "image" || meta?.kind === "video" || meta?.kind === "audio") {
    return "media";
  }
  return "prototype";
}

/** Embed list rows are always decks — keep metadata.kind aligned with the badge. */
export function withTeamverSlideListKind<T extends { kind?: string } | undefined>(
  metadata: T,
): T & { kind: "deck" } {
  return { ...(metadata ?? ({} as T)), kind: "deck" };
}
