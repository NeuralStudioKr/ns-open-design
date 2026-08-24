const activeRevisionSequenceByFile = new Map<string, number>();
const SESSION_PREFIX = 'od:revision-active-seq:';

function revisionActiveKey(projectId: string, fileName: string): string {
  return `${projectId}::${fileName}`;
}

function sessionStorageKey(projectId: string, fileName: string): string {
  return `${SESSION_PREFIX}${revisionActiveKey(projectId, fileName)}`;
}

function readSessionSequence(projectId: string, fileName: string): number | undefined {
  if (typeof sessionStorage === 'undefined') return undefined;
  try {
    const raw = sessionStorage.getItem(sessionStorageKey(projectId, fileName));
    if (raw == null || raw.trim() === '') return undefined;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

function writeSessionSequence(projectId: string, fileName: string, sequence: number): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(sessionStorageKey(projectId, fileName), String(sequence));
  } catch {
    // Quota / private mode — in-memory map still works for the session.
  }
}

function clearSessionSequence(projectId: string, fileName: string): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(sessionStorageKey(projectId, fileName));
  } catch {
    // ignore
  }
}

export function setActiveRevisionSequence(
  projectId: string,
  fileName: string,
  sequence: number,
): void {
  if (!Number.isFinite(sequence) || sequence <= 0) return;
  const key = revisionActiveKey(projectId, fileName);
  activeRevisionSequenceByFile.set(key, sequence);
  writeSessionSequence(projectId, fileName, sequence);
}

export function getActiveRevisionSequence(
  projectId: string,
  fileName: string,
): number | undefined {
  const key = revisionActiveKey(projectId, fileName);
  const cached = activeRevisionSequenceByFile.get(key);
  if (cached != null) return cached;
  const fromSession = readSessionSequence(projectId, fileName);
  if (fromSession != null) {
    activeRevisionSequenceByFile.set(key, fromSession);
    return fromSession;
  }
  return undefined;
}

export function clearActiveRevisionSequence(projectId: string, fileName: string): void {
  activeRevisionSequenceByFile.delete(revisionActiveKey(projectId, fileName));
  clearSessionSequence(projectId, fileName);
}
