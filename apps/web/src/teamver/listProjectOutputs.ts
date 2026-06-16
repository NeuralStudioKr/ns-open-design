import { getDesignBffClient } from "./designBffClient";
import { isTeamverEmbedMode } from "./designApiBase";
import {
  normalizePublishOutput,
  pickReadyPublishOutputs,
  type TeamverPublishDriveOutput,
} from "./publishToDrive";

export type TeamverProjectOutputsResult = {
  projectId: string;
  outputs: TeamverPublishDriveOutput[];
};

type OutputsListResponse = {
  projectId?: string;
  project_id?: string;
  outputs?: Parameters<typeof normalizePublishOutput>[0][];
};

/** Embed: published Drive outputs for a project (design-api registry). */
export async function listTeamverProjectOutputs(
  projectId: string,
): Promise<TeamverProjectOutputsResult | null> {
  if (!isTeamverEmbedMode()) return null;

  const trimmedId = projectId.trim();
  if (!trimmedId) return null;

  const client = getDesignBffClient();
  if (!client) return null;

  const workspaceId = await client.workspaceStore?.get();
  if (!workspaceId?.trim()) return null;

  const response = await client.http.get<OutputsListResponse>(
    `/projects/${encodeURIComponent(trimmedId)}/outputs`,
    {
      workspaceId: workspaceId.trim(),
      skipAuthHeader: true,
    },
  );

  const outputs = (response.outputs ?? []).map(normalizePublishOutput);
  return {
    projectId: response.projectId ?? response.project_id ?? trimmedId,
    outputs,
  };
}

export function findLatestReadyPublishOutput(
  outputs: TeamverPublishDriveOutput[],
  kind?: string,
): TeamverPublishDriveOutput | undefined {
  const ready = pickReadyPublishOutputs(outputs);
  if (!kind?.trim()) return ready[0];
  const normalizedKind = kind.trim().toLowerCase();
  return ready.find((output) => output.kind.toLowerCase() === normalizedKind) ?? ready[0];
}
