import type { ProjectFile } from '../types';

interface ArtifactPersistShape {
  identifier?: string | null;
  title?: string | null;
  artifactType?: string | null;
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
): string {
  const baseName = artifactBaseNameForPersist(art);
  const ext = artifactExtensionForPersist(art);
  const existing = new Set(projectFiles.map((file) => file.name));

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
