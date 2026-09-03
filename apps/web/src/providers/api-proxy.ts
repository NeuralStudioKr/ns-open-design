import { effectiveMaxTokensWithFloor } from '../state/maxTokens';
import type { AppConfig, ChatMessage } from '../types';
import type {
  ProxyImageContentBlock,
  ProxyMessage,
  ProxyMessageContent,
  ProxyTextContentBlock,
} from '@open-design/contracts';
import type { StreamHandlers } from './anthropic';
import { parseSseFrame } from './sse';
import { isAnthropicSupportedImagePath } from '../utils/apiProtocol';
import { fetchTeamverDaemon } from '../teamver/teamverDaemonHeaders';
import { downscaleImageBytesForAnthropicProxy } from '../utils/annotationImage';
import { MAX_ANTHROPIC_PROXY_IMAGE_BYTES } from './anthropic-proxy-limits';
import { isTeamverEmbedMode } from '../teamver/designApiBase';
import {
  hasChatApiCredentials,
  usesServerManagedChatApiKey,
} from '../teamver/chatApiCredentials';
import {
  requestProxyAbort,
  shouldFinalizeAbortedStreamAsIncomplete,
  shouldRequestUpstreamProxyAbort,
} from './proxyAbort';
import { COMMENT_ONLY_USER_PLACEHOLDER } from '../comments';
import { waitForTeamverProjectStoragePrefix } from '../teamver/teamverProjectS3PrefixResolve';
import {
  isEphemeralDrawingScreenshotPath,
  isRenderableImagePath,
  projectFilePathExists,
  projectFilePathBasename,
} from '../utils/projectFilePaths';
import { mergeImageMentionAttachments } from '../utils/recoverChatAttachmentsFromMentions';
import {
  isProjectRawFileKnownMissing,
} from '../utils/projectFileFetchCache';
import { loadAuthenticatedProjectFileBlob } from '../hooks/useAuthenticatedProjectFileObjectUrl';

/** No SSE bytes for this long → surface a retryable stall error instead of infinite Working UI. */
export const PROXY_STREAM_IDLE_TIMEOUT_MS = 5 * 60 * 1000;
/**
 * Slide/deck BYOK (minOutputTokens floor): MiniMax often pauses mid-artifact
 * while planning the next section. 5 minutes cut live decks as AGENT_EXECUTION_STALLED.
 */
export const PROXY_STREAM_IDLE_TIMEOUT_DECK_MS = 10 * 60 * 1000;

/** @internal vitest + ProjectView deck runs */
export function resolveProxyStreamIdleTimeoutMs(context?: ProxyContext): number {
  const override = context?.streamIdleTimeoutMs;
  if (typeof override === 'number' && Number.isFinite(override) && override > 0) {
    return override;
  }
  if (typeof context?.minOutputTokens === 'number' && context.minOutputTokens > 0) {
    return PROXY_STREAM_IDLE_TIMEOUT_DECK_MS;
  }
  return PROXY_STREAM_IDLE_TIMEOUT_MS;
}

async function readProxyStreamChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  idleTimeoutMs: number,
  signal: AbortSignal,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const clearTimer = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };
    const onAbort = () => {
      clearTimer();
      const err = new Error('aborted') as Error & { name?: string };
      err.name = 'AbortError';
      reject(err);
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      reject(
        Object.assign(new Error('BYOK proxy stream timed out due to inactivity'), {
          code: 'AGENT_EXECUTION_STALLED',
          retryable: true,
        }),
      );
    }, idleTimeoutMs);
    reader.read().then(
      (result) => {
        clearTimer();
        signal.removeEventListener('abort', onAbort);
        resolve(result);
      },
      (err) => {
        clearTimer();
        signal.removeEventListener('abort', onAbort);
        reject(err);
      },
    );
  });
}

/**
 * Optional per-request context that some protocols thread into the
 * proxy body or use to prepare provider-native message payloads:
 *  - `projectId` lets the `generate_image` tool write into the active
 *    project's folder instead of a daemon-global cache, and lets the
 *    Anthropic proxy resolve image attachments into content blocks.
 *  - `byokImageModel` is the user's BYOK Settings default for the
 *    image tool. The LLM can still override per-call via the tool's
 *    `model` arg; this is just the fallback when it omits one.
 * Other protocols ignore unknown body fields, so callers are free to
 * pass this for every protocol.
 */
