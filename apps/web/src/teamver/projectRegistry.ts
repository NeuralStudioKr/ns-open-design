import type { Project } from "../types";
import { getDesignBffClient } from "./designBffClient";
import { isTeamverEmbedMode } from "./designApiBase";

export type TeamverProjectRegistryPayload = {
  odProjectId: string;
  title?: string;
};

export function buildTeamverProjectRegistryPayload(
  project: Pick<Project, "id" | "name">,
): TeamverProjectRegistryPayload {
  const title = project.name?.trim();
  return {
    odProjectId: project.id,
    ...(title ? { title } : {}),
  };
}

export async function registerTeamverProjectIfNeeded(
  project: Pick<Project, "id" | "name">,
): Promise<void> {
  if (!isTeamverEmbedMode()) return;

  const client = getDesignBffClient();
  if (!client) return;

  try {
    const workspaceId = await client.workspaceStore?.get();
    if (!workspaceId?.trim()) return;

    await client.http.post(
      "/projects",
      buildTeamverProjectRegistryPayload(project),
      {
        workspaceId: workspaceId.trim(),
        skipAuthHeader: true,
      },
    );
  } catch (err) {
    console.warn("[teamver] project registry sync failed", err);
  }
}
