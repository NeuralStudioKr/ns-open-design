import { describe, expect, it } from 'vitest';

import {
  artifactVersionTabsToClose,
  isArtifactVersionSiblingTab,
  resolveArtifactPersistFileName,
} from '../../src/components/artifact-persist';

describe('resolveArtifactPersistFileName', () => {
  const deck = {
    name: 'ai-adoption-deck.html',
    mtime: 100,
    artifactManifest: { metadata: { identifier: 'ai-adoption-deck' } },
  } as const;

  it('reuses the manifest identifier match instead of minting -2 siblings', () => {
    const fileName = resolveArtifactPersistFileName(
      {
        identifier: 'ai-adoption-deck',
        title: 'AI Adoption Deck',
        artifactType: 'text/html',
      },
      [deck],
      null,
    );
    expect(fileName).toBe('ai-adoption-deck.html');
  });

  it('updates the active preview tab when it is a numbered sibling', () => {
    const fileName = resolveArtifactPersistFileName(
      {
        identifier: 'ai-adoption-deck',
        title: 'AI Adoption Deck',
        artifactType: 'text/html',
      },
      [
        deck,
        { name: 'ai-adoption-deck-2.html', mtime: 90 },
        { name: 'ai-adoption-deck-3.html', mtime: 80 },
      ],
      'ai-adoption-deck-2.html',
    );
    expect(fileName).toBe('ai-adoption-deck-2.html');
  });

  it('still allocates a new filename for unrelated artifacts', () => {
    const fileName = resolveArtifactPersistFileName(
      {
        identifier: 'other-deck',
        title: 'Other Deck',
        artifactType: 'text/html',
      },
      [deck],
      'ai-adoption-deck.html',
    );
    expect(fileName).toBe('other-deck.html');
  });

  it('increments numbered siblings only when no reuse target exists', () => {
    const fileName = resolveArtifactPersistFileName(
      {
        identifier: 'brand-new',
        title: 'Brand New',
        artifactType: 'text/html',
      },
      [deck, { name: 'brand-new.html', mtime: 1 }],
      null,
    );
    expect(fileName).toBe('brand-new-2.html');
  });
});

describe('artifact version tab helpers', () => {
  it('detects numbered siblings for the same artifact base', () => {
    expect(isArtifactVersionSiblingTab('ai-adoption-deck.html', 'ai-adoption-deck', '.html')).toBe(true);
    expect(isArtifactVersionSiblingTab('ai-adoption-deck-2.html', 'ai-adoption-deck', '.html')).toBe(true);
    expect(isArtifactVersionSiblingTab('other-deck.html', 'ai-adoption-deck', '.html')).toBe(false);
  });

  it('closes older sibling tabs when focusing a newer version', () => {
    expect(
      artifactVersionTabsToClose('ai-adoption-deck-3.html', [
        'design-files',
        'ai-adoption-deck.html',
        'ai-adoption-deck-2.html',
        'ai-adoption-deck-3.html',
      ]),
    ).toEqual(['ai-adoption-deck.html', 'ai-adoption-deck-2.html']);
  });
});
