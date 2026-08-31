import type { ArtifactManifest } from './artifacts.js';
import type { OkResponse } from '../common.js';
import type { ProjectFile } from './files.js';

export type FileRevisionSource =
  | 'manual_edit'
  | 'inspect'
  | 'agent_element_patch'
  | 'agent_deck_patch'
  | 'agent_full_deck'
  | 'import'
  | 'restore';

export interface FileRevision {
  id: string;
  projectId: string;
  fileName: string;
  parentRevisionId: string | null;
  sequence: number;
  createdAt: number;
  byteSize: number;
  source: FileRevisionSource;
  label: string;
  conversationId?: string;
  assistantMessageId?: string;
}

/** GET /api/projects/:id/files/:name/revisions */
export interface FileRevisionsListResponse {
  revisions: FileRevision[];
  headRevisionId: string | null;
  /** Server-side retention cap for this file (matches OD_FILE_REVISION_RETENTION_LIMIT). */
  retentionLimit: number;
  /** True when count retention sweep is still draining rows over the cap. */
  retentionPending?: boolean;
}

/** GET /api/projects/:id/files/:name/revisions/:revId */
export interface FileRevisionContentResponse {
  revision: FileRevision;
  content: string;
}

/** POST /api/projects/:id/files/:name/revisions */
export interface FileRevisionPushRequest {
  content: string;
  source: FileRevisionSource;
  label: string;
  artifactManifest?: ArtifactManifest | null;
  conversationId?: string;
  assistantMessageId?: string;
  /** When set, revisions with sequence greater than this are pruned before push. */
  truncateAfterSequence?: number;
  /**
   * Clone LOOK → fill intentionally replaces a large template seed with a
   * compact content deck. When true, daemon stub-guard must not reject the
   * smaller fill as ARTIFACT_REGRESSION.
   */
  skipArtifactStubGuard?: boolean;
  /**
   * Teamver embed must not keep warn-mode overwrite (루프268). When true and
   * env mode is `warn`, daemon upgrades the stub-guard outcome to `reject`
   * so a placeholder cannot replace a real deck on disk.
   */
  forceArtifactStubGuardReject?: boolean;
}

export interface FileRevisionPushResponse {
  revision: FileRevision;
  file: ProjectFile;
}

/** POST /api/projects/:id/files/:name/revisions/:revId/restore */
export interface FileRevisionRestoreResponse {
  revision: FileRevision;
  file: ProjectFile;
}

export type FileRevisionDeleteResponse = OkResponse;

/** Default max revisions retained per file; daemon may override via `OD_FILE_REVISION_RETENTION_LIMIT`. */
export const FILE_REVISION_RETENTION_LIMIT_DEFAULT = 30;

/**
 * Hot in-browser cache for undo/redo neighbors only — much smaller than server
 * retention. Covers cursor + undo/redo targets + a few rapid ⌘Z steps.
 */
export const REVISION_CONTENT_CACHE_MAX_ENTRIES_PER_FILE_DEFAULT = 8;

/** Skip caching a single revision snapshot larger than this (bytes). */
export const REVISION_CONTENT_CACHE_MAX_ENTRY_BYTES_DEFAULT = 4 * 1024 * 1024;

/** Evict LRU entries when per-file cached revision bytes exceed this budget. */
export const REVISION_CONTENT_CACHE_MAX_BYTES_PER_FILE_DEFAULT = 16 * 1024 * 1024;

/** Soft per-snapshot target: pushes prune oldest history instead of failing when exceeded. */
export const FILE_REVISION_MAX_SNAPSHOT_BYTES_DEFAULT = 8 * 1024 * 1024;

/**
 * Max total compressed snapshot bytes stored in DaemonDb (0 = use soft per-snapshot target).
 * When exceeded, oldest revisions are pruned globally before new pushes.
 */
export const FILE_REVISION_MAX_TOTAL_BYTES_DEFAULT = 0;
