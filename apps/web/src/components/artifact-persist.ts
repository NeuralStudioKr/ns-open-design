import type { ProjectFile } from '../types';
import type { ChatMessage } from '../types';

interface ArtifactPersistShape {
  identifier?: string | null;
  title?: string | null;
  artifactType?: string | null;
}

/**
 * Teamver slide-only runs accept only `type="deck"` in the stream contract.
 * Models still occasionally emit `text/html`; normalize at parse/persist time.
 */
export function normalizeSlideOnlyArtifactContractType(
  artifactType: string | null | undefined,
  slideOnlyMvp: boolean,
): string {
  if (!slideOnlyMvp) {
    const trimmed = (artifactType || '').trim();
    return trimmed || 'text/html';
  }
  const lower = (artifactType || '').toLowerCase();
  if (!lower || lower === 'deck' || /html|text\//i.test(lower)) return 'deck';
  return artifactType || 'deck';
}

/** Whether `tabName` is `baseName.ext` or a numbered sibling `baseName-2.ext`. */
export function isArtifactVersionSiblingTab(
  tabName: string,
  baseName: string,
  ext: string,
): boolean {
  if (!tabName) return false;
  const escaped = baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedExt = ext.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped}(?:-\\d+)?${escapedExt}$`).test(tabName);
}

export function artifactBaseNameForPersist(art: ArtifactPersistShape): string {
  return (
    (art.identifier || art.title || 'artifact')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'artifact'
  );
}

export function artifactExtensionForPersist(art: ArtifactPersistShape): '.html' | '.jsx' | '.tsx' {
  const type = (art.artifactType || '').toLowerCase();
  const identifier = (art.identifier || '').toLowerCase();
  if (type.includes('tsx') || identifier.endsWith('.tsx')) return '.tsx';
  if (type.includes('jsx') || type.includes('react') || identifier.endsWith('.jsx')) {
    return '.jsx';
  }
  return '.html';
}

/**
 * Pick the on-disk filename for a streamed artifact.
 *
 * Modification turns should update the deck the user is already previewing
 * instead of minting `deck-2.html`, `deck-3.html` siblings that each spawn a
 * new workspace tab.
 */
export function resolveArtifactPersistFileName(
  art: ArtifactPersistShape,
  projectFiles: readonly ProjectFile[],
  activeTabName: string | null | undefined,
  options?: { preferredFileName?: string | null },
): string {
  const baseName = artifactBaseNameForPersist(art);
  const ext = artifactExtensionForPersist(art);
  const existing = new Set(projectFiles.map((file) => file.name));

  const preferredRaw = options?.preferredFileName?.trim();
  if (preferredRaw) {
    const preferredBase = preferredRaw.split('/').filter(Boolean).pop() ?? preferredRaw;
    const matched = projectFiles.find(
      (file) => file.name === preferredBase || file.path === preferredRaw,
    );
    if (matched) return matched.name;
    if (existing.has(preferredBase)) return preferredBase;
    // Preview-comment edits target a concrete open deck even if the refreshed
    // file list lags behind the tab the user is annotating.
    return preferredBase;
  }

  if (activeTabName && isArtifactVersionSiblingTab(activeTabName, baseName, ext)) {
    return activeTabName;
  }

  const identifier = (art.identifier || '').trim();
  if (identifier) {
    const manifestMatch = projectFiles
      .filter((file) => file.artifactManifest?.metadata?.identifier === identifier)
      .sort((a, b) => b.mtime - a.mtime)[0];
    if (manifestMatch) return manifestMatch.name;
  }

  let fileName = `${baseName}${ext}`;
  let n = 2;
  while (existing.has(fileName)) {
    fileName = `${baseName}-${n}${ext}`;
    n += 1;
  }
  return fileName;
}

/** Open tabs that are older numbered siblings of the file being focused. */
export function artifactVersionTabsToClose(
  fileName: string,
  openTabs: readonly string[],
): string[] {
  if (!fileName || openTabs.length === 0) return [];
  const match = /^(.+?)(-\d+)?(\.[^.]+)$/.exec(fileName);
  if (!match) return [];
  const baseName = match[1]!;
  const ext = match[3]!;
  return openTabs.filter(
    (tab) => tab !== fileName && isArtifactVersionSiblingTab(tab, baseName, ext),
  );
}

function artifactVersionNumber(fileName: string, baseName: string, ext: string): number {
  if (fileName === `${baseName}${ext}`) return 1;
  const match = new RegExp(
    `^${baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)${ext.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
  ).exec(fileName);
  if (!match) return 0;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Prefer the focused tab, else the highest numbered sibling (`-3` > `-2` > base). */
export function preferredArtifactVersionTab(
  siblings: readonly string[],
  preferredActive?: string | null,
): string | null {
  if (siblings.length === 0) return null;
  if (preferredActive && siblings.includes(preferredActive)) return preferredActive;
  const match = /^(.+?)(-\d+)?(\.[^.]+)$/.exec(siblings[0]!);
  if (!match) return siblings[siblings.length - 1] ?? null;
  const baseName = match[1]!;
  const ext = match[3]!;
  return siblings
    .slice()
    .sort(
      (a, b) =>
        artifactVersionNumber(b, baseName, ext) - artifactVersionNumber(a, baseName, ext),
    )[0]!;
}

/**
 * Keep at most one open tab per numbered artifact lineage
 * (`foo.html` / `foo-2.html` / `foo-3.html`).
 *
 * Numbered siblings are treated as version drafts (same convention as
 * `artifactVersionTabsToClose` / `resolveArtifactPersistFileName`), not as
 * intentionally parallel documents. Used on project re-entry and after rapid
 * Write auto-opens so version churn does not leave every draft open.
 */
export function collapseArtifactVersionOpenTabs(
  tabs: readonly string[],
  active: string | null = null,
): string[] {
  if (tabs.length <= 1) return [...tabs];
  const toClose = new Set<string>();
  const processedBases = new Set<string>();

  for (const tab of tabs) {
    const match = /^(.+?)(-\d+)?(\.[^.]+)$/.exec(tab);
    if (!match) continue;
    const baseName = match[1]!;
    const ext = match[3]!;
    const key = `${baseName}\0${ext}`;
    if (processedBases.has(key)) continue;
    processedBases.add(key);

    const siblings = tabs.filter((entry) => isArtifactVersionSiblingTab(entry, baseName, ext));
    if (siblings.length <= 1) continue;

    const preferred = preferredArtifactVersionTab(siblings, active);
    for (const sibling of siblings) {
      if (sibling !== preferred) toClose.add(sibling);
    }
  }

  if (toClose.size === 0) return [...tabs];
  return tabs.filter((tab) => !toClose.has(tab));
}

/** Block turn-1 deck writes while Quick brief is still outstanding. */
export function shouldDeferSlideOnlyDiscoveryArtifactPersist(
  messages: readonly ChatMessage[],
  options: {
    slideOnlyMvp: boolean;
    skipDiscoveryBrief?: boolean;
    hasCompleteHtmlArtifact?: boolean;
  },
): boolean {
  if (!options.slideOnlyMvp) return false;
  if (options.skipDiscoveryBrief) return false;
  if (options.hasCompleteHtmlArtifact) return false;
  const hasFormAnswers = messages.some(
    (message) =>
      message.role === 'user'
      && /\[form answers — [^\]]+\]/.test(message.content ?? ''),
  );
  if (hasFormAnswers) return false;
  const userTurns = messages.filter((message) => message.role === 'user').length;
  return userTurns <= 1;
}
