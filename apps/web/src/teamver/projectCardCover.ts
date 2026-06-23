import type { CSSProperties } from "react";
import { projectFileUrl } from "../providers/registry";
import type { Project } from "../types";
import type { ProjectCoverFile } from "./projectPreviewFile";

export type ProjectCardCover = {
  kind: "image" | "video" | "html" | "logo" | "fallback";
  src?: string;
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
    return {
      kind: override.kind,
      src: projectFileUrl(project.id, override.name),
      style,
      initial,
    };
  }

  const meta = project.metadata;
  const entry = meta?.entryFile;
  if (entry) {
    const src = projectFileUrl(project.id, entry);
    if (meta?.kind === "image") return { kind: "image", src, style, initial };
    if (meta?.kind === "video") return { kind: "video", src, style, initial };
    if (/\.html?$/i.test(entry)) return { kind: "html", src, style, initial };
  }

  return { kind: "fallback", style, initial };
}
