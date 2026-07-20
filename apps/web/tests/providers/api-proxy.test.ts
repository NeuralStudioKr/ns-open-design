import { afterEach, describe, expect, it, vi } from 'vitest';

import { historyWithApiAttachmentContext } from '../../src/api-attachment-context';
import {
  commentsToAttachments,
  historyWithCommentAttachmentContext,
} from '../../src/comments';
import {
  buildProxyMessages,
  buildProxyResponseError,
  shouldSoftRetryProxyFailure,
  streamProxyEndpoint,
} from '../../src/providers/api-proxy';
import type { ChatMessage } from '../../src/types';

describe('buildProxyMessages', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('serializes image attachments as Anthropic image content blocks', async () => {
    const pngBytes = new Uint8Array([137, 80, 78, 71]);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: {
          get: (name: string) => (name.toLowerCase() === 'content-type' ? 'image/png' : null),
        },
        arrayBuffer: async () => pngBytes.buffer,
      }),
    );

    const messages = await buildProxyMessages(
      '/api/proxy/anthropic/stream',
      [
        userMessage('Describe the attached image', [
          { path: 'references/logo.png', name: 'logo.png', kind: 'image', size: 4 },
        ]),
      ],
      { projectId: 'project-1' },
    );

    expect(fetch).toHaveBeenCalledWith(
      '/api/projects/project-1/raw/references/logo.png',
      { cache: 'no-store' },
    );
    expect(messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe the attached image' },
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: 'iVBORw==',
            },
          },
        ],
      },
    ]);
  });

  it('serializes Anthropic image blocks in user-visible attachment order', async () => {
    const pngBytes = new Uint8Array([137, 80, 78, 71]);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: {
          get: (name: string) => (name.toLowerCase() === 'content-type' ? 'image/png' : null),
        },
        arrayBuffer: async () => pngBytes.buffer,
      }),
    );

    await buildProxyMessages(
      '/api/proxy/anthropic/stream',
      [
        userMessage('Compare them', [
          { path: 'references/second.png', name: 'second.png', kind: 'image', size: 4, order: 1 },
          { path: 'references/first.png', name: 'first.png', kind: 'image', size: 4, order: 0 },
        ]),
      ],
      { projectId: 'project-1' },
    );

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      '/api/projects/project-1/raw/references/first.png',
      { cache: 'no-store' },
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      '/api/projects/project-1/raw/references/second.png',
      { cache: 'no-store' },
    );
  });

  it('keeps non-Anthropic proxy messages as plain text', async () => {
    vi.stubGlobal('fetch', vi.fn());

    const messages = await buildProxyMessages(
      '/api/proxy/openai/stream',
      [
        userMessage('Describe the attached image', [
          { path: 'references/logo.png', name: 'logo.png', kind: 'image', size: 4 },
        ]),
      ],
      { projectId: 'project-1' },
    );

    expect(fetch).not.toHaveBeenCalled();
    expect(messages).toEqual([
      { role: 'user', content: 'Describe the attached image' },
    ]);
  });

  it('parses proxy usage SSE events before end', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode([
                'event: usage',
                'data: {"input_tokens":42,"output_tokens":7,"model":"claude-sonnet-4-5"}',
                '',
                'event: end',
                'data: {}',
                '',
              ].join('\n')),
            );
            controller.close();
          },
        }),
      }),
    );

    const onUsage = vi.fn();
    const onDone = vi.fn();

    await streamProxyEndpoint(
      '/api/proxy/anthropic/stream',
      {
        apiKey: 'test-api-key',
        baseUrl: 'https://anthropic.example',
        model: 'claude-sonnet-4-5',
      } as any,
      'System prompt',
      [{ id: 'm1', role: 'user', content: 'hi', createdAt: 1 }],
      new AbortController().signal,
      {
        onDelta: vi.fn(),
        onDone,
        onError: vi.fn(),
        onUsage,
      },
    );

    expect(onUsage).toHaveBeenCalledWith({
      inputTokens: 42,
      outputTokens: 7,
      model: 'claude-sonnet-4-5',
    });
    expect(onDone).toHaveBeenCalled();
  });

  it('dispatches thinking_delta SSE events to onThinkingDelta', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode([
                'event: thinking_delta',
                'data: {"delta":"plan step"}',
                '',
                'event: delta',
                'data: {"delta":"Answer"}',
                '',
                'event: end',
                'data: {}',
                '',
              ].join('\n')),
            );
            controller.close();
          },
        }),
      }),
    );

    const onThinkingDelta = vi.fn();
    const onDelta = vi.fn();

    await streamProxyEndpoint(
      '/api/proxy/openai/stream',
      {
        apiKey: 'test-api-key',
        baseUrl: 'https://minimax.example',
        model: 'MiniMax-M3',
      } as any,
      'System prompt',
      [{ id: 'm1', role: 'user', content: 'hi', createdAt: 1 }],
      new AbortController().signal,
      {
        onDelta,
        onDone: vi.fn(),
        onError: vi.fn(),
        onThinkingDelta,
      },
    );

    expect(onThinkingDelta).toHaveBeenCalledWith('plan step');
    expect(onDelta).toHaveBeenCalledWith('Answer');
  });

  it('sends Anthropic image content blocks in the proxy request body', async () => {
    const pngBytes = new Uint8Array([137, 80, 78, 71]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (name: string) => (name.toLowerCase() === 'content-type' ? 'image/png' : null),
        },
        arrayBuffer: async () => pngBytes.buffer,
      })
      .mockResolvedValueOnce({
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode('event: end\ndata: {}\n\n'),
            );
            controller.close();
          },
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    await streamProxyEndpoint(
      '/api/proxy/anthropic/stream',
      {
        apiKey: 'test-api-key',
        baseUrl: 'https://anthropic-compatible.example',
        model: 'vision-model',
      } as any,
      'System prompt',
      [
        userMessage('Describe the attached image', [
          { path: 'references/logo.png', name: 'logo.png', kind: 'image', size: 4 },
        ]),
      ],
      new AbortController().signal,
      {
        onDelta: vi.fn(),
        onDone: vi.fn(),
        onError: vi.fn(),
      },
      { projectId: 'project-1' },
    );

    const proxyInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(JSON.parse(String(proxyInit.body))).toMatchObject({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe the attached image' },
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: 'iVBORw==',
              },
            },
          ],
        },
      ],
      projectId: 'project-1',
    });
  });

  it('keeps a text fallback when a supported Anthropic image cannot be read', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        headers: { get: () => null },
        arrayBuffer: async () => new ArrayBuffer(0),
      }),
    );

    const messages = await buildProxyMessages(
      '/api/proxy/anthropic/stream',
      [
        userMessage('Describe the attached image', [
          { path: 'references/logo.png', name: 'logo.png', kind: 'image', size: 4 },
        ]),
      ],
      { projectId: 'project-1' },
    );

    expect(messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe the attached image' },
          {
            type: 'text',
            text: 'Attached image could not be sent as native image content: path: references/logo.png | name: logo.png',
          },
        ],
      },
    ]);
  });

  it('never forwards empty Anthropic user messages after comment history enrichment', async () => {
    const attachments = commentsToAttachments([
      {
        id: 'c1',
        projectId: 'project-1',
        conversationId: 'conversation-1',
        filePath: 'deck.html',
        elementId: 'hero-title',
        selector: '[data-od-id="hero-title"]',
        label: 'h1.hero-title',
        text: 'Current title',
        position: { x: 1, y: 2, width: 3, height: 4 },
        htmlHint: '<h1 data-od-id="hero-title">',
        note: 'Shorten this title',
        status: 'open',
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    const history = historyWithCommentAttachmentContext([
      {
        id: 'old',
        role: 'user',
        content: '',
        createdAt: 1,
        commentAttachments: attachments,
      },
      userMessage('Follow up on the title'),
    ]);

    const messages = await buildProxyMessages('/api/proxy/anthropic/stream', history, {
      projectId: 'project-1',
    });

    expect(messages[0]?.role).toBe('user');
    expect(typeof messages[0]?.content).toBe('string');
    expect(String(messages[0]?.content).trim().length).toBeGreaterThan(0);
    expect(String(messages[0]?.content)).toContain('<attached-preview-comments>');
    expect(String(messages[1]?.content)).toBe('Follow up on the title');
  });

  it('replaces blank Anthropic user strings without mutating OpenAI payloads', async () => {
    const blankUser: ChatMessage = {
      id: 'blank',
      role: 'user',
      content: '   ',
      createdAt: 1,
    };

    await expect(
      buildProxyMessages('/api/proxy/anthropic/stream', [blankUser], { projectId: 'project-1' }),
    ).resolves.toEqual([
      { role: 'user', content: '(No extra typed instruction.)' },
    ]);

    await expect(
      buildProxyMessages('/api/proxy/openai/stream', [blankUser], { projectId: 'project-1' }),
    ).resolves.toEqual([{ role: 'user', content: '   ' }]);
  });

  it('does not send preview-unavailable text alongside sketch raster image blocks', async () => {
    const pngBytes = new Uint8Array([137, 80, 78, 71]);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: {
          get: (name: string) => (name.toLowerCase() === 'content-type' ? 'image/png' : null),
        },
        arrayBuffer: async () => pngBytes.buffer,
      }),
    );

    const history = await historyWithApiAttachmentContext(
      [
        userMessage('Describe this image', [
          { path: 'sketch-hero.png', name: 'sketch-hero.png', kind: 'image', size: 4 },
        ]),
      ],
      'msg-1',
      'project-1',
      [
        {
          name: 'sketch-hero.png',
          path: 'sketch-hero.png',
          type: 'file',
          size: 4,
          mtime: 123,
          kind: 'sketch',
          mime: 'image/png',
        },
      ],
      { omitNativeImageAttachments: true },
    );

    const messages = await buildProxyMessages(
      '/api/proxy/anthropic/stream',
      history,
      { projectId: 'project-1' },
    );

    expect(JSON.stringify(messages)).not.toContain('Content preview unavailable');
    expect(messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe this image' },
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: 'iVBORw==',
            },
          },
        ],
      },
    ]);
  });
});

