import type { AgentEvent } from "../types";
import { getPinnedTeamverExecutionConfig } from "./branding/pinnedExecutionConfig";

const TERMINAL_RUN_STATUSES = new Set(["succeeded", "failed", "canceled"]);

const MODEL_STATUS_LABELS = new Set(["model", "initializing", "requesting"]);

export function isTerminalRunStatus(status: string | undefined): boolean {
  return status != null && TERMINAL_RUN_STATUSES.has(status);
}

export function extractLatestUsageFromEvents(events: AgentEvent[] | undefined) {
  if (!events?.length) return null;
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (!event) continue;
    if (event.kind === "usage") {
      const inputTokens = event.inputTokens ?? 0;
      const outputTokens = event.outputTokens ?? 0;
      return {
        inputTokens,
        outputTokens,
        tokenCountSource: resolveTokenCountSource(inputTokens, outputTokens),
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
