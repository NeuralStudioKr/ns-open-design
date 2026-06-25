import { readActiveTeamverWorkspaceId } from "./activeTeamverWorkspace";
import { isTeamverEmbedMode, resolveTeamverDriveAssetUrl } from "./designApiBase";
import {
  ensureDefaultPublishTarget,
  readLastPublishTargetId,
  resolvePublishTargetById,
  writeLastPublishTargetId,
} from "./drivePublishLastTarget";
import { pushRecentPublishTarget } from "./drivePublishRecentTargets";
import { listTeamverDrivePublishTargets } from "./drivePublishTargets";
import { clearLatestPublishSummaryCache, prefetchLatestPublishSummaries } from "./latestPublishSummary";
import {
  formatTeamverDesignErrorMessage,
  pickReadyPublishOutputs,
  publishTeamverDesignToDrive,
  type TeamverPublishDriveOutput,
} from "./publishToDrive";
import { notifyTeamverPublishOutputsChanged } from "./teamverPublishEvents";
import { assertTeamverDesignAppEnabled } from "./teamverDesignAccess";

const PUBLISH_FORMATS = ["html"] as const;

export type TeamverOneClickPublishSkipReason =
  | "not_embed"
  | "no_workspace"
  | "design_disabled"
  | "no_last_target";

export type TeamverOneClickPublishResult =
  | { status: "skipped"; reason: TeamverOneClickPublishSkipReason }
  | { status: "published"; output: TeamverPublishDriveOutput; partial: boolean }
  | { status: "failed"; message: string };

export type TeamverOneClickPublishToast = {
  message: string;
  details: string | null;
  detailsHref?: string | null;
};

export function buildOneClickPublishToast(
  result: TeamverOneClickPublishResult,
): TeamverOneClickPublishToast | null {
  if (result.status === "skipped") return null;
  if (result.status === "failed") {
    return {
      message: "Teamver 드라이브 발행에 실패했습니다",
      details: result.message,
    };
  }
  const driveUrl = result.output.driveAssetId
    ? resolveTeamverDriveAssetUrl(result.output.driveAssetId)
    : null;
  return {
    message: result.partial
      ? "Teamver 드라이브로 일부만 발행되었습니다"
      : "Teamver 드라이브로 발행했습니다",
    details: result.output.driveAssetId
      ? "Teamver 드라이브에서 보기"
      : `${result.output.filename} — 드라이브 열기`,
    detailsHref: driveUrl,
  };
}

/**
 * loop 409 — After run success arms publish, auto-publish to the operator's
 * last remembered Drive destination. Skips when no prior target exists so the
 * deploy menu can collect the first destination manually.
 */
export async function maybeOneClickPublishToDrive(
  projectId: string,
  artifactFile: string,
): Promise<TeamverOneClickPublishResult> {
  const id = projectId.trim();
  const file = artifactFile.trim();
  if (!id || !file || !isTeamverEmbedMode()) {
    return { status: "skipped", reason: "not_embed" };
  }

  const workspaceId = (await readActiveTeamverWorkspaceId())?.trim() || null;
  if (!workspaceId) return { status: "skipped", reason: "no_workspace" };

  try {
    assertTeamverDesignAppEnabled(workspaceId);
  } catch {
    return { status: "skipped", reason: "design_disabled" };
  }

  const rememberedId = readLastPublishTargetId(workspaceId, id);
  if (!rememberedId) return { status: "skipped", reason: "no_last_target" };

  let targets = ensureDefaultPublishTarget([]);
  try {
    targets = ensureDefaultPublishTarget(
      await listTeamverDrivePublishTargets(workspaceId, { limit: 200 }),
    );
  } catch {
    // Keep default-only list — remembered id may still resolve to personal-default.
  }

  const selectedTarget =
    resolvePublishTargetById(targets, rememberedId)
    ?? (rememberedId === "personal-default" ? targets[0] ?? null : null);
  if (!selectedTarget) {
    return { status: "skipped", reason: "no_last_target" };
  }

  try {
    const result = await publishTeamverDesignToDrive({
      projectId: id,
      artifactFile: file,
      formats: [...PUBLISH_FORMATS],
      folderId: selectedTarget.folderId,
      sharedDriveId: selectedTarget.sharedDriveId,
    });
    writeLastPublishTargetId(workspaceId, id, selectedTarget.id);
    pushRecentPublishTarget(workspaceId, selectedTarget);
    clearLatestPublishSummaryCache(id);
    notifyTeamverPublishOutputsChanged(id);
    void prefetchLatestPublishSummaries([id]);

    const ready = pickReadyPublishOutputs(result.outputs);
    const output = ready[0] ?? result.outputs[0];
    if (output?.publishStatus === "ready" && output.driveAssetId.trim() !== "") {
      return { status: "published", output, partial: result.partial };
    }
    if (result.partial && ready.length > 0) {
      return { status: "published", output: ready[0]!, partial: true };
    }
    return {
      status: "failed",
      message: formatTeamverDesignErrorMessage(new Error(output?.errorCode ?? "publish_failed")),
    };
  } catch (err) {
    return {
      status: "failed",
      message: formatTeamverDesignErrorMessage(err),
    };
  }
}