function userMessage(
  content: string,
  attachments: NonNullable<ChatMessage['attachments']>,
): ChatMessage {
  return {
    id: 'msg-1',
    role: 'user',
    content,
    createdAt: 1,
    attachments,
  };
}

// Regression guard for the chat error diagnostic copy. Before parsing the
// daemon's structured error envelope, every proxy 4xx/5xx surfaced as
// `error_code: n/a` even when the daemon already answered with a specific
// code (e.g. `MANAGED_API_KEY_MISSING` from a daemon container missing
// TEAMVER_OD_API_KEY).
describe('buildProxyResponseError', () => {
  it('extracts the daemon error code + message from a nested error envelope', () => {
    const err = buildProxyResponseError(
      503,
      JSON.stringify({
        error: {
          code: 'MANAGED_API_KEY_MISSING',
          message: 'Server-managed BYOK key is not configured on this daemon.',
        },
      }),
    );
    expect(err.code).toBe('MANAGED_API_KEY_MISSING');
    expect(err.message).toContain('MANAGED_API_KEY_MISSING');
    expect(err.message).toContain('Server-managed BYOK key is not configured');
    expect(err.message).toContain('proxy 503');
  });

  it('extracts code + message from a flat envelope (no nested error)', () => {
    const err = buildProxyResponseError(
      400,
      JSON.stringify({ code: 'BAD_REQUEST', message: 'model is required' }),
    );
    expect(err.code).toBe('BAD_REQUEST');
    expect(err.message).toContain('model is required');
  });

  it('falls back to the raw body when the response is not JSON', () => {
    const err = buildProxyResponseError(502, '<html><body>Bad Gateway</body></html>');
    expect(err.code).toBeUndefined();
    expect(err.message).toContain('proxy 502');
    expect(err.message).toContain('<html>');
  });

  it('uses "no body" when the response body is empty', () => {
    const err = buildProxyResponseError(500, '');
    expect(err.code).toBeUndefined();
    expect(err.message).toBe('proxy 500: no body');
  });

  it('ignores empty/blank code fields without throwing', () => {
    const err = buildProxyResponseError(
      400,
      JSON.stringify({ error: { code: '   ', message: 'something' } }),
    );
    expect(err.code).toBeUndefined();
    expect(err.message).toContain('something');
  });

  it('forwards the code into Error.code so ChatPane diagnostic copy renders it', () => {
    const err = buildProxyResponseError(
      503,
      JSON.stringify({ error: { code: 'MANAGED_API_KEY_MISSING', message: 'op missed env' } }),
    );
    // ChatPane reads `(err as Error & { code?: string }).code` — guard the
    // exact shape so a future refactor cannot silently drop the code.
    const typed = err as Error & { code?: string };
    expect(typed.code).toBe('MANAGED_API_KEY_MISSING');
    expect(typed).toBeInstanceOf(Error);
  });

  it('parses legacy BYOK materialization 502 envelope (error_code + string error)', () => {
    const err = buildProxyResponseError(
      502,
      JSON.stringify({
        error: 'project storage unavailable',
        error_code: 'PROJECT_STORAGE_UNAVAILABLE',
        details: 'teamver_project_s3_prefix_required',
      }),
    );
    expect(err.code).toBe('PROJECT_STORAGE_UNAVAILABLE');
    expect(err.message).toContain('PROJECT_STORAGE_UNAVAILABLE');
    expect(err.message).toContain('project storage unavailable');
  });
});

