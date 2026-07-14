import type { ProjectFile } from './types';

// Implicit attribution is based on project-file timing or pre/post file-list
// diffs. User-created sketches can change during a run, but that does not make
// them assistant output files unless a run records them explicitly.
export function isImplicitProducedFileCandidate(file: ProjectFile): boolean {
  const lowerPath = (file.path ?? file.name).toLowerCase();
  return !lowerPath.endsWith('.sketch.json');
}

export function filterImplicitProducedFiles(files: readonly ProjectFile[]): ProjectFile[] {
  return files.filter(isImplicitProducedFileCandidate);
}

/**
 * Turn-start file baseline for produced-file diffs.
 *
 * `undefined` — legacy rows without a snapshot: use the end-of-turn list so
 * the diff is empty instead of attributing the whole project to one turn.
 * `[]` — the project had no files when the turn started (first artifact run).
 */
export function resolveTurnStartFileBaseline(
  preTurnFileNames: readonly string[] | undefined,
  projectFilesAtTurnEnd: readonly Pick<ProjectFile, 'name'>[],
): Set<string> {
  if (preTurnFileNames !== undefined) return new Set(preTurnFileNames);
  return new Set(projectFilesAtTurnEnd.map((file) => file.name));
}

export function computeProducedFiles(
  beforeNames: ReadonlySet<string> | readonly string[] | undefined,
  next: readonly ProjectFile[],
): ProjectFile[] | undefined {
  if (beforeNames === undefined || beforeNames === null) return undefined;
  const set = beforeNames instanceof Set ? beforeNames : new Set(beforeNames);
  return filterImplicitProducedFiles(next.filter((file) => !set.has(file.name)));
}

/** Hide files that already existed before this turn when producedFiles was over-counted. */
export function constrainProducedFilesToTurnBaseline(
  produced: readonly ProjectFile[],
  preTurnFileNames: readonly string[] | undefined,
): ProjectFile[] {
  if (produced.length === 0) return [];
  if (!preTurnFileNames || preTurnFileNames.length === 0) return [...produced];
  const before = new Set(preTurnFileNames);
  return produced.filter((file) => !before.has(file.name));
}
