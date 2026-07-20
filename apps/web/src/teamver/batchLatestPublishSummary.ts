import { resolveActiveTeamverWorkspaceIdForEmbed } from "./activeTeamverWorkspace";
import {
  TEAMVER_BFF_REQUEST_OPTIONS,
  getDesignBffClient,
  shouldSkipTeamverBffAuthCalls,
  withDesignBffCookieAuthRecovery,
} from "./designBffClient";
import { isTeamverEmbedMode, resolveTeamverDriveAssetUrl } from "./designApiBase";
import type { TeamverLatestPublishSummary } from "./latestPublishSummary";
import { PUBLISH_CHIP_BATCH_MAX } from "./publishChipLimits";

export const BATCH_LATEST_PUBLISH_MAX = PUBLISH_CHIP_BATCH_MAX;

type BatchLatestPublishResponse = {
  summaries?: Array<{
    odProjectId?: string;
    version?: number;
    kind?: string;
    driveAssetId?: string;
    filename?: string;
  }>;
};

export type BatchFetchLatestPublishResult =
  | { status: "ok"; summaries: Record<string, TeamverLatestPublishSummary | null> }
  | { status: "skipped" }
  | { status: "error" };

function normalizeBatchSummary(raw: NonNullable<BatchLatestPublishResponse["summaries"]>[number]): TeamverLatestPublishSummary | null {
  const projectId = raw.odProjectId?.trim();
  const driveAssetId = raw.driveAssetId?.trim();
  if (!projectId || !driveAssetId) return null;
  return {
    projectId,
    version: raw.version ?? 1,
    kind: raw.kind ?? "html",
    driveUrl: resolveTeamverDriveAssetUrl(driveAssetId),
    filename: raw.filename ?? raw.kind ?? "output",
  };
}

/** Embed: one design-api call for latest publish chip data across many projects. */
export async function batchFetchLatestPublishSummaries(
  projectIds: string[],
): Promise<BatchFetchLatestPublishResult> {
  if (!isTeamverEmbedMode()) return { status: "skipped" };
  // Dead cookie / sticky: home chip batch must not re-enter cookie recovery.
  if (shouldSkipTeamverBffAuthCalls()) return { status: "skipped" };

  const ids = [...new Set(projectIds.map((id) => id.trim()).filter(Boolean))].slice(
    0,
    BATCH_LATEST_PUBLISH_MAX,
  );
  if (ids.length === 0) return { status: "skipped" };

  const client = getDesignBffClient();
  if (!client) return { status: "skipped" };

  const workspaceId = await resolveActiveTeamverWorkspaceIdForEmbed();
  if (!workspaceId) return { status: "skipped" };

  try {
    const response = await withDesignBffCookieAuthRecovery(() =>
      client.http.post<BatchLatestPublishResponse>(
        "/projects/batch/outputs/latest",
        { odProjectIds: ids },
        {
          workspaceId,
          ...TEAMVER_BFF_REQUEST_OPTIONS,
        },
      ),
    );

    const summaries: Record<string, TeamverLatestPublishSummary | null> = {};
    for (const id of ids) {
      summaries[id] = null;
    }
    for (const raw of response.summaries ?? []) {
      const summary = normalizeBatchSummary(raw);
      if (!summary) continue;
      summaries[summary.projectId] = summary;
    }

    return { status: "ok", summaries };
  } catch {
    return { status: "error" };
  }
}
