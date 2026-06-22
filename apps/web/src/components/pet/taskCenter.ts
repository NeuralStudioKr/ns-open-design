import type { ChatRunStatusResponse } from '@open-design/contracts';
import type { Project } from '../../types';
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
      addActiveSummary(running, run.projectId, project.name, 'running');
      continue;
    }
    if (run.status === 'queued') {
      addActiveSummary(queued, run.projectId, project.name, 'queued');
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
    running: sortActiveSummaries([...running.values()]),
    queued: sortActiveSummaries([...queued.values()]),
    recent: [...recentByProject.values()]
      .filter((task) => !running.has(task.projectId) && !queued.has(task.projectId))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 3),
  };
}

/** Active (queued + running) runs for embed background-run surfaces. */
export function buildActiveRunSummaries(
  projects: Project[],
  runs: ChatRunStatusResponse[],
): PetTaskSummary[] {
  const center = buildPetTaskCenter(projects, runs);
  return [...center.running, ...center.queued];
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
    );
  });
}

function addActiveSummary(
  summaries: Map<string, PetTaskSummary>,
  projectId: string,
  projectName: string,
  status: PetTaskSummary['status'],
) {
  const prev = summaries.get(projectId);
  summaries.set(projectId, {
    projectId,
    projectName,
    status,
    count: (prev?.count ?? 0) + 1,
  });
}

function sortActiveSummaries(summaries: PetTaskSummary[]): PetTaskSummary[] {
  return summaries.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.projectName.localeCompare(b.projectName);
  });
}
