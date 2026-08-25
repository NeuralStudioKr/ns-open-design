import type { ChatMessage } from '../types';
import { isActiveRunStatus } from '../teamver/backgroundChatRecovery';
import { sanitizeChatMessageLeakedPseudoTool } from './sanitizeChatMessageLeakedPseudoTool';

/**
 * Cold-load / soft-refresh: scrub deck HTML debris that was persisted before
 * display last-pass so reload matches live chat. In-flight rows still carry
 * open <question-form> / <artifact> tails that live display hides — leave them.
 *
 * Fail closed: a sanitizer throw must not re-paint raw leftover slide copy.
 */
export function sanitizePersistedAssistantChatMessage(message: ChatMessage): ChatMessage {
  if (message.role !== 'assistant') return message;
  if (isActiveRunStatus(message.runStatus)) return message;
  try {
    return sanitizeChatMessageLeakedPseudoTool(message, { stripCodeFences: true });
  } catch (err) {
    console.error('[sanitizePersistedAssistantChatMessage] failed', message.id, err);
    const events = (message.events ?? []).filter(
      (event) => event.kind !== 'text' && event.kind !== 'thinking',
    );
    return { ...message, content: '', events };
  }
}
