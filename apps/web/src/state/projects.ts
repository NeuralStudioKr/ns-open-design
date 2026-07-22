// Project / conversation / message / tab persistence — backed by the
// daemon's SQLite store. All writes round-trip through HTTP so projects
// stay coherent across multiple browser tabs and across restarts.
//
// These helpers fail soft (returning null / [] on transport errors) so
// the UI can stay rendered when the daemon is briefly unreachable.

import type {
  AppliedPluginSnapshot,
  ApplyResult,
  ChatSessionMode,
  CreateConversationRequest,
  CreatePluginShareProjectResponse,
  CreateTerminalRequest,
  ImportFolderRequest,
  ImportFolderResponse,
  InstalledPluginRecord,
  PluginInstallOutcome,
  PluginShareAction,
  ProjectPluginFolderInstallRequest,
  TerminalSession,
} from '@open-design/contracts';
import { randomUUID } from '../utils/uuid';
import type {
  ChatMessage,
  Conversation,
  OpenTabsState,
  Project,
  ProjectMetadata,
  ProjectTemplate,
} from '../types';
import {
  mayMutateProjectLinkedDirs,
  sanitizeProjectForEmbed,
  stripLinkedDirsFromMetadata,
} from '../teamver/embedLocalWorkspacePolicy';
import { maybeReportTeamverUsageAfterSave } from '../teamver/maybeReportTeamverUsageAfterSave';
import { formatProjectCreateErrorForUser } from '../teamver/projectErrorMessages';
import {
  filterProjectsByTeamverRegistryIfNeeded,
  registerTeamverProjectIfNeeded,
  TeamverProjectRegistryError,
  waitForTeamverRegistrySyncIfNeeded,
} from '../teamver/projectRegistry';
import { isTeamverEmbedMode } from '../teamver/designApiBase';
import { resolveTeamverBranding } from '../teamver/branding/config';
import { pluginsForSlideOnlyMvp } from '../teamver/branding/slideOnlyMvpPolicy';
import { isTeamverEmbedSessionAuthenticated } from '../teamver/teamverEmbedSession';
import { fetchTeamverDaemon, throwIfDaemonUnauthorized, TeamverDaemonUnauthorizedError } from '../teamver/teamverDaemonHeaders';
import { notifyTeamverEmbedAuthFailureIfNeeded } from '../teamver/teamverBffAuthError';
import { readActiveTeamverWorkspaceId } from '../teamver/activeTeamverWorkspace';
import {
  HOME_RECENT_LIST_LIMIT,
  PROJECT_LIST_PAGE_SIZE,
} from '../teamver/projectListLimits';
import { mapRegistryRowToProject, listEmbedProjectsFromRegistry, listEmbedProjectsPageFromRegistry, mergeDaemonFieldsOntoRegistryProjects } from '../teamver/embedRegistryProjectList';
import { fetchTeamverProject } from '../teamver/projectRegistry';
import { sanitizeChatMessageLeakedPseudoTool } from '../utils/sanitizeChatMessageLeakedPseudoTool';

function sanitizeChatMessageForPersist(message: ChatMessage): ChatMessage {
  const hideInternal = resolveTeamverBranding().hideAssistantThinkingDetails;
  return sanitizeChatMessageLeakedPseudoTool(message, {
    stripCodeFences: hideInternal,
    dropThinkingEvents: hideInternal,
  });
}
export type { PluginInstallOutcome } from '@open-design/contracts';
export type { PluginShareAction } from '@open-design/contracts';

export type ProjectsListPageResult = {
  projects: Project[];
  hasMore: boolean;
  nextCursor: string | null;
};

function noteDaemonProjectsListUnauthorized(resp: Response | null): void {
  if (resp?.status === 401) {
    notifyTeamverEmbedAuthFailureIfNeeded(new TeamverDaemonUnauthorizedError(), 'daemon');
  }
}

function throwIfDaemonProjectsListUnauthorized(resp: Response | null): void {
  noteDaemonProjectsListUnauthorized(resp);
  if (resp?.status === 401) {
    throw new TeamverDaemonUnauthorizedError();
  }
}

/** Daemon listing without registry filter — status/metadata enrichment only. */
async function fetchDaemonProjectsPageRaw(limit: number): Promise<Project[]> {
  try {
    const params = new URLSearchParams();
    params.set('limit', String(Math.max(1, Math.min(Math.floor(limit), 100))));
    const resp = await fetchProjectsListWhenAuthenticated(`/api/projects?${params.toString()}`);
    noteDaemonProjectsListUnauthorized(resp);
    if (!resp?.ok) return [];
    const json = (await resp.json()) as { projects?: Project[] };
    return (json.projects ?? []).map((project) => sanitizeProjectForEmbed(project));
  } catch {
    return [];
  }
}

/**
 * Id-targeted status/metadata enrich — avoids daemon top-N miss that left
 * registry cards stuck on `not_started` when other tenants fill the window.
 */
async function fetchDaemonProjectStatusHints(projectIds: string[]): Promise<{
  projects: Project[];
  /** True when the daemon build does not yet expose status-hints. */
  legacyFallback: boolean;
}> {
  const ids = [...new Set(projectIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return { projects: [], legacyFallback: false };
  try {
    const resp = await fetchProjectsListWhenAuthenticated('/api/projects/status-hints', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectIds: ids.slice(0, 48) }),
    });
    if (!resp) return { projects: [], legacyFallback: true };
    if (resp.status === 404 || resp.status === 405) {
      return { projects: [], legacyFallback: true };
    }
    noteDaemonProjectsListUnauthorized(resp);
    if (!resp.ok) return { projects: [], legacyFallback: false };
    const json = (await resp.json()) as { projects?: Project[] };
    return {
      projects: (json.projects ?? []).map((project) => sanitizeProjectForEmbed(project)),
      legacyFallback: false,
    };
  } catch {
    return { projects: [], legacyFallback: true };
  }
}

async function fetchDaemonProjectsAllRaw(): Promise<Project[]> {
  try {
    const resp = await fetchProjectsListWhenAuthenticated('/api/projects');
    noteDaemonProjectsListUnauthorized(resp);
    if (!resp?.ok) return [];
    const json = (await resp.json()) as { projects?: Project[] };
    return (json.projects ?? []).map((project) => sanitizeProjectForEmbed(project));
  } catch {
    return [];
  }
}

async function enrichEmbedRegistryProjects(projects: Project[]): Promise<Project[]> {
  if (projects.length === 0) return projects;
  const { projects: daemonProjects, legacyFallback } = await fetchDaemonProjectStatusHints(
    projects.map((project) => project.id),
  );
  if (legacyFallback) {
    // Soft fallback for older daemons without status-hints.
    const fallback = await fetchDaemonProjectsPageRaw(
      Math.max(PROJECT_LIST_PAGE_SIZE * 4, projects.length * 8, 96),
    );
    return mergeDaemonFieldsOntoRegistryProjects(projects, fallback);
  }
  return mergeDaemonFieldsOntoRegistryProjects(projects, daemonProjects);
}

async function normalizeProjectsResponse(projects: Project[]): Promise<Project[]> {
  if (isTeamverEmbedMode()) {
    await waitForTeamverRegistrySyncIfNeeded();
  }
  return filterProjectsByTeamverRegistryIfNeeded(
    projects.map((project) => sanitizeProjectForEmbed(project)),
  );
}

async function fetchProjectsListWhenAuthenticated(url: string, init?: RequestInit): Promise<Response | null> {
  if (isTeamverEmbedMode() && !isTeamverEmbedSessionAuthenticated()) {
    return null;
  }
  return fetchTeamverDaemon(url, init);
}

async function registerCreatedProjectOrRollback(project: Pick<Project, 'id' | 'name'>): Promise<void> {
  try {
    await registerTeamverProjectIfNeeded(project);
  } catch (err) {
    try {
      await fetchTeamverDaemon(`/api/projects/${encodeURIComponent(project.id)}`, { method: 'DELETE' });
    } catch {
      // The registry failure is the actionable error. Scratch cleanup remains
      // best-effort when the daemon is also unavailable.
    }
    throw err;
  }
}

