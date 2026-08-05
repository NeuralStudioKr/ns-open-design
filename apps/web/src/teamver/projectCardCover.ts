import type { CSSProperties } from "react";
import type { Project } from "../types";
import type { ProjectCoverFile } from "./projectPreviewFile";
import { projectCoverMediaUrl } from "./projectCoverMediaUrl";

export type ProjectCardCover = {
  kind: "image" | "video" | "html" | "logo" | "fallback";
  /** Same-origin `/raw/` URL — used for video/html (and non-Teamver image fallback). */
  src?: string;
  /** Project-relative path for image/logo covers (presigned GET in Teamver). */
  filePath?: string;
  /** Cache-bust / remint key (mtime or coverVersion). */
  version?: number;
  style: CSSProperties;
  initial: string;
};

export function buildProjectCardCover(
  project: Project,
  override: ProjectCoverFile | null,
): ProjectCardCover {
  let h = 0;
  for (let i = 0; i < project.id.length; i += 1) {
    h = (h * 31 + project.id.charCodeAt(i)) >>> 0;
  }
  const hue = h % 360;
  const hue2 = (hue + 38) % 360;
  const style: CSSProperties = {
    background: `radial-gradient(circle at 30% 28%, hsl(${hue} 70% 78% / 0.55), transparent 42%), linear-gradient(135deg, hsl(${hue} 65% 88%), hsl(${hue2} 70% 90%))`,
  };
  const trimmed = project.name.trim();
  const initial = (trimmed ? Array.from(trimmed)[0]! : "?").toUpperCase();

  if (override) {
    const version = coverVersion(override, project);
    return {
      kind: override.kind,
      src: projectCoverMediaUrl(project.id, override.name, version),
      filePath: override.name,
      ...(version !== undefined ? { version } : {}),
      style,
      initial,
    };
  }

  const meta = project.metadata;
  const entry = meta?.entryFile;
  if (entry) {
    const version = project.updatedAt;
    const src = projectCoverMediaUrl(project.id, entry, version);
    if (meta?.kind === "image") {
      return { kind: "image", src, filePath: entry, version, style, initial };
    }
    if (meta?.kind === "video") {
      return { kind: "video", src, filePath: entry, version, style, initial };
    }
    if (/\.html?$/i.test(entry)) {
      return { kind: "html", src, filePath: entry, version, style, initial };
    }
  }

  return { kind: "fallback", style, initial };
}

function coverVersion(override: ProjectCoverFile, project: Project): number | undefined {
  return override.version ?? project.updatedAt;
}
