import { clearLatestPublishSummaryCache } from "./latestPublishSummary";
import { clearProjectCoverCache } from "./projectCoverLoader";
import { invalidateTeamverProjectRegistryCaches } from "./projectRegistry";

/** Drop embed list caches that are keyed by workspace-scoped project ids. */
export function clearTeamverEmbedListCaches(): void {
  invalidateTeamverProjectRegistryCaches();
  clearProjectCoverCache();
  clearLatestPublishSummaryCache();
}
