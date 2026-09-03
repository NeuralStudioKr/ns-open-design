import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/teamver/teamverProjectS3PrefixResolve', () => ({
  waitForTeamverProjectStoragePrefix: vi.fn().mockResolvedValue(null),
}));

import { historyWithApiAttachmentContext } from '../../src/api-attachment-context';
import {
  commentsToAttachments,
  historyWithCommentAttachmentContext,
} from '../../src/comments';
import {
  anthropicImageCandidatesFromMessage,
  buildProxyMessages,
  buildProxyResponseError,
  filterAnthropicImageCandidatesByProjectFiles,
  isValidAnthropicImageBytes,
  MAX_ANTHROPIC_PROXY_IMAGE_BYTES,
  PROXY_STREAM_IDLE_TIMEOUT_DECK_MS,
  PROXY_STREAM_IDLE_TIMEOUT_MS,
  normalizeAnthropicProxyMessageRoles,
  resolveProxyStreamIdleTimeoutMs,
  shouldSoftRetryProxyFailure,
  streamProxyEndpoint,
} from '../../src/providers/api-proxy';
import { AUTO_CONTINUE_PROMPT_SENTINEL } from '../../src/runtime/resume';
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
      expect.objectContaining({
        cache: 'no-store',
        credentials: 'same-origin',
      }),
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
      expect.objectContaining({
        cache: 'no-store',
        credentials: 'same-origin',
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      '/api/projects/project-1/raw/references/second.png',
      expect.objectContaining({
        cache: 'no-store',
        credentials: 'same-origin',
      }),
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

  it('serializes visual comment screenshots when regular attachments were dropped', async () => {
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
        {
          id: 'msg-visual',
          role: 'user',
          content: '이 영역 고쳐줘',
          createdAt: 1,
          commentAttachments: [
            {
              id: 'visual-mark-1',
              order: 0,
              filePath: 'uploads/visual-mark-1.png',
              elementId: 'visual-mark-1',
              selector: '',
              label: 'Visual mark',
              comment: '키워줘',
              currentText: '',
              pagePosition: { x: 0.1, y: 0.2, width: 0.3, height: 0.2 },
              htmlHint: '',
              selectionKind: 'visual',
              screenshotPath: 'uploads/visual-mark-1.png',
              markKind: 'rect',
            },
          ],
        },
      ],
      { projectId: 'project-1' },
    );

    expect(fetch).toHaveBeenCalledWith(
      '/api/projects/project-1/raw/uploads/visual-mark-1.png',
      expect.objectContaining({
        cache: 'no-store',
        credentials: 'same-origin',
      }),
    );
    expect(messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: '이 영역 고쳐줘' },
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

  it('dedupes visual comment screenshots against regular image attachments', () => {
    const candidates = anthropicImageCandidatesFromMessage({
      attachments: [
        { path: 'uploads/visual-mark-1.png', name: 'visual-mark-1.png', kind: 'image', size: 4, order: 0 },
      ],
      commentAttachments: [
        {
          id: 'visual-mark-1',
          order: 0,
          filePath: 'uploads/visual-mark-1.png',
          elementId: 'visual-mark-1',
          selector: '',
          label: 'Visual mark',
          comment: '',
          currentText: '',
          pagePosition: { x: 0, y: 0, width: 1, height: 1 },
          htmlHint: '',
          selectionKind: 'visual',
          screenshotPath: 'uploads/visual-mark-1.png',
          markKind: 'rect',
        },
      ],
    });
    expect(candidates).toEqual([
      { path: 'uploads/visual-mark-1.png', name: 'visual-mark-1.png', order: 0 },
    ]);
  });

  it('dedupes visual comment screenshots against attachments with different path prefixes', () => {
    const candidates = anthropicImageCandidatesFromMessage({
      attachments: [
        { path: 'uploads/visual-mark-1.png', name: 'visual-mark-1.png', kind: 'image', size: 4, order: 0 },
      ],
      commentAttachments: [
        {
          id: 'visual-mark-1',
          order: 0,
          filePath: 'index.html',
          elementId: 'visual-mark-1',
          selector: '',
          label: 'Visual mark',
          comment: '',
          currentText: '',
          pagePosition: { x: 0, y: 0, width: 1, height: 1 },
          htmlHint: '',
          selectionKind: 'visual',
          screenshotPath: 'visual-mark-1.png',
          markKind: 'rect',
        },
      ],
    });
    expect(candidates).toEqual([
      { path: 'uploads/visual-mark-1.png', name: 'visual-mark-1.png', order: 0 },
    ]);
  });

  it('skips deleted visual-mark screenshots when building proxy messages', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const messages = await buildProxyMessages(
      '/api/proxy/anthropic/stream',
      [
        userMessage('Follow up without screenshots', []),
        userMessage('Earlier visual mark', [
          { path: 'ms8hq9qu-drawing-2026-07-31T05-17-03-125Z.png', name: 'mark.png', kind: 'image', size: 4, order: 0 },
        ]),
      ],
      {
        projectId: 'project-1',
        projectFileNames: new Set(['deck.html']),
      },
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(messages).toEqual([
      { role: 'user', content: 'Follow up without screenshots' },
      { role: 'assistant', content: '(No assistant reply was recorded.)' },
      { role: 'user', content: 'Earlier visual mark' },
    ]);
  });

  it('recovers vision candidates from @image mentions when attachments were dropped', () => {
    const candidates = anthropicImageCandidatesFromMessage({
      role: 'user',
      content: '이 이미지 넣어줘 @msh9rso1-서빙하는-금붕어.webp',
      attachments: [],
    });
    expect(candidates.map((item) => item.path)).toEqual(['msh9rso1-서빙하는-금붕어.webp']);
  });

  it('filters image candidates against the project file index', () => {
    const candidates = filterAnthropicImageCandidatesByProjectFiles(
      [
        { path: 'deck.html', name: 'deck.html' },
        { path: 'ms8hq9qu-drawing-2026-07-31T05-17-03-125Z.png', name: 'mark.png' },
      ],
      'project-1',
      new Set(['deck.html']),
    );
    expect(candidates).toEqual([{ path: 'deck.html', name: 'deck.html' }]);
  });

  it('keeps fresh Drive/local upload images when /files index is still stale', () => {
    const candidates = filterAnthropicImageCandidatesByProjectFiles(
      [
        { path: 'refs/drive/msh5lhfh-hero.png', name: 'msh5lhfh-hero.png' },
        { path: 'msh9y0i9-local.jpeg', name: 'msh9y0i9-local.jpeg' },
        { path: 'ms8hq9qu-drawing-2026-07-31T05-17-03-125Z.png', name: 'mark.png' },
      ],
      'project-1',
      new Set(['deck.html']),
    );
    expect(candidates.map((item) => item.path)).toEqual([
      'refs/drive/msh5lhfh-hero.png',
      'msh9y0i9-local.jpeg',
    ]);
  });

  it('keeps a text fallback when a supported Anthropic image cannot be read', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      headers: { get: () => null },
      arrayBuffer: async () => new ArrayBuffer(0),
    });
    vi.stubGlobal('fetch', fetchMock);

    const messages = await buildProxyMessages(
      '/api/proxy/anthropic/stream',
      [
        userMessage('Describe the attached image', [
          { path: 'references/logo.png', name: 'logo.png', kind: 'image', size: 4 },
        ]),
      ],
      { projectId: 'project-1' },
    );

    // Bounded auth/storage retries before falling back to a text notice.
    // Retry backoff is ~0+250+800+1600+3200ms — keep the case above that budget.
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
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
  }, 15_000);

  it('rejects non-image bodies that inherit a .png extension', async () => {
    const htmlBytes = new TextEncoder().encode('<html><body>Unauthorized</body></html>');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: {
          get: (name: string) => (name.toLowerCase() === 'content-type' ? 'image/png' : null),
        },
        arrayBuffer: async () => htmlBytes.buffer,
      }),
    );

    const messages = await buildProxyMessages(
      '/api/proxy/anthropic/stream',
      [
        userMessage('See screenshot', [
          { path: 'uploads/drawing.png', name: 'drawing.png', kind: 'image', size: htmlBytes.length },
        ]),
      ],
      { projectId: 'project-1' },
    );

    expect(messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'See screenshot' },
          {
            type: 'text',
            text: 'Attached image could not be sent as native image content: path: uploads/drawing.png | name: drawing.png',
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
    expect(messages[1]).toEqual({
      role: 'assistant',
      content: '(No assistant reply was recorded.)',
    });
    expect(String(messages[2]?.content)).toBe('Follow up on the title');
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

  it('replaces empty Anthropic assistant shells from failed runs', async () => {
    const history: ChatMessage[] = [
      {
        id: 'u1',
        role: 'user',
        content: '첫 요청',
        createdAt: 1,
      },
      {
        id: 'a1',
        role: 'assistant',
        content: '',
        createdAt: 2,
        runStatus: 'failed',
      },
      {
        id: 'u2',
        role: 'user',
        content: '슬라이드 3\n제목 크게',
        createdAt: 3,
      },
    ];

    const messages = await buildProxyMessages(
      '/api/proxy/anthropic/stream',
      history,
      { projectId: 'project-1' },
    );

    expect(messages).toEqual([
      { role: 'user', content: '첫 요청' },
      { role: 'assistant', content: '(No assistant reply was recorded.)' },
      { role: 'user', content: '슬라이드 3\n제목 크게' },
    ]);
  });

  it('inserts assistant placeholders between consecutive Anthropic user turns', async () => {
    const history: ChatMessage[] = [
      {
        id: 'u1',
        role: 'user',
        content: '첫 요청',
        createdAt: 1,
      },
      {
        id: 'a1',
        role: 'assistant',
        content: '응답',
        createdAt: 2,
      },
      {
        id: 'u-auto',
        role: 'user',
        content: `${AUTO_CONTINUE_PROMPT_SENTINEL}\n이어서 완성해 주세요`,
        createdAt: 3,
      },
      {
        id: 'u-memo',
        role: 'user',
        content: '슬라이드 3\n제목 크게',
        createdAt: 4,
        attachments: [{ path: 'uploads/drawing.png', name: 'drawing.png', kind: 'image', size: 4 }],
      },
    ];

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
      history,
      { projectId: 'project-1' },
    );

    expect(messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant',
      'user',
    ]);
    expect(messages[3]).toEqual({
      role: 'assistant',
      content: '(No assistant reply was recorded.)',
    });
    expect(messages[4]?.role).toBe('user');
  });

  it('skips oversized Anthropic image blocks and keeps a text fallback', async () => {
    const oversized = new Uint8Array(MAX_ANTHROPIC_PROXY_IMAGE_BYTES + 1);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: {
          get: (name: string) => (name.toLowerCase() === 'content-type' ? 'image/png' : null),
        },
        arrayBuffer: async () => oversized.buffer,
      }),
    );

    const messages = await buildProxyMessages(
      '/api/proxy/anthropic/stream',
      [
        userMessage('mark this region', [
          { path: 'uploads/drawing.png', name: 'drawing.png', kind: 'image', size: oversized.length },
        ]),
      ],
      { projectId: 'project-1' },
    );

    expect(messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'mark this region' },
          {
            type: 'text',
            text: 'Attached image could not be sent as native image content: path: uploads/drawing.png | name: drawing.png',
          },
        ],
      },
    ]);
  });

  it('normalizes Anthropic history that starts with an assistant row', () => {
    expect(
      normalizeAnthropicProxyMessageRoles([
        { role: 'assistant', content: 'orphan' },
        { role: 'user', content: 'follow up' },
      ]),
    ).toEqual([
      { role: 'user', content: '(No extra typed instruction.)' },
      { role: 'assistant', content: 'orphan' },
      { role: 'user', content: 'follow up' },
    ]);
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
    expect(messages).toHaveLength(1);
    expect(messages[0]?.role).toBe('user');
    const content = messages[0]?.content;
    expect(Array.isArray(content)).toBe(true);
    const parts = content as Array<Record<string, unknown>>;
    const textPart = parts.find((part) => part.type === 'text');
    expect(String(textPart?.text ?? '')).toContain('Describe this image');
    expect(String(textPart?.text ?? '')).toContain('path: sketch-hero.png');
    expect(String(textPart?.text ?? '')).toContain('<img src="sketch-hero.png"');
    expect(parts).toEqual(
      expect.arrayContaining([
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/png',
            data: 'iVBORw==',
          },
        },
      ]),
    );
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
describe('isValidAnthropicImageBytes', () => {
  it('accepts PNG magic bytes', () => {
    expect(isValidAnthropicImageBytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), 'image/png')).toBe(true);
  });

  it('rejects HTML error bodies labeled as PNG', () => {
    const html = new TextEncoder().encode('<html>');
    expect(isValidAnthropicImageBytes(html, 'image/png')).toBe(false);
  });
});

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

  it('retries premature close / hang-up shapes', () => {
    expect(shouldSoftRetryProxyFailure(new Error('premature close'))).toBe(true);
    expect(shouldSoftRetryProxyFailure(new Error('socket hang up'))).toBe(true);
  });

  it('does not retry managed-key / auth config failures', () => {
    const missing = new Error('proxy 503') as Error & { code?: string; retryable?: boolean };
    missing.code = 'MANAGED_API_KEY_MISSING';
    missing.retryable = true;
    expect(shouldSoftRetryProxyFailure(missing)).toBe(false);
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

describe('streamProxyEndpoint soft-retry gates', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('treats thinking-only EOF without end as non-retryable upstream error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                'event: thinking_delta\ndata: {"delta":"planning"}\n\n',
              ),
            );
            controller.close();
          },
        }),
      }),
    );

    const onError = vi.fn();
    const onDone = vi.fn();
    await streamProxyEndpoint(
      '/api/proxy/openai/stream',
      {
        apiKey: 'test-api-key',
        baseUrl: 'https://example.com',
        model: 'gpt-test',
      } as any,
      'System',
      [{ id: 'm1', role: 'user', content: 'hi', createdAt: 1 }],
      new AbortController().signal,
      { onDelta: vi.fn(), onDone, onError, onThinkingDelta: vi.fn() },
    );

    expect(onDone).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    const err = onError.mock.calls[0]?.[0] as Error & { code?: string; retryable?: boolean };
    expect(err.code).toBe('UPSTREAM_UNAVAILABLE');
    expect(err.retryable).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not soft-retry after thinking when the reader throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        body: {
          getReader() {
            let step = 0;
            return {
              read() {
                step += 1;
                if (step === 1) {
                  return Promise.resolve({
                    done: false,
                    value: new TextEncoder().encode(
                      'event: thinking_delta\ndata: {"delta":"plan"}\n\n',
                    ),
                  });
                }
                return Promise.reject(new TypeError('Failed to fetch'));
              },
              releaseLock() {},
              cancel() {},
            };
          },
        },
      }),
    );

    const onError = vi.fn();
    await streamProxyEndpoint(
      '/api/proxy/openai/stream',
      {
        apiKey: 'test-api-key',
        baseUrl: 'https://example.com',
        model: 'gpt-test',
      } as any,
      'System',
      [{ id: 'm1', role: 'user', content: 'hi', createdAt: 1 }],
      new AbortController().signal,
      { onDelta: vi.fn(), onDone: vi.fn(), onError, onThinkingDelta: vi.fn() },
    );

    expect(onError).toHaveBeenCalledTimes(1);
    const err = onError.mock.calls[0]?.[0] as Error & { retryable?: boolean };
    expect(err.retryable).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('streamProxyEndpoint Motif-SVG dump abort', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('calls onDone (not silent abort) and POSTs /api/proxy/abort', async () => {
    const { FILL_MOTIF_SVG_DUMP_STOP_REASON } = await import(
      '../../src/providers/proxyAbort'
    );
    const abortController = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo) => {
        const url = String(input);
        if (url.includes('/api/proxy/abort')) {
          return { ok: true, json: async () => ({ aborted: true }) };
        }
        return {
          ok: true,
          headers: {
            get: (name: string) =>
              name.toLowerCase() === 'x-stream-id' ? 'stream-fill-1' : null,
          },
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(
                new TextEncoder().encode(
                  'event: delta\ndata: {"delta":"<artifact type=\\"deck\\"><svg"}\n\n',
                ),
              );
            },
          }),
        };
      }),
    );

    const onDone = vi.fn();
    const onError = vi.fn();
    await streamProxyEndpoint(
      '/api/proxy/anthropic/stream',
      {
        apiKey: 'test-api-key',
        baseUrl: 'https://anthropic.example',
        model: 'claude-sonnet-4-5',
      } as any,
      'System',
      [{ id: 'm1', role: 'user', content: 'hi', createdAt: 1 }],
      abortController.signal,
      {
        onDelta: () => {
          abortController.abort(FILL_MOTIF_SVG_DUMP_STOP_REASON);
        },
        onDone,
        onError,
      },
    );

    expect(onDone).toHaveBeenCalled();
    expect(String(onDone.mock.calls[0]?.[0] ?? '')).toContain('<svg');
    expect(onError).not.toHaveBeenCalled();
  });
});

