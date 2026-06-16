import path from 'node:path';

export type ProjectStorageLayout =
  | {
      mode: 'local';
      projectsDir: string;
    }
  | {
      mode: 's3';
      projectsDir: string;
      scratchDir: string;
    };

export function resolveProjectStorageLayout(
  env: Record<string, string | undefined>,
  dataDir: string,
): ProjectStorageLayout {
  const kind = (env.OD_PROJECT_STORAGE ?? 'local').trim().toLowerCase();
  if (kind !== 's3') {
    return {
      mode: 'local',
      projectsDir: path.join(dataDir, 'projects'),
    };
  }

  const scratchDir = (env.OD_SCRATCH_DIR?.trim() || path.join(dataDir, 'scratch'));
  return {
    mode: 's3',
    scratchDir,
    projectsDir: path.join(scratchDir, 'projects'),
  };
}

export function isS3ProjectStorageLayout(
  layout: ProjectStorageLayout,
): layout is Extract<ProjectStorageLayout, { mode: 's3' }> {
  return layout.mode === 's3';
}
