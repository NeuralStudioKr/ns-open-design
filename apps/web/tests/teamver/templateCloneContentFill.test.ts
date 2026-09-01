import { afterEach, describe, expect, it } from 'vitest';

import {
  TEMPLATE_CLONE_CONTENT_FILL_MARKER,
  TEMPLATE_CLONE_CONTENT_FILL_TURN_MARKER,
  TEMPLATE_CLONE_SLOT_FILL_REPAIR_MARKER,
  buildTemplateCloneContentFillSeed,
  buildTemplateCloneSlotFillRepairPrompt,
  compactTemplateCloneFillSourceBrief,
  deriveTemplateCloneTopicLabel,
  ensureTemplateCloneContentFillContinuePrompt,
  extractTemplateCloneUserFacingRequest,
  getTemplateCloneFillMode,
  historyHasTemplateCloneContentFill,
  historyHasTemplateCloneSlotFillRepair,
  isTemplateCloneContentFillPrompt,
  isTemplateCloneSlotFillRepairPrompt,
  looksLikeInstructionNotSlideCopy,
  normalizeTemplateCloneFillMode,
  normalizeTemplateCloneFillSlideCountHint,
  queueTemplateCloneContentFill,
  resolveTemplateCloneAutoSendSeed,
  shouldUseDeterministicTemplateCloneFill,
  templateCloneFillSlideCountOverrideNotice,
  withTemplateCloneFillPluginInputs,
  withoutCanonicalDeckAttachments,
} from '../../src/teamver/templateCloneContentFill';
import { promptWithTemplateCloneContentFillInstruction } from '../../src/components/ProjectView';

afterEach(() => {
  delete process.env.VITE_TEAMVER_TEMPLATE_CLONE_FILL_MODE;
});

