const SESSION_KEY = "teamver.drive.pdfExportBlocked";

function readBlockedProjects(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((item): item is string => typeof item === "string" && item.trim() !== ""));
  } catch {
    return new Set();
  }
}

function writeBlockedProjects(blocked: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    if (blocked.size === 0) window.sessionStorage.removeItem(SESSION_KEY);
    else window.sessionStorage.setItem(SESSION_KEY, JSON.stringify([...blocked]));
  } catch {
    // Session storage unavailable — skip.
  }
}

export function isPdfExportBlocked(projectId: string): boolean {
  const id = projectId.trim();
  if (!id) return false;
  return readBlockedProjects().has(id);
}

export function markPdfExportBlocked(projectId: string): void {
  const id = projectId.trim();
  if (!id) return;
  const blocked = readBlockedProjects();
  blocked.add(id);
  writeBlockedProjects(blocked);
}

export function clearPdfExportBlocked(projectId: string): void {
  const id = projectId.trim();
  if (!id) return;
  const blocked = readBlockedProjects();
  if (!blocked.delete(id)) return;
  writeBlockedProjects(blocked);
}

/** Hide follow-up toast actions when PDF export is blocked for this project. */
export function canOfferAlternateDrivePublishFormat(
  alternateFormat: "html" | "pdf",
  projectId: string,
): boolean {
  return !(alternateFormat === "pdf" && isPdfExportBlocked(projectId));
}