export interface ProxyContext {
  projectId?: string;
  conversationId?: string;
  /** When set, skip raw GETs for attachment paths absent from the project file index. */
  projectFileNames?: ReadonlySet<string>;
  /** Embed BYOK — ties proxy usage SSE to the assistant message row for daemon-side billing staging. */
  assistantMessageId?: string;
  byokImageModel?: string;
  byokVideoModel?: string;
  byokSpeechModel?: string;
  byokSpeechVoice?: string;
  /**
   * Optional per-run output-token floor. Teamver slide/deck generation needs
   * enough room to finish a complete HTML artifact even when an old Settings
   * maxTokens override is still saved in localStorage/runtime config.
   */
  minOutputTokens?: number;
  /**
   * Override SSE idle timeout (ms). Deck runs normally use
   * {@link PROXY_STREAM_IDLE_TIMEOUT_DECK_MS} via minOutputTokens.
   */
  streamIdleTimeoutMs?: number;
}

/** Embed never ships browser secrets — always request daemon-managed BYOK. */
export function shouldUseManagedProxyApiKey(
  cfg: Pick<AppConfig, 'apiKey' | 'apiKeyConfigured'>,
): boolean {
  if (cfg.apiKey?.trim()) return false;
  if (isTeamverEmbedMode()) return true;
  return usesServerManagedChatApiKey(cfg);
}

export async function streamProxyEndpoint(
  endpoint: string,
  cfg: AppConfig,
  system: string,
  history: ChatMessage[],
  signal: AbortSignal,
  handlers: StreamHandlers,
  context?: ProxyContext,
): Promise<void> {
  if (!hasChatApiCredentials(cfg)) {
    const err = new Error('Missing API key — open Settings and paste one in.') as Error & {
      code?: string;
    };
    err.code = 'API_KEY_REQUIRED';
    handlers.onError(err);
    return;
  }

  // Soft-retry transient LLM/network/access failures before substantive
  // tokens stream (mirrors export soft-retry). Avoids intermittent hard failures.
  const maxAttempts = 3;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (signal.aborted) return;
    // Warm X-Teamver-S3-Prefix before BYOK materialization so daemon sync-down
    // does not 502 PROJECT_STORAGE_UNAVAILABLE on a registry/access race.
    if (context?.projectId && isTeamverEmbedMode()) {
      await waitForTeamverProjectStoragePrefix(context.projectId, {
        quick: attempt > 0,
      }).catch(() => null);
    }
    const outcome = await streamProxyEndpointOnce(
      endpoint,
      cfg,
      system,
      history,
      signal,
      handlers,
      context,
    );
    if (outcome === 'ok' || outcome === 'aborted') return;
    const canRetry =
      attempt < maxAttempts - 1
      && !signal.aborted
      && shouldSoftRetryProxyFailure(outcome.error);
    if (!canRetry) {
      handlers.onError(outcome.error);
      return;
    }
    try {
      await delayMs(PROXY_SOFT_RETRY_DELAY_MS * (attempt + 1), signal);
    } catch {
      return;
    }
  }
}

const PROXY_SOFT_RETRY_DELAY_MS = 600;

