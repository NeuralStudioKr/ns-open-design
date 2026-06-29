import { TERMINAL_RUN_STATUSES } from './runs.js';
import {
  scanRunEventsForUsageAnalytics,
  extractLastStopReasonFromRunEvents,
  type RunEventForAnalyticsObservability,
} from './run-analytics-observability.js';
import { teamverDesignApiBaseUrl } from './teamver-project-access.js';
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
      if (response.ok) return { ok: true, json };
      return { ok: false, status: response.status, text: text.slice(0, 200), json };
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

  if (result.ok) return { ok: true, json: result.json };

  emitUsage5xxMarker(stage, {
    ...markerFields,
    ...(result.status != null ? { httpStatus: result.status } : {}),
    ...(result.text ? { body: result.text, error: result.status == null ? result.text : undefined } : {}),
  });
  return { ok: false, json: result.json };
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
  return {
    usageId:
      typeof posted.json.usage_id === 'string' && posted.json.usage_id.trim()
        ? posted.json.usage_id.trim()
        : null,
    billingStatus,
    creditsCommitted: posted.json.credits_committed === true,
    creditsAmountT:
      typeof posted.json.credits_amount_t === 'number' && posted.json.credits_amount_t >= 0
        ? posted.json.credits_amount_t
        : undefined,
  };
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

  const runEvents = chatMessageEventsToRunAnalyticsEvents(message.events);
  const usage = scanRunEventsForUsageAnalytics(runEvents, defaultByokModelName(), 0);
  const modelName =
    usage.agent_reported_model?.trim() || defaultByokModelName();
  const runStatus = message.runStatus ?? '';
  const tokenCountSource = usage.token_count_source ?? 'unknown';
  const inputTokens = usage.input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  const stopReason = extractLastStopReasonFromRunEvents(runEvents);
  const latencyMs =
    typeof message.startedAt === 'number'
    && typeof message.endedAt === 'number'
    && message.endedAt >= message.startedAt
      ? Math.round(message.endedAt - message.startedAt)
      : null;

  let resolvedApiProtocol = 'byok-proxy';
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
    inputTokens === 0
    && outputTokens === 0
    && (usage.cache_read_input_tokens ?? 0) === 0
    && (usage.cache_creation_input_tokens ?? 0) === 0
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
    cacheReadInputTokens: usage.cache_read_input_tokens,
    cacheCreationInputTokens: usage.cache_creation_input_tokens,
    providerReportedModel: usage.agent_reported_model ?? undefined,
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
      cache_read_input_tokens: usage.cache_read_input_tokens ?? null,
      cache_creation_input_tokens: usage.cache_creation_input_tokens ?? null,
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
}
