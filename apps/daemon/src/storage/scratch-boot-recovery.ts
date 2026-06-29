import { promises as fsp } from 'node:fs';
import path from 'node:path';

import type { ProjectMaterializationRuntime } from './project-materialization-runtime.js';

/**
 * Walk `<scratchProjectsRoot>/*` after daemon boot and return projectIds that
 * still have scratch files but no in-memory sticky remote (typical after a
 * crash/restart before run-end sync-up committed).
 */
export async function scanScratchOrphanProjectIds(scratchProjectsRoot: string): Promise<string[]> {
  const orphans: string[] = [];
  let entries;
  try {
    entries = await fsp.readdir(scratchProjectsRoot, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const projectId = entry.name.trim();
    if (!projectId || projectId.includes('..')) continue;
    const projectRoot = path.join(scratchProjectsRoot, projectId);
    if (!(await projectScratchHasFiles(projectRoot))) continue;
    orphans.push(projectId);
  }
  return orphans;
}

async function projectScratchHasFiles(projectRoot: string): Promise<boolean> {
  const queue = [projectRoot];
  while (queue.length > 0) {
    const dir = queue.pop()!;
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return false;
    }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        queue.push(abs);
        continue;
      }
      if (entry.isFile()) return true;
    }
  }
  return false;
}

export function emitScratchOrphanAtBootMarker(projectId: string): void {
  console.info(
    JSON.stringify({
      metric: 'od_scratch_orphan_at_boot',
      projectId,
      ts: Date.now(),
    }),
  );
}

/**
 * Register boot-time orphan projects. The first lazy sync path with a valid
 * request identity will force a full scratch sync-up (runStart=0).
 */
export function registerBootOrphanProjects(
  runtime: ProjectMaterializationRuntime,
  projectIds: string[],
): void {
  for (const projectId of projectIds) {
    runtime.markBootOrphanProject(projectId);
  }
}
