import { projectFileUrl } from "../providers/registry";

/** Card/preview media URL with optional mtime cache-bust (aligns with FileViewer `?v=`). */
export function projectCoverMediaUrl(
  projectId: string,
  filePath: string,
  version?: number,
): string {
  const base = projectFileUrl(projectId, filePath);
  if (version === undefined || !Number.isFinite(version)) return base;
  return `${base}?v=${Math.round(version)}`;
}
