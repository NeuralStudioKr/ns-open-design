import type { ChatRunStatusResponse } from "@open-design/contracts";

export type EmbedRunTrackingRefs = {
  activeRunIds: { current: Set<string> };
  notifiedBackgroundRunIds: { current: Set<string> };
  wasActiveRun: { current: boolean };
  activeRunSignature: { current: string };
};

/** Drop cross-workspace/session background-run toast + list-refresh bookkeeping. */
export function resetEmbedRunTrackingRefs(refs: EmbedRunTrackingRefs): void {
  refs.activeRunIds.current.clear();
  refs.notifiedBackgroundRunIds.current.clear();
  refs.wasActiveRun.current = false;
  refs.activeRunSignature.current = "";
}

/** Skip completion toast when the run's project is outside the loaded workspace list. */
export type EmbedBackgroundRunCompletionDecision = "notify" | "defer" | "suppress";

export function decideEmbedBackgroundRunCompletion(
  projectId: string | null | undefined,
  projectsById: ReadonlyMap<string, unknown>,
  projectListSettled: boolean,
  pendingLocalProjectIds?: ReadonlySet<string>,
): EmbedBackgroundRunCompletionDecision {
  const id = projectId?.trim();
  if (!id) return "suppress";
  if (!projectListSettled) return "defer";
  if (projectsById.has(id)) return "notify";
  if (pendingLocalProjectIds?.has(id)) return "notify";
  return "suppress";
}

/** @deprecated Use decideEmbedBackgroundRunCompletion — kept for narrow boolean checks. */
export function shouldNotifyEmbedBackgroundRunCompletion(
  projectId: string | null | undefined,
  projectsById: ReadonlyMap<string, unknown>,
  projectListSettled = true,
  pendingLocalProjectIds?: ReadonlySet<string>,
): boolean {
  return decideEmbedBackgroundRunCompletion(
    projectId,
    projectsById,
    projectListSettled,
    pendingLocalProjectIds,
  ) === "notify";
}

/** Mark terminal runs notified; return the newest run eligible for a completion toast. */
export function processEmbedBackgroundRunCompletions(
  completed: ChatRunStatusResponse[],
  projectsById: ReadonlyMap<string, unknown>,
  projectListSettled: boolean,
  refs: EmbedRunTrackingRefs,
  pendingLocalProjectIds?: ReadonlySet<string>,
): ChatRunStatusResponse | undefined {
  let toastRun: ChatRunStatusResponse | undefined;
  for (const run of completed) {
    const decision = decideEmbedBackgroundRunCompletion(
      run.projectId,
      projectsById,
      projectListSettled,
      pendingLocalProjectIds,
    );
    if (decision === "defer") continue;
    refs.notifiedBackgroundRunIds.current.add(run.id);
    if (!toastRun && decision === "notify") {
      toastRun = run;
    }
  }
  return toastRun;
}

/** After workspace/session boundary — track in-flight runs; suppress replay toasts for terminal runs. */
export function seedEmbedRunTrackingFromRuns(
  refs: EmbedRunTrackingRefs,
  runs: ChatRunStatusResponse[],
): void {
  refs.activeRunIds.current = new Set(
    runs
      .filter((run) => run.status === "queued" || run.status === "running")
      .map((run) => run.id),
  );
  for (const run of runs) {
    if (run.status === "succeeded" || run.status === "failed") {
      refs.notifiedBackgroundRunIds.current.add(run.id);
    }
  }
}
