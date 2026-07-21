import type { Request } from 'express';
import { TERMINAL_RUN_STATUSES } from './runs.js';
import {
  scanRunEventsForUsageAnalytics,
  extractLastStopReasonFromRunEvents,
  type RunEventForAnalyticsObservability,
} from './run-analytics-observability.js';
import {
  readTeamverIdentityFromRequest,
  teamverDesignApiBaseUrl,
} from './teamver-project-access.js';
import type { TeamverRequestIdentity } from './teamver-project-access.js';

type ChatMessageEvent = {
  kind?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
  model?: string;
  stopReason?: string;
  apiProtocol?: string;
  latencyMs?: number;
  label?: string;
  detail?: string;
};

type PersistedAssistantMessage = {
  id: string;
  role?: string;
  runId?: string | null;
  runStatus?: string;
  startedAt?: number;
  endedAt?: number;
  events?: ChatMessageEvent[];
};

function teamverInternalApiKey(): string | null {
  const key = (process.env.TEAMVER_INTERNAL_API_KEY ?? '').trim();
  return key || null;
}

function defaultByokModelName(): string {
  return (process.env.TEAMVER_OD_API_MODEL ?? '').trim() || 'unknown';
}

function emitUsage5xxMarker(stage: string, fields: Record<string, unknown>): void {
  try {
    console.warn(
      JSON.stringify({
        metric: 'teamver_usage_5xx',
        stage,
        ts: Date.now(),
        ...fields,
      }),
    );
  } catch {
    // best-effort observability
  }
}

function emitUsageZeroTokensMarker(fields: Record<string, unknown>): void {
  try {
    console.warn(
      JSON.stringify({
        metric: 'teamver_usage_zero_tokens',
        stage: 'byok.usage.zero_tokens',
        ts: Date.now(),
        ...fields,
      }),
    );
  } catch {
    // best-effort observability
  }
}

function isRetryableHttpStatus(status: number): boolean {
  return status >= 500 || status === 429;
}

async function postInternalJson(
  path: string,
  body: Record<string, unknown>,
  markerFields: Record<string, unknown>,
  stage: string,
): Promise<{ ok: boolean; json?: Record<string, unknown> }> {
  const baseUrl = teamverDesignApiBaseUrl();
  const apiKey = teamverInternalApiKey();
  if (!baseUrl || !apiKey) return { ok: false };

  const url = `${baseUrl}${path}`;
  const headers = {
    'X-Teamver-Internal-Api-Key': apiKey,
    'Content-Type': 'application/json',
  };

  const attempt = async (): Promise<{ ok: boolean; json?: Record<string, unknown>; status?: number; text?: string }> => {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5_000),
      });
      const text = await response.text().catch(() => '');
      let json: Record<string, unknown> | undefined;
      if (text) {
        try {
          json = JSON.parse(text) as Record<string, unknown>;
        } catch {
          json = undefined;
        }
      }
      if (response.ok) {
        return json != null ? { ok: true as const, json } : { ok: true as const };
      }
      return json != null
        ? { ok: false as const, status: response.status, text: text.slice(0, 200), json }
        : { ok: false as const, status: response.status, text: text.slice(0, 200) };
    } catch (err) {
      return {
        ok: false,
        text: err instanceof Error ? err.message : String(err),
      };
    }
  };

  let result = await attempt();
  if (!result.ok && result.status != null && isRetryableHttpStatus(result.status)) {
    result = await attempt();
  } else if (!result.ok && result.status == null) {
    result = await attempt();
  }

  if (result.ok) {
    return result.json != null ? { ok: true, json: result.json } : { ok: true };
  }

  emitUsage5xxMarker(stage, {
    ...markerFields,
    ...(result.status != null ? { httpStatus: result.status } : {}),
    ...(result.text ? { body: result.text, error: result.status == null ? result.text : undefined } : {}),
  });
  return result.json != null ? { ok: false, json: result.json } : { ok: false };
}

