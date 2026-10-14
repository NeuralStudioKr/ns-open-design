import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  collectHostedBufferedStream,
  fetchHostedBufferedUpstream,
  HOSTED_BUFFERED_MAX_SSE_FRAME_BYTES,
  splitHostedBufferedFinalText,
} from '../src/hosted-managed-buffered-stream.js';

function upstreamSse(frames: unknown[]): Response {
  const body = frames.map((frame) => (
    frame === '[DONE]'
      ? 'data: [DONE]\n\n'
      : `data: ${JSON.stringify(frame)}\n\n`
  )).join('');
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

function contentFrame(content: string): unknown {
  return { choices: [{ index: 0, delta: { content } }] };
}

describe('hosted managed buffered stream', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('bounds the upstream connection phase', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_input: unknown, init?: { signal?: AbortSignal }) => (
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        }, { once: true });
      })
    )));

    const pending = fetchHostedBufferedUpstream('https://upstream.invalid', {}, 30_000);
    const assertion = expect(pending).rejects.toMatchObject({
      code: 'AGENT_EXECUTION_STALLED',
      retryable: true,
    });
    await vi.advanceTimersByTimeAsync(30_001);
    await assertion;
  });

  it('buffers upstream text and publishes only a complete result to its caller', async () => {
    const onProgress = vi.fn();
    const result = await collectHostedBufferedStream({
      initialResponse: upstreamSse([
        contentFrame('{"slides":['),
        contentFrame('{"title":"one"}]}'),
        { choices: [], usage: { prompt_tokens: 10, completion_tokens: 4 } },
        '[DONE]',
      ]),
      isComplete: (text) => text.endsWith(']}'),
      merge: (left, right) => left + right,
      onProgress,
    });

    expect(result).toEqual({
      kind: 'complete',
      text: '{"slides":[{"title":"one"}]}',
      usage: { inputTokens: 10, outputTokens: 4 },
    });
    expect(onProgress).toHaveBeenCalledWith({
      phase: 'generating',
      activity: 'content',
    });
    expect(onProgress).toHaveBeenCalledWith({ phase: 'validating' });
  });

  it('repairs a truncated response inside the same collector request', async () => {
    const createRepairResponse = vi.fn().mockResolvedValue(
      upstreamSse([contentFrame(']}'), '[DONE]']),
    );
    const result = await collectHostedBufferedStream({
      initialResponse: upstreamSse([contentFrame('{"slides":['), '[DONE]']),
      isComplete: (text) => text.endsWith(']}'),
      merge: (left, right) => left + right,
      createRepairResponse,
      maxRepairAttempts: 2,
    });

    expect(result).toMatchObject({
      kind: 'complete',
      text: '{"slides":[]}',
    });
    expect(createRepairResponse).toHaveBeenCalledTimes(1);
    expect(createRepairResponse).toHaveBeenCalledWith({
      attempt: 1,
      fullRewrite: false,
      partial: '{"slides":[',
    });
  });

  it('returns provider errors without exposing buffered partial text', async () => {
    const providerError = { error: { message: 'private upstream detail' } };
    const result = await collectHostedBufferedStream({
      initialResponse: upstreamSse([
        contentFrame('{"slides":['),
        providerError,
      ]),
      isComplete: () => false,
      merge: (left, right) => left + right,
      extractProviderError: (data) => (
        (data as any)?.error?.message ? String((data as any).error.message) : null
      ),
    });

    expect(result).toEqual({
      kind: 'provider_error',
      data: providerError,
      usage: { inputTokens: 0, outputTokens: 0 },
    });
    expect(JSON.stringify(result)).not.toContain('{"slides":[');
  });

  it('rejects output beyond the hard UTF-8 byte limit', async () => {
    await expect(collectHostedBufferedStream({
      initialResponse: upstreamSse([contentFrame('가나다'), '[DONE]']),
      isComplete: () => true,
      merge: (left, right) => left + right,
      maxBufferedBytes: 8,
    })).rejects.toMatchObject({
      code: 'UPSTREAM_OUTPUT_TOO_LARGE',
      retryable: false,
    });
  });

  it('splits final publication on UTF-8-safe boundaries', () => {
    const source = '가나다라마바사-abcdef';
    const chunks = splitHostedBufferedFinalText(source, 7);
    expect(chunks.join('')).toBe(source);
    expect(chunks.every((chunk) => Buffer.byteLength(chunk, 'utf8') <= 7)).toBe(true);
  });

  it('keeps JSON-escaped SSE frames below the proxy frame limit', () => {
    const source = '"\\\n'.repeat(30_000);
    const chunks = splitHostedBufferedFinalText(source);
    expect(chunks.join('')).toBe(source);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      const frame = `event: delta\ndata: ${JSON.stringify({ delta: chunk })}\n\n`;
      expect(Buffer.byteLength(frame, 'utf8')).toBeLessThanOrEqual(
        HOSTED_BUFFERED_MAX_SSE_FRAME_BYTES,
      );
    }
  });
});
