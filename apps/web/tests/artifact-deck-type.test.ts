import { describe, expect, it } from 'vitest';

import {
  splitStreamingArtifact,
  summarizeArtifactsForTranscript,
} from '../src/artifacts/strip';
import { artifactExtensionForPersist } from '../src/components/artifact-persist';

describe('Teamver deck artifact type', () => {
  it('treats type=deck as a streaming code artifact so chat is not blank mid-run', () => {
    const parsed = splitStreamingArtifact(
      'Preparing\n<artifact type="deck" identifier="deck"><!doctype html><html><body><section class="slide">A',
    );

    expect(parsed.head).toBe('Preparing');
    expect(parsed.live).toMatchObject({
      artifactType: 'deck',
      identifier: 'deck',
      content: '<!doctype html><html><body><section class="slide">A',
    });
  });

  it('continues storing deck artifacts as html files for the existing preview pipeline', () => {
    expect(artifactExtensionForPersist({ artifactType: 'deck', identifier: 'deck' })).toBe('.html');
  });

  it('summarizes persisted deck artifacts without changing their contract type to text/html', () => {
    const summary = summarizeArtifactsForTranscript(
      '<artifact type="deck" identifier="deck"><!doctype html><html><body><section class="slide">A</section></body></html></artifact>',
      [{ name: 'deck.html', identifier: 'deck' }],
    );

    expect(summary).toContain('type="deck"');
    expect(summary).not.toContain('type="text/html"');
    expect(summary).toContain('deck.html');
  });
});