/** Map persisted chat `message.events` (`kind`) to run-analytics wire shape (`event`). */
export function chatMessageEventsToRunAnalyticsEvents(
  events: ChatMessageEvent[] | undefined,
): RunEventForAnalyticsObservability[] {
  return (events ?? []).map((ev) => {
    if (ev?.kind === 'usage') {
      return {
        event: 'usage',
        data: {
          input_tokens: ev.inputTokens,
          output_tokens: ev.outputTokens,
          cache_read_input_tokens: ev.cacheReadInputTokens,
          cache_creation_input_tokens: ev.cacheCreationInputTokens,
          model: ev.model,
          stop_reason: ev.stopReason,
          api_protocol: ev.apiProtocol,
          latency_ms: ev.latencyMs,
        },
      };
    }
    if (ev?.kind === 'status') {
      return {
        event: 'agent',
        data: {
          type: 'status',
          label: ev.label,
          detail: ev.detail,
          model: ev.detail,
        },
      };
    }
    return {
      event: 'agent',
      data: { type: ev?.kind ?? 'unknown', ...ev },
    };
  });
}

export function shouldReportByokUsageFromMessage(
  saved: PersistedAssistantMessage | null | undefined,
  body: { telemetryFinalized?: boolean } = {},
): boolean {
  return Boolean(
    saved &&
      saved.role === 'assistant' &&
      !saved.runId?.trim() &&
      typeof saved.runStatus === 'string' &&
      TERMINAL_RUN_STATUSES.has(saved.runStatus) &&
      body?.telemetryFinalized === true,
  );
}

type ByokBillingFinalizeResult = {
  usageId: string | null;
  billingStatus: string;
  creditsCommitted: boolean;
  creditsAmountT?: number;
};

async function finalizeByokBillingFromDaemon(args: {
  workspaceId: string;
  runId: string;
  runStatus: string;
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  tokenCountSource: string;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
  providerReportedModel?: string;
}): Promise<ByokBillingFinalizeResult | null> {
  if (args.runStatus !== 'succeeded') return null;

  const markerFields = {
    workspaceId: args.workspaceId,
    runId: args.runId,
    modelName: args.modelName,
  };

  const posted = await postInternalJson(
    '/api/internal/billing/finalize-byok-run',
    {
      workspace_id: args.workspaceId,
      run_id: args.runId,
      run_status: args.runStatus,
      model_name: args.modelName,
      input_tokens: args.inputTokens,
      output_tokens: args.outputTokens,
      token_count_source: args.tokenCountSource,
      ...(args.cacheReadInputTokens != null && args.cacheReadInputTokens > 0
        ? { cache_read_input_tokens: args.cacheReadInputTokens }
        : {}),
      ...(args.cacheCreationInputTokens != null && args.cacheCreationInputTokens > 0
        ? { cache_creation_input_tokens: args.cacheCreationInputTokens }
        : {}),
      ...(args.providerReportedModel
        ? { provider_reported_model: args.providerReportedModel }
        : {}),
    },
    markerFields,
    'billing.finalize_byok_run',
  );

  if (!posted.ok || !posted.json) return null;

  const billingStatus =
    typeof posted.json.billing_status === 'string' ? posted.json.billing_status : 'not_attempted';
  const businessOk = posted.json.ok !== false;
  if (!businessOk && billingStatus === 'not_attempted') {
    emitUsage5xxMarker('billing.finalize_byok_run', {
      ...markerFields,
      billingStatus,
      error: typeof posted.json.error === 'string' ? posted.json.error : 'finalize_failed',
    });
  }
  return {
    usageId:
      typeof posted.json.usage_id === 'string' && posted.json.usage_id.trim()
        ? posted.json.usage_id.trim()
        : null,
    billingStatus,
    creditsCommitted: posted.json.credits_committed === true,
    ...(typeof posted.json.credits_amount_t === 'number' && posted.json.credits_amount_t >= 0
      ? { creditsAmountT: posted.json.credits_amount_t }
      : {}),
  };
}

const inFlightByokReports = new Set<string>();

const DEFAULT_BYOK_BILLING_STAGE_TTL_MS = 10 * 60 * 1000;

