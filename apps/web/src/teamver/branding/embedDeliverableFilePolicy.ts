import type { TeamverBrandingConfig } from "./config";

/** Deck scaffold / BYOK plumbing — hidden from embed chat stream + auto-open. */
const EMBED_SUPPORTING_EXTENSIONS = new Set([
  "css",
  "scss",
  "sass",
  "less",
  "js",
  "mjs",
  "cjs",
  "jsx",
  "tsx",
  "map",
]);

export function projectRelativePath(file: { name: string; path?: string }): string {
  return file.path?.trim() || file.name;
}

export function filePathExtension(path: string): string {
  const base = path.split("/").pop() ?? path;
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(dot + 1).toLowerCase() : "";
}

/** Stylesheets and sibling JS modules — not end-user deliverables in embed MVP. */
export function isEmbedSupportingProjectFile(file: {
  name: string;
  path?: string;
}): boolean {
  return EMBED_SUPPORTING_EXTENSIONS.has(filePathExtension(projectRelativePath(file)));
}

export function shouldMinimizeEmbedLiveToolCode(
  branding: Pick<TeamverBrandingConfig, "slideOnlyMvp">,
  filePath: string,
): boolean {
  if (!branding.slideOnlyMvp) return false;
  const trimmed = filePath.trim();
  if (!trimmed) return false;
  return isEmbedSupportingProjectFile({ name: trimmed });
}

export function shouldDeclineEmbedAutoOpen(
  branding: Pick<TeamverBrandingConfig, "slideOnlyMvp">,
  file: { name: string; path?: string; kind?: string },
): boolean {
  if (!branding.slideOnlyMvp) return false;
  return isEmbedSupportingProjectFile(file);
}

export function filterEmbedDeliverableProducedFiles<T extends { name: string; path?: string }>(
  files: readonly T[],
  branding: Pick<TeamverBrandingConfig, "slideOnlyMvp">,
): T[] {
  if (!branding.slideOnlyMvp) return [...files];
  return files.filter((file) => !isEmbedSupportingProjectFile(file));
}

export type DesignFileSectionFile = { name: string; path?: string; mtime: number };

export type DesignFileSection<
  T extends string = string,
  F extends DesignFileSectionFile = DesignFileSectionFile,
> = readonly [T, readonly F[]];

/** Split grouped Design Files sections into deliverables vs collapsed supporting bucket. */
export function partitionEmbedDesignFileSections<
  T extends string,
  F extends DesignFileSectionFile,
>(
  sections: readonly DesignFileSection<T, F>[],
  branding: Pick<TeamverBrandingConfig, "slideOnlyMvp">,
): {
  deliverableSections: DesignFileSection<T, F>[];
  supportingFiles: F[];
} {
  if (!branding.slideOnlyMvp) {
    return { deliverableSections: [...sections], supportingFiles: [] };
  }
  const deliverableSections: DesignFileSection<T, F>[] = [];
  const supportingFiles: F[] = [];
  for (const [category, sectionFiles] of sections) {
    const primary: F[] = [];
    for (const file of sectionFiles) {
      if (isEmbedSupportingProjectFile(file)) supportingFiles.push(file);
      else primary.push(file);
    }
    if (primary.length > 0) deliverableSections.push([category, primary]);
  }
  supportingFiles.sort((a, b) => b.mtime - a.mtime || a.name.localeCompare(b.name));
  return { deliverableSections, supportingFiles };
}