function delayMs(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/** @internal vitest */
export function shouldSoftRetryProxyFailure(
  err: Error & { code?: string; retryable?: boolean },
): boolean {
  // Explicit false wins (e.g. after tokens streamed — do not duplicate UI).
  if (err.retryable === false) return false;
  const code = (err.code || '').trim().toUpperCase();
  // Config / auth failures are not transient — don't burn soft-retry budget.
  if (
    code === 'MANAGED_API_KEY_MISSING'
    || code === 'API_KEY_REQUIRED'
    || code === 'UNAUTHORIZED'
    || code === 'FORBIDDEN'
    || code === 'BAD_REQUEST'
  ) {
    return false;
  }
  if (err.retryable === true) return true;
  if (
    code === 'UPSTREAM_UNAVAILABLE'
    || code === 'RATE_LIMITED'
    || code === 'PROJECT_STORAGE_UNAVAILABLE'
    || code === 'PROJECT_STORAGE_SYNC_FAILED'
  ) {
    return true;
  }
  if (/^proxy (502|503|504):/i.test(err.message)) return true;
  if (
    /fetch failed|networkerror|failed to fetch|econnreset|econnrefused|etimedout|premature close|other side closed|socket hang up|closed unexpectedly/i.test(
      err.message,
    )
  ) {
    return true;
  }
  return false;
}

async function streamProxyEndpointOnce(
  endpoint: string,
  cfg: AppConfig,
  system: string,
  history: ChatMessage[],
  signal: AbortSignal,
  handlers: StreamHandlers,
  context?: ProxyContext,
): Promise<'ok' | 'aborted' | { error: Error & { code?: string; retryable?: boolean } }> {
  const managed = shouldUseManagedProxyApiKey(cfg);
  let acc = '';
  let receivedSubstantiveDelta = false;
  /** Thinking frames already painted — soft-retry would duplicate the thinking UI. */
  let receivedThinkingDelta = false;
  let sawEndEvent = false;

  try {
    const messages = await buildProxyMessages(endpoint, history, context);
    const resp = await fetchTeamverDaemon(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      teamverProjectId: context?.projectId,
      body: JSON.stringify({
        baseUrl: cfg.baseUrl,
        ...(managed ? { useManagedApiKey: true } : { apiKey: cfg.apiKey }),
        model: cfg.model,
        apiProtocol: cfg.apiProtocol,
        systemPrompt: system,
        messages,
        maxTokens: effectiveMaxTokensWithFloor(cfg, context?.minOutputTokens),
        apiVersion: cfg.apiVersion,
        ...(context?.projectId ? { projectId: context.projectId } : {}),
        ...(context?.conversationId ? { conversationId: context.conversationId } : {}),
        ...(context?.assistantMessageId
          ? { assistantMessageId: context.assistantMessageId }
          : {}),
        ...(context?.byokImageModel
          ? { byokImageModel: context.byokImageModel }
          : {}),
        ...(context?.byokVideoModel
          ? { byokVideoModel: context.byokVideoModel }
          : {}),
        ...(context?.byokSpeechModel
          ? { byokSpeechModel: context.byokSpeechModel }
          : {}),
        ...(context?.byokSpeechVoice
          ? { byokSpeechVoice: context.byokSpeechVoice }
          : {}),
      }),
      signal,
    });

    if (!resp.ok || !resp.body) {
      const text = await resp.text().catch(() => '');
      const err = buildProxyResponseError(resp.status, text) as Error & {
        code?: string;
        retryable?: boolean;
      };
      if (
        err.code !== 'MANAGED_API_KEY_MISSING'
        && err.code !== 'API_KEY_REQUIRED'
        && (resp.status === 429 || resp.status === 408 || resp.status >= 500)
      ) {
        err.retryable = true;
      }
      return { error: err };
    }

    // Embed BYOK cancellation policy (PR1 §3.5): the daemon hands us a
    // streamId via the `X-Stream-Id` header. When the caller signals an
    // **upstream-cancel** reason (user Stop or Motif-SVG dump abort),
    // fire `POST /api/proxy/abort` with `keepalive: true` so the daemon
    // cancels the upstream LLM fetch. Any other abort reason (page
    // exit, route change, supersession) intentionally lets the daemon
    // drain the upstream so background sync-up commits scratch writes.
    //
    // `resp.headers` is missing on some test mocks (Response shape is
    // partially stubbed). Treat that as "no streamId" so the abort hook
    // is a no-op and the body-streaming code path is unaffected.
    const proxyStreamId =
      (typeof resp.headers?.get === 'function'
        && (resp.headers.get('x-stream-id') || resp.headers.get('X-Stream-Id')))
      || '';
    if (proxyStreamId) {
      const onSignalAbort = () => {
        // `signal.reason` carries whatever the caller passed to
        // `controller.abort(reason)`; only upstream-cancel sentinels
        // (user Stop + Motif-SVG dump) POST /api/proxy/abort.
        if (shouldRequestUpstreamProxyAbort((signal as AbortSignal).reason)) {
          requestProxyAbort(proxyStreamId);
        }
      };
      if (signal.aborted) {
        onSignalAbort();
      } else {
        signal.addEventListener('abort', onSignalAbort, { once: true });
      }
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    while (true) {
      const { value, done } = await readProxyStreamChunk(
        reader,
        resolveProxyStreamIdleTimeoutMs(context),
        signal,
      );
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      while (true) {
        const match = buf.match(/\r?\n\r?\n/);
        if (!match || match.index === undefined) break;
        const frame = buf.slice(0, match.index);
        buf = buf.slice(match.index + match[0].length);

        const parsed = parseSseFrame(frame);
        if (!parsed || parsed.kind !== 'event') continue;

        if (parsed.event === 'delta') {
          const text = String(parsed.data.delta ?? parsed.data.text ?? '');
          if (text) {
            // Whitespace-only first frames must not kill soft-retry (providers
            // often emit a leading `\n` before a mid-stream overload/drop).
            if (text.trim().length > 0) receivedSubstantiveDelta = true;
            acc += text;
            handlers.onDelta(text);
          }
          continue;
        }

        if (parsed.event === 'thinking_delta') {
          const thinking = String(parsed.data.delta ?? '');
          if (thinking) {
            receivedThinkingDelta = true;
            handlers.onThinkingDelta?.(thinking);
          }
          continue;
        }

        if (parsed.event === 'error') {
          const err = new Error(proxyErrorMessage(parsed.data)) as Error & {
            code?: string;
            retryable?: boolean;
          };
          const codeCandidate =
            (parsed.data as { code?: unknown }).code
            ?? (parsed.data as { error?: { code?: unknown } }).error?.code;
          if (typeof codeCandidate === 'string' && codeCandidate.trim()) {
            err.code = codeCandidate.trim();
          }
          const retryableCandidate =
            (parsed.data as { retryable?: unknown }).retryable
            ?? (parsed.data as { error?: { retryable?: unknown } }).error?.retryable;
          if (typeof retryableCandidate === 'boolean') {
            err.retryable = retryableCandidate;
          }
          // Do not soft-retry after substantive tokens or thinking were streamed
          // (would duplicate UI).
          if (receivedSubstantiveDelta || receivedThinkingDelta) err.retryable = false;
          return { error: err };
        }

        if (parsed.event === 'usage') {
          const inputTokens = Number(parsed.data.input_tokens ?? parsed.data.inputTokens ?? 0);
          const outputTokens = Number(parsed.data.output_tokens ?? parsed.data.outputTokens ?? 0);
          const model =
            typeof parsed.data.model === 'string' && parsed.data.model.trim()
              ? parsed.data.model.trim()
              : undefined;
          const cacheReadInputTokens = Number(
            parsed.data.cache_read_input_tokens ?? parsed.data.cacheReadInputTokens ?? 0,
          );
          const cacheCreationInputTokens = Number(
            parsed.data.cache_creation_input_tokens ?? parsed.data.cacheCreationInputTokens ?? 0,
          );
          const stopReason =
            typeof parsed.data.stop_reason === 'string' && parsed.data.stop_reason.trim()
              ? parsed.data.stop_reason.trim()
              : typeof parsed.data.stopReason === 'string' && parsed.data.stopReason.trim()
                ? parsed.data.stopReason.trim()
                : undefined;
          if (Number.isFinite(inputTokens) && Number.isFinite(outputTokens)) {
            handlers.onUsage?.({
              inputTokens: Math.max(0, inputTokens),
              outputTokens: Math.max(0, outputTokens),
              model,
              ...(Number.isFinite(cacheReadInputTokens) && cacheReadInputTokens > 0
                ? { cacheReadInputTokens: Math.max(0, cacheReadInputTokens) }
                : {}),
              ...(Number.isFinite(cacheCreationInputTokens) && cacheCreationInputTokens > 0
                ? { cacheCreationInputTokens: Math.max(0, cacheCreationInputTokens) }
                : {}),
              ...(stopReason ? { stopReason } : {}),
            });
          }
          continue;
        }

        if (parsed.event === 'end') {
          sawEndEvent = true;
          handlers.onDone(acc);
          return 'ok';
        }
      }
    }

    // Some producers omit the final blank line on the last SSE frame; flush
    // the trailing buffer the same way daemon `streamUpstreamSse` does.
    const tail = buf.trim();
    if (tail) {
      const parsed = parseSseFrame(tail);
      if (parsed?.kind === 'event') {
        if (parsed.event === 'delta') {
          const text = String(parsed.data.delta ?? parsed.data.text ?? '');
          if (text) {
            if (text.trim().length > 0) receivedSubstantiveDelta = true;
            acc += text;
            handlers.onDelta(text);
          }
        } else if (parsed.event === 'thinking_delta') {
          const thinking = String(parsed.data.delta ?? '');
          if (thinking) {
            receivedThinkingDelta = true;
            handlers.onThinkingDelta?.(thinking);
          }
        } else if (parsed.event === 'error') {
          const err = new Error(proxyErrorMessage(parsed.data)) as Error & {
            code?: string;
            retryable?: boolean;
          };
          const codeCandidate =
            (parsed.data as { code?: unknown }).code
            ?? (parsed.data as { error?: { code?: unknown } }).error?.code;
          if (typeof codeCandidate === 'string' && codeCandidate.trim()) {
            err.code = codeCandidate.trim();
          }
          const retryableCandidate =
            (parsed.data as { retryable?: unknown }).retryable
            ?? (parsed.data as { error?: { retryable?: unknown } }).error?.retryable;
          if (typeof retryableCandidate === 'boolean') {
            err.retryable = retryableCandidate;
          }
          if (receivedSubstantiveDelta || receivedThinkingDelta) err.retryable = false;
          return { error: err };
        } else if (parsed.event === 'usage') {
          const inputTokens = Number(parsed.data.input_tokens ?? parsed.data.inputTokens ?? 0);
          const outputTokens = Number(parsed.data.output_tokens ?? parsed.data.outputTokens ?? 0);
          const model =
            typeof parsed.data.model === 'string' && parsed.data.model.trim()
              ? parsed.data.model.trim()
              : undefined;
          if (Number.isFinite(inputTokens) && Number.isFinite(outputTokens)) {
            handlers.onUsage?.({
              inputTokens: Math.max(0, inputTokens),
              outputTokens: Math.max(0, outputTokens),
              model,
            });
          }
        } else if (parsed.event === 'end') {
          sawEndEvent = true;
          handlers.onDone(acc);
          return 'ok';
        }
      }
    }

    // Graceful EOF without `end`: empty/pre-token drops are retryable.
    // Thinking-only incomplete matches daemon finalize (retryable:false — soft-retry
    // would duplicate thinking UI). Substantive text keeps historical onDone.
    if (!sawEndEvent && !receivedSubstantiveDelta) {
      const err = new Error('Upstream stream ended before any content') as Error & {
        code?: string;
        retryable?: boolean;
      };
      err.code = 'UPSTREAM_UNAVAILABLE';
      err.retryable = !receivedThinkingDelta;
      return { error: err };
    }
    handlers.onDone(acc);
    return 'ok';
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      if (shouldFinalizeAbortedStreamAsIncomplete((signal as AbortSignal).reason)) {
        handlers.onDone(acc);
        return 'ok';
      }
      return 'aborted';
    }
    const error = (err instanceof Error ? err : new Error(String(err))) as Error & {
      code?: string;
      retryable?: boolean;
    };
    // Mirror daemon network classification so FE soft-retry fires even when
    // the browser throws before an SSE error frame (daemon unreachable, TLS, etc.).
    if (
      !error.code
      && /fetch failed|networkerror|failed to fetch|econnreset|econnrefused|etimedout|network|load failed|premature close|other side closed|socket hang up|closed unexpectedly/i.test(
        `${error.name} ${error.message}`,
      )
    ) {
      error.code = 'UPSTREAM_UNAVAILABLE';
      error.retryable = true;
    }
    // Same gate as SSE error frames — soft-retry after painted tokens/thinking
    // would duplicate UI content across attempts.
    if (receivedSubstantiveDelta || receivedThinkingDelta) {
      error.retryable = false;
    }
    return { error };
  }
}

