import type { ChatRunStatusResponse } from "@open-design/contracts";

import { publishTeamverSessionActiveRunProjectIds } from "./teamverEmbedSessionRuns";

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
  publishTeamverSessionActiveRunProjectIds(refs.sessionActiveRunProjectIds.current);
}

/** Skip completion toast when the run's project is outside the loaded workspace list. */
export type EmbedBackgroundRunCompletionDecision = "notify" | "defer" | "suppress";

export type LocallyDeletedProjectIds =
  | ReadonlyMap<string, unknown>
  | ReadonlySet<string>;

export type EmbedBackgroundRunNoticeStatus = "succeeded" | "failed" | "incomplete";

export function noticeStatusForBackgroundRun(
  run: Pick<ChatRunStatusResponse, "status"> & { endedWithUnfinishedWork?: boolean },
): EmbedBackgroundRunNoticeStatus {
  if (run.status === "succeeded" && run.endedWithUnfinishedWork) return "incomplete";
  return run.status === "failed" ? "failed" : "succeeded";
}

function isLocallyDeletedProjectId(
  id: string,
  locallyDeletedProjectIds?: LocallyDeletedProjectIds,
): boolean {
  if (!locallyDeletedProjectIds) return false;
  if (locallyDeletedProjectIds instanceof Map) return locallyDeletedProjectIds.has(id);
  if (locallyDeletedProjectIds instanceof Set) return locallyDeletedProjectIds.has(id);
  return false;
}

export function decideEmbedBackgroundRunCompletion(
  projectId: string | null | undefined,
  projectsById: ReadonlyMap<string, unknown>,
  projectListSettled: boolean,
  pendingLocalProjectIds?: ReadonlySet<string>,
  sessionActiveRunProjectIds?: ReadonlySet<string>,
  locallyDeletedProjectIds?: LocallyDeletedProjectIds,
): EmbedBackgroundRunCompletionDecision {
  const id = projectId?.trim();
  if (!id) return "suppress";
  if (isLocallyDeletedProjectId(id, locallyDeletedProjectIds)) return "suppress";
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
  locallyDeletedProjectIds?: LocallyDeletedProjectIds;
}): Set<string> {
  const known = new Set(options.projectIds);
  for (const id of options.pendingLocalProjectIds ?? []) known.add(id);
  for (const id of options.sessionActiveRunProjectIds ?? []) known.add(id);
  const openId = options.openProjectId?.trim();
  if (openId) known.add(openId);
  if (options.locallyDeletedProjectIds) {
    for (const id of [...known]) {
      if (isLocallyDeletedProjectId(id, options.locallyDeletedProjectIds)) known.delete(id);
    }
  }
  return known;
}

/**
 * Drop session-tracked project ids that have either rejoined the workspace list
 * (already tracked by `projectsById`) or were locally deleted in this session —
 * otherwise their banner chip / completion toast resurfaces from the next poll.
 */
export function pruneSessionActiveRunProjectIds(
  sessionActiveRunProjectIds: Set<string>,
  options: {
    projectsById: ReadonlyMap<string, unknown>;
    locallyDeletedProjectIds?: LocallyDeletedProjectIds;
  },
): void {
  for (const id of sessionActiveRunProjectIds) {
    if (
      options.projectsById.has(id)
      || isLocallyDeletedProjectId(id, options.locallyDeletedProjectIds)
    ) {
      sessionActiveRunProjectIds.delete(id);
    }
  }
}

/** Orphan active-run banner chips — session-active + pending-local, minus locally deleted. */
export function buildEmbedActiveRunAllowMissingIds(options: {
  sessionActiveRunProjectIds: ReadonlySet<string>;
  pendingLocalProjectIds: ReadonlySet<string>;
  locallyDeletedProjectIds?: LocallyDeletedProjectIds;
}): Set<string> {
  const allow = new Set<string>();
  for (const id of options.sessionActiveRunProjectIds) {
    if (!isLocallyDeletedProjectId(id, options.locallyDeletedProjectIds)) allow.add(id);
  }
  for (const id of options.pendingLocalProjectIds) {
    if (!isLocallyDeletedProjectId(id, options.locallyDeletedProjectIds)) allow.add(id);
  }
  return allow;
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
  locallyDeletedProjectIds?: LocallyDeletedProjectIds,
): boolean {
  return decideEmbedBackgroundRunCompletion(
    projectId,
    projectsById,
    projectListSettled,
    pendingLocalProjectIds,
    sessionActiveRunProjectIds,
    locallyDeletedProjectIds,
  ) === "notify";
}

/** Mark terminal runs notified; return the newest run eligible for a completion toast. */
export function processEmbedBackgroundRunCompletions(
  completed: ChatRunStatusResponse[],
  projectsById: ReadonlyMap<string, unknown>,
  projectListSettled: boolean,
  refs: EmbedRunTrackingRefs,
  pendingLocalProjectIds?: ReadonlySet<string>,
  locallyDeletedProjectIds?: LocallyDeletedProjectIds,
): ChatRunStatusResponse | undefined {
  let toastRun: ChatRunStatusResponse | undefined;
  for (const run of completed) {
    const decision = decideEmbedBackgroundRunCompletion(
      run.projectId,
      projectsById,
      projectListSettled,
      pendingLocalProjectIds,
      refs.sessionActiveRunProjectIds.current,
      locallyDeletedProjectIds,
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
  publishTeamverSessionActiveRunProjectIds(refs.sessionActiveRunProjectIds.current);
}
