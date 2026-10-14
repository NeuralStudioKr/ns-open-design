import type { ProxyStreamProgressPayload } from '@open-design/contracts';

export type HostedBufferedProgress = ProxyStreamProgressPayload;

export type HostedBufferedUsage = {
  inputTokens: number;
  outputTokens: number;
};

export type HostedBufferedStreamResult =
  | { kind: 'complete'; text: string; usage: HostedBufferedUsage }
  | { kind: 'incomplete'; usage: HostedBufferedUsage; text: string }
  | { kind: 'provider_error'; data: unknown; usage: HostedBufferedUsage };

export type HostedBufferedRepairRequest = {
  attempt: number;
  fullRewrite: boolean;
  partial: string;
};

export type CollectHostedBufferedStreamOptions = {
  initialResponse: any;
  isComplete: (text: string) => boolean;
  merge: (partial: string, continuation: string) => string;
  createRepairResponse?: (request: HostedBufferedRepairRequest) => Promise<any>;
  extractProviderError?: (data: unknown) => string | null;
  onProgress?: (progress: HostedBufferedProgress) => void;
  onUsage?: (usage: HostedBufferedUsage) => void;
  maxRepairAttempts?: number;
  maxBufferedBytes?: number;
  contentIdleTimeoutMs?: number;
  totalTimeoutMs?: number;
  progressThrottleMs?: number;
  startedAtMs?: number;
  now?: () => number;
};

const DEFAULT_MAX_BUFFERED_BYTES = 8 * 1024 * 1024;
const DEFAULT_CONTENT_IDLE_TIMEOUT_MS = 6 * 60 * 1000;
const DEFAULT_TOTAL_TIMEOUT_MS = 14 * 60 * 1000;
const DEFAULT_PROGRESS_THROTTLE_MS = 3_000;
const DEFAULT_CONNECT_TIMEOUT_MS = 30_000;
export const HOSTED_BUFFERED_FINAL_CHUNK_BYTES = 48 * 1024;
export const HOSTED_BUFFERED_MAX_SSE_FRAME_BYTES = 64 * 1024;
const DELTA_SSE_FRAME_FIXED_BYTES = Buffer.byteLength(
  'event: delta\ndata: {"delta":""}\n\n',
  'utf8',
);

type ParsedSseFrame = { payload: string; data: any };

function parseSseFrame(frame: string): ParsedSseFrame {
  const dataLines: string[] = [];
  for (const line of frame.replace(/\r/g, '').split('\n')) {
    if (!line.startsWith('data:')) continue;
    let value = line.slice(5);
    if (value.startsWith(' ')) value = value.slice(1);
    dataLines.push(value);
  }
  const payload = dataLines.join('\n');
  if (!payload || payload === '[DONE]') return { payload, data: null };
  try {
    return { payload, data: JSON.parse(payload) };
  } catch {
    return { payload, data: null };
  }
}

