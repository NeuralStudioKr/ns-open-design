import { describe, expect, it } from 'vitest';
import {
  extractPublicHttpUrls,
  historyWithApiWebFetchContext,
  renderApiWebFetchContext,
} from '../src/api-web-fetch-context';
import type { ChatMessage } from '../src/types';

describe('api web fetch context', () => {
  it('extracts at most three public http urls from a prompt', () => {
    expect(
      extractPublicHttpUrls(
        'Analyze https://teamver.com, https://example.com/path). Also http://example.org?a=1 and https://ignored.example',
      ),
    ).toEqual([
      'https://teamver.com/',
      'https://example.com/path',
      'http://example.org/?a=1',
    ]);
  });

  it('renders fetched page text as untrusted context', () => {
    const context = renderApiWebFetchContext([
      {
        url: 'https://teamver.com/',
        ok: true,
        title: 'Teamver',
        text: 'Professional team profile builder',
        truncated: false,
      },
    ]);

    expect(context).toContain('<web-fetch-context>');
    expect(context).toContain('teamver Design pre-fetched');
    expect(context).toContain('Professional team profile builder');
    expect(context).toContain('</web-fetch-context>');
  });

  it('appends fetched context only to the current user turn', () => {
    const history: ChatMessage[] = [
      { id: 'u0', role: 'user', content: 'old', createdAt: 1 },
      { id: 'u1', role: 'user', content: 'new', createdAt: 2 },
    ];

    const next = historyWithApiWebFetchContext(history, 'u1', [
      { url: 'https://teamver.com/', ok: true, text: 'Fetched page' },
    ]);

    expect(next[0]?.content).toBe('old');
    expect(next[1]?.content).toContain('new');
    expect(next[1]?.content).toContain('Fetched page');
  });
});
