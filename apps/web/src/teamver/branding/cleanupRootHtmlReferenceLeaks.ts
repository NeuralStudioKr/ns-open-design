import {
  isRootHtmlMatchingReferenceSource,
  isRootNonDeckHtmlWhenRefsPresent,
  listRootHtmlCanvasLeakCleanupTargets,
  listRootHtmlMatchingReferenceSources,
  projectHasCanonicalDeckDeliverable,
  projectRelativePath,
} from "./embedDeliverableFilePolicy";

export type CleanupRootHtmlReferenceLeaksInput = {
  projectId: string;
  files: readonly { name: string; path?: string }[];
  /** Only run in Teamver slide-only embed. */
  slideOnlyMvp: boolean;
  deleteFile: (projectId: string, name: string) => Promise<boolean>;
  /**
   * When false, delete basename-matched root leaks even before a deck exists.
   * Used on mid-turn Write of a Canvas copy so the leak never settles on disk.
   * Default true (require a real deck deliverable first).
   */
  requireDeckDeliverable?: boolean;
};

/**
 * Delete root HTML that only duplicates an imported `refs/…` Canvas/Drive
 * source. Those leaks are already hidden from deliverable chips, but they
 * still pollute the file tree and can win project-card cover heuristics when
 * `entryFile` is unset.
 */
export async function cleanupRootHtmlReferenceLeaks(
  input: CleanupRootHtmlReferenceLeaksInput,
): Promise<string[]> {
  if (!input.slideOnlyMvp) return [];
  const requireDeck = input.requireDeckDeliverable !== false;
  if (requireDeck && !projectHasCanonicalDeckDeliverable(input.files)) return [];
  // Before a deck exists, only delete exact refs-basename leaks (safer).
  // After a deck exists, also drop root index.html when refs HTML is present.
  const leaks = requireDeck
    ? listRootHtmlCanvasLeakCleanupTargets(input.files)
    : listRootHtmlMatchingReferenceSources(input.files);
  if (leaks.length === 0) return [];
  const deleted: string[] = [];
  for (const name of leaks) {
    try {
      if (await input.deleteFile(input.projectId, name)) deleted.push(name);
    } catch {
      // Best-effort — a failed delete must not block deck finalize.
    }
  }
  return deleted;
}

/**
 * Immediately delete a single Write/Edit target when it is a root Canvas
 * basename leak (refs source already present). Does not wait for deck.html.
 */
export async function deleteRootHtmlReferenceLeakIfPresent(input: {
  projectId: string;
  files: readonly { name: string; path?: string }[];
  slideOnlyMvp: boolean;
  writtenPath: string;
  deleteFile: (projectId: string, name: string) => Promise<boolean>;
}): Promise<string | null> {
  if (!input.slideOnlyMvp) return null;
  const written = input.writtenPath.replace(/\\/g, "/").replace(/^\.\/+/, "").trim();
  if (!written) return null;
  const writtenBase = written.split("/").filter(Boolean).pop() ?? written;
  const match = input.files.find((file) => {
    const rel = projectRelativePath(file).replace(/\\/g, "/").replace(/^\.\/+/, "");
    return (
      rel === written
      || rel === writtenBase
      || (file.name === writtenBase && !rel.includes("/"))
    );
  });
  if (!match) return null;
  const isLeak =
    isRootHtmlMatchingReferenceSource(match, input.files)
    || isRootNonDeckHtmlWhenRefsPresent(match, input.files);
  if (!isLeak) return null;
  const rel = projectRelativePath(match).replace(/\\/g, "/").replace(/^\.\/+/, "");
  try {
    if (await input.deleteFile(input.projectId, rel)) return rel;
  } catch {
    return null;
  }
  return null;
}
