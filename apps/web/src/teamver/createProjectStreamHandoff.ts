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
/** Settled Clone results stay briefly so late waiters still observe completion. */
const settledTemplateClone = new Map<string, TemplateCloneResult | null>();

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

/** Read without clearing — safe for useState initializers / StrictMode. */
export function peekCreateConversationHandoff(projectId: string): string | null {
  const id = projectId.trim();
  if (!id || typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(CONVERSATION_KEY(id))?.trim() || null;
  } catch {
    return null;
  }
}

/** Read+clear — ProjectView conversations effect consumes once after seeding. */
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
  settledTemplateClone.delete(id);
  pendingTemplateClone.set(id, pending);
  void pending
    .then((result) => {
      settledTemplateClone.set(id, result);
      return result;
    })
    .catch(() => {
      settledTemplateClone.set(id, null);
      return null;
    })
    .finally(() => {
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
  if (pending) {
    try {
      return await pending;
    } catch {
      return settledTemplateClone.has(id) ? settledTemplateClone.get(id)! : null;
    }
  }
  if (settledTemplateClone.has(id)) {
    return settledTemplateClone.get(id)!;
  }
  return null;
}

/** @internal vitest */
export function resetCreateProjectStreamHandoffForTests(): void {
  pendingTemplateClone.clear();
  settledTemplateClone.clear();
}
