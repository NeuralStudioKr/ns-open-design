import { describe, expect, it } from 'vitest';

import {
  TEMPLATE_CLONE_CONTENT_FILL_MARKER,
  buildTemplateCloneContentFillSeed,
  compactTemplateCloneFillSourceBrief,
  deriveTemplateCloneTopicLabel,
  extractTemplateCloneUserFacingRequest,
  looksLikeInstructionNotSlideCopy,
  resolveTemplateCloneAutoSendSeed,
} from '../../src/teamver/templateCloneContentFill';

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
    expect(looksLikeInstructionNotSlideCopy('첨부한 자료를 바탕으로 슬라이드 덱을 만들어줘.')).toBe(true);
    expect(seed).toContain('Content quality:');
    expect(seed).toContain('Cover topic (use as the title — not the instruction): expo');
    expect(deriveTemplateCloneTopicLabel(
      'expo에 대해서 설명하는 피피티 만들어줘. 시니어 개발자 레벨.',
    )).toBe('expo');
  });

  it('strips Home create run-dump scaffolding from the fill source brief', () => {
    const runDump = [
      '첨부한 자료를 바탕으로 슬라이드 덱을 만들어줘.',
      '',
      '[Deliverable instruction]',
      'Create a complete closed deck. Bind the Template visual kit.',
      '',
      '[Selected slide template]',
      'The user picked "Html Ppt Zhangzara Daisy Days".',
      '',
      '[Quick settings]',
      'Audience: 시니어 개발자.',
      'Length: 8-10.',
      '',
      '[User instruction]',
      'expo에 대해서 설명하는 피피티 만들어줘. 시니어 개발자 레벨.',
      '',
      '[Selected slide template priority]',
      'READ LAST. Neutral is a failed deliverable.',
    ].join('\n');
    const compact = compactTemplateCloneFillSourceBrief(runDump);
    expect(compact).toMatch(/expo/i);
    expect(compact).toContain('Quick settings:');
    expect(compact).not.toContain('[Deliverable instruction]');
    expect(compact).not.toContain('READ LAST');

    const seed = buildTemplateCloneContentFillSeed({
      pendingPrompt: runDump,
      sourceBrief: runDump,
      templateTitle: 'Html Ppt Zhangzara Daisy Days',
      slideCountHint: '8-10',
    });
    expect(seed).toContain(TEMPLATE_CLONE_CONTENT_FILL_MARKER);
    expect(seed).toContain('Slide count hint: 8-10');
    expect(seed).toContain('시니어 개발자');
    expect(seed).not.toContain('[Deliverable instruction]');
    expect(seed).not.toContain('[Selected slide template priority]');
  });

  it('keeps Drive source labels when compacting a mixed create dump', () => {
    const compact = compactTemplateCloneFillSourceBrief([
      'Drive source file: expo-notes.pdf',
      'Drive source MIME: application/pdf',
      '',
      '[Deliverable instruction]',
      'Create a complete closed deck.',
      '',
      '[User instruction]',
      'expo에 대해서 설명하는 피피티 만들어줘. 시니어 개발자 레벨.',
    ].join('\n'));
    expect(compact).toContain('Drive source file: expo-notes.pdf');
    expect(compact).toMatch(/expo/i);
    expect(compact).not.toContain('[Deliverable instruction]');
  });

  it('prefers the queued fill seed over a stale create-time pendingPrompt', () => {
    const fillSeed = buildTemplateCloneContentFillSeed({
      userInstruction: 'expo에 대해서 설명하는 피피티 만들어줘. 시니어 개발자 레벨.',
      templateTitle: 'Html Ppt Zhangzara Daisy Days',
    });
    const staleCreatePrompt = [
      '첨부한 자료를 바탕으로 슬라이드 덱을 만들어줘.',
      '',
      '[Deliverable instruction]',
      'Create a complete closed deck.',
      '',
      '[User instruction]',
      'expo에 대해서 설명하는 피피티 만들어줘. 시니어 개발자 레벨.',
    ].join('\n');
    const seed = resolveTemplateCloneAutoSendSeed({
      queuedFillSeed: fillSeed,
      pendingPrompt: staleCreatePrompt,
      fillQueued: true,
    });
    expect(seed).toBe(fillSeed);
    expect(seed).toContain(TEMPLATE_CLONE_CONTENT_FILL_MARKER);
    expect(seed).not.toContain('[Deliverable instruction]');
  });

  it('rebuilds a fill seed when fill is queued but only the raw create prompt remains', () => {
    const seed = resolveTemplateCloneAutoSendSeed({
      queuedFillSeed: '',
      pendingPrompt: [
        '첨부한 자료를 바탕으로 슬라이드 덱을 만들어줘.',
        '',
        '[User instruction]',
        'expo에 대해서 설명하는 피피티 만들어줘. 시니어 개발자 레벨.',
      ].join('\n'),
      fillQueued: true,
    });
    expect(seed).toContain(TEMPLATE_CLONE_CONTENT_FILL_MARKER);
    expect(seed).toMatch(/expo/i);
    expect(seed).not.toMatch(/^첨부한 자료를 바탕으로/m);
  });
});