const listRecentProjectsInflight = new Map<string, Promise<Project[]>>();

async function resolveListRecentProjectsInflightKey(limit: number): Promise<string | null> {
  if (!isTeamverEmbedMode()) return `standalone:${limit}`;
  try {
    const workspaceId = (await readActiveTeamverWorkspaceId())?.trim();
    if (!workspaceId) return null;
    return `embed:${workspaceId}:${limit}`;
  } catch {
    return null;
  }
}

export async function listRecentProjects(
  limit = HOME_RECENT_LIST_LIMIT,
): Promise<Project[]> {
  const inflightKey = await resolveListRecentProjectsInflightKey(limit);
  const inflight = inflightKey ? listRecentProjectsInflight.get(inflightKey) : null;
  if (inflight) return inflight;

  const run = (async (): Promise<Project[]> => {
    try {
      if (isTeamverEmbedMode()) {
        // Workspace registry is membership SSOT. Fetch a registry window
        // sized for recent + status reorder, then id-targeted daemon enrich
        // (not top-N ∩ registry — that undersamples other tenants' runs).
        await waitForTeamverRegistrySyncIfNeeded();
        const registryProjects = await listEmbedProjectsFromRegistry(
          Math.max(limit * 4, HOME_RECENT_LIST_LIMIT * 4, 24),
        );
        const enriched = await enrichEmbedRegistryProjects(registryProjects);
        return [...enriched]
          .sort((a, b) => {
            if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
            return b.id.localeCompare(a.id);
          })
          .slice(0, limit);
      }
      const resp = await fetchProjectsListWhenAuthenticated(
        `/api/projects/recent?limit=${encodeURIComponent(String(limit))}`,
      );
      if (!resp) return [];
      throwIfDaemonProjectsListUnauthorized(resp);
      if (!resp.ok) return [];
      const json = (await resp.json()) as { projects: Project[] };
      return normalizeProjectsResponse(json.projects ?? []);
    } catch (err) {
      if (err instanceof TeamverProjectRegistryError) {
        throw err;
      }
      if (err instanceof TeamverDaemonUnauthorizedError) {
        throw err;
      }
      return [];
    } finally {
      if (inflightKey) listRecentProjectsInflight.delete(inflightKey);
    }
  })();

  if (inflightKey) listRecentProjectsInflight.set(inflightKey, run);
  return run;
}

/** @internal vitest */
export function resetListRecentProjectsInflightForTests(): void {
  listRecentProjectsInflight.clear();
}

/** Drop coalesced recent fetches — call on workspace switch so the next home
 * rail load cannot reuse another tenant's in-flight promise. */
export function clearListRecentProjectsInflight(): void {
  listRecentProjectsInflight.clear();
}

export async function listProjectsPage(options?: {
  limit?: number;
  cursor?: string | null;
}): Promise<ProjectsListPageResult> {
  try {
    if (isTeamverEmbedMode()) {
      await waitForTeamverRegistrySyncIfNeeded();
      const page = await listEmbedProjectsPageFromRegistry(options);
      return {
        ...page,
        projects: await enrichEmbedRegistryProjects(page.projects),
      };
    }
    const params = new URLSearchParams();
    params.set('limit', String(options?.limit ?? PROJECT_LIST_PAGE_SIZE));
    if (options?.cursor) {
      params.set('cursor', options.cursor);
    }
    const resp = await fetchProjectsListWhenAuthenticated(`/api/projects?${params.toString()}`);
    if (!resp) {
      return { projects: [], hasMore: false, nextCursor: null };
    }
    throwIfDaemonProjectsListUnauthorized(resp);
    if (!resp.ok) {
      return { projects: [], hasMore: false, nextCursor: null };
    }
    const json = (await resp.json()) as {
      projects: Project[];
      hasMore?: boolean;
      nextCursor?: string | null;
    };
    const projects = await normalizeProjectsResponse(json.projects ?? []);
    return {
      projects,
      hasMore: json.hasMore === true,
      nextCursor: typeof json.nextCursor === 'string' ? json.nextCursor : null,
    };
  } catch (err) {
    if (err instanceof TeamverProjectRegistryError) {
      throw err;
    }
    if (err instanceof TeamverDaemonUnauthorizedError) {
      throw err;
    }
    return { projects: [], hasMore: false, nextCursor: null };
  }
}

/** Full daemon listing — embed uses registry membership + daemon field merge. */
export async function listProjects(): Promise<Project[]> {
  try {
    if (isTeamverEmbedMode()) {
      await waitForTeamverRegistrySyncIfNeeded();
      const registryProjects = await listEmbedProjectsFromRegistry();
      const daemonProjects = await fetchDaemonProjectsAllRaw();
      return mergeDaemonFieldsOntoRegistryProjects(registryProjects, daemonProjects);
    }
    const resp = await fetchProjectsListWhenAuthenticated('/api/projects');
    if (!resp) return [];
    throwIfDaemonProjectsListUnauthorized(resp);
    if (!resp.ok) return [];
    const json = (await resp.json()) as { projects: Project[] };
    return normalizeProjectsResponse(json.projects ?? []);
  } catch (err) {
    if (err instanceof TeamverProjectRegistryError) {
      throw err;
    }
    if (err instanceof TeamverDaemonUnauthorizedError) {
      throw err;
    }
    return [];
  }
}

export async function getProject(id: string): Promise<Project | null> {
  try {
    const resp = await fetchTeamverDaemon(`/api/projects/${encodeURIComponent(id)}`);
    if (resp.ok) {
      const json = (await resp.json()) as { project: Project };
      return sanitizeProjectForEmbed(json.project);
    }
    throwIfDaemonUnauthorized(resp);
    if (isTeamverEmbedMode()) {
      const row = await fetchTeamverProject(id);
      if (row) return mapRegistryRowToProject(row);
    }
    return null;
  } catch (err) {
    if (err instanceof TeamverDaemonUnauthorizedError) throw err;
    if (isTeamverEmbedMode()) {
      try {
        const row = await fetchTeamverProject(id);
        if (row) return mapRegistryRowToProject(row);
      } catch {
        // Registry fallback is best-effort when daemon transport fails.
      }
    }
    return null;
  }
}

/** Background refresh paths keep working when daemon auth blips mid-flight. */
export async function getProjectFailSoft(id: string): Promise<Project | null> {
  try {
    return await getProject(id);
  } catch (err) {
    if (err instanceof TeamverDaemonUnauthorizedError) return null;
    throw err;
  }
}

export async function createProject(input: {
  name: string;
  projectLocationId?: string;
  skillId: string | null;
  designSystemId: string | null;
  pendingPrompt?: string;
  metadata?: ProjectMetadata;
  conversationMode?: ChatSessionMode;
  // Plan §3.A1 / spec §11.5 — POST /api/projects accepts a pluginId
  // (or pre-applied snapshot id) to resolve and pin a plugin to the new
  // project. Used by the PluginLoopHome flow on Home.
  pluginId?: string;
  appliedPluginSnapshotId?: string;
  pluginInputs?: Record<string, unknown>;
}): Promise<{ project: Project; conversationId: string; appliedPluginSnapshotId?: string }> {
  try {
    const metadata = input.metadata
      ? stripLinkedDirsFromMetadata(input.metadata)
      : input.metadata;
    // `randomUUID` falls back to `crypto.getRandomValues` / `Math.random`
    // when `crypto.randomUUID` is unavailable. Open Design served over
    // plain HTTP on a LAN IP (Docker / unRAID self-hosting) is a
    // non-secure context, where `crypto.randomUUID` is undefined and
    // calling it directly throws — the surrounding try/catch then turns
    // the Create button into a silent no-op (issue #849).
    const id = randomUUID();
    const resp = await fetchTeamverDaemon('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...input, ...(metadata ? { metadata } : {}) }),
    });
    if (!resp.ok) {
      if (resp.status === 401) {
        notifyTeamverEmbedAuthFailureIfNeeded(new TeamverDaemonUnauthorizedError(), 'daemon');
        throw new Error(formatProjectCreateErrorForUser(new TeamverDaemonUnauthorizedError()));
      }
      let message = 'Could not create project';
      try {
        const body = await resp.json() as { error?: unknown };
        if (
          body.error &&
          typeof body.error === 'object' &&
          'message' in body.error &&
          typeof body.error.message === 'string' &&
          body.error.message.trim()
        ) {
          message = body.error.message;
        }
      } catch {
        // Keep the generic fallback when the error body is absent or invalid.
      }
      throw new Error(message);
    }
    const result = (await resp.json()) as {
      project: Project;
      conversationId: string;
      appliedPluginSnapshotId?: string;
    };
    await registerCreatedProjectOrRollback(result.project);
    return {
      ...result,
      project: sanitizeProjectForEmbed(result.project),
    };
  } catch (err) {
    throw err instanceof Error ? err : new Error('Could not create project');
  }
}