function positiveLimit(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

function timeoutError(message: string): Error & { code: string; retryable: boolean } {
  return Object.assign(new Error(message), {
    code: 'AGENT_EXECUTION_STALLED',
    retryable: true,
  });
}

export async function fetchHostedBufferedUpstream(
  input: string | URL,
  init: Record<string, any>,
  connectTimeoutMs = DEFAULT_CONNECT_TIMEOUT_MS,
): Promise<any> {
  const timeoutMs = positiveLimit(connectTimeoutMs, DEFAULT_CONNECT_TIMEOUT_MS);
  const timeoutController = new AbortController();
  const parentSignal = init.signal instanceof AbortSignal ? init.signal : null;
  const combinedSignal = parentSignal
    ? AbortSignal.any([parentSignal, timeoutController.signal])
    : timeoutController.signal;
  let connectTimedOut = false;
  const timer = setTimeout(() => {
    connectTimedOut = true;
    timeoutController.abort();
  }, timeoutMs);
  try {
    return await fetch(input, { ...init, signal: combinedSignal });
  } catch (error) {
    if (connectTimedOut) {
      throw timeoutError('Hosted upstream connection timed out');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function overflowError(maxBytes: number): Error & { code: string; retryable: boolean } {
  return Object.assign(new Error(`Hosted buffered output exceeded ${maxBytes} bytes`), {
    code: 'UPSTREAM_OUTPUT_TOO_LARGE',
    retryable: false,
  });
}

function cancelReader(reader: any): void {
  try {
    void Promise.resolve(reader.cancel()).catch(() => undefined);
  } catch {
    // Cancellation is best-effort; the terminal result still wins.
  }
}

async function readWithDeadline(
  reader: any,
  timeoutMs: number,
): Promise<{ done: boolean; value?: Uint8Array }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cancelReader(reader);
      reject(timeoutError('Hosted upstream stream timed out due to content inactivity'));
    }, timeoutMs);
    reader.read().then(
      (result: { done: boolean; value?: Uint8Array }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function collectOneResponse(
  response: any,
  options: {
    maxBufferedBytes: number;
    contentIdleTimeoutMs: number;
    totalDeadline: number;
    extractProviderError?: (data: unknown) => string | null;
    onContent: () => void;
    now: () => number;
  },
): Promise<
  | { kind: 'text'; text: string; usage: HostedBufferedUsage }
  | { kind: 'provider_error'; data: unknown; usage: HostedBufferedUsage }
> {
  if (!response?.body?.getReader) {
    throw Object.assign(new Error('Hosted upstream returned no readable stream'), {
      code: 'UPSTREAM_UNAVAILABLE',
      retryable: true,
    });
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  const usage = { inputTokens: 0, outputTokens: 0 };
  let bufferedBytes = 0;
  let frameBuffer = '';
  let lastContentAt = options.now();

  const consume = (frame: string): { providerError?: unknown } => {
    const parsed = parseSseFrame(frame);
    if (!parsed.data) return {};
    const providerError = options.extractProviderError?.(parsed.data);
    if (providerError) return { providerError: parsed.data };

    const providerUsage = parsed.data?.usage;
    if (typeof providerUsage?.prompt_tokens === 'number' && providerUsage.prompt_tokens > 0) {
      usage.inputTokens += providerUsage.prompt_tokens;
    }
    if (
      typeof providerUsage?.completion_tokens === 'number'
      && providerUsage.completion_tokens > 0
    ) {
      usage.outputTokens += providerUsage.completion_tokens;
    }

    const choices = parsed.data?.choices;
    const content = Array.isArray(choices) && typeof choices[0]?.delta?.content === 'string'
      ? choices[0].delta.content
      : '';
    if (!content) return {};
    const contentBytes = Buffer.byteLength(content, 'utf8');
    if (bufferedBytes + contentBytes > options.maxBufferedBytes) {
      cancelReader(reader);
      throw overflowError(options.maxBufferedBytes);
    }
    chunks.push(content);
    bufferedBytes += contentBytes;
    if (content.trim().length > 0) {
      lastContentAt = options.now();
      options.onContent();
    }
    return {};
  };

  while (true) {
    const now = options.now();
    const remainingTotal = options.totalDeadline - now;
    const remainingIdle = options.contentIdleTimeoutMs - (now - lastContentAt);
    const remaining = Math.min(remainingTotal, remainingIdle);
    if (remaining <= 0) {
      cancelReader(reader);
      throw timeoutError('Hosted upstream stream exceeded its time budget');
    }
    const { done, value } = await readWithDeadline(reader, remaining);
    if (done) break;
    frameBuffer += decoder.decode(value, { stream: true });

    while (true) {
      const match = frameBuffer.match(/\r?\n\r?\n/);
      if (!match || match.index === undefined) break;
      const frame = frameBuffer.slice(0, match.index);
      frameBuffer = frameBuffer.slice(match.index + match[0].length);
      const consumed = consume(frame);
      if (consumed.providerError !== undefined) {
        cancelReader(reader);
        return { kind: 'provider_error', data: consumed.providerError, usage };
      }
    }
  }

  const tail = `${frameBuffer}${decoder.decode()}`.trim();
  if (tail) {
    const consumed = consume(tail);
    if (consumed.providerError !== undefined) {
      return { kind: 'provider_error', data: consumed.providerError, usage };
    }
  }
  return { kind: 'text', text: chunks.join(''), usage };
}

export async function collectHostedBufferedStream(
  options: CollectHostedBufferedStreamOptions,
): Promise<HostedBufferedStreamResult> {
  const now = options.now ?? Date.now;
  const maxBufferedBytes = positiveLimit(
    options.maxBufferedBytes,
    DEFAULT_MAX_BUFFERED_BYTES,
  );
  const contentIdleTimeoutMs = positiveLimit(
    options.contentIdleTimeoutMs,
    DEFAULT_CONTENT_IDLE_TIMEOUT_MS,
  );
  const totalTimeoutMs = positiveLimit(options.totalTimeoutMs, DEFAULT_TOTAL_TIMEOUT_MS);
  const progressThrottleMs = positiveLimit(
    options.progressThrottleMs,
    DEFAULT_PROGRESS_THROTTLE_MS,
  );
  const maxRepairAttempts = Math.max(0, Math.min(2, options.maxRepairAttempts ?? 0));
  const startedAt = typeof options.startedAtMs === 'number'
    && Number.isFinite(options.startedAtMs)
    ? options.startedAtMs
    : now();
  const totalDeadline = startedAt + totalTimeoutMs;
  const totalUsage = { inputTokens: 0, outputTokens: 0 };
  let response = options.initialResponse;
  let accumulated = '';
  let lastContentProgressAt: number | null = null;

  const emitProgress = (progress: HostedBufferedProgress) => {
    try {
      options.onProgress?.(progress);
    } catch {
      // Progress is observational and must never fail artifact generation.
    }
  };

  for (let attempt = 0; attempt <= maxRepairAttempts; attempt += 1) {
    const result = await collectOneResponse(response, {
      maxBufferedBytes,
      contentIdleTimeoutMs,
      totalDeadline,
      ...(options.extractProviderError
        ? { extractProviderError: options.extractProviderError }
        : {}),
      now,
      onContent: () => {
        const current = now();
        if (
          lastContentProgressAt === null
          || current - lastContentProgressAt >= progressThrottleMs
        ) {
          lastContentProgressAt = current;
          emitProgress({ phase: 'generating', activity: 'content' });
        }
      },
    });
    totalUsage.inputTokens += result.usage.inputTokens;
    totalUsage.outputTokens += result.usage.outputTokens;
    try {
      options.onUsage?.(result.usage);
    } catch {
      // Usage observation must not break the transport state machine.
    }
    if (result.kind === 'provider_error') {
      return { kind: 'provider_error', data: result.data, usage: totalUsage };
    }

    const fullRewrite = attempt > 1;
    accumulated = attempt === 0 || fullRewrite
      ? result.text
      : options.merge(accumulated, result.text);
    if (Buffer.byteLength(accumulated, 'utf8') > maxBufferedBytes) {
      throw overflowError(maxBufferedBytes);
    }
    emitProgress({ phase: 'validating' });
    if (options.isComplete(accumulated)) {
      return { kind: 'complete', text: accumulated, usage: totalUsage };
    }
    if (attempt >= maxRepairAttempts || !options.createRepairResponse) break;

    const repairAttempt = attempt + 1;
    emitProgress({ phase: 'repairing', attempt: repairAttempt });
    response = await options.createRepairResponse({
      attempt: repairAttempt,
      fullRewrite: repairAttempt > 1,
      partial: accumulated,
    });
  }

  return { kind: 'incomplete', usage: totalUsage, text: accumulated };
}

export function splitHostedBufferedFinalText(
  text: string,
  maxBytes = HOSTED_BUFFERED_FINAL_CHUNK_BYTES,
): string[] {
  const limit = positiveLimit(maxBytes, HOSTED_BUFFERED_FINAL_CHUNK_BYTES);
  if (!text) return [];
  const chunks: string[] = [];
  let current: string[] = [];
  let currentBytes = 0;
  let currentEscapedBytes = 0;
  for (const codePoint of text) {
    const codePointBytes = Buffer.byteLength(codePoint, 'utf8');
    const escapedCodePoint = JSON.stringify(codePoint).slice(1, -1);
    const escapedBytes = Buffer.byteLength(escapedCodePoint, 'utf8');
    if (
      currentBytes > 0
      && (
        currentBytes + codePointBytes > limit
        || DELTA_SSE_FRAME_FIXED_BYTES + currentEscapedBytes + escapedBytes
          > HOSTED_BUFFERED_MAX_SSE_FRAME_BYTES
      )
    ) {
      chunks.push(current.join(''));
      current = [];
      currentBytes = 0;
      currentEscapedBytes = 0;
    }
    current.push(codePoint);
    currentBytes += codePointBytes;
    currentEscapedBytes += escapedBytes;
  }
  if (current.length > 0) chunks.push(current.join(''));
  return chunks;
}