export type ByokProxyUsageStagePayload = {
  inputTokens: number;
  outputTokens: number;
  model?: string;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
  stopReason?: string;
  apiProtocol?: string;
  latencyMs?: number;
};

export type ByokProxyUsageStager = (usage: ByokProxyUsageStagePayload) => void;

type StagedByokProxyUsage = ByokProxyUsageStagePayload & {
  projectId: string;
  identity: TeamverRequestIdentity;
  ts: number;
};

const stagedByokProxyUsage = new Map<string, StagedByokProxyUsage>();
let byokBillingStageReaper: ReturnType<typeof setInterval> | null = null;

type BillingOrphanAdminRecord = {
  messageId: string;
  projectId: string;
  workspaceId: string;
  stagedAt: number;
  queuedAt: number;
  inputTokens: number;
  outputTokens: number;
};

const billingOrphanAdminQueue: BillingOrphanAdminRecord[] = [];
const MAX_BILLING_ORPHAN_ADMIN_QUEUE = 200;

function enqueueBillingOrphanAdminRecord(messageId: string, entry: StagedByokProxyUsage): void {
  billingOrphanAdminQueue.push({
    messageId,
    projectId: entry.projectId,
    workspaceId: entry.identity.workspaceId,
    stagedAt: entry.ts,
    queuedAt: Date.now(),
    inputTokens: entry.inputTokens,
    outputTokens: entry.outputTokens,
  });
  if (billingOrphanAdminQueue.length > MAX_BILLING_ORPHAN_ADMIN_QUEUE) {
    billingOrphanAdminQueue.shift();
  }
}

function byokBillingStageTtlMs(): number {
  const parsed = Number(process.env.OD_BYOK_BILLING_STAGE_TTL_MS ?? '');
  return Number.isFinite(parsed) && parsed > 0
    ? Math.floor(parsed)
    : DEFAULT_BYOK_BILLING_STAGE_TTL_MS;
}

function emitByokBillingOrphanUsageMarker(messageId: string, entry: StagedByokProxyUsage): void {
  try {
    console.warn(
      JSON.stringify({
        metric: 'od_byok_billing_orphan_usage',
        messageId,
        projectId: entry.projectId,
        workspaceId: entry.identity.workspaceId,
        ts: Date.now(),
        stagedAt: entry.ts,
        inputTokens: entry.inputTokens,
        outputTokens: entry.outputTokens,
      }),
    );
  } catch {
    // best-effort observability
  }
}

function sweepExpiredByokBillingStages(): void {
  const ttl = byokBillingStageTtlMs();
  const now = Date.now();
  let swept = 0;
  for (const [messageId, entry] of stagedByokProxyUsage) {
    if (now - entry.ts > ttl) {
      stagedByokProxyUsage.delete(messageId);
      emitByokBillingOrphanUsageMarker(messageId, entry);
      enqueueBillingOrphanAdminRecord(messageId, entry);
      swept += 1;
    }
  }
  if (swept > 0) {
    console.warn(
      JSON.stringify({
        metric: 'od_byok_billing_reaper_sweep',
        swept,
        queueDepth: billingOrphanAdminQueue.length,
        ts: now,
      }),
    );
  }
}

function ensureByokBillingStageReaper(): void {
  if (byokBillingStageReaper) return;
  byokBillingStageReaper = setInterval(sweepExpiredByokBillingStages, 60_000);
  byokBillingStageReaper.unref?.();
}