describe('templateCloneContentFill', () => {
  it('defaults to prompt fill and only opts into deterministic mode explicitly', () => {
    expect(normalizeTemplateCloneFillMode(undefined)).toBe('prompt');
    expect(normalizeTemplateCloneFillMode('')).toBe('prompt');
    expect(normalizeTemplateCloneFillMode('prompt')).toBe('prompt');
    expect(getTemplateCloneFillMode()).toBe('prompt');
    expect(shouldUseDeterministicTemplateCloneFill()).toBe(false);

    process.env.VITE_TEAMVER_TEMPLATE_CLONE_FILL_MODE = 'deterministic';
    expect(getTemplateCloneFillMode()).toBe('deterministic');
    expect(shouldUseDeterministicTemplateCloneFill()).toBe(true);
    expect(normalizeTemplateCloneFillMode('content-fill')).toBe('deterministic');
    expect(normalizeTemplateCloneFillMode('server')).toBe('deterministic');
  });

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
    expect(seed).toMatch(/JSON slot-fill|JSON outline only/i);
    expect(seed).toMatch(/do NOT regenerate deck HTML|Forbidden output/i);
    expect(seed).toMatch(/roleHint/i);
    expect(seed).toMatch(/Slide count THIS TURN/i);
    expect(seed).toMatch(/default 6-slide outline/i);
    expect(seed).toMatch(/empty pillar\/column-number|Card count = content count/i);
    expect(seed).toMatch(/NEVER "수정 반영 중"/);
    expect(seed).not.toMatch(/Strict body-first contract/i);
    expect(seed).not.toMatch(/emit a full.*rewrites visible text/i);
    expect(seed).not.toMatch(/Prefer `<artifact type="deck-patch" identifier="deck">`/);
    expect(seed).toContain('Cover topic (use as the title — not the instruction): expo');
    expect(seed).toMatch(/brief is a topic, not slide text/i);
    expect(seed).toMatch(/The visible request above is a BRIEF\/TOPIC/);
    expect(seed).toMatch(/Expo for Senior Engineers/);
    expect(seed).toMatch(/Do NOT paste the request onto the cover/);
    expect(looksLikeInstructionNotSlideCopy('첨부한 자료를 바탕으로 슬라이드 덱을 만들어줘.')).toBe(true);
    expect(deriveTemplateCloneTopicLabel(
      'expo에 대해서 설명하는 피피티 만들어줘. 시니어 개발자 레벨.',
    )).toBe('expo');
  });

  it('adds a default 6-slide hint when no explicit count is provided', () => {
    const seed = buildTemplateCloneContentFillSeed({
      userInstruction: 'monorepo에 대해서 설명하는 피피티 만들어줘. 시니어 개발자 레벨.',
      templateTitle: 'Html Ppt Zhangzara Daisy Days',
    });
    expect(seed).toContain(
      'Slide count hint: 6 (default for first template fill; close 6 complete slides this turn.)',
    );
    expect(seed).toMatch(/honor an explicit user count of 1–10/i);
    expect(seed).toContain('If unspecified, close 6 this turn');
    expect(seed).toContain('11 or more');
    expect(seed).not.toMatch(/honor an explicit user count of 1–6/i);
    expect(seed).toContain('no 3+3+3 split');
    expect(seed).not.toMatch(/persist rejects 1–2/i);
    expect(seed).toMatch(/JSON outline only|JSON slot-fill/i);
    expect(seed).toMatch(/host slot-fills|do NOT regenerate deck HTML/i);
  });

  it('derives explicit slide counts from the visible user request when no UI hint is present', () => {
    const oneSlide = buildTemplateCloneContentFillSeed({
      userInstruction: '캡슐 템플릿으로 정확히 1장짜리 요약 슬라이드 만들어줘.',
      templateTitle: 'Html Ppt Zhangzara Capsule',
    });
    expect(oneSlide).toContain('User requested slide count: 1.');
    expect(oneSlide).toContain('Slide count hint: 1.');
    expect(oneSlide).not.toContain('default for first template fill');

    const twoSlides = buildTemplateCloneContentFillSeed({
      userInstruction: '개발자 포트폴리오 예시로 2장짜리 ppt 만들어줘.',
      templateTitle: 'Html Ppt Zhangzara Creative Mode',
    });
    expect(twoSlides).toContain('User requested slide count: 2.');
    expect(twoSlides).toContain('Slide count hint: 2.');
  });

  it('honors an explicit 8-slide request this turn instead of cutting at 6', () => {
    const seed = buildTemplateCloneContentFillSeed({
      userInstruction: 'Expo 아키텍처를 설명하는 8장 발표자료 만들어줘.',
      templateTitle: 'Html Ppt Zhangzara Daisy Days',
    });
    expect(seed).toContain('User requested slide count: 8.');
    expect(seed).toContain('Slide count hint: 8.');
    expect(seed).not.toContain('stability cap for first template fill');
  });

  it('honors an explicit 10-slide request this turn and still caps 12+ for top-up', () => {
    const ten = buildTemplateCloneContentFillSeed({
      userInstruction: '온보딩 슬라이드 10장 만들어줘.',
      templateTitle: 'Html Ppt Zhangzara Pink Script',
    });
    expect(ten).toContain('User requested slide count: 10.');
    expect(ten).toContain('Slide count hint: 10.');
    expect(ten).not.toContain('stability cap for first template fill');

    const twelve = buildTemplateCloneContentFillSeed({
      userInstruction: '아키텍처 리뷰 12장 만들어줘.',
      templateTitle: 'Html Ppt Zhangzara Daisy Days',
    });
    expect(twelve).toContain('User requested slide count: 12.');
    expect(twelve).toContain('Slide count hint: 6 (stability cap for first template fill).');
  });

  it('records a typed 5-page brief instead of the auto 6-8 quick-length range', () => {
    const seed = buildTemplateCloneContentFillSeed({
      userInstruction: '온보딩 슬라이드 5페이지 만들어줘.',
      templateTitle: 'Html Ppt Zhangzara Pink Script',
      slideCountHint: '6-8',
    });
    expect(seed).toContain('User requested slide count: 5.');
    expect(seed).not.toContain('User requested slide count: 6-8.');
    expect(seed).toContain('Slide count hint: 5.');
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
    expect(prompted).toContain(TEMPLATE_CLONE_CONTENT_FILL_MARKER);
    expect(prompted).toMatch(/슬라이드 초안 작성 중/);
    expect(prompted).toMatch(/NEVER "수정 반영 중"/);
    expect(prompted).toMatch(/JSON outline only|JSON slot-fill/i);
    expect(prompted).not.toContain('[Existing deck edit]');
    expect(prompted).not.toMatch(/rewrites visible text/i);
    expect(prompted).not.toMatch(/use edit tone only/i);
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
    expect(seed).toContain('Slide count hint: 8-10 (close this turn)');
    expect(seed).not.toContain('stability cap for first template fill');
    expect(seed).toContain('시니어 개발자');
    expect(seed).not.toContain('[Deliverable instruction]');
    expect(seed).not.toContain('[Selected slide template priority]');
  });

  it('treats the 5-6 short preset as a this-turn close, not a later-append cap', () => {
    expect(normalizeTemplateCloneFillSlideCountHint('5-6')).toBe(
      '5-6 (close at least 5 this turn)',
    );
    expect(normalizeTemplateCloneFillSlideCountHint('5~6')).toBe(
      '5-6 (close at least 5 this turn)',
    );
    const seed = buildTemplateCloneContentFillSeed({
      userInstruction: '온보딩 슬라이드 만들어줘.',
      templateTitle: 'Html Ppt Zhangzara Pink Script',
      slideCountHint: '5-6',
    });
    expect(seed).toContain('User requested slide count: 5-6.');
    expect(seed).toContain('Slide count hint: 5-6 (close at least 5 this turn).');
    expect(seed).not.toContain('stability cap for first template fill');
    expect(seed).toMatch(/close ≥5 this turn|Never close after a single cover or after 3 slides when the target is 5\+/);
    const notice = templateCloneFillSlideCountOverrideNotice('5-6');
    expect(notice).toContain('5-6 (close at least 5 this turn)');
    expect(notice).toContain('Close at least 5 slides this turn');
    expect(notice).not.toContain('A later turn may append remaining slides');
  });

  it('honors explicit 1–10 this turn, keeps 6-8 auto at 6, and caps 11+ for top-up', () => {
    expect(normalizeTemplateCloneFillSlideCountHint('6-8')).toBe(
      '6 (stability cap for first template fill)',
    );
    expect(normalizeTemplateCloneFillSlideCountHint('8-10')).toBe(
      '8-10 (close this turn)',
    );
    expect(normalizeTemplateCloneFillSlideCountHint('8~10')).toBe(
      '8-10 (close this turn)',
    );
    expect(normalizeTemplateCloneFillSlideCountHint('12-15')).toBe(
      '6 (stability cap for first template fill)',
    );
    expect(normalizeTemplateCloneFillSlideCountHint('4')).toBe('4');
    expect(normalizeTemplateCloneFillSlideCountHint('3')).toBe('3');
    expect(normalizeTemplateCloneFillSlideCountHint('5')).toBe('5');
    expect(normalizeTemplateCloneFillSlideCountHint('8')).toBe('8');
    expect(normalizeTemplateCloneFillSlideCountHint('10')).toBe('10');
    expect(normalizeTemplateCloneFillSlideCountHint('정확히 10')).toBe('10');
    expect(normalizeTemplateCloneFillSlideCountHint('정확히 1')).toBe('1');
    expect(normalizeTemplateCloneFillSlideCountHint('정확히 12')).toBe(
      '6 (stability cap for first template fill)',
    );
  });

  it('caps Plugin-input slideCount for fill turns and emits an override notice', () => {
    expect(
      withTemplateCloneFillPluginInputs({ slideCount: '12-15', topic: 'expo' }, '12-15'),
    ).toMatchObject({
      topic: 'expo',
      slideCount: '6 (stability cap for first template fill)',
    });
    expect(templateCloneFillSlideCountOverrideNotice('8-10')).toContain(
      '8-10 (close this turn)',
    );
    expect(templateCloneFillSlideCountOverrideNotice('8-10')).toContain(
      'Do not leave remaining slides for a later turn',
    );
    expect(templateCloneFillSlideCountOverrideNotice('8-10')).not.toContain(
      'A later turn may append remaining slides',
    );
    expect(templateCloneFillSlideCountOverrideNotice('12-15')).toContain(
      '6 (stability cap for first template fill)',
    );
    expect(templateCloneFillSlideCountOverrideNotice('12-15')).toContain(
      'A later turn may append remaining slides',
    );
    expect(templateCloneFillSlideCountOverrideNotice('5')).not.toContain(
      'A later turn may append remaining slides',
    );
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

  it('historyHasTemplateCloneContentFill only checks the latest user turn', () => {
    expect(
      historyHasTemplateCloneContentFill([
        { role: 'user', content: `expo\n\n${TEMPLATE_CLONE_CONTENT_FILL_MARKER}` },
        { role: 'assistant', content: '<artifact type="deck"><head>' },
      ]),
    ).toBe(true);
    // Later normal edit must NOT inherit ancient fill markers.
    expect(
      historyHasTemplateCloneContentFill([
        { role: 'user', content: `expo\n\n${TEMPLATE_CLONE_CONTENT_FILL_MARKER}` },
        { role: 'assistant', content: 'done' },
        { role: 'user', content: '제목만 바꿔줘' },
      ]),
    ).toBe(false);
  });

  it('does not re-append expansion hard rules when the fill seed is already present', () => {
    const seed = buildTemplateCloneContentFillSeed({
      userInstruction: 'expo에 대해서 설명하는 피피티 만들어줘. 시니어 개발자 레벨.',
    });
    const once = (seed.match(/brief is a topic, not slide text/gi) ?? []).length;
    expect(once).toBe(1);
    const stamped = promptWithTemplateCloneContentFillInstruction(seed, { slideOnlyMvp: true });
    expect((stamped.match(/brief is a topic, not slide text/gi) ?? []).length).toBe(1);
    expect(stamped).toBe(seed);
  });

  it('ensureTemplateCloneContentFillContinuePrompt restamps create contract without Existing deck edit', () => {
    const continued = ensureTemplateCloneContentFillContinuePrompt(
      '이전 응답이 끊겼습니다. JSON outline으로 이어서 완성하세요.',
    );
    expect(continued).toContain(TEMPLATE_CLONE_CONTENT_FILL_MARKER);
    expect(continued).toContain(TEMPLATE_CLONE_CONTENT_FILL_TURN_MARKER);
    expect(continued).toMatch(/NEVER "수정 반영 중"/);
    expect(continued).toMatch(/ABANDON any HTML deck dump|JSON outline only/i);
    expect(continued).not.toContain('[Existing deck edit]');
    expect(continued).toMatch(/이전 응답이 끊겼습니다/);
    // Idempotent when already stamped.
    expect(ensureTemplateCloneContentFillContinuePrompt(continued)).toBe(continued);
  });

  it('builds a one-shot JSON repair prompt (0901-N02 B5)', () => {
    const repair = buildTemplateCloneSlotFillRepairPrompt();
    expect(repair).toContain(TEMPLATE_CLONE_SLOT_FILL_REPAIR_MARKER);
    expect(repair).toContain(TEMPLATE_CLONE_CONTENT_FILL_MARKER);
    expect(isTemplateCloneSlotFillRepairPrompt(repair)).toBe(true);
    expect(isTemplateCloneContentFillPrompt(repair)).toBe(true);
    expect(repair).toMatch(/Emit ONE JSON outline only/i);
    expect(repair).toMatch(/FORBIDDEN:.*section class="slide"/i);
    expect(historyHasTemplateCloneSlotFillRepair([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: '<section class="slide">' },
    ])).toBe(false);
    expect(historyHasTemplateCloneSlotFillRepair([
      { role: 'user', content: repair },
    ])).toBe(true);
  });

  it('drops cloned deck.html from fill-queue attachments', () => {
    expect(withoutCanonicalDeckAttachments([
      { path: 'deck.html', name: 'deck.html', kind: 'file' },
      { path: 'deck-2.html', name: 'deck-2.html', kind: 'file' },
      { path: 'refs/drive/notes.pdf', name: 'notes.pdf', kind: 'file' },
    ])).toEqual([
      { path: 'refs/drive/notes.pdf', name: 'notes.pdf', kind: 'file' },
    ]);

    const store = new Map<string, string>();
    const prev = globalThis.window;
    (globalThis as { window?: unknown }).window = {
      sessionStorage: {
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
        getItem: (key: string) => store.get(key) ?? null,
      },
    };
    try {
      queueTemplateCloneContentFill({
        projectId: 'proj-fill',
        seed: buildTemplateCloneContentFillSeed({
          userInstruction: 'expo에 대해서 설명하는 피피티 만들어줘.',
        }),
        attachments: [
          { path: 'deck.html', name: 'deck.html', kind: 'file' },
          { path: 'refs/drive/notes.pdf', name: 'notes.pdf', kind: 'file' },
        ],
      });
      expect(store.get('od:auto-send-attachments:proj-fill')).toContain('notes.pdf');
      expect(store.get('od:auto-send-attachments:proj-fill')).not.toContain('deck.html');
      // App/create owns od:auto-send-first — fill queue must not bypass Drive suppress.
      expect(store.get('od:auto-send-first:proj-fill')).toBeUndefined();
    } finally {
      if (prev) (globalThis as { window?: unknown }).window = prev;
      else delete (globalThis as { window?: unknown }).window;
    }
  });
});
