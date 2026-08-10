import {
  listRootHtmlMatchingReferenceSources,
  projectHasCanonicalDeckDeliverable,
} from "./embedDeliverableFilePolicy";

export type CleanupRootHtmlReferenceLeaksInput = {
  projectId: string;
  files: readonly { name: string; path?: string }[];
  /** Only run in Teamver slide-only embed. */
  slideOnlyMvp: boolean;
  deleteFile: (projectId: string, name: string) => Promise<boolean>;
};

/**
 * After a canvas→slide run lands a real `deck*.html`, delete root HTML that is
 * only a near-copy of an imported `refs/…` Canvas/Drive source. Those leaks are
 * already hidden from deliverable chips, but they still pollute the file tree
 * and can win project-card cover heuristics when `entryFile` is unset.
 */
export async function cleanupRootHtmlReferenceLeaks(
  input: CleanupRootHtmlReferenceLeaksInput,
): Promise<string[]> {
  if (!input.slideOnlyMvp) return [];
  if (!projectHasCanonicalDeckDeliverable(input.files)) return [];
  const leaks = listRootHtmlMatchingReferenceSources(input.files);
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