export async function pickLocalFolderPath(): Promise<string | null> {
  if (!mayMutateProjectLinkedDirs()) {
    throw new Error('local_folder_picker_unavailable');
  }
  const resp = await fetch('/api/dialog/open-folder', {
    method: 'POST',
  });
  if (!resp.ok) {
    let message = 'Could not open folder picker';
    try {
      const body = await resp.json() as { error?: unknown };
      if (typeof body.error === 'string' && body.error.trim()) {
        message = body.error;
      } else if (
        body.error
        && typeof body.error === 'object'
        && 'message' in body.error
        && typeof body.error.message === 'string'
        && body.error.message.trim()
      ) {
        message = body.error.message;
      }
    } catch { /* use default message */ }
    throw new Error(message);
  }

  const body = await resp.json() as { path?: unknown };
  if (body.path == null) return null;
  if (typeof body.path !== 'string') {
    throw new Error('Could not open folder picker');
  }
  return body.path.length > 0 ? body.path : null;
}

export async function importFolderProject(
  input: ImportFolderRequest,
): Promise<ImportFolderResponse> {
  if (!mayMutateProjectLinkedDirs()) {
    throw new Error('folder_import_unavailable');
  }
  const resp = await fetch('/api/import/folder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!resp.ok) {
    let message = 'Failed to import folder';
    try {
      const body = await resp.json();
      if (body?.error?.message) message = body.error.message;
    } catch { /* use default message */ }
    throw new Error(message);
  }
  const result = (await resp.json()) as ImportFolderResponse;
  await registerCreatedProjectOrRollback(result.project);
  return result;
}

export async function importClaudeDesignZip(
  file: File,
): Promise<{ project: Project; conversationId: string; entryFile: string }> {
  const form = new FormData();
  form.append('file', file);
  const resp = await fetch('/api/import/claude-design', {
    method: 'POST',
    body: form,
  });
  if (!resp.ok) {
    const payload = await resp.json().catch(() => null);
    const message =
      payload != null &&
      typeof payload === 'object' &&
      typeof (payload as { error?: unknown }).error === 'string'
        ? (payload as { error: string }).error
        : `Import failed (${resp.status})`;
    throw new Error(message);
  }
  const result = (await resp.json()) as {
    project: Project;
    conversationId: string;
    entryFile: string;
  };
  await registerCreatedProjectOrRollback(result.project);
  return result;
}

// ---------- templates ----------

let listTemplatesInflight: Promise<ProjectTemplate[]> | null = null;

export async function listTemplates(): Promise<ProjectTemplate[]> {
  if (listTemplatesInflight) return listTemplatesInflight;
  listTemplatesInflight = (async () => {
    try {
      const resp = await fetchProjectsListWhenAuthenticated('/api/templates');
      if (!resp) return [];
      noteDaemonProjectsListUnauthorized(resp);
      if (!resp.ok) return [];
      const json = (await resp.json()) as { templates: ProjectTemplate[] };
      return json.templates ?? [];
    } catch {
      return [];
    } finally {
      listTemplatesInflight = null;
    }
  })();
  return listTemplatesInflight;
}

/** @internal vitest only */
export function resetListTemplatesInflightForTests(): void {
  listTemplatesInflight = null;
}

export async function getTemplate(id: string): Promise<ProjectTemplate | null> {
  try {
    const resp = await fetch(`/api/templates/${encodeURIComponent(id)}`);
    if (!resp.ok) return null;
    const json = (await resp.json()) as { template: ProjectTemplate };
    return json.template;
  } catch {
    return null;
  }
}

export async function saveTemplate(input: {
  name: string;
  description?: string;
  sourceProjectId: string;
}): Promise<ProjectTemplate | null> {
  try {
    const resp = await fetch('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!resp.ok) return null;
    const json = (await resp.json()) as { template: ProjectTemplate };
    return json.template;
  } catch {
    return null;
  }
}

export async function deleteTemplate(id: string): Promise<boolean> {
  try {
    const resp = await fetch(`/api/templates/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    return resp.ok;
  } catch {
    return false;
  }
}

type ProjectPatch = Omit<Partial<Project>, 'pendingPrompt' | 'customInstructions'> & {
  pendingPrompt?: Project['pendingPrompt'] | null;
  customInstructions?: string | null;
};

export async function patchProject(
  id: string,
  patch: ProjectPatch,
): Promise<Project | null> {
  const sanitized: ProjectPatch = { ...patch };
  if (sanitized.metadata) {
    sanitized.metadata = stripLinkedDirsFromMetadata(sanitized.metadata);
  }
  try {
    const resp = await fetchTeamverDaemon(`/api/projects/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sanitized),
    });
    if (!resp.ok) {
      if (resp.status === 401) {
        notifyTeamverEmbedAuthFailureIfNeeded(new TeamverDaemonUnauthorizedError(), 'daemon');
      }
      return null;
    }
    const json = (await resp.json()) as { project: Project };
    return sanitizeProjectForEmbed(json.project);
  } catch {
    return null;
  }
}

export async function deleteProject(id: string): Promise<boolean> {
  try {
    const resp = await fetchTeamverDaemon(`/api/projects/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!resp.ok) {
      if (resp.status === 401) {
        notifyTeamverEmbedAuthFailureIfNeeded(new TeamverDaemonUnauthorizedError(), 'daemon');
      }
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

// ---------- conversations ----------

export { TeamverDaemonUnauthorizedError } from '../teamver/teamverDaemonHeaders';

export async function listConversations(
  projectId: string,
): Promise<Conversation[]> {
  // Throw on failure so ProjectView's load-with-retry + soft-sticky recovery
  // can run. Returning [] looked like "no conversations" after a transient
  // daemon/auth blip and wiped the sidebar on re-entry.
  const resp = await fetchTeamverDaemon(
    `/api/projects/${encodeURIComponent(projectId)}/conversations`,
  );
  throwIfDaemonUnauthorized(resp);
  if (!resp.ok) {
    throw new Error(`Failed to list conversations (${resp.status})`);
  }
  const json = (await resp.json()) as { conversations: Conversation[] };
  return json.conversations ?? [];
}

export async function createConversation(
  projectId: string,
  title?: string,
  // Side Chat: seed the new conversation with another conversation's context
  // by copying its messages. `forkAfterMessageId` narrows that copy to a
  // specific point in the source history.
  opts?: {
    seedFromConversationId?: string | null;
    forkAfterMessageId?: string | null;
    sessionMode?: ChatSessionMode;
    // Fork snapshot: the exact in-memory messages to copy (up to the fork
    // point). Lets the daemon fork from what the user sees even when the fork
    // point was never persisted (e.g. a run that errored before its assistant
    // message reached the database).
    seedMessages?: ChatMessage[];
  },
): Promise<Conversation | null> {
  try {
    const body: CreateConversationRequest = { title };
    if (opts?.sessionMode) {
      body.sessionMode = opts.sessionMode;
    }
    if (opts?.seedFromConversationId) {
      body.seedFromConversationId = opts.seedFromConversationId;
    }
    if (opts?.forkAfterMessageId) {
      body.forkAfterMessageId = opts.forkAfterMessageId;
    }
    if (opts?.seedMessages && opts.seedMessages.length > 0) {
      body.seedMessages = opts.seedMessages;
    }
    const resp = await fetchTeamverDaemon(
      `/api/projects/${encodeURIComponent(projectId)}/conversations`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
    throwIfDaemonUnauthorized(resp);
    if (!resp.ok) return null;
    const json = (await resp.json()) as { conversation: Conversation };
    return json.conversation;
  } catch (err) {
    if (err instanceof TeamverDaemonUnauthorizedError) throw err;
    return null;
  }
}

export async function patchConversation(
  projectId: string,
  conversationId: string,
  patch: Partial<Conversation>,
): Promise<Conversation | null> {
  try {
    const resp = await fetchTeamverDaemon(
      `/api/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conversationId)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      },
    );
    throwIfDaemonUnauthorized(resp);
    if (!resp.ok) return null;
    const json = (await resp.json()) as { conversation: Conversation };
    return json.conversation;
  } catch (err) {
    if (err instanceof TeamverDaemonUnauthorizedError) throw err;
    return null;
  }
}

