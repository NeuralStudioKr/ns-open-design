import { describe, expect, it } from 'vitest';

import {
  canAutoRenameProjectFromPrompt,
  deriveProjectNameForCreate,
  extractUserPromptForNaming,
  isPlaceholderProjectName,
  summarizeProjectNameFromPrompt,
} from '../../src/utils/projectName';

describe('summarizeProjectNameFromPrompt', () => {
  it('summarizes Chinese first prompts into concise project names', () => {
    expect(
      summarizeProjectNameFromPrompt('先实现一下根据项目中的第一个prompt总结项目名称，并自动更改项目名称'),
    ).toBe('自动项目命名');
  });

  it('drops common English request prefixes', () => {
    expect(
      summarizeProjectNameFromPrompt('Please build a settings page for managing desktop pets'),
    ).toBe('Settings Page Managing Desktop Pets');
  });

  it('ignores code blocks and links before naming', () => {
    expect(
      summarizeProjectNameFromPrompt('Create a dashboard for https://example.com\n```ts\nconst x = 1\n```'),
    ).toBe('Dashboard');
  });
});

describe('deriveProjectNameForCreate', () => {
  it('prefers user prompt over plugin template title', () => {
    const name = deriveProjectNameForCreate({
      prompt: 'AI 도입 전략 발표 자료 만들어줘',
      pluginTitle: '기본 슬라이드 템플릿',
    });
    expect(name).not.toBe('기본 슬라이드 템플릿');
    expect(name.toLowerCase()).toContain('ai');
  });

  it('uses canvas topic hint when prompt is boilerplate-only', () => {
    expect(
      deriveProjectNameForCreate({
        prompt: '첨부한 자료를 바탕으로 슬라이드 덱을 만들어줘.',
        topicHint: 'Q4 GTM 전략',
        pluginTitle: 'Html Ppt Hermes',
      }),
    ).toMatch(/Q4 GTM/i);
  });
});

describe('extractUserPromptForNaming', () => {
  it('strips deliverable instruction blocks from auto-send seeds', () => {
    const userLine = '분기 실적 요약 덱';
    const full = `${userLine}\n\n[Deliverable instruction]\nBuild a deck...`;
    expect(extractUserPromptForNaming(full)).toBe(userLine);
  });
});

describe('canAutoRenameProjectFromPrompt', () => {
  const projectId = '77610df3-5878-41ed-a10f-2d388ac495f3';

  it('allows first-prompt renaming for generated project names', () => {
    expect(
      canAutoRenameProjectFromPrompt({
        id: projectId,
        name: 'Untitled',
        metadata: { kind: 'prototype', nameSource: 'generated' },
      }),
    ).toBe(true);
  });

  it('blocks renaming when the user chose the name', () => {
    expect(
      canAutoRenameProjectFromPrompt({
        id: projectId,
        name: 'Imported Client Folder',
        metadata: { kind: 'prototype', nameSource: 'user' },
      }),
    ).toBe(false);
  });

  it('renames prompt-sourced projects that still look like ids or slugs', () => {
    expect(
      canAutoRenameProjectFromPrompt({
        id: projectId,
        name: projectId,
        metadata: { kind: 'deck', nameSource: 'prompt' },
      }),
    ).toBe(true);
    expect(
      canAutoRenameProjectFromPrompt({
        id: 'p1',
        name: '기본 슬라이드 템플릿',
        metadata: { kind: 'deck', nameSource: 'prompt' },
      }),
    ).toBe(true);
    expect(
      canAutoRenameProjectFromPrompt({
        id: 'p1',
        name: 'Q4 Deck',
        metadata: { kind: 'deck', nameSource: 'prompt' },
      }),
    ).toBe(false);
  });

  it('treats missing metadata with uuid-like names as renamable', () => {
    expect(
      canAutoRenameProjectFromPrompt({
        id: projectId,
        name: projectId,
        metadata: undefined,
      }),
    ).toBe(true);
  });
});

describe('isPlaceholderProjectName', () => {
  it('detects uuid and generic daemon names', () => {
    const id = '77610df3-5878-41ed-a10f-2d388ac495f3';
    expect(isPlaceholderProjectName({ id, name: id })).toBe(true);
    expect(isPlaceholderProjectName({ id, name: 'design' })).toBe(true);
    expect(isPlaceholderProjectName({ id, name: 'My Launch Deck' })).toBe(false);
  });
});
