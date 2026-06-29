import type { VelaLoginStatus } from './integrations/vela.js';

// AMR account id stamp for daemon-emitted run events. Browser captures get
// `user_id` from the PostHog super-property register (analytics/client.ts);
// daemon-side run_created/run_finished must stamp it at capture time or the
// highest-value generation events stay unjoinable against the AMR project's
// `app_user_id`. Env-configured auth (VELA_RUNTIME_KEY/VELA_LINK_URL) is
// authorized but carries no profile, so it yields no stamp — only
// file-backed sign-in knows the account id.
export function amrUserIdForRunAnalytics(
  status: VelaLoginStatus | null,
): Record<string, string> {
  if (status?.loggedIn !== true) return {};
  const id = status.user?.id?.trim() ?? '';
  return id ? { user_id: id } : {};
}

export interface RunEventForAnalyticsObservability {
  id?: number;
  event: string;
  data: unknown;
  timestamp?: number;
}

export interface RunTelemetryTimestamps {
  startRequestedAt?: number;
  startChatRunStartedAt?: number;
  promptBuildStartAt?: number;
  promptBuildEndAt?: number;
  processSpawnStartedAt?: number;
  processSpawnedAt?: number;
  modelCallStartAt?: number;
  firstTokenAt?: number;
  finalizeStartAt?: number;
}

export interface RunUsageAnalytics {
  input_tokens?: number;
  input_tokens_provider?: number;
  input_tokens_effective?: number;
  output_tokens?: number;
  total_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  uncached_input_tokens?: number;
  estimated_context_tokens?: number;
  cache_hit_ratio?: number;
  cache_token_source: 'anthropic' | 'openai' | 'unavailable';
  /**
   * Provenance of the token counts. Mostly comes from upstream usage
   * frames (`provider_usage`) or our heuristic estimator (`estimated`).
   * `proxy_sse_staged` is used by the embed BYOK billing reconciliation
   * map (`teamver-byok-usage-bridge.ts`) when the terminal message PUT
   * scan returns zero tokens but the proxy stream emitted a usage SSE
   * frame earlier in the same turn — the staged counts are then promoted
   * into the design-api billing finalize payload.
   */
  token_count_source: 'provider_usage' | 'estimated' | 'unknown' | 'proxy_sse_staged';
  agent_reported_model: string | null;
}

export interface RunTimingAnalytics {
  queue_duration_ms?: number;
  pre_spawn_duration_ms?: number;
  process_spawn_duration_ms?: number;
  time_to_first_token_ms?: number;
  spawn_to_first_token_ms?: number;
  generation_duration_ms?: number;
  tool_call_count: number;
  tool_duration_ms?: number;
  finalize_duration_ms?: number;
  total_duration_ms: number;
}

