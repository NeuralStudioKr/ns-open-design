const activeRevisionSequenceByFile = new Map<string, number>();

function revisionActiveKey(projectId: string, fileName: string): string {
  return `${projectId}::${fileName}`;
}

export function setActiveRevisionSequence(
  projectId: string,
  fileName: string,
  sequence: number,
): void {
  if (!Number.isFinite(sequence) || sequence <= 0) return;
  activeRevisionSequenceByFile.set(revisionActiveKey(projectId, fileName), sequence);
}

export function getActiveRevisionSequence(
  projectId: string,
  fileName: string,
): number | undefined {
  return activeRevisionSequenceByFile.get(revisionActiveKey(projectId, fileName));
}

export function clearActiveRevisionSequence(projectId: string, fileName: string): void {
  activeRevisionSequenceByFile.delete(revisionActiveKey(projectId, fileName));
}
