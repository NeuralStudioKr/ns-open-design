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

/** True when any imported Canvas/Drive HTML source exists under `refs/`. */
export function projectHasRefsHtmlSource(
  projectFiles: readonly { name: string; path?: string }[],
): boolean {
  return projectFiles.some(
    (file) =>
      isEmbedReferenceSourceFile(file)
      && isHtmlProjectPath(projectRelativePath(file)),
  );
}

/**
 * Known Canvas-shaped root basenames. Models often Write these even when the
 * refs import was renamed (`refs/drive/canvas-rev-9.html` → root `index.html`).
 * Do NOT treat arbitrary root HTML (`notes.html`, `about.html`) as leaks — those
 * may be user-authored.
 */
const CANVAS_SHAPED_ROOT_BASENAME_RE =
  /^(index|export|canvas)(?:[-_.].*)?\.html?$/i;

/**
 * Root Canvas-shaped HTML while a refs HTML source is present. Basename-matched
 * refs leaks are handled separately by `isRootHtmlMatchingReferenceSource`.
 */
export function isRootNonDeckHtmlWhenRefsPresent(
  file: { name: string; path?: string },
  projectFiles: readonly { name: string; path?: string }[],
): boolean {
  const rel = projectRelativePath(file).replace(/\\/g, "/").replace(/^\.\/+/, "");
  if (!rel || rel.includes("/") || isEmbedReferenceSourceFile(file)) return false;
  if (!isHtmlProjectPath(rel) || isCanonicalDeckProjectPath(rel)) return false;
  if (!CANVAS_SHAPED_ROOT_BASENAME_RE.test(filePathBasename(rel))) return false;
  return projectHasRefsHtmlSource(projectFiles);
}

/**
 * Root HTML cleanup candidates after a real deck exists: basename-matched refs
 * leaks, plus known Canvas-shaped root names when refs HTML sources are present.
 */
export function listRootHtmlCanvasLeakCleanupTargets(
  projectFiles: readonly { name: string; path?: string }[],
): string[] {
  const out = listRootHtmlMatchingReferenceSources(projectFiles);
  const seen = new Set(out);
  if (!projectHasRefsHtmlSource(projectFiles)) return out;
  if (!projectHasCanonicalDeckDeliverable(projectFiles)) return out;
  for (const file of projectFiles) {
    if (!isRootNonDeckHtmlWhenRefsPresent(file, projectFiles)) continue;
    const rel = projectRelativePath(file).replace(/\\/g, "/").replace(/^\.\/+/, "");
    if (!rel || seen.has(rel)) continue;
    seen.add(rel);
    out.push(rel);
  }
  return out;
}

/** True when a project-relative path is a canonical Teamver slide deliverable. */
export function isCanonicalDeckProjectPath(path: string): boolean {
  const base = filePathBasename(path).toLowerCase();
  return /^deck(?:[-_.].*)?\.html?$/.test(base);
}

/**
 * Whether metadata.entryFile is safe to trust as a deck project cover/entry.
 * Canvas→Slide leaks often pin `index.html` / `canvas.html` — those must not
 * short-circuit cover resolution past the real deck.
 */
export function isTrustedDeckEntryFile(entryFile?: string | null): boolean {
  const trimmed = entryFile?.trim() ?? "";
  if (!trimmed) return false;
  return isCanonicalDeckProjectPath(trimmed);
}

/** True when the project already has a real slide deliverable (not a refs leak). */
export function projectHasCanonicalDeckDeliverable(
  projectFiles: readonly { name: string; path?: string }[],
): boolean {
  return projectFiles.some((file) => {
    if (isEmbedReferenceSourceFile(file)) return false;
    if (isRootHtmlMatchingReferenceSource(file, projectFiles)) return false;
    return isCanonicalDeckProjectPath(projectRelativePath(file));
  });
}