export async function buildProxyMessages(
  endpoint: string,
  history: ChatMessage[],
  context?: ProxyContext,
): Promise<ProxyMessage[]> {
  const anthropic = usesAnthropicMessagesPayload(endpoint);
  if (!anthropic || !context?.projectId) {
    const out = history.map((message) => ({
      role: message.role,
      // Anthropic rejects empty user content even when projectId is missing
      // (image blocks skipped). Other protocols keep historical behavior.
      content: sanitizeAnthropicProxyRoleContent(message.role, message.content, anthropic),
    }));
    return anthropic ? normalizeAnthropicProxyMessageRoles(out) : out;
  }

  const out: ProxyMessage[] = [];
  for (const message of history) {
    let content = await buildAnthropicMessageContent(message, context);
    content = sanitizeAnthropicProxyRoleContent(message.role, content, true);
    out.push({
      role: message.role,
      content,
    });
  }
  return normalizeAnthropicProxyMessageRoles(out);
}

function sanitizeAnthropicProxyRoleContent(
  role: ChatMessage['role'],
  content: ProxyMessageContent,
  anthropic: boolean,
): ProxyMessageContent {
  if (!anthropic) return content;
  if (role === 'user') return ensureNonEmptyAnthropicUserContent(content);
  if (role === 'assistant') return ensureNonEmptyAnthropicAssistantContent(content);
  return content;
}

