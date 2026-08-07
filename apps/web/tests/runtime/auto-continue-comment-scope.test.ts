// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  commentsToAttachments,
  messageContentWithCommentAttachments,
} from '../../src/comments';
import {
  extractCommentAttachmentsForAutoContinue,
  findPrecedingUserMessage,
} from '../../src/runtime/auto-continue-comment-scope';
import { AUTO_CONTINUE_PROMPT_SENTINEL } from '../../src/runtime/resume';
import type { ChatCommentAttachment, ChatMessage } from '../../src/types';

function userMessage(
  id: string,
  content: string,
  commentAttachments?: ChatCommentAttachment[],
): ChatMessage {
  return {
    id,
    role: 'user',
    content,
    ...(commentAttachments ? { commentAttachments } : {}),
  } as ChatMessage;
}

function assistantMessage(id: string): ChatMessage {
  return { id, role: 'assistant', content: 'done', runStatus: 'failed' } as ChatMessage;
}

const chip = commentsToAttachments([
  {
    id: 'c1',
    projectId: 'project-1',
    conversationId: 'conversation-1',
    filePath: 'deck.html',
    elementId: 'dom:section:nth-of-type(1)',
    selector: 'section:nth-of-type(1)',
    label: 'title',
    text: 'Hello',
    position: { x: 0, y: 0, width: 0, height: 0 },
    htmlHint: '',
    note: 'bigger title',
    status: 'open',
    createdAt: 1,
    updatedAt: 1,
    slideIndex: 0,
  },
])[0]!;

describe('findPrecedingUserMessage', () => {
  it('skips auto-continue user rows and returns the originating scoped user turn', () => {
    const messages = [
      userMessage('u1', 'edit slide', [chip]),
      assistantMessage('a1'),
      userMessage('u-auto', `${AUTO_CONTINUE_PROMPT_SENTINEL}\ncontinue`),
      assistantMessage('a2'),
    ];
    const found = findPrecedingUserMessage(messages, 'a2');
    expect(found?.id).toBe('u1');
    expect(found?.commentAttachments).toEqual([chip]);
  });

  it('reconciles comment attachments from durable content when the column is empty', () => {
    const content = messageContentWithCommentAttachments('edit slide', [chip]);
    const messages = [
      userMessage('u1', content),
      assistantMessage('a1'),
    ];
    const found = findPrecedingUserMessage(messages, 'a1');
    expect(found?.commentAttachments?.length).toBe(1);
  });

  it('recovers image attachments from @mentions when attachments_json was dropped', () => {
    const messages = [
      userMessage('u1', '넣어줘 @msh9rso1-서빙하는-금붕어.webp'),
      assistantMessage('a1'),
    ];
    const found = findPrecedingUserMessage(messages, 'a1');
    expect(found?.id).toBe('u1');
    expect(found?.attachments?.map((item) => item.path)).toEqual([
      'msh9rso1-서빙하는-금붕어.webp',
    ]);
  });
});

describe('extractCommentAttachmentsForAutoContinue', () => {
  it('reconciles attachments from content before falling back to the live ref', () => {
    const fromContent = extractCommentAttachmentsForAutoContinue(
      userMessage('u1', messageContentWithCommentAttachments('edit slide', [chip])),
      undefined,
    );
    expect(fromContent).toHaveLength(1);
    expect(fromContent[0]?.elementId).toBe(chip.elementId);

    const fromRef = extractCommentAttachmentsForAutoContinue(
      userMessage('u2', 'plain'),
      [chip],
    );
    expect(fromRef).toEqual([chip]);
  });
});
