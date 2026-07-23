import { effectiveMaxTokensWithFloor } from '../state/maxTokens';
import type { AppConfig, ChatMessage } from '../types';
import type {
  ProxyImageContentBlock,
  ProxyMessage,
  ProxyMessageContent,
  ProxyTextContentBlock,
} from '@open-design/contracts';
import { projectFileUrl } from './registry';
import type { StreamHandlers } from './anthropic';
import { parseSseFrame } from './sse';
import { isAnthropicSupportedImagePath } from '../utils/apiProtocol';
import { fetchTeamverDaemon } from '../teamver/teamverDaemonHeaders';
import { isTeamverEmbedMode } from '../teamver/designApiBase';
import {
  hasChatApiCredentials,
  usesServerManagedChatApiKey,
} from '../teamver/chatApiCredentials';
import { EXPLICIT_PROXY_STOP_REASON, requestProxyAbort } from './proxyAbort';
import { COMMENT_ONLY_USER_PLACEHOLDER } from '../comments';
import { waitForTeamverProjectStoragePrefix } from '../teamver/teamverProjectS3PrefixResolve';

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
    // **explicit Stop** (handleStop / onStop pass
    // `EXPLICIT_PROXY_STOP_REASON` to `controller.abort(reason)`), fire
    // `POST /api/proxy/abort` with `keepalive: true` so the daemon
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
        // `controller.abort(reason)`; equality with the explicit-stop
        // sentinel is the only safe distinction the daemon can rely on.
        if ((signal as AbortSignal).reason === EXPLICIT_PROXY_STOP_REASON) {
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
      const { value, done } = await reader.read();
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
    if ((err as Error).name === 'AbortError') return 'aborted';
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
    return history.map((message) => ({
      role: message.role,
      // Anthropic rejects empty user content even when projectId is missing
      // (image blocks skipped). Other protocols keep historical behavior.
      content:
        anthropic && message.role === 'user'
          ? ensureNonEmptyAnthropicUserContent(message.content)
          : message.content,
    }));
  }

  const out: ProxyMessage[] = [];
  for (const message of history) {
    let content = await buildAnthropicMessageContent(message, context.projectId);
    if (message.role === 'user') {
      content = ensureNonEmptyAnthropicUserContent(content);
    }
    out.push({
      role: message.role,
      content,
    });
  }
  return out;
}

function ensureNonEmptyAnthropicUserContent(content: ProxyMessageContent): ProxyMessageContent {
  if (typeof content === 'string') {
    return content.trim().length > 0 ? content : COMMENT_ONLY_USER_PLACEHOLDER;
  }
  if (Array.isArray(content)) {
    const hasSubstance = content.some((block) => {
      if (!block || typeof block !== 'object') return false;
      if (block.type === 'text') return String(block.text ?? '').trim().length > 0;
      if (block.type === 'image') return true;
      return true;
    });
    return hasSubstance ? content : COMMENT_ONLY_USER_PLACEHOLDER;
  }
  return COMMENT_ONLY_USER_PLACEHOLDER;
}

function usesAnthropicMessagesPayload(endpoint: string): boolean {
  return endpoint.includes('/api/proxy/anthropic/');
}

async function buildAnthropicMessageContent(
  message: ChatMessage,
  projectId: string,
): Promise<ProxyMessageContent> {
  const imageAttachments = sortAttachmentsByUserOrder(
    (message.attachments ?? []).filter((attachment) => attachment.kind === 'image'),
  );
  if (message.role !== 'user' || imageAttachments.length === 0) {
    return message.content;
  }

  const blocks: Array<ProxyTextContentBlock | ProxyImageContentBlock> = [];
  if (message.content.trim()) {
    blocks.push({ type: 'text', text: message.content });
  }

  for (const attachment of imageAttachments) {
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

async function readAnthropicImageBlock(
  projectId: string,
  path: string,
): Promise<ProxyImageContentBlock | null> {
  try {
    const resp = await fetch(projectFileUrl(projectId, path), { cache: 'no-store' });
    if (!resp.ok) return null;

    const mediaType = supportedAnthropicImageMediaType(
      resp.headers.get('content-type') ?? '',
      path,
    );
    if (!mediaType) return null;

    const bytes = new Uint8Array(await resp.arrayBuffer());
    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: mediaType,
        data: bytesToBase64(bytes),
      },
    };
  } catch {
    return null;
  }
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

function proxyErrorMessage(data: Record<string, unknown>): string {
  const nested = data.error;
  if (nested && typeof nested === 'object' && 'message' in nested) {
    const message = (nested as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return String(data.message ?? 'proxy error');
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
