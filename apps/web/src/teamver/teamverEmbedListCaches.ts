import { clearLatestPublishSummaryCache } from "./latestPublishSummary";
import { clearProjectCoverCache } from "./projectCoverLoader";
import { invalidateTeamverProjectRegistryCaches } from "./projectRegistry";

/** Drop embed list caches that are keyed by workspace-scoped project ids. */
export function clearTeamverEmbedListCaches(): void {
  invalidateTeamverProjectRegistryCaches();
  clearProjectCoverCache();
  clearLatestPublishSummaryCache();
}

/** Single-project purge after delete — cover hints + publish chip cache. */
export function clearTeamverEmbedProjectCaches(projectId: string): void {
  const id = projectId.trim();
  if (!id) return;
  clearProjectCoverCache(id);
  clearLatestPublishSummaryCache(id);
}
