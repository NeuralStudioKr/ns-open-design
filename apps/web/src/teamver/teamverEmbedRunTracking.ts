import type { ChatRunStatusResponse } from "@open-design/contracts";

export type EmbedRunTrackingRefs = {
  activeRunIds: { current: Set<string> };
  notifiedBackgroundRunIds: { current: Set<string> };
  wasActiveRun: { current: boolean };
  activeRunSignature: { current: string };
  /** Project ids observed as in-flight in this embed session (empty-list toast guard). */
  sessionActiveRunProjectIds: { current: Set<string> };
};

/** Drop cross-workspace/session background-run toast + list-refresh bookkeeping. */
export function resetEmbedRunTrackingRefs(refs: EmbedRunTrackingRefs): void {
  refs.activeRunIds.current.clear();
  refs.notifiedBackgroundRunIds.current.clear();
  refs.wasActiveRun.current = false;
  refs.activeRunSignature.current = "";
  refs.sessionActiveRunProjectIds.current.clear();
}

/** Skip completion toast when the run's project is outside the loaded workspace list. */
export type EmbedBackgroundRunCompletionDecision = "notify" | "defer" | "suppress";

export function decideEmbedBackgroundRunCompletion(
  projectId: string | null | undefined,
  projectsById: ReadonlyMap<string, unknown>,
  projectListSettled: boolean,
  pendingLocalProjectIds?: ReadonlySet<string>,
  sessionActiveRunProjectIds?: ReadonlySet<string>,
): EmbedBackgroundRunCompletionDecision {
  const id = projectId?.trim();
  if (!id) return "suppress";
  if (!projectListSettled) return "defer";
  if (projectsById.has(id)) return "notify";
  if (pendingLocalProjectIds?.has(id)) return "notify";
  if (sessionActiveRunProjectIds?.has(id)) return "notify";
  return "suppress";
}

/** Project ids the embed session treats as in-workspace for run tracking. */
export function buildEmbedKnownProjectIds(options: {
  projectIds: Iterable<string>;
  pendingLocalProjectIds?: ReadonlySet<string>;
  sessionActiveRunProjectIds?: ReadonlySet<string>;
  openProjectId?: string | null;
}): Set<string> {
  const known = new Set(options.projectIds);
  for (const id of options.pendingLocalProjectIds ?? []) known.add(id);
  for (const id of options.sessionActiveRunProjectIds ?? []) known.add(id);
  const openId = options.openProjectId?.trim();
  if (openId) known.add(openId);
  return known;
}

/** Drop daemon runs whose project is outside the current embed workspace context. */
export function filterRunsForEmbedKnownProjects(
  runs: ChatRunStatusResponse[],
  knownProjectIds: ReadonlySet<string>,
): ChatRunStatusResponse[] {
  if (knownProjectIds.size === 0) return [];
  return runs.filter((run) => {
    const id = run.projectId?.trim();
    return id && knownProjectIds.has(id);
  });
}

/** @deprecated Use decideEmbedBackgroundRunCompletion — kept for narrow boolean checks. */
export function shouldNotifyEmbedBackgroundRunCompletion(
  projectId: string | null | undefined,
  projectsById: ReadonlyMap<string, unknown>,
  projectListSettled = true,
  pendingLocalProjectIds?: ReadonlySet<string>,
  sessionActiveRunProjectIds?: ReadonlySet<string>,
): boolean {
  return decideEmbedBackgroundRunCompletion(
    projectId,
    projectsById,
    projectListSettled,
    pendingLocalProjectIds,
    sessionActiveRunProjectIds,
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
      refs.sessionActiveRunProjectIds.current,
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
  workspaceRuns: ChatRunStatusResponse[] = runs,
): void {
  refs.activeRunIds.current = new Set(
    workspaceRuns
      .filter((run) => run.status === "queued" || run.status === "running")
      .map((run) => run.id),
  );
  for (const run of workspaceRuns) {
    if (run.status === "queued" || run.status === "running") {
      const projectId = run.projectId?.trim();
      if (projectId) refs.sessionActiveRunProjectIds.current.add(projectId);
    }
  }
  for (const run of runs) {
    if (run.status === "succeeded" || run.status === "failed") {
      refs.notifiedBackgroundRunIds.current.add(run.id);
    }
  }
}