/** Root `deck.html` — the only slide-only deliverable entry. */
export function isRootCanonicalDeckHtmlPath(path: string): boolean {
  const rel = path.replace(/\\/g, "/").replace(/^\.\//, "").trim();
  return Boolean(rel) && !rel.includes("/") && rel.toLowerCase() === "deck.html";
}

const TEMPLATE_CLONE_LOOK_SEED_META = "templateClonedDeckSeeded";
const TEMPLATE_CLONE_CONTENT_FILLED_META = "templateCloneContentFilled";

/**
 * Clone LOOK seed occupying deck.html in the same turn as content-fill.
 * A filled stamp always wins — stale seed flags must not hide a real deck.
 */
export function isTemplateCloneLookSeedFile(
  file: {
    artifactManifest?: { metadata?: Record<string, unknown> | null } | null;
  } | null | undefined,
): boolean {
  const meta = file?.artifactManifest?.metadata;
  if (!meta || typeof meta !== "object") return false;
  const rec = meta as Record<string, unknown>;
  if (rec[TEMPLATE_CLONE_CONTENT_FILLED_META] === true) return false;
  return rec[TEMPLATE_CLONE_LOOK_SEED_META] === true;
}

export type CanonicalDeckEntryFile = {
  name: string;
  path?: string;
  mtime?: number;
  artifactManifest?: { metadata?: Record<string, unknown> | null } | null;
};

/**
 * Best on-disk deck path for entryFile pinning / cover.
 * Prefers a filled root `deck.html`, then a filled `deck-*.html` sibling
 * (so Clone LOOK seed cannot win over content-fill), then any root deck.
 */
export function resolveCanonicalDeckEntryPath(
  projectFiles: readonly CanonicalDeckEntryFile[],
): string | null {
  const decks: Array<{ rel: string; file: CanonicalDeckEntryFile }> = [];
  for (const file of projectFiles) {
    if (isEmbedReferenceSourceFile(file)) continue;
    if (isRootHtmlMatchingReferenceSource(file, projectFiles)) continue;
    const rel = projectRelativePath(file).replace(/\\/g, "/").replace(/^\.\/+/, "");
    if (!rel || !isCanonicalDeckProjectPath(rel)) continue;
    decks.push({ rel, file });
  }
  if (decks.length === 0) return null;
  const nonSeed = decks.filter((entry) => !isTemplateCloneLookSeedFile(entry.file));
  const pickRootExact = (list: typeof decks): string | null =>
    list.find((entry) => !entry.rel.includes("/") && entry.rel.toLowerCase() === "deck.html")?.rel
    ?? null;
  const pickRootAny = (list: typeof decks): string | null => {
    const roots = list.filter((entry) => !entry.rel.includes("/"));
    if (roots.length === 0) return null;
    roots.sort((a, b) => (b.file.mtime ?? 0) - (a.file.mtime ?? 0));
    return roots[0]?.rel ?? null;
  };
  return (
    pickRootExact(nonSeed)
    ?? pickRootAny(nonSeed)
    ?? pickRootExact(decks)
    ?? pickRootAny(decks)
    ?? decks.slice().sort((a, b) => a.rel.localeCompare(b.rel))[0]?.rel
    ?? null
  );
}

/**
 * When fill landed on `deck-2.html` and root `deck.html` is still the Clone
 * LOOK seed, copy the filled sibling onto the canonical name.
 */
export function resolveFilledDeckPromotion(input: {
  files: readonly CanonicalDeckEntryFile[];
  preferredPath?: string | null;
}): { entryPath: string | null; copyFrom: string | null } {
  const preferred = (input.preferredPath ?? "").trim().replace(/\\/g, "/").replace(/^\.\//, "");
  const preferredIsDeck = Boolean(preferred) && isCanonicalDeckProjectPath(preferred);
  const rootDeck = input.files.find((file) =>
    isRootCanonicalDeckHtmlPath(projectRelativePath(file)),
  );
  const rootIsSeed = Boolean(rootDeck && isTemplateCloneLookSeedFile(rootDeck));
  const canonical = resolveCanonicalDeckEntryPath(input.files);
  const siblingSource =
    (preferredIsDeck && !isRootCanonicalDeckHtmlPath(preferred) ? preferred : null)
    ?? (canonical && !isRootCanonicalDeckHtmlPath(canonical) ? canonical : null);
  if (siblingSource && (rootIsSeed || !rootDeck)) {
    return { entryPath: "deck.html", copyFrom: siblingSource };
  }
  return {
    entryPath: canonical ?? (preferredIsDeck ? preferred : null),
    copyFrom: null,
  };
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
  if (options?.projectFiles) {
    if (isRootHtmlMatchingReferenceSource(file, options.projectFiles)) return true;
    if (isRootNonDeckHtmlWhenRefsPresent(file, options.projectFiles)) return true;
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
