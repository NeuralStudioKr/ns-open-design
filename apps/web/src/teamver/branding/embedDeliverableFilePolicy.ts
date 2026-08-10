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

export function filePathBasename(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/^\.\/+/, "");
  const base = normalized.split("/").filter(Boolean).pop() ?? normalized;
  return base.trim();
}

export function isEmbedReferenceSourceFile(file: { name: string; path?: string }): boolean {
  const rel = projectRelativePath(file).replace(/\\/g, "/").replace(/^\.\/+/, "");
  return rel === "refs" || rel.startsWith("refs/");
}

function isHtmlProjectPath(path: string): boolean {
  return /\.html?$/i.test(path);
}

/**
 * Canvas/Drive source HTML is imported under `refs/...`. Models sometimes also
 * Write a root-level near-copy (same basename). Treat that root leak as a
 * supporting/source file — not a slide deliverable.
 */
export function isRootHtmlMatchingReferenceSource(
  file: { name: string; path?: string },
  projectFiles: readonly { name: string; path?: string }[],
): boolean {
  const rel = projectRelativePath(file).replace(/\\/g, "/").replace(/^\.\/+/, "");
  if (!rel || rel.includes("/") || isEmbedReferenceSourceFile(file)) return false;
  if (!isHtmlProjectPath(rel)) return false;
  const base = filePathBasename(rel).toLowerCase();
  // Canonical slide deliverable names stay deliverables even if a refs copy exists.
  // `index.html` is NOT exempt — Canvas exports often use that basename and leak to root.
  if (!base || /^deck(?:[-_.].*)?\.html?$/.test(base)) {
    return false;
  }
  for (const candidate of projectFiles) {
    if (!isEmbedReferenceSourceFile(candidate)) continue;
    const candidateRel = projectRelativePath(candidate).replace(/\\/g, "/");
    if (!isHtmlProjectPath(candidateRel)) continue;
    if (filePathBasename(candidateRel).toLowerCase() === base) return true;
  }
  return false;
}

/** Root-level HTML paths that duplicate a `refs/…` Canvas/Drive source basename. */
export function listRootHtmlMatchingReferenceSources(
  projectFiles: readonly { name: string; path?: string }[],
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const file of projectFiles) {
    if (!isRootHtmlMatchingReferenceSource(file, projectFiles)) continue;
    const rel = projectRelativePath(file).replace(/\\/g, "/").replace(/^\.\/+/, "");
    if (!rel || seen.has(rel)) continue;
    seen.add(rel);
    out.push(rel);
  }
  return out;
}

function isCanonicalDeckBasename(path: string): boolean {
  const base = filePathBasename(path).toLowerCase();
  return /^deck(?:[-_.].*)?\.html?$/.test(base);
}

/** True when the project already has a real slide deliverable (not a refs leak). */
export function projectHasCanonicalDeckDeliverable(
  projectFiles: readonly { name: string; path?: string }[],
): boolean {
  return projectFiles.some((file) => {
    if (isEmbedReferenceSourceFile(file)) return false;
    if (isRootHtmlMatchingReferenceSource(file, projectFiles)) return false;
    return isCanonicalDeckBasename(projectRelativePath(file));
  });
}

export type EmbedSupportingFileOptions = {
  /** Full project file list — used to detect root HTML that duplicates a refs source. */
  projectFiles?: readonly { name: string; path?: string }[];
};

/** Stylesheets, sibling JS, refs sources, and root HTML that leaks refs basenames. */
export function isEmbedSupportingProjectFile(
  file: {
    name: string;
    path?: string;
  },
  options?: EmbedSupportingFileOptions,
): boolean {
  if (isEmbedReferenceSourceFile(file)) return true;
  if (
    options?.projectFiles
    && isRootHtmlMatchingReferenceSource(file, options.projectFiles)
  ) {
    return true;
  }
  return EMBED_SUPPORTING_EXTENSIONS.has(filePathExtension(projectRelativePath(file)));
}

export function shouldMinimizeEmbedLiveToolCode(
  branding: Pick<TeamverBrandingConfig, "slideOnlyMvp">,
  filePath: string,
  options?: EmbedSupportingFileOptions,
): boolean {
  if (!branding.slideOnlyMvp) return false;
  const trimmed = filePath.trim();
  if (!trimmed) return true;
  if (/\.html?$/i.test(trimmed)) return true;
  return isEmbedSupportingProjectFile({ name: trimmed }, options);
}

export function shouldDeclineEmbedAutoOpen(
  branding: Pick<TeamverBrandingConfig, "slideOnlyMvp">,
  file: { name: string; path?: string; kind?: string },
  options?: EmbedSupportingFileOptions,
): boolean {
  if (!branding.slideOnlyMvp) return false;
  return isEmbedSupportingProjectFile(file, options);
}

export function filterEmbedDeliverableProducedFiles<T extends { name: string; path?: string }>(
  files: readonly T[],
  branding: Pick<TeamverBrandingConfig, "slideOnlyMvp">,
  options?: EmbedSupportingFileOptions,
): T[] {
  if (!branding.slideOnlyMvp) return [...files];
  const projectFiles = options?.projectFiles ?? files;
  return files.filter((file) => !isEmbedSupportingProjectFile(file, { projectFiles }));
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
  const allFiles = sections.flatMap(([, sectionFiles]) => [...sectionFiles]);
  const deliverableSections: DesignFileSection<T, F>[] = [];
  const supportingFiles: F[] = [];
  for (const [category, sectionFiles] of sections) {
    const primary: F[] = [];
    for (const file of sectionFiles) {
      if (isEmbedSupportingProjectFile(file, { projectFiles: allFiles })) supportingFiles.push(file);
      else primary.push(file);
    }
    if (primary.length > 0) deliverableSections.push([category, primary]);
  }
  supportingFiles.sort((a, b) => b.mtime - a.mtime || a.name.localeCompare(b.name));
  return { deliverableSections, supportingFiles };
}
