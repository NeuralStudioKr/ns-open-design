import { resolveActiveTeamverWorkspaceIdForEmbed } from "./activeTeamverWorkspace";
import {
  TEAMVER_BFF_REQUEST_OPTIONS,
  getDesignBffClient,
  withDesignBffCookieAuthRecovery,
} from "./designBffClient";
import { isTeamverEmbedMode } from "./designApiBase";
import {
  normalizePublishOutput,
  sortReadyPublishOutputsDesc,
  type TeamverPublishDriveOutput,
} from "./publishToDrive";

export type TeamverProjectOutputsResult = {
  projectId: string;
  outputs: TeamverPublishDriveOutput[];
};

type OutputsListResponse = {
  projectId?: string;
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

  const workspaceId = await resolveActiveTeamverWorkspaceIdForEmbed();
  if (!workspaceId) return null;

  const response = await withDesignBffCookieAuthRecovery(() =>
    client.http.get<OutputsListResponse>(
      `/projects/${encodeURIComponent(trimmedId)}/outputs`,
      {
        workspaceId,
        ...TEAMVER_BFF_REQUEST_OPTIONS,
      },
    ),
  );

  const outputs = (response.outputs ?? []).map(normalizePublishOutput);
  return {
    projectId: response.projectId ?? trimmedId,
    outputs,
  };
}

export function findLatestReadyPublishOutput(
  outputs: TeamverPublishDriveOutput[],
  kind?: string,
): TeamverPublishDriveOutput | undefined {
  const ready = sortReadyPublishOutputsDesc(outputs);
  if (!kind?.trim()) return ready[0];
  const normalizedKind = kind.trim().toLowerCase();
  return ready.find((output) => output.kind.toLowerCase() === normalizedKind) ?? ready[0];
}
