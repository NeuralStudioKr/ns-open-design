import type { DrivePublishFormat } from "./drivePublishMessaging";

const VALID_FORMATS = new Set<DrivePublishFormat>(["html", "pdf", "pptx"]);

export function lastPublishFormatStorageKey(
  workspaceId: string | null,
  projectId: string,
): string | null {
  const ws = workspaceId?.trim();
  const proj = projectId.trim();
  if (!ws || !proj) return null;
  return `teamver.drive.lastPublishFormat.${ws}.${proj}`;
}

export function readLastPublishFormat(
  workspaceId: string | null,
  projectId: string,
): DrivePublishFormat | null {
  if (typeof window === "undefined") return null;
  const key = lastPublishFormatStorageKey(workspaceId, projectId);
  if (!key) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const normalized = raw.trim().toLowerCase();
    return VALID_FORMATS.has(normalized as DrivePublishFormat)
      ? (normalized as DrivePublishFormat)
      : null;
  } catch {
    return null;
  }
}

export function writeLastPublishFormat(
  workspaceId: string | null,
  projectId: string,
  format: DrivePublishFormat,
): void {
  if (typeof window === "undefined") return;
  const key = lastPublishFormatStorageKey(workspaceId, projectId);
  if (!key) return;
  try {
    window.localStorage.setItem(key, format);
  } catch {
    // Private mode / quota — preference loss is harmless.
  }
}

export function resolveInitialPublishFormat(
  workspaceId: string | null,
  projectId: string,
  requested: DrivePublishFormat | null | undefined,
  pdfBlocked: boolean,
): DrivePublishFormat {
  if (requested && VALID_FORMATS.has(requested) && !(requested === "pdf" && pdfBlocked)) {
    return requested;
  }
  const remembered = readLastPublishFormat(workspaceId, projectId);
  if (remembered && !(remembered === "pdf" && pdfBlocked)) return remembered;
  return pdfBlocked ? "html" : "pdf";
}
