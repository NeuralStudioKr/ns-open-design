// In-process read cache for sync db.ts callers when OD_DAEMON_DB=postgres.
// Writes go to Postgres (async queue); reads hit cache first.

type CachedProject = Record<string, unknown>;
type CachedConversation = Record<string, unknown>;
type CachedMessage = Record<string, unknown>;

const projects = new Map<string, CachedProject>();
const conversationsByProject = new Map<string, CachedConversation[]>();
const messagesByConversation = new Map<string, CachedMessage[]>();

export function getCachedProject(id: string): CachedProject | null {
  return projects.get(id) ?? null;
}

export function setCachedProject(project: CachedProject): void {
  projects.set(String(project.id), project);
}

export function deleteCachedProject(id: string): void {
  projects.delete(id);
  conversationsByProject.delete(id);
}

export function getCachedConversations(projectId: string): CachedConversation[] | null {
  return conversationsByProject.get(projectId) ?? null;
}

export function setCachedConversations(projectId: string, rows: CachedConversation[]): void {
  conversationsByProject.set(projectId, rows);
}

export function invalidateCachedConversations(projectId: string): void {
  conversationsByProject.delete(projectId);
}

export function getCachedConversationById(id: string): CachedConversation | null {
  for (const list of conversationsByProject.values()) {
    const hit = list.find((row) => String(row.id) === id);
    if (hit) return hit;
  }
  return null;
}

export function getCachedMessages(conversationId: string): CachedMessage[] | null {
  return messagesByConversation.get(conversationId) ?? null;
}

export function setCachedMessages(conversationId: string, rows: CachedMessage[]): void {
  messagesByConversation.set(conversationId, rows);
}

export function invalidateCachedMessages(conversationId: string): void {
  messagesByConversation.delete(conversationId);
}

export function clearDaemonDbEntityCache(): void {
  projects.clear();
  conversationsByProject.clear();
  messagesByConversation.clear();
}