export async function deleteConversation(
  projectId: string,
  conversationId: string,
): Promise<boolean> {
  try {
    const resp = await fetchTeamverDaemon(
      `/api/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conversationId)}`,
      { method: 'DELETE' },
    );
    throwIfDaemonUnauthorized(resp);
    return resp.ok;
  } catch (err) {
    if (err instanceof TeamverDaemonUnauthorizedError) throw err;
    return false;
  }
}

// ---------- messages ----------

export async function listMessages(
  projectId: string,
  conversationId: string,
): Promise<ChatMessage[]> {
  // Must throw on transport / non-OK responses. Returning [] made
  // ProjectView treat a failed reload as an empty conversation — the chat
  // wiped on refresh while the in-memory run still looked "완료됨".
  const resp = await fetchTeamverDaemon(
    `/api/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conversationId)}/messages`,
  );
  throwIfDaemonUnauthorized(resp);
  if (!resp.ok) {
    throw new Error(`Failed to list messages (${resp.status})`);
  }
  const json = (await resp.json()) as { messages: ChatMessage[] };
  return (json.messages ?? []).map(sanitizeChatMessageForPersist);
}

export interface SaveMessageOptions {
  telemetryFinalized?: boolean;
  // Set during page-unload paths (pagehide / visibilitychange→hidden) so
  // the in-flight PUT survives even if the document tears down before the
  // response arrives. Without keepalive the browser cancels the fetch
  // and the daemon never sees the final buffered text chunk.
  keepalive?: boolean;
}

/**
 * Browsers cap the aggregate body size of all in-flight `keepalive`
 * fetches to 64 KiB (per the Fetch spec, enforced by Chromium/Firefox).
 * Once exceeded the browser silently rejects the request with
 * `TypeError: Failed to fetch`. We size our threshold slightly under
 * that cap to leave headroom for request headers (Cookie, X-Workspace-Id,
 * X-Teamver-User-Id, Content-Type, ...) that count against the same
 * budget in some UAs.
 */
const KEEPALIVE_PAYLOAD_MAX_BYTES = 56 * 1024;

/**
 * Byte length of a UTF-8 encoded JSON payload. Prefer `TextEncoder` over
 * `body.length` because JSON.stringify returns UCS-2 code units, not
 * bytes — a payload of "just barely under 32K chars" can be 60K bytes.
 */
function byteLengthUtf8(value: string): number {
  if (typeof TextEncoder === 'undefined') {
    // Node fallback for tests — approximate via Buffer.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return typeof Buffer !== 'undefined' ? (Buffer as any).byteLength(value, 'utf8') : value.length;
  }
  return new TextEncoder().encode(value).byteLength;
}

/**
 * Return a shallow-projected `ChatMessage` that drops heavy optional
 * fields (`events`, `producedFiles`, `toolInput`, `renderedHtml`) so the
 * keepalive PUT stays under the 64 KiB cap on pagehide paths. The daemon
 * already has a running record of tool events from SSE and will
 * reconcile the missing enrichment on the next full save.
 */
function projectKeepaliveEssentials(message: ChatMessage): ChatMessage {
  const {
    events: _events,
    producedFiles: _producedFiles,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } = message as unknown as Record<string, any>;
  const trimmed: ChatMessage = { ...message };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (trimmed as unknown as Record<string, any>).events;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (trimmed as unknown as Record<string, any>).producedFiles;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (trimmed as unknown as Record<string, any>).toolInput;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (trimmed as unknown as Record<string, any>).renderedHtml;
  return trimmed;
}

/**
 * Non-keepalive saves survive refresh — a silent failure here is what makes
 * a "완료됨" chat wipe on reload. Retry once on transient 5xx / network
 * shapes before conceding. Keepalive PUTs (pagehide path) don't retry: the
 * document is tearing down and a second in-flight fetch can be cancelled
 * mid-way anyway.
 */
const MESSAGE_SAVE_RETRY_DELAY_MS = 350;

function isTransientMessageSaveStatus(status: number): boolean {
  return status >= 500 && status < 600;
}

export async function saveMessage(
  projectId: string,
  conversationId: string,
  message: ChatMessage,
  options: SaveMessageOptions = {},
): Promise<void> {
  const savedMessage = sanitizeChatMessageForPersist(
    options.telemetryFinalized
      ? { ...message, telemetryFinalized: true }
      : message,
  );
  let body = JSON.stringify(savedMessage);
  let truncated = false;
  if (options.keepalive) {
    const originalSize = byteLengthUtf8(body);
    if (originalSize > KEEPALIVE_PAYLOAD_MAX_BYTES) {
      const essentials = projectKeepaliveEssentials(savedMessage);
      const trimmedBody = JSON.stringify(essentials);
      const trimmedSize = byteLengthUtf8(trimmedBody);
      console.warn(
        '[teamver] chat-save: keepalive payload exceeded 56KiB cap; retrying with essential fields only',
        {
          projectId,
          conversationId,
          messageId: message.id,
          originalBytes: originalSize,
          trimmedBytes: trimmedSize,
          withinCap: trimmedSize <= KEEPALIVE_PAYLOAD_MAX_BYTES,
        },
      );
      if (trimmedSize <= KEEPALIVE_PAYLOAD_MAX_BYTES) {
        body = trimmedBody;
        truncated = true;
      } else {
        // Even the essentials-only projection blew the cap (huge
        // content field). Abandon the keepalive send and log — the
        // next visible session refresh triggers a full PUT via the
        // finalization effect in ProjectView.
        console.warn(
          '[teamver] chat-save: essentials-only projection still over cap; skipping keepalive PUT',
          { projectId, conversationId, messageId: message.id },
        );
        return;
      }
    }
  }

  const url = `/api/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(message.id)}`;
  const putOnce = () =>
    fetchTeamverDaemon(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body,
      ...(options.keepalive ? { keepalive: true } : {}),
    });

  type AttemptOutcome =
    | { kind: 'response'; status: number; ok: boolean }
    | { kind: 'error'; err: unknown };
  const attemptOnce = async (): Promise<AttemptOutcome> => {
    try {
      const resp = await putOnce();
      return { kind: 'response', status: resp.status, ok: resp.ok };
    } catch (err) {
      return { kind: 'error', err };
    }
  };
  const shouldRetry = (outcome: AttemptOutcome): boolean => {
    if (options.keepalive) return false;
    if (outcome.kind === 'error') return true;
    return isTransientMessageSaveStatus(outcome.status);
  };

  let outcome = await attemptOnce();
  if (shouldRetry(outcome)) {
    // Soft sticky / HA cookie race / daemon storage blip — one retry
    // matches the conversation-list recovery path in ProjectView.
    await new Promise((resolve) => setTimeout(resolve, MESSAGE_SAVE_RETRY_DELAY_MS));
    outcome = await attemptOnce();
  }

  if (outcome.kind === 'error') {
    console.warn('[teamver] chat-save: PUT threw', {
      projectId,
      conversationId,
      messageId: message.id,
      keepalive: Boolean(options.keepalive),
      error: outcome.err instanceof Error ? outcome.err.message : String(outcome.err),
    });
    // best-effort persistence — UI keeps the message in-memory either way
    return;
  }
  if (!outcome.ok) {
    console.warn('[teamver] chat-save: PUT non-ok', {
      projectId,
      conversationId,
      messageId: message.id,
      status: outcome.status,
      truncated,
      keepalive: Boolean(options.keepalive),
    });
  }

  // Usage reporting is decoupled from message PUT status — BYOK embed has
  // no daemon fallback, so a soft failure must not drop the ledger row.
  void maybeReportTeamverUsageAfterSave(projectId, savedMessage, options);
}