describe('shouldSoftRetryProxyFailure', () => {
  it('retries UPSTREAM_UNAVAILABLE and explicit retryable', () => {
    const upstream = new Error('upstream') as Error & { code?: string; retryable?: boolean };
    upstream.code = 'UPSTREAM_UNAVAILABLE';
    expect(shouldSoftRetryProxyFailure(upstream)).toBe(true);

    const flagged = new Error('x') as Error & { retryable?: boolean };
    flagged.retryable = true;
    expect(shouldSoftRetryProxyFailure(flagged)).toBe(true);
  });

  it('retries nginx HTML 502 without structured code', () => {
    expect(
      shouldSoftRetryProxyFailure(new Error('proxy 502: <html>Bad Gateway</html>')),
    ).toBe(true);
  });

  it('retries storage / network message shapes', () => {
    const storage = new Error('proxy 502') as Error & { code?: string };
    storage.code = 'PROJECT_STORAGE_UNAVAILABLE';
    expect(shouldSoftRetryProxyFailure(storage)).toBe(true);
    expect(shouldSoftRetryProxyFailure(new Error('TypeError: Failed to fetch'))).toBe(true);
  });

  it('does not retry when retryable was explicitly cleared after deltas', () => {
    const afterDelta = new Error('upstream') as Error & { code?: string; retryable?: boolean };
    afterDelta.code = 'UPSTREAM_UNAVAILABLE';
    afterDelta.retryable = false;
    expect(shouldSoftRetryProxyFailure(afterDelta)).toBe(false);
  });

  it('does not retry auth / bad request', () => {
    const unauthorized = new Error('proxy 401') as Error & { code?: string };
    unauthorized.code = 'UNAUTHORIZED';
    expect(shouldSoftRetryProxyFailure(unauthorized)).toBe(false);
    const bad = new Error('proxy 400') as Error & { code?: string };
    bad.code = 'BAD_REQUEST';
    expect(shouldSoftRetryProxyFailure(bad)).toBe(false);
  });
});
