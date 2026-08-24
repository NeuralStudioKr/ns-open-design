import { describe, expect, it } from 'vitest';

import {
  canAutoRenameProjectFromPrompt,
  conversationTitleFromUserTurn,
  deriveProjectNameForCreate,
  extractUserFacingCreateRequest,
  extractUserPromptForNaming,
  isPlaceholderProjectName,
  isUsableDeckCoverTitle,
  summarizeProjectNameFromPrompt,
  summarizeProjectNameFromUserTurn,
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

  it('summarizes Korean free-form asks into a short topic', () => {
    expect(
      summarizeProjectNameFromPrompt('expo에 대해서 설명하는 피피티 만들어줘. 시니어 개발자 레벨.'),
    ).toMatch(/^expo$/i);
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

  it('names from [User instruction] even when lead is attachment boilerplate', () => {
    const prompt = [
      '첨부한 자료를 바탕으로 슬라이드 덱을 만들어줘.',
      '',
      '[Deliverable instruction]',
      'Build a new presentation deck...',
      '',
      '[User instruction]',
      'expo에 대해서 설명하는 피피티 만들어줘. 시니어 개발자 레벨.',
    ].join('\n');
    const name = deriveProjectNameForCreate({
      prompt,
      pluginTitle: 'Html Ppt Zhangzara Daisy Days',
    });
    expect(name.toLowerCase()).toMatch(/expo/);
    expect(name).not.toMatch(/Html Ppt|Daisy|Zhangzara|만들어/i);
  });

  it('never uses deck template marketing titles as the project name', () => {
    expect(
      deriveProjectNameForCreate({
        prompt: '첨부한 자료를 바탕으로 슬라이드 덱을 만들어줘.',
        pluginTitle: 'Html Ppt Zhangzara Daisy Days',
      }),
    ).toBe('Untitled');
  });

  it('Home freeform lead (user typed request) becomes the project name', () => {
    const name = deriveProjectNameForCreate({
      prompt: [
        'expo에 대해서 설명하는 피피티 만들어줘. 시니어 개발자 레벨.',
        '',
        '[Deliverable instruction]',
        'Build a new presentation deck...',
      ].join('\n'),
      pluginTitle: 'Html Ppt Zhangzara Daisy Days',
    });
    expect(name.toLowerCase()).toMatch(/expo/);
    expect(name).not.toMatch(/만들어/);
  });
  it('empty user prompt with no attachments yields Untitled (not template title)', () => {
    expect(
      deriveProjectNameForCreate({
        prompt: '슬라이드 덱을 만들어줘.\n\n[Deliverable instruction]\nBuild…',
        pluginTitle: 'Html Ppt Zhangzara Daisy Days',
      }),
    ).toBe('Untitled');
  });

  it('empty prompt still names from attachment label', () => {
    expect(
      deriveProjectNameForCreate({
        prompt: '첨부한 자료를 바탕으로 슬라이드 덱을 만들어줘.',
        attachmentLabel: 'q3-roadmap.pdf',
        pluginTitle: 'Html Ppt Hermes',
      }),
    ).toMatch(/q3|roadmap/i);
  });
});

describe('extractUserFacingCreateRequest', () => {
  it('returns empty for empty-create / attachment boilerplate leads', () => {
    expect(
      extractUserFacingCreateRequest(
        '슬라이드 덱을 만들어줘.\n\n[Deliverable instruction]\nBuild…',
      ),
    ).toBe('');
    expect(
      extractUserFacingCreateRequest(
        '첨부한 자료를 바탕으로 슬라이드 덱을 만들어줘.\n\n[Deliverable instruction]\nBuild…',
      ),
    ).toBe('');
  });

  it('returns the real user instruction block', () => {
    const full = [
      '첨부한 자료를 바탕으로 슬라이드 덱을 만들어줘.',
      '',
      '[Deliverable instruction]',
      'Build…',
      '',
      '[User instruction]',
      'expo에 대해서 설명하는 피피티 만들어줘.',
    ].join('\n');
    expect(extractUserFacingCreateRequest(full)).toMatch(/expo/i);
  });
});

describe('isUsableDeckCoverTitle', () => {
  it('rejects Untitled / template marketing / boilerplate', () => {
    expect(isUsableDeckCoverTitle('Untitled')).toBe(false);
    expect(isUsableDeckCoverTitle('Html Ppt Zhangzara Daisy Days')).toBe(false);
    expect(isUsableDeckCoverTitle('슬라이드 덱을 만들어줘.')).toBe(false);
    expect(isUsableDeckCoverTitle('expo에 대해서 설명하는 피피티 만들어줘.')).toBe(false);
    expect(isUsableDeckCoverTitle('Q3 Roadmap')).toBe(true);
  });
});

describe('extractUserPromptForNaming', () => {
  it('strips deliverable instruction blocks from auto-send seeds', () => {
    const userLine = '분기 실적 요약 덱';
    const full = `${userLine}\n\n[Deliverable instruction]\nBuild a deck...`;
    expect(extractUserPromptForNaming(full)).toBe(userLine);
  });

  it('prefers [User instruction] over attachment boilerplate lead', () => {
    const full = [
      '첨부한 자료를 바탕으로 슬라이드 덱을 만들어줘.',
      '',
      '[Deliverable instruction]',
      'Build…',
      '',
      '[User instruction]',
      '분기 실적 요약',
    ].join('\n');
    expect(extractUserPromptForNaming(full)).toBe('분기 실적 요약');
    expect(summarizeProjectNameFromUserTurn(full)).toMatch(/분기/);
  });
});

describe('conversationTitleFromUserTurn', () => {
  it('never uses 첨부한 자료 / raw protocol dump as the conversation title', () => {
    const full = [
      '첨부한 자료를 바탕으로 슬라이드 덱을 만들어줘.',
      '',
      '[Deliverable instruction]',
      'Build a new presentation deck...',
    ].join('\n');
    expect(conversationTitleFromUserTurn(full)).toBe('');
  });

  it('uses the user topic when present after deliverable scaffolding', () => {
    const full = [
      '요청한 내용으로 슬라이드 덱을 만들어줘.',
      '',
      '[Deliverable instruction]',
      'Build…',
      '',
      '[User instruction]',
      'expo에 대해서 설명하는 피피티 만들어줘.',
    ].join('\n');
    expect(conversationTitleFromUserTurn(full).toLowerCase()).toMatch(/expo/);
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

  it('treats Daisy / Html Ppt template titles as renamable placeholders', () => {
    expect(
      canAutoRenameProjectFromPrompt({
        id: 'p1',
        name: 'Html Ppt Zhangzara Daisy Days',
        metadata: { kind: 'deck', nameSource: 'prompt' },
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
