import type {
  AgentsResponse,
  ChatRunCreateResponse,
  ChatRunStatus,
  ChatRunStatusResponse,
  CreateProjectRequest,
  CreateProjectResponse,
  HealthResponse,
  McpRunCreateRequest,
  ProjectExportManifestResponse,
} from '@open-design/contracts';

import type { OdDaemonClientOptions } from './types.js';
import { TERMINAL_RUN_STATUSES } from './types.js';

export class OdDaemonError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'OdDaemonError';
  }
}

export interface WaitForRunOptions {
  pollIntervalMs?: number;
  timeoutMs?: number;
  onStatus?: (status: ChatRunStatusResponse) => void;
}

const DEFAULT_BASE_URL = 'http://127.0.0.1:7456';

export class OdDaemonClient {
  readonly baseUrl: string;
  private readonly apiToken?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OdDaemonClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.apiToken = options.apiToken;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-od-client': 'teamver-integration',
      ...extra,
    };
    if (this.apiToken) {
      headers.authorization = `Bearer ${this.apiToken}`;
    }
    return headers;
  }

  private async requestJson<T>(
    path: string,
    init?: { method?: string; body?: string; headers?: Record<string, string> },
  ): Promise<{ status: number; body: T }> {
    const resp = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: this.headers(init?.headers),
    });
    let body: T;
    const text = await resp.text();
    try {
      body = text ? (JSON.parse(text) as T) : ({} as T);
    } catch {
      throw new OdDaemonError(
        `Non-JSON response from ${path}: ${text.slice(0, 200)}`,
        resp.status,
      );
    }
    if (!resp.ok) {
      const err = body as { error?: string; code?: string };
      throw new OdDaemonError(
        err.error ?? `Request failed: ${path}`,
        resp.status,
        err.code,
      );
    }
    return { status: resp.status, body };
  }

  async checkHealth(): Promise<HealthResponse> {
    const { body } = await this.requestJson<HealthResponse>('/api/health');
    return body;
  }

  /** Returns false when daemon responds 503 (shutting down). */
  async checkReady(): Promise<boolean> {
    const resp = await this.fetchImpl(`${this.baseUrl}/api/ready`, {
      headers: this.headers(),
    });
    if (resp.status === 503) return false;
    if (!resp.ok) {
      throw new OdDaemonError('Daemon not ready', resp.status);
    }
    return true;
  }

  async listAgents(): Promise<AgentsResponse> {
    const { body } = await this.requestJson<AgentsResponse>('/api/agents');
    return body;
  }

  async createProject(
    request: CreateProjectRequest,
  ): Promise<CreateProjectResponse> {
    const { body } = await this.requestJson<CreateProjectResponse>(
      '/api/projects',
      { method: 'POST', body: JSON.stringify(request) },
    );
    return body;
  }

  async createRun(
    request: McpRunCreateRequest,
  ): Promise<ChatRunCreateResponse> {
    const { status, body } = await this.requestJson<ChatRunCreateResponse>(
      '/api/runs',
      { method: 'POST', body: JSON.stringify(request) },
    );
    if (status !== 202) {
      throw new OdDaemonError('Expected 202 from POST /api/runs', status);
    }
    return body;
  }

  async getRun(runId: string): Promise<ChatRunStatusResponse> {
    const { body } = await this.requestJson<ChatRunStatusResponse>(
      `/api/runs/${encodeURIComponent(runId)}`,
    );
    return body;
  }

  async cancelRun(runId: string): Promise<void> {
    await this.requestJson(`/api/runs/${encodeURIComponent(runId)}/cancel`, {
      method: 'POST',
      body: '{}',
    });
  }

  async waitForRun(
    runId: string,
    options: WaitForRunOptions = {},
  ): Promise<ChatRunStatusResponse> {
    const pollIntervalMs = options.pollIntervalMs ?? 2_000;
    const timeoutMs = options.timeoutMs ?? 90 * 60_000;
    const started = Date.now();

    while (true) {
      const status = await this.getRun(runId);
      options.onStatus?.(status);
      if (TERMINAL_RUN_STATUSES.has(status.status)) {
        return status;
      }
      if (Date.now() - started > timeoutMs) {
        await this.cancelRun(runId).catch(() => undefined);
        throw new OdDaemonError(
          `Run ${runId} timed out after ${timeoutMs}ms`,
          408,
          'RUN_TIMEOUT',
        );
      }
      await sleep(pollIntervalMs);
    }
  }

  async getExportManifest(
    projectId: string,
  ): Promise<ProjectExportManifestResponse> {
    const { body } = await this.requestJson<ProjectExportManifestResponse>(
      `/api/projects/${encodeURIComponent(projectId)}/export/manifest`,
    );
    return body;
  }

  async assertOperational(): Promise<void> {
    await this.checkHealth();
    const ready = await this.checkReady();
    if (!ready) {
      throw new OdDaemonError('Daemon is not ready', 503, 'NOT_READY');
    }
    const agents = await this.listAgents();
    if (!agents.agents?.length) {
      throw new OdDaemonError(
        'No local agent CLI detected',
        503,
        'NO_AGENTS',
      );
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
