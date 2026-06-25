/**
 * Direct Anthropic SDK BYOK path used to drop token usage on the floor — the
 * `MessageStream` was awaited via `finalMessage()` but `handlers.onUsage` was
 * never called, so every embed BYOK run landed an ai_model_token_usages row
 * with input_tokens=0, output_tokens=0, billing_status='not_attempted'.
 *
 * These tests pin the fix in `apps/web/src/providers/anthropic.ts`: the
 * direct-SDK branch must invoke onUsage with the totals exposed by
 * `finalMessage().usage`, folding cache_creation + cache_read into the input
 * bucket so credit math does not under-bill prompt caching.
 *
 * See docs-teamver/24_AI_API_usage_capture_경로별_분석.md.
 */
import { describe, expect, it, vi } from 'vitest';

import type { AppConfig } from '../../src/types';

type FakeStreamOptions = {
  onText?: (delta: string) => void;
  usage: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  model: string;
  textDeltas?: string[];
  /** simulate stream.finalMessage() rejecting with the given error */
  rejectFinalWith?: Error;
  /** Optional `currentMessage` snapshot exposed by the SDK after a failure.
   *  Real `@anthropic-ai/sdk` populates this from message_start events, so
   *  even an aborted stream can still surface input_tokens for billing. */
  currentMessage?: { usage?: unknown; model?: unknown } | null;
};

class FakeMessageStream {
  private listeners: Array<(delta: string) => void> = [];
  private opts: FakeStreamOptions;

  constructor(opts: FakeStreamOptions) {
    this.opts = opts;
  }

  on(event: 'text', cb: (delta: string) => void): this {
    if (event === 'text') this.listeners.push(cb);
    return this;
  }

  get currentMessage(): { usage?: unknown; model?: unknown } | undefined {
    return this.opts.currentMessage ?? undefined;
  }

  async finalMessage(): Promise<{ usage: FakeStreamOptions['usage']; model: string }> {
    for (const delta of this.opts.textDeltas ?? []) {
      for (const cb of this.listeners) cb(delta);
    }
    if (this.opts.rejectFinalWith) throw this.opts.rejectFinalWith;
    return { usage: this.opts.usage, model: this.opts.model };
  }
}

const sdkState = vi.hoisted(() => ({
  nextStream: null as FakeMessageStream | null,
}));

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class Anthropic {
      messages = {
        stream: (_payload: unknown, _opts?: unknown) => {
          if (!sdkState.nextStream) throw new Error('test forgot to set nextStream');
          const s = sdkState.nextStream;
          sdkState.nextStream = null;
          return s;
        },
      };
      constructor(_init: unknown) {}
    },
  };
});

function queueStream(stream: FakeMessageStream): void {
  sdkState.nextStream = stream;
}

function makeCfg(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    apiKey: 'test-key',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-5',
    apiProtocol: 'anthropic',
    ...overrides,
  } as AppConfig;
}

