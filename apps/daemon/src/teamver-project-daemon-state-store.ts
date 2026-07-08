import type { ProjectStorage } from './storage/project-storage.js';
import type { TeamverProjectDaemonStateV1 } from './teamver-project-daemon-state.js';

export const TEAMVER_PROJECT_DAEMON_STATE_RELPATH = '_daemon/project-state.v1.json';

export function isTeamverDaemonStateRelpath(relpath: string): boolean {
  const normalized = relpath.replace(/^[\\/]+/, '').replace(/\\/g, '/');
  return normalized === TEAMVER_PROJECT_DAEMON_STATE_RELPATH
    || normalized.startsWith('_daemon/');
}

export async function readTeamverProjectDaemonStateFromRemote(
  remote: ProjectStorage,
  projectId: string,
): Promise<TeamverProjectDaemonStateV1 | null> {
  try {
    const body = await remote.readFile(projectId, TEAMVER_PROJECT_DAEMON_STATE_RELPATH);
    const parsed = JSON.parse(body.toString('utf8')) as TeamverProjectDaemonStateV1;
    if (parsed?.version !== 1) return null;
    if (parsed.projectId?.trim() !== projectId.trim()) return null;
    if (!Array.isArray(parsed.conversations) || !Array.isArray(parsed.messages)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeTeamverProjectDaemonStateToRemote(
  remote: ProjectStorage,
  projectId: string,
  state: TeamverProjectDaemonStateV1,
): Promise<void> {
  const body = Buffer.from(JSON.stringify(state), 'utf8');
  await remote.writeFile(projectId, TEAMVER_PROJECT_DAEMON_STATE_RELPATH, body);
}
