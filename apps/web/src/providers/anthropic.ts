/**
 * Thin wrapper over @anthropic-ai/sdk. Minimal analog of
 * packages/providers/src/index.ts in the reference repo.
 *
 * Runs in the browser with dangerouslyAllowBrowser — this is a BYOK local-
 * first tool, so the key is the user's and never leaves their machine. If
 * you later move to a server-hosted build, drop that flag and proxy through
 * your own backend.
 */
import Anthropic from '@anthropic-ai/sdk';
import { effectiveMaxTokens } from '../state/maxTokens';
import type { AppConfig, ChatMessage } from '../types';
import { streamMessageAnthropicProxy } from './anthropic-compatible';
import type { ProxyContext } from './api-proxy';
import { streamMessageAzure } from './azure-compatible';
import { streamMessageGoogle } from './google-compatible';
import { streamMessageOllama } from './ollama-compatible';
import { isOpenAICompatible, streamMessageOpenAI } from './openai-compatible';
import { streamMessageSenseAudio } from './senseaudio-compatible';
import { streamMessageAIHubMix } from './aihubmix-compatible';
import { usesAnthropicProxy } from '../utils/apiProtocol';

// Re-export for convenience
export { isOpenAICompatible } from './openai-compatible';

export type ProxyUsageSnapshot = {
  inputTokens: number;
  outputTokens: number;
  model?: string;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
  apiProtocol?: string;
  latencyMs?: number;
  stopReason?: string;
};

export interface StreamHandlers {
  onDelta: (textDelta: string) => void;
  onDone: (fullText: string) => void;
  onError: (err: Error) => void;
  onUsage?: (usage: ProxyUsageSnapshot) => void;
  onThinkingDelta?: (thinkingDelta: string) => void;
}

export function makeClient(cfg: AppConfig): Anthropic {
  return new Anthropic({
    apiKey: cfg.apiKey,
    baseURL: cfg.baseUrl || undefined,
    dangerouslyAllowBrowser: true,
  });
}

export async function streamMessage(
  cfg: AppConfig,
  system: string,
  history: ChatMessage[],
  signal: AbortSignal,
  handlers: StreamHandlers,
  // Only the senseaudio / aihubmix branches read `context.projectId`
  // today (so the daemon-side `generate_image` tool can write into the
  // active project's folder). Other branches accept and ignore — keeping the
  // signature uniform means the single call site in ProjectView passes
  // the same shape regardless of protocol.
  context?: ProxyContext,
): Promise<void> {
  // Prefer the explicit Settings protocol; keep the legacy heuristic as a
  // fallback for configs saved before apiProtocol existed.
  if (cfg.apiProtocol === 'azure') {
    return streamMessageAzure(cfg, system, history, signal, handlers, context);
  }
  if (cfg.apiProtocol === 'ollama') {
    return streamMessageOllama(cfg, system, history, signal, handlers, context);
  }
  if (cfg.apiProtocol === 'google') {
    return streamMessageGoogle(cfg, system, history, signal, handlers, context);
  }
  if (cfg.apiProtocol === 'senseaudio') {
    return streamMessageSenseAudio(cfg, system, history, signal, handlers, context);
  }
  if (cfg.apiProtocol === 'aihubmix') {
    return streamMessageAIHubMix(cfg, system, history, signal, handlers, context);
  }
  if (cfg.apiProtocol === 'openai' || (!cfg.apiProtocol && isOpenAICompatible(cfg.model, cfg.baseUrl))) {
    return streamMessageOpenAI(cfg, system, history, signal, handlers, context);
  }

  if (usesAnthropicProxy(cfg)) {
    return streamMessageAnthropicProxy(cfg, system, history, signal, handlers, context);
  }

  if (!cfg.apiKey?.trim()) {
    const err = new Error('Missing API key — open Settings and paste one in.') as Error & {
      code?: string;
    };
    err.code = 'API_KEY_REQUIRED';
    handlers.onError(err);
    return;
  }

  const client = makeClient(cfg);
  let acc = '';
  let stream: ReturnType<typeof client.messages.stream> | undefined;
  // Guard so that emitting from both the success path (authoritative
  // finalMessage) and the catch path (best-effort currentMessage snapshot)
  // never reports tokens twice for the same run. We always prefer the
  // success-path payload when both are available.
  let usageEmitted = false;
  const tryEmitUsage = (
    snapshot: { usage?: unknown; model?: unknown } | null | undefined,
  ): void => {
    if (usageEmitted) return;
    if (emitAnthropicUsage(handlers, snapshot, cfg.model)) {
      usageEmitted = true;
    }
  };

  try {
    stream = client.messages.stream(
      {
        model: cfg.model,
        max_tokens: effectiveMaxTokens(cfg),
        system,
        messages: history.map((m) => ({ role: m.role, content: m.content })),
      },
      { signal },
    );

    stream.on('text', (delta) => {
      acc += delta;
      handlers.onDelta(delta);
    });

    // Without this, embed BYOK runs report 0-token rows with billing_status
    // 'not_attempted'. The proxy-based providers go through api-proxy.ts which
    // already lifts usage off the SSE wire; the direct SDK path here is the
    // remaining gap. See docs-teamver/24_AI_API_usage_capture_경로별_분석.md.
    const finalMessage = await stream.finalMessage();
    tryEmitUsage(finalMessage);
    handlers.onDone(acc);
  } catch (err) {
    // Even on abort or mid-stream error the provider has already counted
    // input_tokens (and any output_tokens streamed before the failure), so
    // we must still report whatever the SDK accumulated. Without this an
    // aborted run lands a 0-token ledger row that the user was actually
    // charged for upstream. `currentMessage` is the SDK's live snapshot
    // populated via message_start / message_delta events; it survives until
    // the next successful turn ends.
    if (stream?.currentMessage) {
      tryEmitUsage(stream.currentMessage as { usage?: unknown; model?: unknown });
    }
    if ((err as Error).name === 'AbortError') return;
    handlers.onError(err instanceof Error ? err : new Error(String(err)));
  }
}