/** Daemon-side billing reconciliation (PR1 §3.6 Phase A). */
export function createByokProxyUsageBillingStager(
  req: Request,
  proxyBody: Record<string, unknown> | null | undefined,
): ByokProxyUsageStager | undefined {
  const messageId =
    typeof proxyBody?.assistantMessageId === 'string'
      ? proxyBody.assistantMessageId.trim()
      : '';
  const projectId =
    typeof proxyBody?.projectId === 'string' ? proxyBody.projectId.trim() : '';
  const identity = readTeamverIdentityFromRequest(req);
  if (!messageId || !projectId || !identity?.userId.trim() || !identity.workspaceId.trim()) {
    return undefined;
  }
  if (!teamverDesignApiBaseUrl() || !teamverInternalApiKey()) {
    return undefined;
  }
  const modelFromBody =
    typeof proxyBody?.model === 'string' ? proxyBody.model.trim() : '';
  // Seed intended model before any usage SSE — embed BYOK runs that fail
  // during materialization (502 before upstream) still need a real
  // model_name in ai_model_token_usages instead of `unknown`.
  // Soft-retry re-POSTs with the same assistantMessageId: preserve any
  // tokens already staged from a prior attempt so a second failure before
  // usage does not wipe billed amounts to 0.
  if (modelFromBody) {
    ensureByokBillingStageReaper();
    const existing = stagedByokProxyUsage.get(messageId);
    stagedByokProxyUsage.set(messageId, {
      projectId,
      identity,
      inputTokens: existing?.inputTokens ?? 0,
      outputTokens: existing?.outputTokens ?? 0,
      model: modelFromBody,
      ts: Date.now(),
    });
  }
  return (usage) => {
    ensureByokBillingStageReaper();
    stagedByokProxyUsage.set(messageId, {
      projectId,
      identity,
      ...usage,
      ts: Date.now(),
    });
  };
}

function consumeStagedByokProxyUsage(messageId: string): StagedByokProxyUsage | undefined {
  const entry = stagedByokProxyUsage.get(messageId);
  if (!entry) return undefined;
  stagedByokProxyUsage.delete(messageId);
  return entry;
}

/** @internal vitest — reset concurrent guard between cases. */
export function resetByokInFlightReportsForTests(): void {
  inFlightByokReports.clear();
}

/** @internal vitest — reset billing staging map + reaper between cases. */
export function resetByokBillingStagingForTests(): void {
  stagedByokProxyUsage.clear();
  billingOrphanAdminQueue.length = 0;
  if (byokBillingStageReaper) {
    clearInterval(byokBillingStageReaper);
    byokBillingStageReaper = null;
  }
}

/** @internal vitest — inspect reaper admin queue depth. */
export function peekBillingOrphanAdminQueueForTests(): readonly BillingOrphanAdminRecord[] {
  return billingOrphanAdminQueue;
}

/** @internal vitest — inspect staged usage without consuming. */
export function peekStagedByokProxyUsageForTests(messageId: string): StagedByokProxyUsage | undefined {
  return stagedByokProxyUsage.get(messageId);
}

/** @internal vitest — force TTL sweep (orphan markers). */
export function sweepExpiredByokBillingStagesForTests(): void {
  sweepExpiredByokBillingStages();
}


