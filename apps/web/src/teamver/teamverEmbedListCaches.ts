import { clearLatestPublishSummaryCache } from "./latestPublishSummary";
import { clearProjectCoverCache } from "./projectCoverLoader";
import { invalidateTeamverProjectRegistryCaches } from "./projectRegistry";

/** Drop embed list caches that are keyed by workspace-scoped project ids. */
export function clearTeamverEmbedListCaches(): void {
  invalidateTeamverProjectRegistryCaches();
  clearProjectCoverCache();
  clearLatestPublishSummaryCache();
}

/** Single-project purge after delete — cover hints + publish chip + registry list. */
export function clearTeamverEmbedProjectCaches(projectId: string): void {
  const id = projectId.trim();
  if (!id) return;
  clearProjectCoverCache(id);
  clearLatestPublishSummaryCache(id);
  // Membership may already be invalidated by unregister; keep list cache empty
  // so the next home recent fetch cannot serve a 15s pre-delete snapshot.
  invalidateTeamverProjectRegistryCaches();
}
