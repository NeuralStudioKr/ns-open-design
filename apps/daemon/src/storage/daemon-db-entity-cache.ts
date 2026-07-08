// In-process read cache for sync db.ts callers when OD_DAEMON_DB=postgres.
// Writes go to Postgres (async queue); reads hit cache first.

type CachedProject = Record<string, unknown>;
type CachedConversation = Record<string, unknown>;
type CachedMessage = Record<string, unknown>;
type CachedPreviewComment = Record<string, unknown>;
type CachedDeployment = Record<string, unknown>;
type CachedTabsState = {
  stateJson: string | null;
  updatedAt: number;
};

const projects = new Map<string, CachedProject>();
const conversationsByProject = new Map<string, CachedConversation[]>();
const messagesByConversation = new Map<string, CachedMessage[]>();
const tabsStateByProject = new Map<string, CachedTabsState>();
// Preview comments keyed by `${projectId}:${conversationId}` — sqlite reads
// only ever ask for a full list per conversation, so we cache list bodies.
const previewCommentsByScope = new Map<string, CachedPreviewComment[]>();
// Deployments cached per-project, ordered updated_at DESC to match sqlite.
const deploymentsByProject = new Map<string, CachedDeployment[]>();

function previewCommentsScopeKey(projectId: string, conversationId: string): string {
  return `${projectId}:${conversationId}`;
}

export function getCachedProject(id: string): CachedProject | null {
  return projects.get(id) ?? null;
}

export function setCachedProject(project: CachedProject): void {
  projects.set(String(project.id), project);
}

export function deleteCachedProject(id: string): void {
  projects.delete(id);
  conversationsByProject.delete(id);
  tabsStateByProject.delete(id);
  for (const key of Array.from(previewCommentsByScope.keys())) {
    if (key.startsWith(`${id}:`)) previewCommentsByScope.delete(key);
  }
  deploymentsByProject.delete(id);
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

export function getCachedTabsState(projectId: string): CachedTabsState | null {
  return tabsStateByProject.get(projectId) ?? null;
}

export function setCachedTabsState(projectId: string, entry: CachedTabsState): void {
  tabsStateByProject.set(projectId, entry);
}

export function invalidateCachedTabsState(projectId: string): void {
  tabsStateByProject.delete(projectId);
}

export function getCachedPreviewComments(
  projectId: string,
  conversationId: string,
): CachedPreviewComment[] | null {
  return previewCommentsByScope.get(previewCommentsScopeKey(projectId, conversationId)) ?? null;
}

export function setCachedPreviewComments(
  projectId: string,
  conversationId: string,
  rows: CachedPreviewComment[],
): void {
  previewCommentsByScope.set(previewCommentsScopeKey(projectId, conversationId), rows);
}

export function invalidateCachedPreviewComments(
  projectId: string,
  conversationId: string,
): void {
  previewCommentsByScope.delete(previewCommentsScopeKey(projectId, conversationId));
}

/**
 * Merge a mutated / newly inserted comment into the cached list for its
 * (projectId, conversationId) scope. Preserves insertion order (created_at
 * ASC, id ASC) to match the sqlite read query. If the scope isn't cached
 * yet, this is a no-op — the next warm/read populates it.
 */
export function upsertCachedPreviewComment(
  projectId: string,
  conversationId: string,
  comment: CachedPreviewComment,
): void {
  const key = previewCommentsScopeKey(projectId, conversationId);
  const list = previewCommentsByScope.get(key);
  if (!list) return;
  const idx = list.findIndex((row) => String(row.id) === String(comment.id));
  if (idx >= 0) {
    list[idx] = comment;
    return;
  }
  const insertAt = list.findIndex((row) => {
    const rowCreated = Number(row.createdAt ?? 0);
    const cCreated = Number(comment.createdAt ?? 0);
    if (rowCreated !== cCreated) return rowCreated > cCreated;
    return String(row.id) > String(comment.id);
  });
  if (insertAt < 0) list.push(comment);
  else list.splice(insertAt, 0, comment);
}

export function removeCachedPreviewComment(
  projectId: string,
  conversationId: string,
  id: string,
): boolean {
  const key = previewCommentsScopeKey(projectId, conversationId);
  const list = previewCommentsByScope.get(key);
  if (!list) return false;
  const idx = list.findIndex((row) => String(row.id) === id);
  if (idx < 0) return false;
  list.splice(idx, 1);
  return true;
}

export function getCachedDeployments(projectId: string): CachedDeployment[] | null {
  return deploymentsByProject.get(projectId) ?? null;
}

export function setCachedDeployments(projectId: string, rows: CachedDeployment[]): void {
  deploymentsByProject.set(projectId, rows);
}

export function invalidateCachedDeployments(projectId: string): void {
  deploymentsByProject.delete(projectId);
}

/**
 * Merge a deployment (identified by (fileName, providerId)) into the
 * per-project list, then re-sort by updated_at DESC so listDeployments
 * ordering stays deterministic. Caller supplies the raw row shape used
 * for sqlite-parity reads.
 */
export function upsertCachedDeployment(
  projectId: string,
  deployment: CachedDeployment,
): void {
  const list = deploymentsByProject.get(projectId);
  if (!list) return;
  const idx = list.findIndex(
    (row) =>
      String((row as Record<string, unknown>).fileName) === String((deployment as Record<string, unknown>).fileName) &&
      String((row as Record<string, unknown>).providerId) === String((deployment as Record<string, unknown>).providerId),
  );
  if (idx >= 0) list[idx] = deployment;
  else list.push(deployment);
  list.sort((a, b) => {
    const bu = Number((b as Record<string, unknown>).updatedAt ?? 0);
    const au = Number((a as Record<string, unknown>).updatedAt ?? 0);
    return bu - au;
  });
}

export function clearDaemonDbEntityCache(): void {
  projects.clear();
  conversationsByProject.clear();
  messagesByConversation.clear();
  tabsStateByProject.clear();
  previewCommentsByScope.clear();
  deploymentsByProject.clear();
}
