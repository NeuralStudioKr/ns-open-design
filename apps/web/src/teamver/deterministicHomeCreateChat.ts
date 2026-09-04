/**
 * 루프428 — Deterministic Home create skips MiniMax, so the chat would stay
 * empty (「슬라이드 작업 시작」). Seed a user brief + short assistant note so
 * the project does not look stuck and follow-up edits are obvious.
 */

import type { ChatMessage } from '../types';
import { createConversation, saveMessage } from '../state/projects';

export function buildDeterministicHomeCreateChatMessages(input: {
  userBrief: string;
  slideCount?: number | null;
  fileName?: string | null;
  now?: number;
}): ChatMessage[] {
  const now = typeof input.now === 'number' && Number.isFinite(input.now)
    ? input.now
    : Date.now();
  const brief = String(input.userBrief ?? '').trim() || '슬라이드를 만들어줘.';
  const count =
    typeof input.slideCount === 'number' && Number.isFinite(input.slideCount) && input.slideCount > 0
      ? Math.round(input.slideCount)
      : null;
  const deckLabel = String(input.fileName ?? '').trim() || 'deck.html';
  const assistant = count
    ? `선택하신 템플릿으로 ${count}장 슬라이드를 준비했습니다. 오른쪽에서 ${deckLabel}을(를) 확인한 뒤, 수정할 내용을 입력해 주세요.`
    : `선택하신 템플릿으로 슬라이드를 준비했습니다. 오른쪽에서 ${deckLabel}을(를) 확인한 뒤, 수정할 내용을 입력해 주세요.`;

  return [
    {
      id: crypto.randomUUID(),
      role: 'user',
      content: brief,
      createdAt: now,
      ...( { slideTurnKind: 'create' } as const),
    },
    {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: assistant,
      createdAt: now + 1,
      runStatus: 'succeeded',
      startedAt: now,
      endedAt: now + 1,
      ...( { slideTurnKind: 'create' } as const),
    },
  ];
}

/**
 * Persist the seed into the create-time conversation (or create one).
 * Returns the conversation id used.
 */
export async function persistDeterministicHomeCreateChat(options: {
  projectId: string;
  conversationId?: string | null;
  userBrief: string;
  slideCount?: number | null;
  fileName?: string | null;
}): Promise<string | null> {
  const projectId = options.projectId.trim();
  if (!projectId) return null;

  const messages = buildDeterministicHomeCreateChatMessages({
    userBrief: options.userBrief,
    slideCount: options.slideCount,
    fileName: options.fileName,
  });

  let conversationId =
    typeof options.conversationId === 'string' && options.conversationId.trim()
      ? options.conversationId.trim()
      : '';

  if (!conversationId) {
    const created = await createConversation(projectId, undefined, {
      seedMessages: messages,
    });
    return created?.id?.trim() || null;
  }

  for (const message of messages) {
    await saveMessage(projectId, conversationId, message);
  }
  return conversationId;
}
