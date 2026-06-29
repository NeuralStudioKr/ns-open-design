/**
 * Daemon HTTP collection routes under `/api/projects/*` — not OD project ids.
 *
 * Normal project creation always uses client-generated UUIDs (`createProject`).
 * These slugs only appear when **our** embed/router or daemon legacy-register
 * paths mis-handle a collection URL or `:id` segment as a project id.
 *
 * Keep in sync with `PROJECT_COLLECTION_ROUTE_SLUGS` in
 * `apps/daemon/src/teamver-project-access.ts`.
 */
export const TEAMVER_PROJECT_COLLECTION_ROUTE_SLUGS = [
  "recent",
  "cover-hints",
] as const;

const SLUG_SET = new Set<string>(
  TEAMVER_PROJECT_COLLECTION_ROUTE_SLUGS.map((slug) => slug.toLowerCase()),
);

/** True when a string is a daemon collection route slug, not a real project id. */
export function isTeamverProjectCollectionRouteSlug(
  projectId: string | null | undefined,
): boolean {
  const trimmed = typeof projectId === "string" ? projectId.trim() : "";
  if (!trimmed) return false;
  return SLUG_SET.has(trimmed.toLowerCase());
}