// ---------- terminals ----------
//
// Interactive PTY sessions rooted at the project working directory. The daemon
// streams output down over SSE (`GET .../stream`) and accepts keystrokes /
// resizes back up over plain POST — see `packages/contracts/src/api/terminals.ts`.
// `<TerminalViewer>` drives `terminalStreamUrl` directly via EventSource; these
// helpers cover the request/response endpoints.

export async function createTerminal(
  projectId: string,
  init?: CreateTerminalRequest,
): Promise<TerminalSession | null> {
  try {
    const resp = await fetchTeamverDaemon(
      `/api/projects/${encodeURIComponent(projectId)}/terminals`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(init ?? {}),
      },
    );
    if (!resp.ok) return null;
    const json = (await resp.json()) as { terminal: TerminalSession };
    return json.terminal ?? null;
  } catch {
    return null;
  }
}

/** SSE endpoint a `<TerminalViewer>` subscribes to for raw PTY output. */
export function terminalStreamUrl(projectId: string, terminalId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/terminals/${encodeURIComponent(terminalId)}/stream`;
}

export async function sendTerminalStdin(
  projectId: string,
  terminalId: string,
  data: string,
): Promise<boolean> {
  try {
    const resp = await fetchTeamverDaemon(
      `/api/projects/${encodeURIComponent(projectId)}/terminals/${encodeURIComponent(terminalId)}/stdin`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data }),
      },
    );
    return resp.ok;
  } catch {
    return false;
  }
}

export async function resizeTerminal(
  projectId: string,
  terminalId: string,
  cols: number,
  rows: number,
): Promise<boolean> {
  try {
    const resp = await fetchTeamverDaemon(
      `/api/projects/${encodeURIComponent(projectId)}/terminals/${encodeURIComponent(terminalId)}/resize`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cols, rows }),
      },
    );
    return resp.ok;
  } catch {
    return false;
  }
}

export async function killTerminal(
  projectId: string,
  terminalId: string,
  // Page-unload paths set keepalive so the kill survives document teardown,
  // mirroring `saveMessage`. Without it the browser cancels the fetch and the
  // PTY leaks until the daemon GCs it.
  options: { keepalive?: boolean } = {},
): Promise<boolean> {
  try {
    const resp = await fetchTeamverDaemon(
      `/api/projects/${encodeURIComponent(projectId)}/terminals/${encodeURIComponent(terminalId)}/kill`,
      {
        method: 'POST',
        ...(options.keepalive ? { keepalive: true } : {}),
      },
    );
    return resp.ok;
  } catch {
    return false;
  }
}

// ---------- tabs ----------

const PROJECT_TABS_CACHE_PREFIX = 'open-design:project-tabs:v1:';

function tabsCacheKey(projectId: string): string {
  return `${PROJECT_TABS_CACHE_PREFIX}${projectId}`;
}

function normalizeTabsState(value: unknown): OpenTabsState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.tabs) || !record.tabs.every((tab) => typeof tab === 'string')) {
    return null;
  }
  const browserTabs = Array.isArray(record.browserTabs)
    ? record.browserTabs.filter(
        (tab) =>
          Boolean(tab) &&
          typeof tab === 'object' &&
          !Array.isArray(tab) &&
          typeof (tab as Record<string, unknown>).id === 'string' &&
          typeof (tab as Record<string, unknown>).label === 'string',
      ) as OpenTabsState['browserTabs']
    : undefined;
  const state: OpenTabsState = {
    tabs: record.tabs.slice() as string[],
    active: typeof record.active === 'string' ? record.active : null,
  };
  if (browserTabs && browserTabs.length > 0) state.browserTabs = browserTabs;
  if (record.hasSavedState === true) state.hasSavedState = true;
  if (typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt)) {
    state.updatedAt = record.updatedAt;
  }
  return state;
}

function readCachedTabs(projectId: string): OpenTabsState | null {
  if (typeof window === 'undefined') return null;
  try {
    return normalizeTabsState(JSON.parse(window.localStorage.getItem(tabsCacheKey(projectId)) ?? 'null'));
  } catch {
    return null;
  }
}

function writeCachedTabs(projectId: string, state: OpenTabsState): OpenTabsState {
  const next: OpenTabsState = {
    ...state,
    updatedAt: Date.now(),
  };
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(tabsCacheKey(projectId), JSON.stringify(next));
    } catch {
      // Ignore quota/private-mode failures. The daemon save below is canonical.
    }
  }
  return next;
}

function newestTabsState(
  first: OpenTabsState | null,
  second: OpenTabsState | null,
): OpenTabsState {
  if (!first && !second) return { tabs: [], active: null };
  if (!first) return second!;
  if (!second) return first;
  return (second.updatedAt ?? 0) > (first.updatedAt ?? 0) ? second : first;
}

async function persistTabsToDaemon(projectId: string, state: OpenTabsState): Promise<void> {
  const resp = await fetchTeamverDaemon(`/api/projects/${encodeURIComponent(projectId)}/tabs`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
    keepalive: true,
  });
  if (resp.status === 401) {
    notifyTeamverEmbedAuthFailureIfNeeded(new TeamverDaemonUnauthorizedError(), 'daemon');
  }
}

export async function loadTabs(projectId: string): Promise<OpenTabsState> {
  const cached = readCachedTabs(projectId);
  try {
    const resp = await fetchTeamverDaemon(
      `/api/projects/${encodeURIComponent(projectId)}/tabs`,
    );
    if (resp.status === 401) {
      notifyTeamverEmbedAuthFailureIfNeeded(new TeamverDaemonUnauthorizedError(), 'daemon');
      return cached ?? { tabs: [], active: null };
    }
    if (!resp.ok) return cached ?? { tabs: [], active: null };
    const saved = normalizeTabsState(await resp.json());
    const latest = newestTabsState(cached, saved);
    if (cached && latest === cached && (cached.updatedAt ?? 0) > (saved?.updatedAt ?? 0)) {
      void persistTabsToDaemon(projectId, cached).catch(() => {});
    }
    return latest;
  } catch {
    return cached ?? { tabs: [], active: null };
  }
}

export async function saveTabs(
  projectId: string,
  state: OpenTabsState,
): Promise<void> {
  const next = writeCachedTabs(projectId, state);
  try {
    await persistTabsToDaemon(projectId, next);
  } catch {
    // best-effort
  }
}

/**
 * Write tab state to the local cache ONLY (synchronous localStorage), returning
 * the `updatedAt`-stamped state. Callers that debounce the canonical daemon
 * write use this so the cache is always current — `loadTabs` reconciles cache
 * vs daemon by `updatedAt`, so a debounced (or dropped) daemon PUT never loses
 * data: a newer cache is re-pushed on next load.
 */
export function cacheTabsLocally(projectId: string, state: OpenTabsState): OpenTabsState {
  return writeCachedTabs(projectId, state);
}

/** Persist already-stamped tab state to the daemon (the debounced write). */
export async function persistTabsToDaemonNow(
  projectId: string,
  state: OpenTabsState,
): Promise<void> {
  try {
    await persistTabsToDaemon(projectId, state);
  } catch {
    // best-effort; the local cache (written via cacheTabsLocally) is canonical
    // and will re-push on the next loadTabs reconciliation.
  }
}

// ---------- plugins ----------
// Plan §3.C1 — plugin discovery + apply.
//
// applyPlugin() is the canonical entry point for both the inline rail
// (NewProjectPanel + ChatComposer) and the marketplace detail page. It
// hits POST /api/plugins/:id/apply, which is the same pure resolver
// the daemon uses; the response carries everything the composer needs:
//   - query (pre-filled brief)
//   - contextItems (chip strip)
//   - inputs (form fields)
//   - appliedPlugin (snapshot id; sent back on POST /api/runs to pin
//     the prompt block to the frozen view)

export interface ListPluginsOptions {
  includeHidden?: boolean;
  /** Embed slide-only — request daemon deck catalog (`manifest.od.mode === 'deck'`). */
  mode?: 'deck';
  query?: string;
  limit?: number;
  offset?: number;
}

export interface ListPluginsPageResult {
  plugins: InstalledPluginRecord[];
  total: number | null;
  limit: number | null;
  offset: number;
  nextOffset: number | null;
}

function resolvePluginsListUrl(options: ListPluginsOptions): string {
  const params = new URLSearchParams();
  const slideOnly = isTeamverEmbedMode() && resolveTeamverBranding().slideOnlyMvp;
  if (options.mode === 'deck' || slideOnly) params.set('mode', 'deck');
  if (options.query?.trim()) params.set('q', options.query.trim());
  const limit = options.limit ?? (slideOnly ? 24 : undefined);
  if (typeof limit === 'number' && Number.isFinite(limit) && limit > 0) {
    params.set('limit', String(Math.floor(limit)));
  }
  if (typeof options.offset === 'number' && Number.isFinite(options.offset) && options.offset > 0) {
    params.set('offset', String(Math.floor(options.offset)));
  }
  const query = params.toString();
  return query ? `/api/plugins?${query}` : '/api/plugins';
}

export async function listPlugins(
  options: ListPluginsOptions = {},
): Promise<InstalledPluginRecord[]> {
  return (await listPluginsPage(options)).plugins;
}

export async function getInstalledPlugin(
  pluginId: string,
  options: Pick<ListPluginsOptions, 'includeHidden'> = {},
): Promise<InstalledPluginRecord | null> {
  const id = pluginId.trim();
  if (!id) return null;
  try {
    const resp = await fetch(`/api/plugins/${encodeURIComponent(id)}`);
    if (!resp.ok) return null;
    const plugin = (await resp.json()) as InstalledPluginRecord;
    if (isTeamverEmbedMode() && resolveTeamverBranding().slideOnlyMvp) {
      const visible = pluginsForSlideOnlyMvp([plugin], { slideOnlyMvp: true });
      if (visible.length === 0) return null;
    }
    if (!options.includeHidden && !isVisiblePlugin(plugin)) return null;
    return plugin;
  } catch {
    return null;
  }
}

export async function listPluginsPage(
  options: ListPluginsOptions = {},
): Promise<ListPluginsPageResult> {
  try {
    const resp = await fetch(resolvePluginsListUrl(options));
    if (!resp.ok) return emptyPluginsPage();
    const json = (await resp.json()) as {
      plugins?: InstalledPluginRecord[];
      total?: number;
      limit?: number | null;
      offset?: number;
      nextOffset?: number | null;
    };
    let plugins = json.plugins ?? [];
    if (isTeamverEmbedMode() && resolveTeamverBranding().slideOnlyMvp) {
      plugins = pluginsForSlideOnlyMvp(plugins, { slideOnlyMvp: true });
    }
    const visible = options.includeHidden ? plugins : plugins.filter(isVisiblePlugin);
    return {
      plugins: visible,
      total: typeof json.total === 'number' && Number.isFinite(json.total) ? json.total : null,
      limit: typeof json.limit === 'number' && Number.isFinite(json.limit) ? json.limit : null,
      offset: typeof json.offset === 'number' && Number.isFinite(json.offset) ? json.offset : 0,
      nextOffset:
        typeof json.nextOffset === 'number' && Number.isFinite(json.nextOffset)
          ? json.nextOffset
          : null,
    };
  } catch {
    return emptyPluginsPage();
  }
}

function emptyPluginsPage(): ListPluginsPageResult {
  return { plugins: [], total: null, limit: null, offset: 0, nextOffset: null };
}

export function isVisiblePlugin(plugin: InstalledPluginRecord): boolean {
  const od = (plugin.manifest?.od ?? {}) as Record<string, unknown>;
  return od.hidden !== true;
}

interface PluginInstallEvent {
  kind?: 'progress' | 'success' | 'error';
  phase?: string;
  message?: string;
  plugin?: InstalledPluginRecord;
  warnings?: string[];
}

export async function installPluginSource(source: string): Promise<PluginInstallOutcome> {
  const log: string[] = [];
  try {
    const resp = await fetch('/api/plugins/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source }),
    });
    if (!resp.ok) {
      const message = await readErrorMessage(resp);
      return { ok: false, warnings: [], message, log };
    }
    if (!resp.body) {
      return {
        ok: false,
        warnings: [],
        message: 'Install stream did not start.',
        log,
      };
    }

    let success: InstalledPluginRecord | undefined;
    let warnings: string[] = [];
    let errorMessage: string | undefined;
    for await (const ev of readServerSentEvents(resp.body)) {
      if (ev.message) log.push(ev.message);
      if (ev.warnings) warnings = ev.warnings;
      if (ev.kind === 'success') success = ev.plugin;
      if (ev.kind === 'error') errorMessage = ev.message ?? 'Install failed.';
    }
    return {
      ok: Boolean(success) && !errorMessage,
      plugin: success,
      warnings,
      message: errorMessage ?? (success ? `Installed ${success.title}.` : 'Install finished.'),
      log,
    };
  } catch (err) {
    return {
      ok: false,
      warnings: [],
      message: (err as Error).message,
      log,
    };
  }
}

export async function uploadPluginZip(file: File): Promise<PluginInstallOutcome> {
  const form = new FormData();
  form.append('file', file);
  return postPluginUpload('/api/plugins/upload-zip', form);
}

export async function uploadPluginFolder(files: File[]): Promise<PluginInstallOutcome> {
  const form = new FormData();
  for (const file of files) {
    const relativePath = getUploadRelativePath(file);
    form.append('files', file, file.name);
    form.append('paths', relativePath);
  }
  return postPluginUpload('/api/plugins/upload-folder', form);
}

export async function installGeneratedPluginFolder(
  projectId: string,
  relativePath: string,
): Promise<PluginInstallOutcome> {
  try {
    const request: ProjectPluginFolderInstallRequest = { path: relativePath };
    const resp = await fetchTeamverDaemon(
      `/api/projects/${encodeURIComponent(projectId)}/plugins/install-folder`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      },
    );
    const outcome = await readPluginInstallOutcome(resp);
    if (outcome.ok && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('open-design:plugins-changed'));
    }
    return outcome;
  } catch (err) {
    return {
      ok: false,
      warnings: [],
      message: (err as Error).message,
      log: [],
    };
  }
}

export interface PluginShareOutcome {
  ok: boolean;
  message: string;
  url?: string;
  log?: string[];
  code?: string;
}

export interface PluginShareTaskStart {
  taskId: string;
  action: 'publish-github' | 'contribute-open-design';
  path: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  startedAt: number;
}

export interface PluginShareTaskResult {
  message: string;
  url?: string;
  log?: string[];
}

export interface PluginShareTaskError {
  message: string;
  code?: string;
  log?: string[];
}

export interface PluginShareTaskSnapshot {
  taskId: string;
  action: 'publish-github' | 'contribute-open-design';
  path: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  startedAt: number;
  endedAt?: number | null;
  progress: string[];
  nextSince: number;
  result?: PluginShareTaskResult;
  error?: PluginShareTaskError;
}

export async function publishGeneratedPluginToGitHub(
  projectId: string,
  relativePath: string,
): Promise<PluginShareOutcome> {
  return postGeneratedPluginShareAction(projectId, relativePath, 'publish-github');
}

export async function contributeGeneratedPluginToOpenDesign(
  projectId: string,
  relativePath: string,
): Promise<PluginShareOutcome> {
  return postGeneratedPluginShareAction(projectId, relativePath, 'contribute-open-design');
}

export async function startGeneratedPluginShareTask(
  projectId: string,
  relativePath: string,
  action: 'publish-github' | 'contribute-open-design',
): Promise<PluginShareTaskStart> {
  const resp = await fetchTeamverDaemon(
    `/api/projects/${encodeURIComponent(projectId)}/plugins/share-tasks`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: relativePath, action }),
    },
  );
  const body = await resp.json().catch(() => null) as Partial<PluginShareTaskStart> & {
    error?: string | { message?: string };
    message?: string;
  } | null;
  if (!resp.ok || !body?.taskId || !body?.action || !body?.path || !body?.status || !body?.startedAt) {
    const errorMessage =
      body?.message
      ?? (typeof body?.error === 'string' ? body.error : body?.error?.message)
      ?? 'Could not start plugin share task.';
    throw new Error(errorMessage);
  }
  return {
    taskId: body.taskId,
    action: body.action,
    path: body.path,
    status: body.status,
    startedAt: body.startedAt,
  };
}

export async function waitGeneratedPluginShareTask(
  taskId: string,
  since: number,
  timeoutMs = 25_000,
): Promise<PluginShareTaskSnapshot> {
  const resp = await fetch(`/api/plugins/share-tasks/${encodeURIComponent(taskId)}/wait`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ since, timeoutMs }),
  });
  const body = await resp.json().catch(() => null) as PluginShareTaskSnapshot & {
    error?: string | { message?: string };
    message?: string;
  } | null;
  if (!resp.ok || !body?.taskId) {
    const errorMessage =
      body?.message
      ?? (typeof body?.error === 'string' ? body.error : body?.error?.message)
      ?? 'Could not fetch plugin share task.';
    throw new Error(errorMessage);
  }
  return body;
}

export type PluginShareProjectOutcome =
  | (CreatePluginShareProjectResponse & { ok: true })
  | {
      ok: false;
      message: string;
      code?: string;
    };

export async function createPluginShareProject(
  pluginId: string,
  action: PluginShareAction,
  locale?: string,
): Promise<PluginShareProjectOutcome> {
  try {
    const resp = await fetch(
      `/api/plugins/${encodeURIComponent(pluginId)}/share-project`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          ...(locale ? { locale } : {}),
        }),
      },
    );
    const body = (await resp.json().catch(() => null)) as
      | (Partial<CreatePluginShareProjectResponse> & {
          error?: string | { code?: string; message?: string };
          code?: string;
        })
      | null;
    if (resp.ok && body?.ok && body.project && body.conversationId) {
      const outcome = body as CreatePluginShareProjectResponse & { ok: true };
      await registerCreatedProjectOrRollback(outcome.project);
      return outcome;
    }
    const errorMessage =
      typeof body?.error === 'string' ? body.error : body?.error?.message;
    const fallbackMessage = resp.statusText || 'Could not create plugin share project.';
    const message = body?.message ?? errorMessage ?? fallbackMessage;
    const code =
      body?.code ?? (typeof body?.error === 'object' ? body.error.code : undefined);
    return {
      ok: false,
      message,
      ...(code ? { code } : {}),
    };
  } catch (err) {
    return {
      ok: false,
      message: (err as Error).message,
    };
  }
}

async function postGeneratedPluginShareAction(
  projectId: string,
  relativePath: string,
  action: 'publish-github' | 'contribute-open-design',
): Promise<PluginShareOutcome> {
  try {
    const resp = await fetchTeamverDaemon(
      `/api/projects/${encodeURIComponent(projectId)}/plugins/${action}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: relativePath }),
      },
    );
    const body = (await resp.json().catch(() => null)) as Partial<PluginShareOutcome> | null;
    return {
      ok: Boolean(resp.ok && body?.ok),
      message: body?.message ?? (resp.ok ? 'Action finished.' : 'Plugin share action failed.'),
      ...(body?.url ? { url: body.url } : {}),
      ...(body?.log ? { log: body.log } : {}),
      ...(body?.code ? { code: body.code } : {}),
    };
  } catch (err) {
    return {
      ok: false,
      message: (err as Error).message,
      log: [],
    };
  }
}

