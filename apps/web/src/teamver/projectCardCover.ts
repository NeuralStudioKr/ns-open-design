import type { CSSProperties } from "react";
import type { Project } from "../types";
import { isTrustedDeckEntryFile } from "./branding/embedDeliverableFilePolicy";
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
    // Only file mtime / cover-hints coverVersion — never project.updatedAt.
    // List polls bump updatedAt and would remint S3 GETs for every image thumb.
    const version = override.version;
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
  const entry = meta?.entryFile?.trim();
  if (entry) {
    const isDeckProject = meta?.kind === "deck" || meta?.skipDiscoveryBrief === true;
    // Deck projects must not thumb Canvas HTML pinned as entryFile.
    if (isDeckProject && /\.html?$/i.test(entry) && !isTrustedDeckEntryFile(entry)) {
      return { kind: "fallback", style, initial };
    }
    // Path-stable URL (no ?v=updatedAt). Html covers cache by path; image
    // thumbs mint once until an override with coverVersion arrives.
    const src = projectCoverMediaUrl(project.id, entry);
    if (meta?.kind === "image") {
      return { kind: "image", src, filePath: entry, style, initial };
    }
    if (meta?.kind === "video") {
      return { kind: "video", src, filePath: entry, style, initial };
    }
    if (/\.html?$/i.test(entry)) {
      return { kind: "html", src, filePath: entry, style, initial };
    }
  }

  return { kind: "fallback", style, initial };
}
