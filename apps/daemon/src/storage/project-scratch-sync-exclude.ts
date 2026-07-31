import { isTeamverDaemonStateRelpath } from '../teamver-project-daemon-state-store.js';

/**
 * Project scratch paths that must never be uploaded to remote SSOT (S3).
 * Revision snapshots belong in daemon DB (sqlite) or local `.od/revisions` only.
 */
export function isProjectScratchSyncExcludedRelpath(relpath: string): boolean {
  const normalized = relpath.replace(/^[\\/]+/, '').replace(/\\/g, '/');
  if (isTeamverDaemonStateRelpath(normalized)) return true;
  if (normalized === '.od/revisions' || normalized.startsWith('.od/revisions/')) return true;
  return false;
}
