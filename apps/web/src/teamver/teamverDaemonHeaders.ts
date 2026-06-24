import { isTeamverEmbedMode } from "./designApiBase";
import { readActiveTeamverWorkspaceId } from "./useTeamverEmbed";

/** Embed active workspace for daemon `/api/*` — aligns run usage/billing with BFF headers. */
export async function buildTeamverDaemonRequestHeaders(
  base: Record<string, string>,
): Promise<Record<string, string>> {
  if (!isTeamverEmbedMode()) return base;
  const workspaceId = await readActiveTeamverWorkspaceId();
  if (!workspaceId) return base;
  return { ...base, "X-Workspace-Id": workspaceId };
}
