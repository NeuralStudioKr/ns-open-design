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