/** Failed/canceled runs often persist assistant shells with empty `content`. */
export const ANTHROPIC_EMPTY_ASSISTANT_PLACEHOLDER = '(No assistant reply was recorded.)';

/** Anthropic Messages API rejects images above 5 MB; stay under with headroom. */
export { MAX_ANTHROPIC_PROXY_IMAGE_BYTES } from './anthropic-proxy-limits';

/**
 * Anthropic requires alternating user/assistant roles. Hidden auto-continue user
 * rows and collapsed empty assistant shells can leave consecutive user turns in
 * chat history — insert placeholders instead of forwarding invalid sequences.
 */
export function normalizeAnthropicProxyMessageRoles(
  messages: ProxyMessage[],
): ProxyMessage[] {
  if (messages.length === 0) return messages;
  const normalized: ProxyMessage[] = [];
  for (const message of messages) {
    const previous = normalized[normalized.length - 1];
    if (previous && previous.role === message.role) {
      normalized.push(
        message.role === 'user'
          ? {
              role: 'assistant',
              content: ANTHROPIC_EMPTY_ASSISTANT_PLACEHOLDER,
            }
          : {
              role: 'user',
              content: COMMENT_ONLY_USER_PLACEHOLDER,
            },
      );
    }
    normalized.push(message);
  }
  if (normalized[0]?.role === 'assistant') {
    normalized.unshift({
      role: 'user',
      content: COMMENT_ONLY_USER_PLACEHOLDER,
    });
  }
  return normalized;
}

