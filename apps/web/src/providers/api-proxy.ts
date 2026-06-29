import { effectiveMaxTokens } from '../state/maxTokens';
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
import {
  hasChatApiCredentials,
  usesServerManagedChatApiKey,
} from '../teamver/chatApiCredentials';

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
  /** Embed BYOK — ties proxy usage SSE to the assistant message row for daemon-side billing staging. */
  assistantMessageId?: string;
  byokImageModel?: string;
  byokVideoModel?: string;
  byokSpeechModel?: string;
  byokSpeechVoice?: string;
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
    handlers.onError(new Error('Missing API key — open Settings and paste one in.'));
    return;
  }

  const managed = usesServerManagedChatApiKey(cfg);
  let acc = '';

  try {
    const messages = await buildProxyMessages(endpoint, history, context);
    const resp = await fetchTeamverDaemon(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseUrl: cfg.baseUrl,
        ...(managed ? { useManagedApiKey: true } : { apiKey: cfg.apiKey }),
        model: cfg.model,
        systemPrompt: system,
        messages,
        maxTokens: effectiveMaxTokens(cfg),
        apiVersion: cfg.apiVersion,
        ...(context?.projectId ? { projectId: context.projectId } : {}),
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
      handlers.onError(buildProxyResponseError(resp.status, text));
      return;
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
            acc += text;
            handlers.onDelta(text);
          }
          continue;
        }

        if (parsed.event === 'thinking_delta') {
          const thinking = String(parsed.data.delta ?? '');
          if (thinking) handlers.onThinkingDelta?.(thinking);
          continue;
        }

        if (parsed.event === 'error') {
          const err = new Error(proxyErrorMessage(parsed.data)) as Error & { code?: string };
          const codeCandidate =
            (parsed.data as { code?: unknown }).code
            ?? (parsed.data as { error?: { code?: unknown } }).error?.code;
          if (typeof codeCandidate === 'string' && codeCandidate.trim()) {
            err.code = codeCandidate.trim();
          }
          handlers.onError(err);
          return;
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
          handlers.onDone(acc);
          return;
        }
      }
    }

    handlers.onDone(acc);
  } catch (err) {
    if ((err as Error).name === 'AbortError') return;
    handlers.onError(err instanceof Error ? err : new Error(String(err)));
  }
}

export async function buildProxyMessages(
  endpoint: string,
  history: ChatMessage[],
  context?: ProxyContext,
): Promise<ProxyMessage[]> {
  if (!usesAnthropicMessagesPayload(endpoint) || !context?.projectId) {
    return history.map((m) => ({ role: m.role, content: m.content }));
  }

  const out: ProxyMessage[] = [];
  for (const message of history) {
    out.push({
      role: message.role,
      content: await buildAnthropicMessageContent(message, context.projectId),
    });
  }
  return out;
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
): Error & { code?: string } {
  const parsed = parseProxyErrorEnvelope(text);
  const codeFragment = parsed?.code ? `${parsed.code} ` : '';
  const messageFragment =
    (parsed?.message && parsed.message.trim())
    || (text && text.trim())
    || 'no body';
  const err = new Error(`proxy ${status}: ${codeFragment}${messageFragment}`) as Error & {
    code?: string;
  };
  if (parsed?.code) err.code = parsed.code;
  return err;
}

function parseProxyErrorEnvelope(
  text: string,
): { code?: string; message?: string } | null {
  if (!text || typeof text !== 'string') return null;
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') return null;
    const nested =
      (parsed as { error?: unknown }).error
      && typeof (parsed as { error?: unknown }).error === 'object'
        ? ((parsed as { error: { code?: unknown; message?: unknown } }).error)
        : null;
    const code =
      typeof nested?.code === 'string' && nested.code.trim()
        ? nested.code.trim()
        : typeof (parsed as { code?: unknown }).code === 'string'
          ? (parsed as { code: string }).code.trim() || undefined
          : undefined;
    const message =
      typeof nested?.message === 'string' && nested.message.trim()
        ? nested.message.trim()
        : typeof (parsed as { message?: unknown }).message === 'string'
          ? (parsed as { message: string }).message.trim() || undefined
          : undefined;
    if (!code && !message) return null;
    const out: { code?: string; message?: string } = {};
    if (code) out.code = code;
    if (message) out.message = message;
    return out;
  } catch {
    return null;
  }
}