/** Embed BYOK — usage ledger + Strategy B billing on terminal message PUT (§4.11). */
export async function reportByokTeamverUsageAndBillingFromDaemon({
  message,
  projectId,
  identity,
  reportedRuns,
}: {
  message: PersistedAssistantMessage;
  projectId: string;
  identity: TeamverRequestIdentity;
  reportedRuns?: Set<string>;
}): Promise<boolean> {
  if (!teamverDesignApiBaseUrl() || !teamverInternalApiKey()) return false;

  const runId = message.id.trim();
  const workspaceId = identity.workspaceId.trim();
  if (!runId || !workspaceId || !identity.userId.trim()) return false;

  const dedupeKey = `byok:${runId}`;
  if (reportedRuns?.has(dedupeKey)) return true;
  if (inFlightByokReports.has(dedupeKey)) return true;

  inFlightByokReports.add(dedupeKey);
  try {
    const staged = consumeStagedByokProxyUsage(runId);

    const runEvents = chatMessageEventsToRunAnalyticsEvents(message.events);
    const usage = scanRunEventsForUsageAnalytics(runEvents, defaultByokModelName(), 0);
    let modelName =
      usage.agent_reported_model?.trim() || staged?.model?.trim() || defaultByokModelName();
    const runStatus = message.runStatus ?? '';
    let tokenCountSource = usage.token_count_source ?? 'unknown';
    let inputTokens = usage.input_tokens ?? 0;
    let outputTokens = usage.output_tokens ?? 0;
    let stopReason = extractLastStopReasonFromRunEvents(runEvents);
    let latencyMs =
      typeof message.startedAt === 'number'
      && typeof message.endedAt === 'number'
      && message.endedAt >= message.startedAt
        ? Math.round(message.endedAt - message.startedAt)
        : null;

    let resolvedApiProtocol = staged?.apiProtocol ?? 'byok-proxy';
    for (let i = runEvents.length - 1; i >= 0; i -= 1) {
      const ev = runEvents[i];
      if (ev?.event !== 'usage') continue;
      const protocol = (ev.data as { api_protocol?: string } | undefined)?.api_protocol?.trim();
      if (protocol) {
        resolvedApiProtocol = protocol;
        break;
      }
    }

    if (
      staged
      && inputTokens === 0
      && outputTokens === 0
      && (usage.cache_read_input_tokens ?? 0) === 0
      && (usage.cache_creation_input_tokens ?? 0) === 0
    ) {
      inputTokens = staged.inputTokens;
      outputTokens = staged.outputTokens;
      tokenCountSource = 'proxy_sse_staged';
      if (staged.stopReason && !stopReason) stopReason = staged.stopReason;
      if (staged.latencyMs != null && latencyMs == null) latencyMs = staged.latencyMs;
      if (staged.apiProtocol) resolvedApiProtocol = staged.apiProtocol;
    }

    const cacheReadInputTokens =
      (usage.cache_read_input_tokens ?? 0) > 0
        ? usage.cache_read_input_tokens
        : staged?.cacheReadInputTokens;
    const cacheCreationInputTokens =
      (usage.cache_creation_input_tokens ?? 0) > 0
        ? usage.cache_creation_input_tokens
        : staged?.cacheCreationInputTokens;

    if (
      inputTokens === 0
      && outputTokens === 0
      && (cacheReadInputTokens ?? 0) === 0
      && (cacheCreationInputTokens ?? 0) === 0
    ) {
      emitUsageZeroTokensMarker({
        workspaceId,
        projectId,
        runId,
        modelName,
        runStatus,
        tokenCountSource,
        eventCount: message.events?.length ?? 0,
      });
    }

    const billing = await finalizeByokBillingFromDaemon({
      workspaceId,
      runId,
      runStatus,
      modelName,
      inputTokens,
      outputTokens,
      tokenCountSource,
      ...(cacheReadInputTokens != null && cacheReadInputTokens > 0
        ? { cacheReadInputTokens }
        : {}),
      ...(cacheCreationInputTokens != null && cacheCreationInputTokens > 0
        ? { cacheCreationInputTokens }
        : {}),
      ...(usage.agent_reported_model?.trim()
        ? { providerReportedModel: usage.agent_reported_model.trim() }
        : {}),
    });

    const markerFields = {
      runId,
      workspaceId,
      projectId,
      modelName,
    };

    const usagePosted = await postInternalJson(
    '/api/internal/usage/events',
    {
      user_id: identity.userId.trim(),
      workspace_id: workspaceId,
      model_name: modelName,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: usage.total_tokens ?? null,
      operation: 'design_run',
      project_id: projectId,
      run_id: runId,
      run_status: runStatus || null,
      token_count_source: tokenCountSource,
      registry_usage_id: billing?.usageId ?? null,
      billing_status: billing?.billingStatus ?? 'not_attempted',
      credits_committed: billing?.creditsCommitted ?? false,
      credits_amount_t: billing?.creditsAmountT ?? null,
      cache_read_input_tokens: cacheReadInputTokens ?? null,
      cache_creation_input_tokens: cacheCreationInputTokens ?? null,
      provider_reported_model: usage.agent_reported_model ?? null,
      api_protocol: resolvedApiProtocol,
      latency_ms: latencyMs,
      stop_reason: stopReason,
    },
    markerFields,
    'byok.usage.events',
  );

    if (usagePosted.ok) {
      reportedRuns?.add(dedupeKey);
      return true;
    }
    return false;
  } finally {
    inFlightByokReports.delete(dedupeKey);
  }
}
