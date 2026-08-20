import { reconcileUserCommentAttachments } from '../comments';
import type { ChatCommentAttachment, ChatMessage } from '../types';
import { recoverChatAttachmentsFromMentions } from '../utils/recoverChatAttachmentsFromMentions';
import { isAutoContinueIncompleteOutputPrompt } from './resume';

/**
 * Recover the failed turn's comment attachments for an auto-continue retry.
 * Auto-continue historically passed `[]` for `commentAttachments`, which
 * stripped scope from the retry and let deck-wide rewrites slip through.
 */
export function extractCommentAttachmentsForAutoContinue(
  originatingUserMsg: ChatMessage | null | undefined,
  runRefFallback: readonly ChatCommentAttachment[] | null | undefined,
): ChatCommentAttachment[] {
  const reconciled = originatingUserMsg
    ? reconcileUserCommentAttachments(originatingUserMsg)
    : null;
  const fromMsg = reconciled?.commentAttachments;
  if (fromMsg && fromMsg.length > 0) return [...fromMsg];
  if (runRefFallback && runRefFallback.length > 0) return [...runRefFallback];
  return [];
}

/**
 * Walk backwards from an assistant turn to the originating user message.
 * Skips auto-continue prompts and prefers the nearest user turn that still
 * carries comment attachments after content/column reconciliation.
 */
export function findPrecedingUserMessage(
  messages: readonly ChatMessage[] | null | undefined,
  assistantId: string | null | undefined,
): ChatMessage | null {
  if (!messages || !assistantId) return null;
  const index = messages.findIndex((message) => message.id === assistantId);
  if (index <= 0) return null;
  let fallback: ChatMessage | null = null;
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const candidate = messages[cursor];
    if (candidate?.role !== 'user') continue;
    if (isAutoContinueIncompleteOutputPrompt(candidate.content)) continue;
    const reconciled = recoverChatAttachmentsFromMentions(
      reconcileUserCommentAttachments(candidate),
    );
    if ((reconciled.commentAttachments?.length ?? 0) > 0) return reconciled;
    if ((reconciled.attachments?.length ?? 0) > 0 && !fallback) fallback = reconciled;
    if (!fallback) fallback = reconciled;
  }
  return fallback;
}