describe('anthropic.ts direct SDK onUsage capture', () => {
  it('reports input/output tokens from finalMessage().usage', async () => {
    const { streamMessage } = await import('../../src/providers/anthropic');

    queueStream(new FakeMessageStream({
      usage: { input_tokens: 137, output_tokens: 42 },
      model: 'claude-sonnet-4-5',
      textDeltas: ['Hello', ' world'],
    }));

    const onUsage = vi.fn();
    const onDelta = vi.fn();
    const onDone = vi.fn();

    await streamMessage(
      makeCfg(),
      'system',
      [{ id: 'm1', role: 'user', content: 'hi', createdAt: 1 } as never],
      new AbortController().signal,
      { onDelta, onDone, onError: vi.fn(), onUsage },
    );

    expect(onDelta).toHaveBeenCalledWith('Hello');
    expect(onDelta).toHaveBeenCalledWith(' world');
    expect(onDone).toHaveBeenCalledWith('Hello world');
    expect(onUsage).toHaveBeenCalledTimes(1);
    expect(onUsage).toHaveBeenCalledWith({
      inputTokens: 137,
      outputTokens: 42,
      model: 'claude-sonnet-4-5',
    });
  });

  it('folds cache_creation_input_tokens + cache_read_input_tokens into inputTokens', async () => {
    const { streamMessage } = await import('../../src/providers/anthropic');

    queueStream(new FakeMessageStream({
      usage: {
        input_tokens: 100,
        output_tokens: 25,
        cache_creation_input_tokens: 50,
        cache_read_input_tokens: 200,
      },
      model: 'claude-sonnet-4-5',
    }));

    const onUsage = vi.fn();
    await streamMessage(
      makeCfg(),
      'system',
      [{ id: 'm1', role: 'user', content: 'hi', createdAt: 1 } as never],
      new AbortController().signal,
      { onDelta: vi.fn(), onDone: vi.fn(), onError: vi.fn(), onUsage },
    );

    expect(onUsage).toHaveBeenCalledWith({
      inputTokens: 350,
      outputTokens: 25,
      model: 'claude-sonnet-4-5',
    });
  });

  it('skips onUsage when both buckets are zero (preserves "no signal" state)', async () => {
    const { streamMessage } = await import('../../src/providers/anthropic');

    queueStream(new FakeMessageStream({
      usage: { input_tokens: 0, output_tokens: 0 },
      model: 'claude-sonnet-4-5',
    }));

    const onUsage = vi.fn();
    await streamMessage(
      makeCfg(),
      'system',
      [{ id: 'm1', role: 'user', content: 'hi', createdAt: 1 } as never],
      new AbortController().signal,
      { onDelta: vi.fn(), onDone: vi.fn(), onError: vi.fn(), onUsage },
    );

    expect(onUsage).not.toHaveBeenCalled();
  });

  it('falls back to cfg.model when finalMessage().model is missing', async () => {
    const { streamMessage } = await import('../../src/providers/anthropic');

    queueStream(new FakeMessageStream({
      usage: { input_tokens: 10, output_tokens: 2 },
      model: '',
    }));

    const onUsage = vi.fn();
    await streamMessage(
      makeCfg({ model: 'claude-haiku-test' }),
      'system',
      [{ id: 'm1', role: 'user', content: 'hi', createdAt: 1 } as never],
      new AbortController().signal,
      { onDelta: vi.fn(), onDone: vi.fn(), onError: vi.fn(), onUsage },
    );

    expect(onUsage).toHaveBeenCalledWith({
      inputTokens: 10,
      outputTokens: 2,
      model: 'claude-haiku-test',
    });
  });

  it('does not call onUsage when the stream errors with no currentMessage snapshot', async () => {
    const { streamMessage } = await import('../../src/providers/anthropic');

    queueStream(new FakeMessageStream({
      usage: { input_tokens: 0, output_tokens: 0 },
      model: 'claude-sonnet-4-5',
      rejectFinalWith: new Error('upstream 500'),
      currentMessage: null,
    }));

    const onUsage = vi.fn();
    const onError = vi.fn();
    await streamMessage(
      makeCfg(),
      'system',
      [{ id: 'm1', role: 'user', content: 'hi', createdAt: 1 } as never],
      new AbortController().signal,
      { onDelta: vi.fn(), onDone: vi.fn(), onError, onUsage },
    );

    expect(onError).toHaveBeenCalled();
    expect(onUsage).not.toHaveBeenCalled();
  });

  it('reports best-effort usage from currentMessage when finalMessage rejects mid-stream', async () => {
    const { streamMessage } = await import('../../src/providers/anthropic');

    queueStream(new FakeMessageStream({
      usage: { input_tokens: 0, output_tokens: 0 },
      model: 'claude-sonnet-4-5',
      rejectFinalWith: new Error('upstream 503'),
      currentMessage: {
        usage: { input_tokens: 220, output_tokens: 17 },
        model: 'claude-sonnet-4-5',
      },
    }));

    const onUsage = vi.fn();
    const onError = vi.fn();
    await streamMessage(
      makeCfg(),
      'system',
      [{ id: 'm1', role: 'user', content: 'hi', createdAt: 1 } as never],
      new AbortController().signal,
      { onDelta: vi.fn(), onDone: vi.fn(), onError, onUsage },
    );

    expect(onError).toHaveBeenCalled();
    expect(onUsage).toHaveBeenCalledTimes(1);
    expect(onUsage).toHaveBeenCalledWith({
      inputTokens: 220,
      outputTokens: 17,
      model: 'claude-sonnet-4-5',
    });
  });

  it('reports usage from currentMessage on abort (user cancel) without onError', async () => {
    const { streamMessage } = await import('../../src/providers/anthropic');

    const abortErr = new Error('aborted');
    abortErr.name = 'AbortError';
    queueStream(new FakeMessageStream({
      usage: { input_tokens: 0, output_tokens: 0 },
      model: 'claude-sonnet-4-5',
      rejectFinalWith: abortErr,
      currentMessage: {
        usage: { input_tokens: 415, output_tokens: 3 },
        model: 'claude-sonnet-4-5',
      },
    }));

    const onUsage = vi.fn();
    const onError = vi.fn();
    const onDone = vi.fn();
    await streamMessage(
      makeCfg(),
      'system',
      [{ id: 'm1', role: 'user', content: 'hi', createdAt: 1 } as never],
      new AbortController().signal,
      { onDelta: vi.fn(), onDone, onError, onUsage },
    );

    expect(onError).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    expect(onUsage).toHaveBeenCalledWith({
      inputTokens: 415,
      outputTokens: 3,
      model: 'claude-sonnet-4-5',
    });
  });

  it('does not double-emit when both finalMessage and currentMessage are populated', async () => {
    const { streamMessage } = await import('../../src/providers/anthropic');

    queueStream(new FakeMessageStream({
      usage: { input_tokens: 100, output_tokens: 20 },
      model: 'claude-sonnet-4-5',
      currentMessage: {
        usage: { input_tokens: 100, output_tokens: 20 },
        model: 'claude-sonnet-4-5',
      },
    }));

    const onUsage = vi.fn();
    await streamMessage(
      makeCfg(),
      'system',
      [{ id: 'm1', role: 'user', content: 'hi', createdAt: 1 } as never],
      new AbortController().signal,
      { onDelta: vi.fn(), onDone: vi.fn(), onError: vi.fn(), onUsage },
    );

    expect(onUsage).toHaveBeenCalledTimes(1);
  });

  it('coerces non-integer / NaN / negative provider values to a safe floor', async () => {
    const { streamMessage } = await import('../../src/providers/anthropic');

    queueStream(new FakeMessageStream({
      usage: {
        input_tokens: 12.7 as unknown as number,
        output_tokens: -5 as unknown as number,
        cache_read_input_tokens: Number.NaN as unknown as number,
      },
      model: 'claude-sonnet-4-5',
    }));

    const onUsage = vi.fn();
    await streamMessage(
      makeCfg(),
      'system',
      [{ id: 'm1', role: 'user', content: 'hi', createdAt: 1 } as never],
      new AbortController().signal,
      { onDelta: vi.fn(), onDone: vi.fn(), onError: vi.fn(), onUsage },
    );

    expect(onUsage).toHaveBeenCalledWith({
      inputTokens: 12,
      outputTokens: 0,
      model: 'claude-sonnet-4-5',
    });
  });
});