export async function upgradePlugin(id: string): Promise<PluginInstallOutcome> {
  const log: string[] = [];
  try {
    const resp = await fetch(`/api/plugins/${encodeURIComponent(id)}/upgrade`, {
      method: 'POST',
    });
    if (!resp.ok) {
      const message = await readErrorMessage(resp);
      return { ok: false, warnings: [], message, log };
    }
    if (!resp.body) {
      return {
        ok: false,
        warnings: [],
        message: 'Upgrade stream did not start.',
        log,
      };
    }
    let success: InstalledPluginRecord | undefined;
    let warnings: string[] = [];
    let errorMessage: string | undefined;
    for await (const ev of readServerSentEvents(resp.body)) {
      if (ev.message) log.push(ev.message);
      if (ev.warnings) warnings = ev.warnings;
      if (ev.kind === 'success') success = ev.plugin;
      if (ev.kind === 'error') errorMessage = ev.message ?? 'Upgrade failed.';
    }
    return {
      ok: Boolean(success) && !errorMessage,
      plugin: success,
      warnings,
      message: errorMessage ?? (success ? `Upgraded ${success.title}.` : 'Upgrade finished.'),
      log,
    };
  } catch (err) {
    return {
      ok: false,
      warnings: [],
      message: (err as Error).message,
      log,
    };
  }
}

