import { describe, expect, it } from 'vitest';

import type { ChatMessage } from '../../src/types';
import {
  isPrimaryDeckFileName,
  messageIndicatesSlideEditArtifact,
  messageLooksLikeSlideEditTurn,
  resolveSlideTurnKindForSend,
} from '../../src/runtime/chat-message-render';

function assistant(partial: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'a1',
    role: 'assistant',
    content: '',
    runStatus: 'succeeded',
    endedAt: 2,
    ...partial,
  } as ChatMessage;
}

describe('slide edit turn detection (0805-N05)', () => {
  it('recognizes primary/canonical deck filenames only', () => {
    expect(isPrimaryDeckFileName('deck.html')).toBe(true);
    expect(isPrimaryDeckFileName('site/deck.html')).toBe(true);
    expect(isPrimaryDeckFileName('deck-2.html')).toBe(true);
    expect(isPrimaryDeckFileName('about.html')).toBe(false);
    expect(isPrimaryDeckFileName('index.html')).toBe(false);
  });

  it('treats element-patch as a slide edit artifact', () => {
    expect(
      messageIndicatesSlideEditArtifact(
        '<artifact type="element-patch" identifier="deck"><patch target-id="t1" slide-index="0" kind="set-text">Hi</patch></artifact>',
      ),
    ).toBe(true);
    expect(messageIndicatesSlideEditArtifact('', 'element-patch')).toBe(true);
    expect(messageIndicatesSlideEditArtifact('', 'deck')).toBe(false);
  });

  it('does not treat leftover non-deck HTML as an edit turn', () => {
    expect(
      messageLooksLikeSlideEditTurn(
        assistant({
          content: '',
          preTurnFileNames: ['about.html', 'notes.html'],
          producedFiles: [
            {
              name: 'deck.html',
              path: 'deck.html',
              size: 10,
              mtime: 1,
              kind: 'html',
              mime: 'text/html',
            },
          ],
        }),
      ),
    ).toBe(false);
  });

  it('does not treat in-place about.html + new deck as an edit turn', () => {
    expect(
      messageLooksLikeSlideEditTurn(
        assistant({
          content: '',
          preTurnFileNames: ['about.html'],
          producedFiles: [
            {
              name: 'about.html',
              path: 'about.html',
              size: 12,
              mtime: 1,
              kind: 'html',
              mime: 'text/html',
            },
            {
              name: 'deck.html',
              path: 'deck.html',
              size: 40,
              mtime: 2,
              kind: 'html',
              mime: 'text/html',
            },
          ],
        }),
      ),
    ).toBe(false);
  });

  it('treats in-place deck.html updates and preTurn primary deck as edit', () => {
    expect(
      messageLooksLikeSlideEditTurn(
        assistant({
          content: '',
          preTurnFileNames: ['deck.html'],
          producedFiles: [],
        }),
      ),
    ).toBe(true);

    expect(
      messageLooksLikeSlideEditTurn(
        assistant({
          content: '',
          preTurnFileNames: ['slides/deck.html'],
          producedFiles: [
            {
              name: 'slides/deck.html',
              path: 'slides/deck.html',
              size: 20,
              mtime: 2,
              kind: 'html',
              mime: 'text/html',
            },
          ],
        }),
      ),
    ).toBe(true);
  });

  it('prefers durable slideTurnKind over preTurn heuristics (0806-N04)', () => {
    expect(
      resolveSlideTurnKindForSend({
        slideOnlyMvp: true,
        preTurnFileNames: [],
        existingDeckAttached: true,
      }),
    ).toBe('edit');
    expect(
      resolveSlideTurnKindForSend({
        slideOnlyMvp: true,
        preTurnFileNames: ['about.html'],
      }),
    ).toBe('create');
    expect(
      resolveSlideTurnKindForSend({
        slideOnlyMvp: false,
        preTurnFileNames: ['deck.html'],
      }),
    ).toBeUndefined();
    // Clone LOOK preview on disk must not flip first content-fill to edit.
    expect(
      resolveSlideTurnKindForSend({
        slideOnlyMvp: true,
        preTurnFileNames: ['deck.html'],
        existingDeckAttached: true,
        templateCloneContentFill: true,
      }),
    ).toBe('create');

    expect(
      messageLooksLikeSlideEditTurn(
        assistant({
          content: '',
          slideTurnKind: 'edit',
          preTurnFileNames: [],
        }),
      ),
    ).toBe(true);
    expect(
      messageLooksLikeSlideEditTurn(
        assistant({
          content: '',
          slideTurnKind: 'create',
          preTurnFileNames: ['deck.html'],
        }),
      ),
    ).toBe(false);
    expect(
      messageLooksLikeSlideEditTurn(
        assistant({
          content:
            '<artifact type="element-patch" identifier="deck"><patch target-id="t1" slide-index="0" kind="set-text">Hi</patch></artifact>',
          slideTurnKind: 'create',
          preTurnFileNames: [],
        }),
      ),
    ).toBe(true);
  });
});
