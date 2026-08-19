import { projectKindToTracking, type TrackingProjectKind } from "@open-design/contracts/analytics";

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

/**
 * Seed `kind: deck` only when the list row has no kind.
 *
 * Do not overwrite daemon `prototype` + Canvas `entryFile: index.html`.
 * `buildProjectCardCover` treats kind=deck + untrusted HTML as a fallback
 * thumb, which would blank cards that still pin index.html.
 */
export function withTeamverSlideListKind<T extends { kind?: string } | undefined>(
  metadata: T,
): (T & { kind: string }) | { kind: "deck" } {
  if (metadata && typeof metadata.kind === "string" && metadata.kind.trim()) {
    return metadata as T & { kind: string };
  }
  return { ...(metadata ?? ({} as T)), kind: "deck" };
}

/** List analytics: Teamver slide-only cards are slide_deck even if kind is stale. */
export function projectListTrackingKind(
  project: Project,
  options?: { slideOnly?: boolean },
): TrackingProjectKind | null {
  const tracked = projectKindToTracking(project.metadata?.kind, project.metadata?.videoModel);
  if (options?.slideOnly && (!tracked || tracked === "prototype" || tracked === "other")) {
    return "slide_deck";
  }
  return tracked;
}