async function postPluginUpload(url: string, form: FormData): Promise<PluginInstallOutcome> {
  try {
    const resp = await fetch(url, {
      method: 'POST',
      body: form,
    });
    const json = (await resp.json()) as Partial<PluginInstallOutcome> & {
      error?: string | { message?: string };
    };
    if (resp.ok && json.ok) {
      return {
        ok: true,
        plugin: json.plugin,
        warnings: json.warnings ?? [],
        message: json.message ?? 'Plugin installed.',
        log: json.log ?? [],
      };
    }
    const message =
      json.message ??
      (typeof json.error === 'string' ? json.error : json.error?.message) ??
      resp.statusText;
    return {
      ok: false,
      warnings: json.warnings ?? [],
      message,
      log: json.log ?? [],
    };
  } catch (err) {
    return {
      ok: false,
      warnings: [],
      message: (err as Error).message,
      log: [],
    };
  }
}

async function readPluginInstallOutcome(resp: Response): Promise<PluginInstallOutcome> {
  const json = (await resp.json()) as Partial<PluginInstallOutcome> & {
    error?: string | { message?: string };
  };
  if (resp.ok && json.ok) {
    return {
      ok: true,
      ...(json.plugin ? { plugin: json.plugin } : {}),
      warnings: json.warnings ?? [],
      message: json.message ?? 'Plugin installed.',
      log: json.log ?? [],
    };
  }
  const message =
    json.message ??
    (typeof json.error === 'string' ? json.error : json.error?.message) ??
    resp.statusText;
  return {
    ok: false,
    ...(json.plugin ? { plugin: json.plugin } : {}),
    warnings: json.warnings ?? [],
    message,
    log: json.log ?? [],
  };
}

function getUploadRelativePath(file: File): string {
  const withRelativePath = file as File & { webkitRelativePath?: string };
  return withRelativePath.webkitRelativePath || file.name;
}

export async function uninstallPlugin(id: string): Promise<boolean> {
  try {
    const resp = await fetch(`/api/plugins/${encodeURIComponent(id)}/uninstall`, {
      method: 'POST',
    });
    return resp.ok;
  } catch {
    return false;
  }
}

