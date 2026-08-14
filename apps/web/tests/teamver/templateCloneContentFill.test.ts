import { describe, expect, it } from 'vitest';

import {
  buildTemplateCloneContentFillSeed,
  extractTemplateCloneUserFacingRequest,
  isTemplateCloneContentFillPrompt,
  looksLikeInstructionNotSlideCopy,
  TEMPLATE_CLONE_CONTENT_FILL_TURN_MARKER,
} from '../../src/teamver/templateCloneContentFill';
import { promptWithTemplateCloneContentFillInstruction } from '../../src/components/ProjectView';

describe('templateCloneContentFill', () => {
  it('does not treat Canvas boilerplate as the visible request', () => {
    const visible = extractTemplateCloneUserFacingRequest({
      pendingPrompt: [
        '첨부한 자료를 바탕으로 슬라이드 덱을 만들어줘.',
        '',
        '[User instruction]',
        'expo에 대해서 설명하는 피피티 만들어줘. 시니어 개발자 레벨.',
      ].join('\n'),
    });
    expect(visible).toMatch(/expo/i);
    expect(visible).not.toMatch(/첨부한 자료를 바탕으로/);
  });

  it('build seed keeps visible topic and fill marker for the model', () => {
    const seed = buildTemplateCloneContentFillSeed({
      userInstruction: 'expo에 대해서 설명하는 피피티 만들어줘. 시니어 개발자 레벨.',
      templateTitle: 'Html Ppt Zhangzara Daisy Days',
      sourceBrief: 'Canvas title: Expo\nVisible headings: Intro / API / Next',
    });
    expect(seed).toContain('[Template clone content fill]');
    expect(seed).toMatch(/expo/i);
    expect(seed).toContain('Selected template: Html Ppt Zhangzara Daisy Days');
    expect(seed).toMatch(/attached source materials/i);
    expect(seed).toMatch(/Quality bar: each non-divider slide/i);
    expect(seed).toMatch(/headline, takeaway/i);
    expect(seed).toMatch(/body-first/i);
    expect(seed).toMatch(/NEVER "수정 반영 중"/);
    expect(seed).not.toMatch(/emit a full.*rewrites visible text/i);
    expect(seed).not.toMatch(/Prefer `<artifact type="deck-patch" identifier="deck">`/);
    expect(looksLikeInstructionNotSlideCopy('첨부한 자료를 바탕으로 슬라이드 덱을 만들어줘.')).toBe(true);
  });

  it('fallback fill copy does not claim 첨부한 자료 or 요청한 내용 when topic is missing', () => {
    const visible = extractTemplateCloneUserFacingRequest({
      pendingPrompt: '첨부한 자료를 바탕으로 슬라이드 덱을 만들어줘.',
    });
    expect(visible).toBe('슬라이드 내용을 채워줘.');
    expect(visible).not.toMatch(/첨부한 자료|요청한 내용/);

    const seed = buildTemplateCloneContentFillSeed({
      userInstruction: '',
      sourceBrief: null,
      hasSourceMaterial: false,
    });
    expect(seed).toMatch(/user prompt may be empty/i);
    expect(seed).not.toMatch(/any attached source materials/);
    expect(seed.startsWith('슬라이드 내용을 채워줘.')).toBe(true);
  });

  it('extracts topic from full run prompt with [User instruction] block', () => {
    const visible = extractTemplateCloneUserFacingRequest({
      pendingPrompt: [
        '요청한 내용으로 슬라이드 덱을 만들어줘.',
        '',
        '[Deliverable instruction]',
        'Build a new presentation deck...',
        '',
        '[User instruction]',
        'expo에 대해서 설명하는 피피티 만들어줘.',
      ].join('\n'),
    });
    expect(visible).toMatch(/expo/i);
    expect(visible).not.toMatch(/요청한 내용|첨부한 자료/);
  });

  it('promptWithTemplateCloneContentFillInstruction is create tone, not existing-deck rewrite', () => {
    const seed = buildTemplateCloneContentFillSeed({
      userInstruction: 'expo에 대해서 설명하는 피피티 만들어줘.',
      hasSourceMaterial: false,
    });
    expect(isTemplateCloneContentFillPrompt(seed)).toBe(true);
    const prompted = promptWithTemplateCloneContentFillInstruction(seed, {
      slideOnlyMvp: true,
    });
    expect(prompted).toContain(TEMPLATE_CLONE_CONTENT_FILL_TURN_MARKER);
    expect(prompted).toMatch(/슬라이드 초안 작성 중/);
    expect(prompted).toMatch(/NEVER "수정 반영 중"/);
    expect(prompted).toMatch(/body-first/i);
    expect(prompted).not.toContain('[Existing deck edit]');
    expect(prompted).not.toMatch(/rewrites visible text/i);
    expect(prompted).not.toMatch(/use edit tone only/i);
  });
});
