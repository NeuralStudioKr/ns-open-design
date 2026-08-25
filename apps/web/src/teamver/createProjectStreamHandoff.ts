/**
 * Create → ProjectView handoff so the first BYOK stream does not wait on
 * listConversations / createConversation / empty listMessages.
 */

const CONVERSATION_KEY = (projectId: string) =>
  `od:create-conversation:${projectId.trim()}`;

type TemplateCloneResult = {
  ok: boolean;
  fileName?: string;
  preservedFilled?: boolean;
};

const pendingTemplateClone = new Map<string, Promise<TemplateCloneResult | null>>();

export function writeCreateConversationHandoff(
  projectId: string,
  conversationId: string,
): void {
  const id = projectId.trim();
  const cid = conversationId.trim();
  if (!id || !cid || typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(CONVERSATION_KEY(id), cid);
  } catch {
    /* private mode */
  }
}

/** Read+clear — ProjectView conversations effect consumes once. */
export function takeCreateConversationHandoff(projectId: string): string | null {
  const id = projectId.trim();
  if (!id || typeof window === "undefined") return null;
  try {
    const key = CONVERSATION_KEY(id);
    const value = window.sessionStorage.getItem(key)?.trim() || null;
    if (value) window.sessionStorage.removeItem(key);
    return value;
  } catch {
    return null;
  }
}

export function setPendingTemplateClone(
  projectId: string,
  pending: Promise<TemplateCloneResult | null>,
): void {
  const id = projectId.trim();
  if (!id) return;
  pendingTemplateClone.set(id, pending);
  void pending.finally(() => {
    if (pendingTemplateClone.get(id) === pending) {
      pendingTemplateClone.delete(id);
    }
  });
}

/** Auto-send waits so fill does not race an in-flight Clone seed. */
export async function waitPendingTemplateClone(
  projectId: string,
): Promise<TemplateCloneResult | null> {
  const id = projectId.trim();
  if (!id) return null;
  const pending = pendingTemplateClone.get(id);
  if (!pending) return null;
  try {
    return await pending;
  } catch {
    return null;
  }
}

/** @internal vitest */
export function resetCreateProjectStreamHandoffForTests(): void {
  pendingTemplateClone.clear();
}