function anthropicContentHasSubstance(content: ProxyMessageContent): boolean {
  if (typeof content === 'string') return content.trim().length > 0;
  if (!Array.isArray(content)) return false;
  return content.some((block) => {
    if (!block || typeof block !== 'object') return false;
    if (block.type === 'text') return String(block.text ?? '').trim().length > 0;
    if (block.type === 'image') return true;
    return true;
  });
}

function ensureNonEmptyAnthropicUserContent(content: ProxyMessageContent): ProxyMessageContent {
  return anthropicContentHasSubstance(content) ? content : COMMENT_ONLY_USER_PLACEHOLDER;
}

function ensureNonEmptyAnthropicAssistantContent(content: ProxyMessageContent): ProxyMessageContent {
  return anthropicContentHasSubstance(content) ? content : ANTHROPIC_EMPTY_ASSISTANT_PLACEHOLDER;
}

function usesAnthropicMessagesPayload(endpoint: string): boolean {
  return endpoint.includes('/api/proxy/anthropic/');
}

type AnthropicImageCandidate = {
  path: string;
  name: string;
  order?: number;
};

/**
 * Visual marks store screenshots on `commentAttachments.screenshotPath`.
 * History rows can keep that metadata after regular `attachments` were
 * dropped — still emit native Anthropic image blocks for those paths.
 */
export function anthropicImageCandidatesFromMessage(
  message: Pick<ChatMessage, 'attachments' | 'commentAttachments' | 'content' | 'role'>,
): AnthropicImageCandidate[] {
  // Rebuild chips from `@image` / embed-contract paths when attachments_json
  // was dropped — otherwise BYOK vision silently becomes text-only after refresh.
  const recoveredAttachments = mergeImageMentionAttachments(
    message.attachments,
    message.content,
  );
  const imageAttachments = sortAttachmentsByUserOrder(
    recoveredAttachments.filter(
      (attachment) =>
        attachment.kind === 'image' || isRenderableImagePath(attachment.path),
    ),
  );
  const seen = new Set(imageAttachments.map((attachment) => projectFilePathBasename(attachment.path)));
  const fromAttachments: AnthropicImageCandidate[] = imageAttachments.map((attachment) => ({
    path: attachment.path,
    name: attachment.name,
    order: attachment.order,
  }));
  const fromVisualComments: AnthropicImageCandidate[] = [];
  for (const [index, attachment] of (message.commentAttachments ?? []).entries()) {
    const selectionKind = attachment.selectionKind;
    const screenshotPath = String(attachment.screenshotPath || '').trim();
    const filePath = String(attachment.filePath || '').trim();
    const isVisual =
      selectionKind === 'visual'
      || Boolean(attachment.markKind)
      || Boolean(screenshotPath)
      || String(attachment.elementId || '').startsWith('visual-mark-');
    if (!isVisual) continue;
    const path = screenshotPath || filePath;
    if (!path) continue;
    const basename = projectFilePathBasename(path);
    if (seen.has(basename)) continue;
    seen.add(basename);
    fromVisualComments.push({
      path,
      name: String(attachment.label || path.split('/').pop() || path).trim() || path,
      order: typeof attachment.order === 'number' ? attachment.order : index,
    });
  }
  return sortAttachmentsByUserOrder([...fromAttachments, ...fromVisualComments]);
}

export function filterAnthropicImageCandidatesByProjectFiles(
  candidates: readonly AnthropicImageCandidate[],
  projectId: string,
  projectFileNames?: ReadonlySet<string>,
): AnthropicImageCandidate[] {
  return candidates.filter((candidate) => {
    if (isProjectRawFileKnownMissing(projectId, candidate.path)) return false;
    if (!projectFileNames || projectFilePathExists(projectFileNames, candidate.path)) return true;
    // Ephemeral annotation drawings must stay gated by the file index so
    // deleted marks do not spam raw GETs. Other message attachments may race
    // ahead of /files refresh — still allow vision for those paths.
    if (isEphemeralDrawingScreenshotPath(candidate.path)) return false;
    return true;
  });
}

