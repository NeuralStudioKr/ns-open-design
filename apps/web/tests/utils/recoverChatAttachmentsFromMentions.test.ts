import { describe, expect, it } from 'vitest';

import {
  extractImageMentionPathsFromUserText,
  recoverChatAttachmentsFromMentions,
} from '../../src/utils/recoverChatAttachmentsFromMentions';
import type { ChatMessage } from '../../src/types';

describe('extractImageMentionPathsFromUserText', () => {
  it('pulls Korean/ASCII image @mentions from visible user text', () => {
    expect(
      extractImageMentionPathsFromUserText(
        '이 이미지 2페이지에 넣어줘 @msh9rso1-서빙하는-금붕어.webp please',
      ),
    ).toEqual(['msh9rso1-서빙하는-금붕어.webp']);
  });

  it('ignores model-only embed suffixes and ephemeral drawings', () => {
    expect(
      extractImageMentionPathsFromUserText(
        [
          '@hero.png and @ms8hq9qu-drawing-2026-07-31T05-17-03-125Z.png',
          '',
          '[Attached image embed]',
          '- <img src="hero.png">',
        ].join('\n'),
      ),
    ).toEqual(['hero.png']);
  });
});

describe('recoverChatAttachmentsFromMentions', () => {
  it('rebuilds missing image attachments from @mentions after refresh', () => {
    const message: ChatMessage = {
      id: 'u1',
      role: 'user',
      content: '넣어줘 @msh9rso1-서빙하는-금붕어.webp',
      createdAt: 1,
    };
    const recovered = recoverChatAttachmentsFromMentions(message);
    expect(recovered.attachments).toEqual([
      {
        path: 'msh9rso1-서빙하는-금붕어.webp',
        name: 'msh9rso1-서빙하는-금붕어.webp',
        kind: 'image',
        order: 0,
      },
    ]);
  });

  it('does not duplicate attachments already present by basename', () => {
    const message: ChatMessage = {
      id: 'u1',
      role: 'user',
      content: '@goldfish.webp',
      createdAt: 1,
      attachments: [
        {
          path: 'uploads/goldfish.webp',
          name: 'goldfish.webp',
          kind: 'image',
          order: 0,
        },
      ],
    };
    expect(recoverChatAttachmentsFromMentions(message)).toBe(message);
  });
});
