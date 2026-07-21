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

  it('normalizes bare www urls in user prompts to https urls', () => {
    expect(
      extractPublicHttpUrls(
        'www.teamver.com 참고해서 슬라이드 만들고 https://example.com/docs도 같이 확인해줘.',
      ),
    ).toEqual([
      'https://www.teamver.com/',
      'https://example.com/docs',
    ]);
  });

  it('normalizes bare domains without treating emails or html filenames as urls', () => {
    expect(
      extractPublicHttpUrls(
        'teamver.com 사이트 분석하고 contact@example.com 메일과 ai-adoption-deck.html 파일명은 무시해줘.',
      ),
    ).toEqual(['https://teamver.com/']);
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
    expect(context).toContain('Teamver Design pre-fetched');
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
