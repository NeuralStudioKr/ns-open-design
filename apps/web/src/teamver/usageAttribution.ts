import type { AgentEvent } from "../types";
import { getPinnedTeamverExecutionConfig } from "./branding/pinnedExecutionConfig";

const TERMINAL_RUN_STATUSES = new Set(["succeeded", "failed", "canceled"]);

const MODEL_STATUS_LABELS = new Set(["model", "initializing", "requesting"]);

export function isTerminalRunStatus(status: string | undefined): boolean {
  return status != null && TERMINAL_RUN_STATUSES.has(status);
}

/** Normalize provider usage payloads (nested usage, top-level BYOK SSE, stats).
 *  Keep in sync with daemon `normalizeUsageTokenCounts` (run-analytics-observability.ts). */
export function normalizeProviderUsagePayload(
  payload: unknown,
): { inputTokens: number; outputTokens: number } | null {
  const details = extractProviderUsageDetails(payload);
  if (!details) return null;
  return { inputTokens: details.inputTokens, outputTokens: details.outputTokens };
}

function readUsageNumber(value: unknown, keys: string[]): number | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
  }
  return undefined;
}

/** Full provider usage breakdown for ledger metadata (cache, model, stop reason). */
export function extractProviderUsageDetails(
  payload: unknown,
): {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
  model?: string;
  stopReason?: string;
  latencyMs?: number;
} | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const usagePayload =
    record.usage && typeof record.usage === "object"
      ? record.usage
      : record.modelUsage && typeof record.modelUsage === "object"
        ? record.modelUsage
        : record.stats && typeof record.stats === "object"
          ? record.stats
          : record;
  const usageRecord = usagePayload as Record<string, unknown>;
  const inputTokens = readUsageNumber(usageRecord, ["input_tokens", "inputTokens", "prompt_tokens"]) ?? 0;
  const outputTokens = readUsageNumber(usageRecord, ["output_tokens", "outputTokens", "completion_tokens"]) ?? 0;
  const cacheReadInputTokens = readUsageNumber(usageRecord, [
    "cache_read_input_tokens",
    "cacheReadInputTokens",
    "cached_tokens",
  ]);
  const cacheCreationInputTokens = readUsageNumber(usageRecord, [
    "cache_creation_input_tokens",
    "cacheCreationInputTokens",
  ]);
  const tokenSum =
    inputTokens + outputTokens + (cacheReadInputTokens ?? 0) + (cacheCreationInputTokens ?? 0);
  if (tokenSum <= 0) return null;

  const model =
    typeof record.model === "string" && record.model.trim()
      ? record.model.trim()
      : typeof usageRecord.model === "string" && usageRecord.model.trim()
        ? usageRecord.model.trim()
        : undefined;
  const stopReason =
    typeof record.stop_reason === "string" && record.stop_reason.trim()
      ? record.stop_reason.trim()
      : typeof record.stopReason === "string" && record.stopReason.trim()
        ? record.stopReason.trim()
        : undefined;
  const latencyMs = readUsageNumber(record, ["latency_ms", "latencyMs", "duration_ms", "durationMs"]);

  return {
    inputTokens,
    outputTokens,
    ...(cacheReadInputTokens != null && cacheReadInputTokens > 0
      ? { cacheReadInputTokens }
      : {}),
    ...(cacheCreationInputTokens != null && cacheCreationInputTokens > 0
      ? { cacheCreationInputTokens }
      : {}),
    ...(model ? { model } : {}),
    ...(stopReason ? { stopReason } : {}),
    ...(latencyMs != null && latencyMs > 0 ? { latencyMs: Math.round(latencyMs) } : {}),
  };
}

export type TeamverUsageAttribution = {
  inputTokens: number;
  outputTokens: number;
  tokenCountSource: "provider_usage" | "unknown";
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
  providerReportedModel?: string;
  apiProtocol?: string;
  latencyMs?: number;
  stopReason?: string;
};

export function sumUsageTokens(usage: Pick<
  TeamverUsageAttribution,
  "inputTokens" | "outputTokens" | "cacheReadInputTokens" | "cacheCreationInputTokens"
>): number {
  return (
    usage.inputTokens
    + usage.outputTokens
    + (usage.cacheReadInputTokens ?? 0)
    + (usage.cacheCreationInputTokens ?? 0)
  );
}

export function extractLatestUsageFromEvents(events: AgentEvent[] | undefined): TeamverUsageAttribution | null {
  if (!events?.length) return null;
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (!event) continue;
    if (event.kind === "usage") {
      const inputTokens = event.inputTokens ?? 0;
      const outputTokens = event.outputTokens ?? 0;
      const cacheReadInputTokens = event.cacheReadInputTokens;
      const cacheCreationInputTokens = event.cacheCreationInputTokens;
      const tokenSum = sumUsageTokens({
        inputTokens,
        outputTokens,
        cacheReadInputTokens,
        cacheCreationInputTokens,
      });
      if (tokenSum <= 0) continue;
      return {
        inputTokens,
        outputTokens,
        tokenCountSource: "provider_usage",
        ...(cacheReadInputTokens != null && cacheReadInputTokens > 0
          ? { cacheReadInputTokens }
          : {}),
        ...(cacheCreationInputTokens != null && cacheCreationInputTokens > 0
          ? { cacheCreationInputTokens }
          : {}),
        ...(typeof event.model === "string" && event.model.trim()
          ? { providerReportedModel: event.model.trim() }
          : {}),
        ...(typeof event.apiProtocol === "string" && event.apiProtocol.trim()
          ? { apiProtocol: event.apiProtocol.trim() }
          : {}),
        ...(typeof event.latencyMs === "number" && Number.isFinite(event.latencyMs) && event.latencyMs > 0
          ? { latencyMs: Math.round(event.latencyMs) }
          : {}),
        ...(typeof event.stopReason === "string" && event.stopReason.trim()
          ? { stopReason: event.stopReason.trim() }
          : {}),
      };
    }
  }
  return null;
}

/** Align with daemon run-analytics: non-zero usage events imply provider counts. */
export function resolveTokenCountSource(
  inputTokens: number,
  outputTokens: number,
): "provider_usage" | "unknown" {
  return inputTokens + outputTokens > 0 ? "provider_usage" : "unknown";
}

export function extractModelNameFromEvents(events: AgentEvent[] | undefined): string | null {
  if (!events?.length) return null;
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (!event) continue;
    if (event.kind === "usage" && typeof event.model === "string" && event.model.trim()) {
      return event.model.trim();
    }
  }
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (!event) continue;
    if (
      event.kind === "status"
      && MODEL_STATUS_LABELS.has(event.label)
      && event.detail?.trim()
    ) {
      return event.detail.trim();
    }
  }
  return null;
}

/** Embed usage report model — events first, then runtime-config pin. */
export function resolveTeamverUsageModelName(events: AgentEvent[] | undefined): string {
  return (
    extractModelNameFromEvents(events)
    ?? getPinnedTeamverExecutionConfig()?.model?.trim()
    ?? "unknown"
  );
}