export interface PluginMarketplace {
  id: string;
  url: string;
  trust: PluginMarketplaceTrust;
  specVersion?: string;
  version?: string;
  addedAt?: number;
  refreshedAt?: number;
  manifest: {
    name?: string;
    version?: string;
    plugins?: PluginMarketplaceEntry[];
  };
}

export type PluginMarketplaceTrust = 'official' | 'trusted' | 'restricted';

export interface PluginMarketplaceEntry {
  name: string;
  source: string;
  version?: string;
  ref?: string;
  dist?: {
    type?: string;
    archive?: string;
    integrity?: string;
    manifestDigest?: string;
  };
  versions?: Array<{
    version: string;
    source?: string;
    ref?: string;
    dist?: {
      type?: string;
      archive?: string;
      integrity?: string;
      manifestDigest?: string;
    };
    integrity?: string;
    manifestDigest?: string;
    deprecated?: boolean | string;
    yanked?: boolean;
    yankedAt?: string;
    yankReason?: string;
  }>;
  distTags?: Record<string, string>;
  integrity?: string;
  manifestDigest?: string;
  publisher?: {
    id?: string;
    github?: string;
    url?: string;
  };
  homepage?: string;
  license?: string;
  permissions?: string[];
  capabilitiesSummary?: string[];
  deprecated?: boolean | string;
  yanked?: boolean;
  yankedAt?: string;
  yankReason?: string;
  tags?: string[];
  title?: string;
  title_i18n?: Record<string, string>;
  description?: string;
  description_i18n?: Record<string, string>;
  icon?: string;
}

export interface PluginMarketplaceMutationOutcome {
  ok: boolean;
  marketplace?: PluginMarketplace;
  message: string;
}

export async function listPluginMarketplaces(): Promise<PluginMarketplace[]> {
  try {
    const resp = await fetch('/api/marketplaces');
    if (!resp.ok) return [];
    const json = (await resp.json()) as { marketplaces?: PluginMarketplace[] };
    return json.marketplaces ?? [];
  } catch {
    return [];
  }
}

export async function addPluginMarketplace(input: {
  url: string;
  trust: PluginMarketplaceTrust;
}): Promise<PluginMarketplaceMutationOutcome> {
  try {
    const resp = await fetch('/api/marketplaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return readPluginMarketplaceOutcome(resp, 'Marketplace source added.');
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

export async function refreshPluginMarketplace(
  id: string,
): Promise<PluginMarketplaceMutationOutcome> {
  try {
    const resp = await fetch(`/api/marketplaces/${encodeURIComponent(id)}/refresh`, {
      method: 'POST',
    });
    return readPluginMarketplaceOutcome(resp, 'Marketplace source refreshed.');
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

export async function removePluginMarketplace(
  id: string,
): Promise<PluginMarketplaceMutationOutcome> {
  try {
    const resp = await fetch(`/api/marketplaces/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!resp.ok) {
      return { ok: false, message: await readErrorMessage(resp) };
    }
    return { ok: true, message: 'Marketplace source removed.' };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

export async function setPluginMarketplaceTrust(
  id: string,
  trust: PluginMarketplaceTrust,
): Promise<PluginMarketplaceMutationOutcome> {
  try {
    const resp = await fetch(`/api/marketplaces/${encodeURIComponent(id)}/trust`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trust }),
    });
    return readPluginMarketplaceOutcome(resp, 'Marketplace trust updated.');
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

async function readPluginMarketplaceOutcome(
  resp: Response,
  successMessage: string,
): Promise<PluginMarketplaceMutationOutcome> {
  if (!resp.ok) {
    return { ok: false, message: await readErrorMessage(resp) };
  }
  const marketplace = (await resp.json().catch(() => null)) as PluginMarketplace | null;
  return {
    ok: true,
    ...(marketplace ? { marketplace } : {}),
    message: successMessage,
  };
}

export async function applyPlugin(
  pluginId: string,
  options: {
    inputs?: Record<string, unknown>;
    projectId?: string;
    grantCaps?: string[];
    locale?: string;
  } = {},
): Promise<ApplyResult | null> {
  try {
    const resp = await fetch(
      `/api/plugins/${encodeURIComponent(pluginId)}/apply`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputs: options.inputs ?? {},
          projectId: options.projectId,
          grantCaps: options.grantCaps ?? [],
          locale: options.locale,
        }),
      },
    );
    if (!resp.ok) return null;
    const json = (await resp.json()) as ApplyResult & { ok?: boolean };
    return json;
  } catch {
    return null;
  }
}

async function readErrorMessage(resp: Response): Promise<string> {
  try {
    const json = (await resp.json()) as {
      error?: string | { message?: string; data?: { errors?: unknown } };
      errors?: unknown;
      message?: string;
    };
    const message =
      json.message ??
      (typeof json.error === 'string' ? json.error : json.error?.message);
    const details = extractErrorDetails(
      typeof json.error === 'object' ? json.error.data?.errors : undefined,
      json.errors,
    );
    if (message && details.length > 0) return `${message}: ${details.join('; ')}`;
    if (message) return message;
  } catch {
    // Fall through to the status text below.
  }
  return resp.statusText || `HTTP ${resp.status}`;
}

function extractErrorDetails(...values: unknown[]): string[] {
  return values.flatMap((value) => {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
      if (typeof item === 'string' && item.trim()) return [item.trim()];
      if (item && typeof item === 'object' && 'message' in item) {
        const message = (item as { message?: unknown }).message;
        if (typeof message === 'string' && message.trim()) return [message.trim()];
      }
      return [];
    });
  });
}

async function* readServerSentEvents(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<PluginInstallEvent, void, void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split(/\n\n/);
      buffer = parts.pop() ?? '';
      for (const part of parts) {
        const event = parseServerSentEvent(part);
        if (event) yield event;
      }
    }
    buffer += decoder.decode();
    const event = parseServerSentEvent(buffer);
    if (event) yield event;
  } finally {
    reader.releaseLock();
  }
}

function parseServerSentEvent(raw: string): PluginInstallEvent | null {
  const data = raw
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n');
  if (!data) return null;
  try {
    return JSON.parse(data) as PluginInstallEvent;
  } catch {
    return null;
  }
}

// Fetch the immutable snapshot pinned to a project / conversation.
// Used by ProjectView to surface the active plugin as a context chip
// on user messages instead of re-rendering the inline plugin rail
// (the user already picked a plugin on Home — re-prompting is noise).
export async function fetchAppliedPluginSnapshot(
  snapshotId: string,
): Promise<AppliedPluginSnapshot | null> {
  try {
    const resp = await fetch(
      `/api/applied-plugins/${encodeURIComponent(snapshotId)}`,
    );
    if (!resp.ok) return null;
    return (await resp.json()) as AppliedPluginSnapshot;
  } catch {
    return null;
  }
}

// Render the brief that the composer should display for the active
// applied plugin. Substitutes `{{var}}` placeholders inside
// useCase.query against the user-supplied inputs map; missing values
// stay as `{{var}}` so the gating "fill required" hint stays visible.
export function renderPluginBriefTemplate(
  template: string,
  inputs: Record<string, unknown>,
): string {
  return template.replace(/\{\{\s*([a-zA-Z_][\w-]*)\s*\}\}/g, (full, key) => {
    if (key in inputs) {
      const v = inputs[key];
      if (v === undefined || v === null || v === '') return full;
      return String(v);
    }
    return full;
  });
}

export function resolvePluginQueryFallback(
  value: unknown,
  locale?: string,
  fallbackLocale: string = 'en',
): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (!isStringMap(value)) return '';

  const candidates = [
    locale,
    locale?.split('-')[0],
    fallbackLocale,
    fallbackLocale.split('-')[0],
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    const resolved = value[candidate];
    if (typeof resolved === 'string' && resolved.length > 0) return resolved;
  }

  return Object.values(value).find((entry) => entry.length > 0) ?? '';
}

function isStringMap(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value).every((entry) => typeof entry === 'string');
}
