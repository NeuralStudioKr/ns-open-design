import { resolveTeamverDriveAssetUrl } from "./designApiBase";
import { listTeamverProjectOutputs } from "./listProjectOutputs";
import { sortReadyPublishOutputsDesc } from "./publishToDrive";

export type TeamverLatestPublishSummary = {
  projectId: string;
  version: number;
  kind: string;
  driveUrl: string;
  filename: string;
};

const cache = new Map<string, Promise<TeamverLatestPublishSummary | null>>();

export function clearLatestPublishSummaryCache(projectId?: string): void {
  if (projectId?.trim()) {
    cache.delete(projectId.trim());
    return;
  }
  cache.clear();
}

/** Latest ready Drive publish for a project (session-cached). */
export async function fetchLatestPublishSummary(
  projectId: string,
): Promise<TeamverLatestPublishSummary | null> {
  const id = projectId.trim();
  if (!id) return null;

  const existing = cache.get(id);
  if (existing) return existing;

  const run = (async () => {
    const result = await listTeamverProjectOutputs(id);
    if (!result) return null;

    const ready = sortReadyPublishOutputsDesc(result.outputs);
    const latest = ready[0];
    if (!latest || !latest.driveAssetId.trim()) return null;

    const version = ready.length;

    return {
      projectId: id,
      version,
      kind: latest.kind,
      driveUrl: resolveTeamverDriveAssetUrl(latest.driveAssetId),
      filename: latest.filename,
    };
  })();

  cache.set(id, run);
  return run;
}