async function buildAnthropicMessageContent(
  message: ChatMessage,
  context: Pick<ProxyContext, 'projectId' | 'projectFileNames'>,
): Promise<ProxyMessageContent> {
  const projectId = context.projectId;
  if (!projectId) return message.content;
  let imageCandidates = anthropicImageCandidatesFromMessage(message);
  imageCandidates = filterAnthropicImageCandidatesByProjectFiles(
    imageCandidates,
    projectId,
    context.projectFileNames,
  );
  if (message.role !== 'user' || imageCandidates.length === 0) {
    return message.content;
  }

  const blocks: Array<ProxyTextContentBlock | ProxyImageContentBlock> = [];
  if (message.content.trim()) {
    blocks.push({ type: 'text', text: message.content });
  }

  for (const attachment of imageCandidates) {
    const block = await readAnthropicImageBlock(projectId, attachment.path);
    if (block) {
      blocks.push(block);
    } else if (isAnthropicSupportedImagePath(attachment.path)) {
      blocks.push({
        type: 'text',
        text: `Attached image could not be sent as native image content: path: ${attachment.path} | name: ${attachment.name}`,
      });
    }
  }

  return blocks.length > 0 ? blocks : message.content;
}

function sortAttachmentsByUserOrder<T extends { order?: number }>(attachments: T[]): T[] {
  return attachments
    .map((attachment, index) => ({ attachment, index }))
    .sort((a, b) => {
      const aOrder = typeof a.attachment.order === 'number' && Number.isFinite(a.attachment.order)
        ? a.attachment.order
        : a.index;
      const bOrder = typeof b.attachment.order === 'number' && Number.isFinite(b.attachment.order)
        ? b.attachment.order
        : b.index;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.index - b.index;
    })
    .map((entry) => entry.attachment);
}

const ANTHROPIC_IMAGE_FETCH_DELAYS_MS = [0, 250, 800, 1_600, 3_200] as const;

async function readAnthropicImageBlock(
  projectId: string,
  path: string,
): Promise<ProxyImageContentBlock | null> {
  if (isProjectRawFileKnownMissing(projectId, path)) return null;

  // Enable Drive/NFD alternates for vision fetch — the message attachment path
  // is often a canonical NFC form while the daemon has the NFD-encoded file
  // (macOS uploads) or moved it under refs/drive/.
  const blob = await loadAuthenticatedProjectFileBlob(projectId, path, {
    delaysMs: ANTHROPIC_IMAGE_FETCH_DELAYS_MS,
    trustExists: true,
  });
  if (!blob) return null;

  const mediaType = supportedAnthropicImageMediaType(blob.type, path);
  if (!mediaType) return null;

  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (!isValidAnthropicImageBytes(bytes, mediaType)) return null;
  let payload = bytes;
  if (payload.length > MAX_ANTHROPIC_PROXY_IMAGE_BYTES) {
    const downscaled = await downscaleImageBytesForAnthropicProxy(
      payload,
      mediaType,
      MAX_ANTHROPIC_PROXY_IMAGE_BYTES,
    );
    if (!downscaled) return null;
    payload = downscaled;
  }
  return {
    type: 'image',
    source: {
      type: 'base64',
      media_type: mediaType,
      data: bytesToBase64(payload),
    },
  };
}

/** Reject HTML/JSON error bodies that inherit a .png path extension. */
export function isValidAnthropicImageBytes(
  bytes: Uint8Array,
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
): boolean {
  if (bytes.length < 4) return false;
  if (mediaType === 'image/png') {
    return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  }
  if (mediaType === 'image/jpeg') {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mediaType === 'image/gif') {
    return bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46;
  }
  if (bytes.length < 12) return false;
  return (
    bytes[0] === 0x52
    && bytes[1] === 0x49
    && bytes[2] === 0x46
    && bytes[3] === 0x46
    && bytes[8] === 0x57
    && bytes[9] === 0x45
    && bytes[10] === 0x42
    && bytes[11] === 0x50
  );
}

function supportedAnthropicImageMediaType(
  contentType: string,
  path: string,
): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | null {
  const normalized = contentType.split(';', 1)[0]?.trim().toLowerCase();
  if (
    normalized === 'image/jpeg' ||
    normalized === 'image/png' ||
    normalized === 'image/gif' ||
    normalized === 'image/webp'
  ) {
    return normalized;
  }
  const lower = path.toLowerCase();
  if (/\.(jpe?g)$/.test(lower)) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  return null;
}

function bytesToBase64(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out += alphabet[(n >> 18) & 63];
    out += alphabet[(n >> 12) & 63];
    out += alphabet[(n >> 6) & 63];
    out += alphabet[n & 63];
  }
  if (i < bytes.length) {
    const a = bytes[i]!;
    const b = i + 1 < bytes.length ? bytes[i + 1]! : 0;
    const n = (a << 16) | (b << 8);
    out += alphabet[(n >> 18) & 63];
    out += alphabet[(n >> 12) & 63];
    out += i + 1 < bytes.length ? alphabet[(n >> 6) & 63] : '=';
    out += '=';
  }
  return out;
}