export function hasExplicitRequestedModelForAnalytics(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const model = value.trim();
  return model.length > 0 && model !== 'default';
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function readNestedNumber(
  value: Record<string, unknown>,
  path: string[],
): number | undefined {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return readNumber(current);
}

function firstNumber(
  value: Record<string, unknown>,
  keys: string[],
  nested: string[][] = [],
): number | undefined {
  for (const key of keys) {
    const direct = readNumber(value[key]);
    if (direct !== undefined) return direct;
  }
  for (const path of nested) {
    const found = readNestedNumber(value, path);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** Normalize provider usage payloads (nested usage, top-level BYOK SSE, stats).
 *  Keep in sync with web `normalizeProviderUsagePayload` (usageAttribution.ts). */
export function normalizeUsageTokenCounts(
  payload: unknown,
): { input_tokens: number; output_tokens: number } | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;
  const usagePayload =
    record.usage && typeof record.usage === 'object'
      ? (record.usage as Record<string, unknown>)
      : record.modelUsage && typeof record.modelUsage === 'object'
        ? (record.modelUsage as Record<string, unknown>)
        : record.stats && typeof record.stats === 'object'
          ? (record.stats as Record<string, unknown>)
          : record;
  const inputTokens = firstNumber(usagePayload, ['input_tokens', 'inputTokens', 'prompt_tokens']);
  const outputTokens = firstNumber(usagePayload, ['output_tokens', 'outputTokens', 'completion_tokens']);
  if (inputTokens === undefined && outputTokens === undefined) return null;
  return {
    input_tokens: inputTokens ?? 0,
    output_tokens: outputTokens ?? 0,
  };
}

function durationBetween(
  start: number | undefined,
  end: number | undefined,
): number | undefined {
  if (start === undefined || end === undefined) return undefined;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return undefined;
  if (end < start) return undefined;
  return Math.round(end - start);
}

function applyUsagePayloadToScan(
  usage: Record<string, unknown>,
  state: {
    inputTokens: number | undefined;
    outputTokens: number | undefined;
    providerTotalTokens: number | undefined;
    cacheReadInputTokens: number | undefined;
    cacheCreationInputTokens: number | undefined;
    cacheTokenSource: RunUsageAnalytics['cache_token_source'];
    haveUsageTokens: boolean;
  },
): void {
  const inputTokens = firstNumber(usage, ['input_tokens', 'inputTokens', 'prompt_tokens']);
  const outputTokens = firstNumber(usage, ['output_tokens', 'outputTokens', 'completion_tokens']);
  const providerTotalTokens = firstNumber(usage, ['total_tokens', 'totalTokens']);
  const anthropicCacheReadInputTokens = firstNumber(usage, ['cache_read_input_tokens']);
  const normalizedCachedReadInputTokens = firstNumber(
    usage,
    ['cached_input_tokens', 'cache_read_tokens', 'cached_read_tokens'],
  );
  const openAiCachedInputTokens = readNestedNumber(usage, ['prompt_tokens_details', 'cached_tokens']);
  const cacheReadInputTokens =
    anthropicCacheReadInputTokens ?? normalizedCachedReadInputTokens ?? openAiCachedInputTokens;
  const anthropicCacheCreationInputTokens = firstNumber(
    usage,
    ['cache_creation_input_tokens', 'cache_write_input_tokens', 'cache_creation_tokens'],
    [['cache_creation', 'input_tokens']],
  );
  const normalizedCachedWriteInputTokens = firstNumber(usage, ['cached_write_tokens']);
  const cacheCreationInputTokens =
    anthropicCacheCreationInputTokens ?? normalizedCachedWriteInputTokens;

  state.inputTokens = inputTokens;
  state.outputTokens = outputTokens;
  state.providerTotalTokens = providerTotalTokens;
  state.cacheReadInputTokens = cacheReadInputTokens;
  state.cacheCreationInputTokens = cacheCreationInputTokens;
  if (
    anthropicCacheReadInputTokens !== undefined ||
    anthropicCacheCreationInputTokens !== undefined
  ) {
    state.cacheTokenSource = 'anthropic';
  } else if (
    normalizedCachedReadInputTokens !== undefined ||
    normalizedCachedWriteInputTokens !== undefined ||
    openAiCachedInputTokens !== undefined
  ) {
    state.cacheTokenSource = 'openai';
  }
  state.haveUsageTokens = inputTokens !== undefined || outputTokens !== undefined;
}

export function extractLastStopReasonFromRunEvents(
  events: RunEventForAnalyticsObservability[],
): string | null {
  let last: string | null = null;
  for (const rec of events) {
    if (rec.event !== 'agent') continue;
    const data = rec.data as Record<string, unknown> | null | undefined;
    if (!data || typeof data !== 'object') continue;
    if (data.type === 'result' && typeof data.stop_reason === 'string' && data.stop_reason.trim()) {
      last = data.stop_reason.trim();
      continue;
    }
    if (data.type === 'message_delta') {
      const delta = data.delta as Record<string, unknown> | undefined;
      if (typeof delta?.stop_reason === 'string' && delta.stop_reason.trim()) {
        last = delta.stop_reason.trim();
      }
    }
    if (typeof data.stop_reason === 'string' && data.stop_reason.trim()) {
      last = data.stop_reason.trim();
    }
  }
  return last;
}

export function scanRunEventsForUsageAnalytics(
  events: RunEventForAnalyticsObservability[],
  reqBodyModel: unknown,
  userQueryTokens: number,
): RunUsageAnalytics {
  const scanState = {
    inputTokens: undefined as number | undefined,
    outputTokens: undefined as number | undefined,
    providerTotalTokens: undefined as number | undefined,
    cacheReadInputTokens: undefined as number | undefined,
    cacheCreationInputTokens: undefined as number | undefined,
    cacheTokenSource: 'unavailable' as RunUsageAnalytics['cache_token_source'],
    haveUsageTokens: false,
  };
  let agentReportedModel: string | null = null;
  const needAgentModel = !hasExplicitRequestedModelForAnalytics(reqBodyModel);

  for (let i = events.length - 1; i >= 0; i -= 1) {
    const ev = events[i];
    const data = ev?.data as
      | {
          type?: string;
          usage?: Record<string, unknown> | null;
          modelUsage?: Record<string, unknown> | null;
          label?: string;
          model?: unknown;
          detail?: unknown;
          input_tokens?: unknown;
          inputTokens?: unknown;
          output_tokens?: unknown;
          outputTokens?: unknown;
        }
      | null
      | undefined;

    if (ev?.event === 'usage' && !scanState.haveUsageTokens && data && typeof data === 'object') {
      const usagePayload =
        data.usage && typeof data.usage === 'object' ? data.usage : data;
      applyUsagePayloadToScan(usagePayload, scanState);
      const modelCandidate = typeof data.model === 'string' ? data.model.trim() : '';
      if (modelCandidate) agentReportedModel = modelCandidate;
    }

    if (ev?.event === 'agent' && data?.type === 'usage' && !scanState.haveUsageTokens) {
      const usage = data.usage && typeof data.usage === 'object'
        ? data.usage
        : data.modelUsage && typeof data.modelUsage === 'object'
          ? data.modelUsage
          : null;
      if (usage) {
        applyUsagePayloadToScan(usage, scanState);
      }
      const modelCandidate = typeof data.model === 'string' ? data.model.trim() : '';
      if (modelCandidate) agentReportedModel = modelCandidate;
    }

    if (
      !agentReportedModel &&
      ev?.event === 'agent' &&
      data?.type === 'status' &&
      (data.label === 'model' ||
        data.label === 'initializing' ||
        // Embed BYOK (mode=api) records the configured model on
        // `{ label: 'requesting', detail: config.model }` before the
        // proxy stream starts. Failed runs that die during materialization
        // never emit a `usage` event — without this label the ledger falls
        // through to `defaultByokModelName()` → `unknown`.
        data.label === 'requesting')
    ) {
      const candidate =
        typeof data.model === 'string'
          ? data.model
          : typeof data.detail === 'string'
            ? data.detail
            : null;
      if (candidate && candidate.trim()) {
        agentReportedModel = candidate.trim();
      }
    }

    if (scanState.haveUsageTokens && (!needAgentModel || agentReportedModel)) break;
  }

  const {
    inputTokens,
    outputTokens,
    providerTotalTokens,
    cacheReadInputTokens,
    cacheCreationInputTokens,
    cacheTokenSource,
    haveUsageTokens,
  } = scanState;

  const inputTokensEffective =
    inputTokens !== undefined
      ? cacheTokenSource === 'anthropic'
        ? inputTokens + (cacheReadInputTokens ?? 0) + (cacheCreationInputTokens ?? 0)
        : inputTokens
      : undefined;
  const totalTokens =
    providerTotalTokens ??
    (inputTokensEffective !== undefined && outputTokens !== undefined
      ? inputTokensEffective + outputTokens
      : undefined);
  const uncachedInputTokens =
    inputTokens !== undefined && cacheTokenSource === 'anthropic'
      ? inputTokens
      : inputTokens !== undefined &&
          cacheTokenSource === 'openai' &&
          cacheReadInputTokens !== undefined
        ? Math.max(0, inputTokens - cacheReadInputTokens)
        : undefined;
  const estimatedContextTokens =
    inputTokensEffective !== undefined && userQueryTokens > 0
      ? Math.max(0, inputTokensEffective - userQueryTokens)
      : undefined;
  const cacheHitRatio =
    inputTokensEffective !== undefined &&
    inputTokensEffective > 0 &&
    cacheReadInputTokens !== undefined
      ? cacheReadInputTokens / inputTokensEffective
      : undefined;

  return {
    ...(inputTokens !== undefined ? { input_tokens: inputTokens } : {}),
    ...(inputTokens !== undefined ? { input_tokens_provider: inputTokens } : {}),
    ...(inputTokensEffective !== undefined
      ? { input_tokens_effective: inputTokensEffective }
      : {}),
    ...(outputTokens !== undefined ? { output_tokens: outputTokens } : {}),
    ...(totalTokens !== undefined ? { total_tokens: totalTokens } : {}),
    ...(cacheReadInputTokens !== undefined
      ? { cache_read_input_tokens: cacheReadInputTokens }
      : {}),
    ...(cacheCreationInputTokens !== undefined
      ? { cache_creation_input_tokens: cacheCreationInputTokens }
      : {}),
    ...(uncachedInputTokens !== undefined
      ? { uncached_input_tokens: uncachedInputTokens }
      : {}),
    ...(estimatedContextTokens !== undefined
      ? { estimated_context_tokens: estimatedContextTokens }
      : {}),
    ...(cacheHitRatio !== undefined ? { cache_hit_ratio: cacheHitRatio } : {}),
    cache_token_source: cacheTokenSource,
    token_count_source: haveUsageTokens ? 'provider_usage' : 'unknown',
    agent_reported_model: agentReportedModel,
  };
}

function eventTimestamp(
  rec: RunEventForAnalyticsObservability,
): number | undefined {
  return readNumber(rec.timestamp);
}

export function summarizeRunTimingAnalytics(args: {
  runCreatedAt: number;
  runUpdatedAt: number;
  analyticsCapturedAt: number;
  telemetry?: RunTelemetryTimestamps | null;
  events: RunEventForAnalyticsObservability[];
}): RunTimingAnalytics {
  const telemetry = args.telemetry ?? {};
  const runEndAt = args.runUpdatedAt;
  let toolCallCount = 0;
  let toolDurationMs = 0;
  const openTools = new Map<string, number>();

  for (const rec of args.events) {
    if (rec.event !== 'agent') continue;
    const data = rec.data as
      | { type?: string; id?: unknown; toolUseId?: unknown }
      | null
      | undefined;
    const ts = eventTimestamp(rec);
    if (ts === undefined) continue;
    if (data?.type === 'tool_use' && typeof data.id === 'string') {
      toolCallCount += 1;
      openTools.set(data.id, ts);
    } else if (
      data?.type === 'tool_result' &&
      typeof data.toolUseId === 'string'
    ) {
      const startedAt = openTools.get(data.toolUseId);
      if (startedAt !== undefined && ts >= startedAt) {
        toolDurationMs += ts - startedAt;
        openTools.delete(data.toolUseId);
      }
    }
  }

  const startAt = telemetry.startChatRunStartedAt ?? telemetry.startRequestedAt;
  const totalDurationMs = Math.max(0, args.analyticsCapturedAt - args.runCreatedAt);
  const result: RunTimingAnalytics = {
    tool_call_count: toolCallCount,
    total_duration_ms: Math.round(totalDurationMs),
  };
  const queueDuration = durationBetween(args.runCreatedAt, startAt);
  if (queueDuration !== undefined) result.queue_duration_ms = queueDuration;
  const preSpawnDuration = durationBetween(startAt, telemetry.processSpawnStartedAt);
  if (preSpawnDuration !== undefined) result.pre_spawn_duration_ms = preSpawnDuration;
  const processSpawnDuration = durationBetween(
    telemetry.processSpawnStartedAt,
    telemetry.processSpawnedAt,
  );
  if (processSpawnDuration !== undefined) {
    result.process_spawn_duration_ms = processSpawnDuration;
  }
  const timeToFirstToken = durationBetween(startAt, telemetry.firstTokenAt);
  if (timeToFirstToken !== undefined) {
    result.time_to_first_token_ms = timeToFirstToken;
  }
  const spawnToFirstToken = durationBetween(
    telemetry.processSpawnedAt,
    telemetry.firstTokenAt,
  );
  if (spawnToFirstToken !== undefined) {
    result.spawn_to_first_token_ms = spawnToFirstToken;
  }
  const generationDuration = durationBetween(telemetry.firstTokenAt, runEndAt);
  if (generationDuration !== undefined) {
    result.generation_duration_ms = generationDuration;
  }
  if (toolCallCount > 0) result.tool_duration_ms = Math.round(toolDurationMs);
  const finalizeDuration = durationBetween(runEndAt, args.analyticsCapturedAt);
  if (finalizeDuration !== undefined) {
    result.finalize_duration_ms = finalizeDuration;
  }
  return result;
}
