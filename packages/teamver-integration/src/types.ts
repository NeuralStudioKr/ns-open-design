import type { ChatRunStatus } from '@open-design/contracts';
import type { ProjectExportManifestResponse } from '@open-design/contracts';

export interface OdDaemonClientOptions {
  /** Daemon base URL, e.g. http://127.0.0.1:7456 */
  baseUrl?: string;
  /** Bearer token when daemon is not bound to loopback (OD_API_TOKEN). */
  apiToken?: string;
  fetchImpl?: typeof fetch;
}

export interface GenerateDesignArtifactInput {
  prompt: string;
  /** Open Design skill id, e.g. `frontend-design`. Omit for daemon default. */
  skillId?: string | null;
  /** Open Design design system id, e.g. `modern`. Omit for none. */
  designSystemId?: string | null;
  agentId?: string;
  projectName?: string;
}

export interface GenerateDesignArtifactResult {
  projectId: string;
  runId: string;
  conversationId: string | null;
  status: ChatRunStatus;
  exportManifest: ProjectExportManifestResponse | null;
}

export const TERMINAL_RUN_STATUSES = new Set<ChatRunStatus>([
  'succeeded',
  'failed',
  'canceled',
]);
