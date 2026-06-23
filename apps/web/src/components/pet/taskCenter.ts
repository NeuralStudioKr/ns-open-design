import type { ChatRunStatusResponse } from '@open-design/contracts';
import type { Project } from '../../types';
import { projectOpenOptionsFromPreviewCover } from '../../teamver/projectPreviewFile';
import type { PetRecentTaskSummary, PetTaskCenter, PetTaskSummary } from './PetOverlay';

const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'canceled']);

export function buildPetTaskCenter(
  projects: Project[],
  runs: ChatRunStatusResponse[],
): PetTaskCenter {
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const running = new Map<string, PetTaskSummary>();
  const queued = new Map<string, PetTaskSummary>();
  const recentByProject = new Map<string, PetRecentTaskSummary>();

  for (const run of runs) {
    if (!run.projectId) continue;
    const project = projectsById.get(run.projectId);
    if (!project) continue;
    if (run.status === 'running') {
      addActiveSummary(running, run, project.name, 'running');
      continue;
    }
    if (run.status === 'queued') {
      addActiveSummary(queued, run, project.name, 'queued');
      continue;
    }
    if (TERMINAL_STATUSES.has(run.status)) {
      const prev = recentByProject.get(run.projectId);
      if (prev && prev.updatedAt >= run.updatedAt) continue;
      recentByProject.set(run.projectId, {
        projectId: run.projectId,
        projectName: project.name,
        status: run.status as PetRecentTaskSummary['status'],
        updatedAt: run.updatedAt,
      });
    }
  }

  return {
    running: attachPrimaryConversations(sortActiveSummaries([...running.values()]), runs),
    queued: attachPrimaryConversations(sortActiveSummaries([...queued.values()]), runs),
    recent: [...recentByProject.values()]
      .filter((task) => !running.has(task.projectId) && !queued.has(task.projectId))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 3),
  };
}

/** Prefer a running run's conversation; else the latest queued/running run with conversationId. */
export function primaryConversationIdForProject(
  runs: ChatRunStatusResponse[],
  projectId: string,
): string | null {
  let best: { id: string; updatedAt: number; running: boolean } | null = null;
  for (const run of runs) {
    if (run.projectId !== projectId) continue;
    if (run.status !== 'running' && run.status !== 'queued') continue;
    const id = run.conversationId?.trim();
    if (!id) continue;
    const running = run.status === 'running';
    if (
      !best
      || (running && !best.running)
      || (running === best.running && run.updatedAt >= best.updatedAt)
    ) {
      best = { id, updatedAt: run.updatedAt, running };
    }
  }
  return best?.id ?? null;
}

function attachPrimaryConversations(
  summaries: PetTaskSummary[],
  runs: ChatRunStatusResponse[],
): PetTaskSummary[] {
  return summaries.map((summary) => ({
    ...summary,
    conversationId: primaryConversationIdForProject(runs, summary.projectId),
  }));
}

/** Active (queued + running) runs for embed background-run surfaces. */
export function buildActiveRunSummaries(
  projects: Project[],
  runs: ChatRunStatusResponse[],
): PetTaskSummary[] {
  const center = buildPetTaskCenter(projects, runs);
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  return [...center.running, ...center.queued].map((summary) => {
    const project = projectsById.get(summary.projectId);
    const previewFileName = project
      ? projectOpenOptionsFromPreviewCover(project, null)?.fileName ?? null
      : null;
    return previewFileName
      ? { ...summary, previewFileName }
      : summary;
  });
}

export function activeRunSummariesEqual(
  left: PetTaskSummary[],
  right: PetTaskSummary[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((item, index) => {
    const other = right[index];
    return (
      other != null
      && item.projectId === other.projectId
      && item.projectName === other.projectName
      && item.status === other.status
      && item.count === other.count
      && item.conversationId === other.conversationId
    );
  });
}

function addActiveSummary(
  summaries: Map<string, PetTaskSummary>,
  run: ChatRunStatusResponse,
  projectName: string,
  status: PetTaskSummary['status'],
) {
  const projectId = run.projectId!;
  const prev = summaries.get(projectId);
  summaries.set(projectId, {
    projectId,
    projectName,
    status: prev?.status === 'running' ? 'running' : status,
    count: (prev?.count ?? 0) + 1,
  });
}

function sortActiveSummaries(summaries: PetTaskSummary[]): PetTaskSummary[] {
  return summaries.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.projectName.localeCompare(b.projectName);
  });
}