// Anthropic bills prompt, cache-creation, and cache-read input separately.
// Store each bucket in its own ledger column so credit_meter can apply
// cache-specific per-1k rates (see deploy/teamver/be/app/services/credit_meter.py).
// Returns true when onUsage was invoked so callers can suppress duplicate
// emissions from the catch path.
function emitAnthropicUsage(
  handlers: StreamHandlers,
  finalMessage: { usage?: unknown; model?: unknown } | null | undefined,
  fallbackModel: string,
): boolean {
  if (!handlers.onUsage) return false;
  const usage = (finalMessage?.usage ?? null) as
    | {
        input_tokens?: unknown;
        output_tokens?: unknown;
        cache_creation_input_tokens?: unknown;
        cache_read_input_tokens?: unknown;
      }
    | null;
  if (!usage || typeof usage !== 'object') return false;

  const promptTokens = nonNegativeInt(usage.input_tokens);
  const cacheCreation = nonNegativeInt(usage.cache_creation_input_tokens);
  const cacheRead = nonNegativeInt(usage.cache_read_input_tokens);
  const outputTokens = nonNegativeInt(usage.output_tokens);

  if (promptTokens + cacheCreation + cacheRead + outputTokens === 0) return false;

  const reportedModel =
    typeof finalMessage?.model === 'string' && finalMessage.model.trim()
      ? finalMessage.model.trim()
      : fallbackModel;

  const stopReason =
    typeof (finalMessage as { stop_reason?: unknown } | null | undefined)?.stop_reason === 'string'
      ? String((finalMessage as { stop_reason: string }).stop_reason).trim() || undefined
      : undefined;

  handlers.onUsage({
    inputTokens: promptTokens,
    outputTokens,
    ...(cacheRead > 0 ? { cacheReadInputTokens: cacheRead } : {}),
    ...(cacheCreation > 0 ? { cacheCreationInputTokens: cacheCreation } : {}),
    model: reportedModel,
    ...(stopReason ? { stopReason } : {}),
  });
  return true;
}

function nonNegativeInt(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}
