import { describe, expect, it } from 'vitest';

import {
  isPresentationArtifact,
  presentationArtifactId,
} from '../src/teamver-presentation-usage.js';

describe('presentation usage emit key', () => {
  it('prefers manifest identifier and ignores non-deck html', () => {
    expect(isPresentationArtifact('notes.html')).toBe(false);
    expect(isPresentationArtifact('pitch-notes.html')).toBe(false);
    expect(isPresentationArtifact('slides.html')).toBe(false);
    expect(isPresentationArtifact('deck.html')).toBe(true);
    expect(isPresentationArtifact('nested/deck.html')).toBe(true);
    expect(isPresentationArtifact('notes.html', { kind: 'deck' })).toBe(true);
    expect(
      presentationArtifactId({
        projectId: 'p-1',
        fileName: 'deck.html',
        artifactManifest: { kind: 'deck', metadata: { identifier: 'ART-1' } },
      }),
    ).toBe('ART-1');
    expect(
      presentationArtifactId({
        projectId: 'p-1',
        fileName: 'deck.html',
      }),
    ).toBe('p-1:deck.html');
    expect(
      presentationArtifactId({
        projectId: 'p-1',
        fileName: 'prototype.html',
      }),
    ).toBeNull();
  });
});