// loop184 / loop411 (AGENT_EXECUTION_STALLED)
//
// `readProxyStreamChunk` rejects with `code === "AGENT_EXECUTION_STALLED"` when
// the SSE body goes idle past the resolved timeout (5 min default, 10 min for
// deck minOutputTokens). That code must survive the outer `catch` block
// un-remapped, and the "no tokens streamed yet" gate must keep `retryable: true`
// while the "tokens already streamed" gate flips `retryable: false`.
describe('streamProxyEndpoint idle-timeout stall (AGENT_EXECUTION_STALLED)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('uses a longer idle window for deck minOutputTokens runs (loop411)', () => {
    expect(PROXY_STREAM_IDLE_TIMEOUT_MS).toBe(5 * 60 * 1000);
    expect(PROXY_STREAM_IDLE_TIMEOUT_DECK_MS).toBe(10 * 60 * 1000);
    expect(resolveProxyStreamIdleTimeoutMs()).toBe(PROXY_STREAM_IDLE_TIMEOUT_MS);
    expect(resolveProxyStreamIdleTimeoutMs({ minOutputTokens: 16_000 })).toBe(
      PROXY_STREAM_IDLE_TIMEOUT_DECK_MS,
    );
    expect(resolveProxyStreamIdleTimeoutMs({ streamIdleTimeoutMs: 90_000 })).toBe(90_000);
  });

  it('surfaces AGENT_EXECUTION_STALLED as non-retryable after a substantive delta', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        body: {
          getReader() {
            let step = 0;
            let pendingReject: ((err: unknown) => void) | null = null;
            return {
              read() {
                step += 1;
                if (step === 1) {
                  return Promise.resolve({
                    done: false,
                    value: new TextEncoder().encode(
                      'event: delta\ndata: {"delta":"Answer"}\n\n',
                    ),
                  });
                }
                return new Promise((_resolve, reject) => {
                  pendingReject = reject;
                });
              },
              cancel() {
                pendingReject?.(
                  Object.assign(new Error('canceled'), { name: 'AbortError' }),
                );
              },
              releaseLock() {},
            };
          },
        },
      }),
    );

    const onDelta = vi.fn();
    const onError = vi.fn();
    const onDone = vi.fn();
    const runPromise = streamProxyEndpoint(
      '/api/proxy/minimax/stream',
      {
        apiKey: 'test-api-key',
        baseUrl: 'https://api.minimaxi.com',
        model: 'MiniMax-M3',
      } as any,
      'System',
      [{ id: 'm1', role: 'user', content: 'hi', createdAt: 1 }],
      new AbortController().signal,
      { onDelta, onDone, onError },
    );

    // Advance timers past PROXY_STREAM_IDLE_TIMEOUT_MS (5 min) plus a bit.
    // Wait a microtask first so the first `read()` chunk lands and the idle
    // timer arms on the second read.
    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1000);
    await runPromise;

    expect(onDelta).toHaveBeenCalledWith('Answer');
    expect(onDone).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    const err = onError.mock.calls[0]?.[0] as Error & {
      code?: string;
      retryable?: boolean;
    };
    expect(err.code).toBe('AGENT_EXECUTION_STALLED');
    // Substantive delta was already painted — soft-retry would duplicate the
    // "Answer" tokens in the assistant card, so retryable must be forced off.
    expect(err.retryable).toBe(false);
    // Only one upstream attempt because retryable=false short-circuits the
    // soft-retry loop.
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('surfaces AGENT_EXECUTION_STALLED as retryable when no delta streamed yet', async () => {
    const { shouldSoftRetryProxyFailure } = await import(
      '../../src/providers/api-proxy'
    );
    // Independent of the actual stream mock — the gate lives at the soft-retry
    // decision layer: a pre-delta stall carries retryable: true from the
    // adapter, and `shouldSoftRetryProxyFailure` must accept it (the explicit
    // retryable=true branch wins even without a canonical retry code).
    const preDeltaStall = Object.assign(
      new Error('BYOK proxy stream timed out due to inactivity'),
      { code: 'AGENT_EXECUTION_STALLED', retryable: true },
    );
    expect(shouldSoftRetryProxyFailure(preDeltaStall)).toBe(true);

    // Confirm the tokens-streamed variant is treated as non-retryable at the
    // same layer.
    const postDeltaStall = Object.assign(
      new Error('BYOK proxy stream timed out due to inactivity'),
      { code: 'AGENT_EXECUTION_STALLED', retryable: false },
    );
    expect(shouldSoftRetryProxyFailure(postDeltaStall)).toBe(false);
  });
});
