// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  deriveAgentRevisionLabel,
  mapArtifactTypeToRevisionSource,
} from '../../src/runtime/file-revision-agent';
import type { ChatCommentAttachment } from '../../src/types';

describe('file-revision-agent', () => {
  it('maps artifact types to revision sources', () => {
    expect(mapArtifactTypeToRevisionSource('element-patch')).toBe('agent_element_patch');
    expect(mapArtifactTypeToRevisionSource('deck-patch')).toBe('agent_deck_patch');
    expect(mapArtifactTypeToRevisionSource('deck')).toBe('agent_full_deck');
  });

  it('derives scoped comment labels from attachments', () => {
    const attachments: ChatCommentAttachment[] = [{
      id: 'c1',
      comment: 'Make this headline bigger',
      elementId: 'hero',
      selector: 'h1',
      label: 'Hero headline',
      text: 'Hero',
      filePath: 'deck.html',
      position: { x: 0, y: 0, width: 10, height: 10 },
      htmlHint: '<h1>Hero</h1>',
    }];
    expect(deriveAgentRevisionLabel(attachments, 'deck.html')).toContain('Hero headline');
    expect(deriveAgentRevisionLabel(attachments, 'deck.html')).toContain('bigger');
  });
});