function stringifyProxyErrorDetails(details: unknown): string {
  if (details == null) return '';
  if (typeof details === 'string') {
    return details.replace(/\s+/g, ' ').trim().slice(0, 400);
  }
  try {
    return JSON.stringify(details).replace(/\s+/g, ' ').trim().slice(0, 400);
  } catch {
    return '';
  }
}

/**
 * Prefer nested.message; when the daemon only sent "Upstream error: NNN"
 * (or the FE ignored `details`), append the upstream body so classifiers
 * and copy-diagnostics still see prompt-too-long / balance text.
 */
function proxyErrorMessage(data: Record<string, unknown>): string {
  const nested = data.error;
  let message = '';
  if (nested && typeof nested === 'object' && 'message' in nested) {
    const nestedMessage = (nested as { message?: unknown }).message;
    if (typeof nestedMessage === 'string' && nestedMessage.trim()) {
      message = nestedMessage.trim();
    }
  }
  if (!message) message = String(data.message ?? 'proxy error').trim() || 'proxy error';

  const detailsRaw =
    (nested && typeof nested === 'object'
      ? (nested as { details?: unknown }).details
      : undefined)
    ?? data.details;
  const detailsText = stringifyProxyErrorDetails(detailsRaw);
  if (
    detailsText
    && /^(?:Upstream error|Provider error|Gemini error|Azure error):\s*\d{3}\s*$/i.test(message)
  ) {
    return `${message} — ${detailsText}`;
  }
  return message;
}

/**
 * Surface the daemon's structured error to the chat error card by attaching
 * `code` to the thrown Error. Without this the chat diagnostic copy shows
 * `error_code: n/a` even when the daemon answered with a specific code (e.g.
 * `MANAGED_API_KEY_MISSING` when TEAMVER_OD_API_KEY is missing from the
 * daemon env), making the failure look generic and untraceable.
 */
export function buildProxyResponseError(
  status: number,
  text: string,
): Error & { code?: string; retryable?: boolean } {
  const parsed = parseProxyErrorEnvelope(text);
  const codeFragment = parsed?.code ? `${parsed.code} ` : '';
  const messageFragment =
    (parsed?.message && parsed.message.trim())
    || (text && text.trim())
    || 'no body';
  const err = new Error(`proxy ${status}: ${codeFragment}${messageFragment}`) as Error & {
    code?: string;
    retryable?: boolean;
  };
  if (parsed?.code) err.code = parsed.code;
  if (typeof parsed?.retryable === 'boolean') {
    err.retryable = parsed.retryable;
  } else if (
    parsed?.code !== 'MANAGED_API_KEY_MISSING'
    && parsed?.code !== 'API_KEY_REQUIRED'
    && (status === 429 || status === 408 || status >= 500)
  ) {
    err.retryable = true;
  }
  return err;
}

function parseProxyErrorEnvelope(
  text: string,
): { code?: string; message?: string; retryable?: boolean } | null {
  if (!text || typeof text !== 'string') return null;
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') return null;
    const nested =
      (parsed as { error?: unknown }).error
      && typeof (parsed as { error?: unknown }).error === 'object'
        ? ((parsed as { error: { code?: unknown; message?: unknown; retryable?: unknown } }).error)
        : null;
    const code =
      typeof nested?.code === 'string' && nested.code.trim()
        ? nested.code.trim()
        : typeof (parsed as { code?: unknown }).code === 'string'
          ? (parsed as { code: string }).code.trim() || undefined
          : typeof (parsed as { error_code?: unknown }).error_code === 'string'
            ? (parsed as { error_code: string }).error_code.trim() || undefined
            : undefined;
    const message =
      typeof nested?.message === 'string' && nested.message.trim()
        ? nested.message.trim()
        : typeof (parsed as { message?: unknown }).message === 'string'
          ? (parsed as { message: string }).message.trim() || undefined
          : typeof (parsed as { error?: unknown }).error === 'string'
            ? (parsed as { error: string }).error.trim() || undefined
            : typeof (parsed as { details?: unknown }).details === 'string'
              ? (parsed as { details: string }).details.trim() || undefined
              : undefined;
    const retryableRaw =
      nested?.retryable ?? (parsed as { retryable?: unknown }).retryable;
    const retryable =
      typeof retryableRaw === 'boolean' ? retryableRaw : undefined;
    if (!code && !message && retryable === undefined) return null;
    const out: { code?: string; message?: string; retryable?: boolean } = {};
    if (code) out.code = code;
    if (message) out.message = message;
    if (retryable !== undefined) out.retryable = retryable;
    return out;
  } catch {
    return null;
  }
}
