import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import {
  applyTemplateCloneSlotFill,
  buildTemplateClonedDeckHtml,
  classifyTemplateCloneShellRole,
  inferTemplateCloneContentRole,
  listTemplateCloneSlideShells,
  looksLikeInstructionCopy,
  catalogExampleShouldBeScrubbed,
  looksLikeLeakedApiModeFilesystemProse,
  looksLikeLeftoverTemplateDemoDeck,
  looksLikeCatalogSwipeShell,
  looksLikeScrubbedCatalogExampleShell,
  stripLeakedApiModeFilesystemProse,
  looksLikeTemplateMarketingTitle,
  scrubLeftoverCatalogExampleHtml,
  normalizeTemplateCssForFixedCanvas,
  pickTemplateShellsForContent,
  resolveTemplateCloneSlideCountHint,
  resolveTemplateCloneSlidesFromBrief,
  sanitizeTemplateCloneDeckTitle,
  deriveDeckCoverTitleFromBrief,
  healInstructionCopyCoverHeading,
  isGenericDeckArtifactTitle,
  sanitizePersistedDeckHostLeaks,
  salvageMalformedMiniMaxSlideMarkup,
  restyleForeignIbMagazineCover,
  restyleBiennaleSparseChapterBodies,
  restyleBiennaleSparseDataBodies,
  restyleBiennaleSparseQuoteBodies,
  injectBiennaleSparseFillCss,
  polishInstructionCoverTitle,
  stripEmptyOfficialMotifInstances,
  stripHostProtocolLeakFromDeckHtml,
  stripNonSlotWrappers,
  fillAndTrimCardPeers,
  hoistCloneSlidesOutOfFlexTrack,
  resolveTemplateCloneSlotMap,
  stripLeafEmptyListAndParagraphShells,
} from '../src/template-clone-fill.js';
import { pinDeckSlidesToFixedCanvas } from '../src/html/deck-fixed-canvas.js';
import { hoistDeckHostStylesToHead } from '../src/html/deck-template-look-css.js';
import { healAiGeneratedDeckMarkup } from '../src/html/heal-ai-generated-deck.js';

describe('buildTemplateClonedDeckHtml', () => {
  it('clones Daisy Days look and swaps Source headings', async () => {
    const html = await readFile(
      new URL(
        '../../../plugins/_official/examples/html-ppt-zhangzara-daisy-days/example.html',
        import.meta.url,
      ),
      'utf8',
    );
    const cloned = buildTemplateClonedDeckHtml(
      html,
      [
        { title: '분기 전략 개요' },
        { title: '핵심 KPI', body: '매출\n리텐션\n활성 사용자' },
        { title: '리스크 대응' },
        { title: '다음 단계' },
      ],
      { title: '분기 전략 개요' },
    );
    expect(cloned).toBeTruthy();
    expect(cloned).toContain('#F5F0E6');
    expect(cloned).toMatch(/Fredoka/i);
    expect(cloned).toMatch(/#FCDF6C/i);
    expect(cloned).toContain('분기 전략 개요');
    expect(cloned).toContain('핵심 KPI');
    expect(cloned).toContain('매출');
    expect(cloned).not.toContain('Daisy Days');
    expect(cloned).toMatch(/width:\s*1920px/i);
    expect(cloned).toMatch(/height:\s*1080px/i);
    const shells = listTemplateCloneSlideShells(cloned!);
    expect(shells.length).toBe(4);
  });

  it('uses a short starter count when outline is empty (not full template lineup)', async () => {
    const html = await readFile(
      new URL(
        '../../../plugins/_official/examples/html-ppt-zhangzara-daisy-days/example.html',
        import.meta.url,
      ),
      'utf8',
    );
    const natural = listTemplateCloneSlideShells(html).length;
    expect(natural).toBeGreaterThan(6);
    const cloned = buildTemplateClonedDeckHtml(html, [], { title: 'Fallback Deck' });
    expect(cloned).toBeTruthy();
    expect(cloned).toContain('#F5F0E6');
    // Must NOT mirror Daisy's ~10 demo pages when there is no content outline.
    expect(listTemplateCloneSlideShells(cloned!).length).toBe(3);
    expect(listTemplateCloneSlideShells(cloned!).length).toBeLessThan(natural);
  });

  it('picks shells by content role instead of template page order', async () => {
    const html = await readFile(
      new URL(
        '../../../plugins/_official/examples/html-ppt-zhangzara-daisy-days/example.html',
        import.meta.url,
      ),
      'utf8',
    );
    const shells = listTemplateCloneSlideShells(html);
    const slides = [
      { title: '표지' },
      { title: '체크리스트', body: '하나\n둘\n셋' },
      { title: '한 줄 메시지', body: 'A'.repeat(140) },
    ];
    const picked = pickTemplateShellsForContent(shells, slides);
    expect(classifyTemplateCloneShellRole(picked[0]!)).toBe('cover');
    expect(classifyTemplateCloneShellRole(picked[1]!)).toBe('list');
    expect(classifyTemplateCloneShellRole(picked[2]!)).toBe('quote');
    expect(inferTemplateCloneContentRole(slides[1]!, 1, 3)).toBe('list');
  });

  it('supports div.slide shells', () => {
    const html = `<!doctype html><html><head><style>:root{--paper:#fff}</style></head>
<body>
<div class="slide"><h1>Cover</h1><p>Hello</p></div>
<div class="slide"><h2>Body</h2><ul><li>A</li><li>B</li></ul></div>
</body></html>`;
    const cloned = buildTemplateClonedDeckHtml(
      html,
      [
        { title: '새 표지' },
        { title: '본문', body: '하나\n둘' },
      ],
      { title: '새 표지' },
    );
    expect(cloned).toContain('새 표지');
    expect(cloned).toContain('본문');
    expect(cloned).toContain('<li>하나</li>');
    expect(cloned).toContain('class="slide"');
  });

  it('does not truncate Source headings when slideCountHint is shorter', () => {
    const html = `<!doctype html><html><body>
<section class="slide"><h1>T1</h1></section>
<section class="slide"><h2>T2</h2></section>
<section class="slide"><h2>T3</h2></section>
<section class="slide"><h2>T4</h2></section>
<section class="slide"><h2>T5</h2></section>
</body></html>`;
    const cloned = buildTemplateClonedDeckHtml(
      html,
      [
        { title: '하나' },
        { title: '둘' },
        { title: '셋' },
        { title: '넷' },
        { title: '다섯' },
      ],
      { maxSlides: 3 },
    );
    expect(listTemplateCloneSlideShells(cloned!).length).toBe(5);
    expect(cloned).toContain('다섯');
  });

  it('preserves nested heading chrome when swapping text', () => {
    const html = `<!doctype html><html><body>
<section class="slide"><h1><span class="accent">Old</span></h1></section>
<section class="slide"><h2>Body</h2><ul><li class="item"><em>A</em></li></ul></section>
</body></html>`;
    const cloned = buildTemplateClonedDeckHtml(
      html,
      [{ title: '신규' }, { title: '본문', body: '항목' }],
    );
    expect(cloned).toContain('<span class="accent">신규</span>');
    expect(cloned).toContain('class="item"');
    expect(cloned).toContain('<em>항목</em>');
  });
});

describe('resolveTemplateCloneSlideCountHint', () => {
  it('parses ranges and singles', () => {
    expect(resolveTemplateCloneSlideCountHint('6-8')).toBe(7);
    expect(resolveTemplateCloneSlideCountHint('10')).toBe(10);
    expect(resolveTemplateCloneSlideCountHint(5)).toBe(5);
    expect(resolveTemplateCloneSlideCountHint('')).toBeNull();
  });
});

describe('resolveTemplateCloneSlidesFromBrief', () => {
  it('parses Canvas Visible headings', () => {
    const slides = resolveTemplateCloneSlidesFromBrief({
      sourceBrief:
        'Canvas title: Plan\nVisible headings: Alpha / Bravo / Charlie\nSource preview: x',
    });
    expect(slides.map((s) => s.title)).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  it('synthesizes content-bearing slides from a free-form prompt (no outline)', () => {
    // Home template-card path: free-form prompt with no numbered outline.
    // Must NOT return [] — that left Daisy marketing copy intact. Titles must
    // be topic-like placeholders (AI fill writes real copy next).
    const slides = resolveTemplateCloneSlidesFromBrief({
      userInstruction: 'Make a deck about our Q3 team plans.',
      deckTitle: 'Team Plans',
    });
    expect(slides.length).toBeGreaterThanOrEqual(2);
    expect(slides[0]?.title).toMatch(/Team Plans|Q3/i);
    expect(slides[0]?.title).not.toMatch(/Make a deck/i);
  });

  it('derives a title from Korean free-form when deckTitle is template marketing', () => {
    const slides = resolveTemplateCloneSlidesFromBrief({
      userInstruction: 'User instruction:\nAI 트렌드 발표자료를 만들어줘',
      deckTitle: 'Html Ppt Zhangzara Daisy Days',
    });
    expect(slides[0]?.title).toMatch(/AI 트렌드/);
    expect(slides[0]?.title).not.toMatch(/Html Ppt|Daisy Days|만들어/i);
  });

  it('does not dump instruction prompts into cover titles', () => {
    const slides = resolveTemplateCloneSlidesFromBrief({
      userInstruction:
        '첨부한 자료를 바탕으로 슬라이드 덱을 만들어줘.\n\nUser instruction:\nexpo에 대해서 설명하는 피피티 만들어줘. 시니어 개발자 레벨.',
      deckTitle: 'Html Ppt Zhangzara Daisy Days',
    });
    expect(slides[0]?.title).toMatch(/expo/i);
    expect(slides[0]?.title).not.toMatch(/첨부한 자료|만들어줘/);
    expect(slides[0]?.body).toBe('…');
  });

  it('extracts [User instruction] from a full create-slides run prompt', () => {
    const slides = resolveTemplateCloneSlidesFromBrief({
      userInstruction: [
        '요청한 내용으로 슬라이드 덱을 만들어줘.',
        '',
        '[Deliverable instruction]',
        'Build a new presentation deck from the attached source material.',
        '',
        '[User instruction]',
        'expo에 대해서 설명하는 피피티 만들어줘. 시니어 개발자 레벨.',
      ].join('\n'),
      deckTitle: 'Html Ppt Zhangzara Daisy Days',
    });
    expect(slides[0]?.title).toMatch(/expo/i);
    expect(slides[0]?.title).not.toMatch(/요청한 내용|첨부한 자료|만들어줘|Deliverable/i);
  });

  it('returns empty free-form synthesis when only empty-create boilerplate is present', () => {
    const slides = resolveTemplateCloneSlidesFromBrief({
      userInstruction: '슬라이드 덱을 만들어줘.',
      deckTitle: 'Untitled',
    });
    // Boilerplate-only brief → no instruction dump; empty outline so Clone
    // uses role-diverse starter shells instead of "슬라이드 덱을 만들어줘".
    expect(slides).toEqual([]);
  });

  it('picks up numbered outlines from user instructions', () => {
    const slides = resolveTemplateCloneSlidesFromBrief({
      userInstruction: [
        'Make a deck for our roadmap:',
        '1. Vision',
        '2. Milestones',
        '3. Risks',
      ].join('\n'),
    });
    expect(slides.map((s) => s.title)).toEqual(['Vision', 'Milestones', 'Risks']);
  });

  it('returns [] when brief is empty (build uses short role-diverse starter)', () => {
    expect(resolveTemplateCloneSlidesFromBrief({})).toEqual([]);
  });
});

describe('normalizeTemplateCssForFixedCanvas', () => {
  it('rewrites vw/vh to px for a 1920×1080 canvas', () => {
    const css = '.slide{width:100vw;height:100vh}h1{font-size:clamp(2.5rem,5vw,4.5rem)}';
    const next = normalizeTemplateCssForFixedCanvas(css);
    expect(next).toContain('width:1920px');
    expect(next).toContain('height:1080px');
    expect(next).toContain('96px');
    expect(next).not.toMatch(/\d+vw|\d+vh/);
  });
});

describe('free-form Daisy clone content swap', () => {
  it('replaces Daisy marketing copy when only a free-form prompt is supplied', async () => {
    const html = await readFile(
      new URL(
        '../../../plugins/_official/examples/html-ppt-zhangzara-daisy-days/example.html',
        import.meta.url,
      ),
      'utf8',
    );
    const slides = resolveTemplateCloneSlidesFromBrief({
      userInstruction: 'AI 트렌드 발표자료를 만들어줘',
      deckTitle: 'Html Ppt Zhangzara Daisy Days',
    });
    const natural = listTemplateCloneSlideShells(html).length;
    const cloned = buildTemplateClonedDeckHtml(html, slides, {
      title: slides[0]?.title || 'AI 트렌드',
    });
    expect(cloned).toBeTruthy();
    expect(cloned).toContain('#F5F0E6');
    expect(cloned).toMatch(/AI 트렌드/);
    expect(cloned).not.toContain('Daisy Days');
    expect(cloned).not.toContain('cheerful presentation template');
    expect(cloned).toMatch(/width:\s*1920px/i);
    // vw→px so type scale matches template preview intent on fixed canvas
    expect(cloned).not.toMatch(/font-size:\s*clamp\([^)]*vw/i);
    // Content length — not Daisy's full demo page count/order.
    const outCount = listTemplateCloneSlideShells(cloned!).length;
    expect(outCount).toBe(slides.length);
    expect(outCount).toBeLessThan(natural);
    expect(outCount).toBeGreaterThanOrEqual(3);
  });
});

describe('sanitizeTemplateCloneDeckTitle', () => {
  it('rejects instruction copy and template marketing titles', () => {
    expect(sanitizeTemplateCloneDeckTitle('첨부한 자료를 바탕으로 슬라이드 덱을 만들어줘.')).toBeNull();
    expect(sanitizeTemplateCloneDeckTitle('expo에 대해서 설명하는 피피티 만들어줘.')).toBeNull();
    expect(sanitizeTemplateCloneDeckTitle('Html Ppt Zhangzara Daisy Days')).toBeNull();
    expect(looksLikeInstructionCopy('[Deliverable instruction] Build a deck')).toBe(true);
    expect(looksLikeLeakedApiModeFilesystemProse(
      'Since this workspace is in API mode without filesystem write tools, here is the complete deck HTML. You can save this as deck.html and it will render as a self-contained slide deck.',
    )).toBe(true);
    expect(looksLikeInstructionCopy(
      'Since this workspace is in API mode without filesystem write tools, here is the complete deck HTML. You can save this as deck.html and it will render as a self-contained slide deck.',
    )).toBe(true);
    expect(stripLeakedApiModeFilesystemProse(
      '작성 중.\n\nSince this workspace is in API mode without filesystem write tools, here is the complete deck HTML. You can save this as deck.html and it will render as a self-contained slide deck.',
    )).toBe('작성 중.');
    expect(looksLikeTemplateMarketingTitle('Html Ppt Zhangzara Daisy Days')).toBe(true);
    expect(looksLikeTemplateMarketingTitle('Presentation')).toBe(true);
    expect(looksLikeTemplateMarketingTitle('Slide')).toBe(true);
    expect(looksLikeTemplateMarketingTitle('Presentation Skills')).toBe(false);
    expect(looksLikeTemplateMarketingTitle('Hartfield & Co.')).toBe(true);
    expect(looksLikeTemplateMarketingTitle('NorthPeak Industries')).toBe(true);
    expect(looksLikeTemplateMarketingTitle('Filebase · Series B')).toBe(true);
    expect(looksLikeLeftoverTemplateDemoDeck('<p>Hartfield &amp; Co. WACC (base)</p>')).toBe(true);
    expect(looksLikeLeftoverTemplateDemoDeck('<p>open-design v0.18 · skill: pitch-agent</p>')).toBe(true);
    expect(looksLikeLeftoverTemplateDemoDeck('<p>Apex Group · OPERATION HALCYON · hermes-agent</p>')).toBe(true);
    expect(looksLikeLeftoverTemplateDemoDeck('<section class="slide"><h1>개요</h1></section>')).toBe(false);
    expect(looksLikeLeftoverTemplateDemoDeck(
      '<p>Open Design is the open-source alternative to Anthropic\'s Claude Design.</p>',
    )).toBe(true);
    expect(looksLikeLeftoverTemplateDemoDeck(
      '<p>A local-first design studio for the agent you already trust.</p>',
    )).toBe(true);
    expect(looksLikeLeftoverTemplateDemoDeck(
      '<section class="slide"><h1>삼각함수</h1><p>정의와 활용</p></section>',
    )).toBe(false);
    expect(looksLikeLeftoverTemplateDemoDeck(
      '<span class="eyebrow">Open-source design studio</span><p>Berlin · 52.5200° N</p>',
    )).toBe(true);
    expect(looksLikeLeftoverTemplateDemoDeck(
      '<span class="tag">Apache-2.0</span><span class="tag">Local-first</span><span class="tag">BYOK</span>',
    )).toBe(true);
    expect(looksLikeLeftoverTemplateDemoDeck(
      '<span class="broadside-num">[[Author Name]]</span>',
    )).toBe(true);
    expect(looksLikeLeftoverTemplateDemoDeck(
      '<p class="lead">this is the broadside style</p>',
    )).toBe(true);
    expect(looksLikeLeftoverTemplateDemoDeck(
      ':root { --c-bg-orange: #e85d26; } /* ZONE A · TOKENS */',
    )).toBe(false);
    expect(sanitizeTemplateCloneDeckTitle('Presentation')).toBeNull();
    expect(looksLikeTemplateMarketingTitle('Expo for Senior Engineers')).toBe(false);
    expect(deriveDeckCoverTitleFromBrief('', 'Presentation')).toBe('슬라이드');
    expect(sanitizeTemplateCloneDeckTitle('Expo SDK 개요')).toBe('Expo SDK 개요');
  });

  it('heals a 만들어줘 cover heading from the user brief', () => {
    const html = [
      '<!doctype html><html><body>',
      '<section class="slide"><h1>expo에 대해서 설명하는 피피티 만들어줘</h1><p>시니어</p></section>',
      '<section class="slide"><h2>Agenda</h2></section>',
      '</body></html>',
    ].join('');
    const healed = healInstructionCopyCoverHeading(
      html,
      'expo에 대해서 설명하는 피피티 만들어줘. 시니어 개발자 레벨.',
    );
    expect(healed).toContain('<h1>expo</h1>');
    expect(healed).not.toContain('만들어줘');
    expect(healed).toContain('<h2>Agenda</h2>');
    expect(healInstructionCopyCoverHeading(
      '<section class="slide"><h1>Expo SDK 개요</h1></section>',
      'expo에 대해서 설명하는 피피티 만들어줘',
    )).toContain('<h1>Expo SDK 개요</h1>');
  });

  it('heals later host headings so majority marketing copy does not fail persist', () => {
    const html = [
      '<!doctype html><html><body>',
      '<section class="slide" data-screen-label="01 Cover"><h1>expo에 대해서 설명하는 피피티 만들어줘</h1><p>시니어</p></section>',
      '<section class="slide" data-screen-label="02 Agenda"><h2>Html Ppt Zhangzara Daisy Days</h2><p>Router와 EAS</p></section>',
      '<section class="slide"><h2>만들어줘</h2><p>Managed workflow vs prebuild</p></section>',
      '<section class="slide"><h2>Expo SDK 개요</h2><p>keep me</p></section>',
      '</body></html>',
    ].join('');
    const healed = healInstructionCopyCoverHeading(
      html,
      'expo에 대해서 설명하는 피피티 만들어줘. 시니어 개발자 레벨.',
    );
    expect(healed).toContain('<h1>expo</h1>');
    expect(healed).toContain('<h2>Agenda</h2>');
    expect(healed).toContain('<h2>Managed workflow vs prebuild</h2>');
    expect(healed).toContain('<h2>Expo SDK 개요</h2>');
    expect(healed).not.toContain('만들어줘');
    expect(healed).not.toContain('Daisy Days');
  });

  it('heals mixed section/div hosts and every failed heading in a slide', () => {
    const html = [
      '<!doctype html><html><body>',
      '<section class="slide"><h3>Daisy Days</h3><h1>expo에 대해서 설명하는 피피티 만들어줘</h1></section>',
      '<div class="slide"><h2>Html Ppt Zhangzara Daisy Days</h2>',
      '<p>This body dump is far too long to become a heading because persist would look noisy and cut mid thought.</p></div>',
      '<section class="s1" data-screen-label="03 Close"><h2>만들어줘</h2></section>',
      '</body></html>',
    ].join('');
    const healed = healInstructionCopyCoverHeading(
      html,
      'expo에 대해서 설명하는 피피티 만들어줘',
    );
    expect(healed).toContain('<h3>expo</h3>');
    expect(healed).toContain('<h1>expo</h1>');
    expect(healed).toContain('<h2>개요</h2>');
    expect(healed).toContain('<h2>Close</h2>');
    expect(healed).not.toContain('만들어줘');
    expect(healed).not.toContain('Daisy Days');
    expect(healed).not.toMatch(/<h2>This body dump/);
    expect(healed).not.toMatch(/<h2>expo 2/);
  });

  it('derives a cover title from a 만들어줘 brief instead of Daisy chrome', () => {
    expect(
      deriveDeckCoverTitleFromBrief(
        'Linux Internals에 대해서 설명하는 피피티 만들어줘',
        'Daisy Days — Presentation Template',
      ),
    ).toBe('Linux Internals');
    expect(
      deriveDeckCoverTitleFromBrief(
        'AI 트렌드 발표자료를 만들어줘\n\n[Deliverable instruction]\nIgnore this.',
      ),
    ).toMatch(/AI 트렌드/);
    expect(deriveDeckCoverTitleFromBrief('')).toBe('슬라이드');
    expect(deriveDeckCoverTitleFromBrief('슬라이드 만들어줘')).toBe('슬라이드');
    expect(deriveDeckCoverTitleFromBrief('만들어줘', '만들어줘')).toBe('슬라이드');
  });

  it('treats parser/emergency English titles as generic', () => {
    expect(isGenericDeckArtifactTitle('Response')).toBe(true);
    expect(isGenericDeckArtifactTitle('deck')).toBe(true);
    expect(isGenericDeckArtifactTitle('Deck')).toBe(true);
    expect(isGenericDeckArtifactTitle('Presentation')).toBe(true);
    expect(isGenericDeckArtifactTitle('발표 자료')).toBe(true);
    expect(isGenericDeckArtifactTitle('슬라이드')).toBe(true);
    expect(isGenericDeckArtifactTitle('기업 AI 도입 효과')).toBe(false);
  });

  it('strips top-up sentinels, empty artifact tags, and leftover motif Hartfield', () => {
    const leaked = [
      '<section class="slide"><h1>[od:slide_count_top_up]</h1>',
      '<artifact type="deck" identifier="deck"></artifact>',
      '<div class="who" data-od-official-motif-html>Hartfield &amp; Co. — Industrials</div>',
      '<p>영어 회화</p></section>',
    ].join('');
    const cleaned = sanitizePersistedDeckHostLeaks(leaked);
    expect(cleaned).not.toMatch(/od:slide_count_top_up/i);
    expect(cleaned).not.toMatch(/<artifact\b/i);
    expect(cleaned).not.toMatch(/Hartfield/i);
    expect(cleaned).toContain('영어 회화');
    expect(stripHostProtocolLeakFromDeckHtml('[od:slide_count_top_up]\n<section class="slide">x</section>'))
      .not.toMatch(/od:slide_count_top_up/i);
  });

  it('heals a generic 슬라이드 cover heading from the user brief', () => {
    const healed = healInstructionCopyCoverHeading(
      '<section class="slide"><h1>슬라이드</h1><p>초안</p></section>',
      '영어 회화 표현 공부 팁, 예시에 대한 발표자료 만들어줘',
    );
    expect(healed).not.toMatch(/<h1>슬라이드<\/h1>/);
    expect(healed).toMatch(/영어 회화/);
  });

  it('rebuilds a stub cover and salvages MiniMax card markup', () => {
    const brief = '영어 회화 표현 공부 팁, 예시에 대한 발표자료 만들어줘';
    expect(deriveDeckCoverTitleFromBrief(brief)).toMatch(/영어 회화 표현 공부 팁/);
    expect(deriveDeckCoverTitleFromBrief(brief)).not.toMatch(/예시에$/);

    const html = [
      '<!doctype html><html><head></head><body>',
      '<section class="slide slide-title" style="display:flex;justify-content:center;padding:80px 88px">',
      '<span data-od-official-motif-html class="ribbon" style="position:absolute"></span>',
      '<div data-od-slide-flow style="padding:80px 88px"><h1>영어 회화 표현 공부 팁, 예시에</h1></div>',
      '</section>',
      '<style data-od-official-look-css>.cover h1.display{font-size:96px}</style>',
      '<section class="slide">',
      '<div class="eyebrow">Why It Matters</div>',
      '<h2>문법으로 외운 회화는 왜 입에서 안 나올까</h2>',
      '<p="">알면서도 말하지 못하는 간극입니다.</p="">',
      '<div style="grid-template-rows:auto auto 1fr;background:var(--paper-warm)">',
      '<div>Situation · 01</div>',
      '<div style="font-weight:700">첫 만남 · Small talk</div> · Small talk</div>',
      '<div>Nice to finally meet you.</div>',
      '</div>',
      '</section>',
      '</body></html>',
    ].join('');

    const salvaged = salvageMalformedMiniMaxSlideMarkup(html);
    expect(salvaged).toContain('<p>알면서도 말하지 못하는 간극입니다.</p>');
    expect(salvaged).not.toMatch(/<\/p="">/);
    expect(salvaged).toContain('첫 만남 · Small talk');
    expect(salvaged.match(/· Small talk/g)?.length).toBe(1);
    expect(salvaged).toContain('Nice to finally meet you.');

    const cleaned = sanitizePersistedDeckHostLeaks(salvaged);
    expect(cleaned).not.toMatch(/<span[^>]*data-od-official-motif-html[^>]*>\s*<\/span>/);
    const hoisted = hoistDeckHostStylesToHead(html);
    const lookAt = hoisted.indexOf('data-od-official-look-css');
    const firstSlide = hoisted.indexOf('slide-title');
    const secondSlide = hoisted.indexOf('Why It Matters');
    expect(lookAt).toBeGreaterThan(-1);
    expect(lookAt < firstSlide || lookAt > secondSlide).toBe(true);
    expect(cleaned).toContain('data-od-official-look-css');

    const healed = healInstructionCopyCoverHeading(cleaned, brief);
    expect(healed).toMatch(/h1 class="display"/);
    expect(healed).toMatch(/class="ribbon"/);
    expect(healed).toMatch(/cover-meta/);
    expect(healed).toMatch(/문법으로 외운 회화/);
    expect(healed).not.toMatch(/slide-title/);
  });

  it('does not stamp IB magazine chrome onto a Biennale poster deck', () => {
    const brief = '영어 회화 공부, 연습 팁에 대한 발표자료 만들어줘';
    expect(polishInstructionCoverTitle('영어 회화 공부, 연습 팁에 대한')).toBe('영어 회화 공부, 연습 팁');
    expect(deriveDeckCoverTitleFromBrief(brief)).not.toMatch(/에 대한/);

    const html = `<!doctype html><html lang="ko"><body>
<section class="slide slide-title"><h1>영어 회화 공부, 연습 팁에 대한</h1></section>
<section class="slide s-chapter" style="background:#0a0a0a"></section>
<section class="slide s-chapter"><h2>왜 회화는 근육인가</h2><p>발화 근육이 따로 필요합니다.</p></section>
</body></html>`;
    const healed = healInstructionCopyCoverHeading(html, brief);
    expect(healed).not.toMatch(/class="mast"|cover-meta|Study Notes/i);
    expect(healed).not.toMatch(/<h1 class="display">/);
    expect(healed).toMatch(/<h1>영어 회화 공부, 연습 팁<\/h1>/);
    expect(healed).not.toMatch(/에 대한/);
    expect(healed).toMatch(/s-chapter/);
  });

  it('restyles an IB-stamped cover on Biennale look and salvages broken body slides', () => {
    const html = `<!doctype html><html lang="ko"><body>
<section class="slide cover slide-title" style="display:grid">
<header class="mast"><span class="brand">Study Notes</span></header>
<div class="body"><div><span class="ribbon">Study Notes</span>
<h1 class="display">영어 회화 공부<br>연습 팁에 대한</h1>
<p class="subhead">하루 45분, 네 가지 리츄얼로 발화 회로를 단련합니다</p>
</div><aside class="cover-meta"><div class="row"><div class="k">Brief</div>
<div class="v">영어 회화 공부, 연습 팁에 대한</div></div></aside></div>
</section>
<section class="slide s-chapter" style="width:1920px;height:1080px;background:#0a0a0a"></section>
<section class="slide s-chapter">
<h1 style="font-size:124px">왜 회화는<br><br>공부가 아니라<br><br><em>근육</em> 인가
<div>성인 학습자는 문법·단어를 입력해도 회화에서 자동으로 끌어오지 못합니다.</div>
</h1>
</section>
<section class="slide s-data">
<h2>하루 45분, 네 가지 리츄얼</h2>
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:28px">
<div style="min-height:420px"><div>01 · 10 MIN</div><div>Shadowing</div></div>
</div>
</section>
<section class="slide s-data">
<div style="position:relative;width:520px;height:520px;background:radial-gradient(circle at 100% 0%,#F1EE2E 0%,rgba(241,238,46,0) 60%);pointer-events:none"></div>
<h2>일주일 회화 루틴 · <em>레시피 카드</em>
<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:32px">
<div><div>MON · WED · FRI</div><div>Shado</div></div></div></h>
</section>
<style data-od-official-look-css>
:root { --sun:#F1EE2E; --paper:#E9E5DB; }
.s-cover { background: var(--paper); }
.s-cover .sunglow { position:absolute; inset:0; }
.s-cover .titlewrap { position:absolute; }
</style>
</body></html>`;

    const salvaged = salvageMalformedMiniMaxSlideMarkup(html);
    expect(salvaged).toMatch(/class="slide s-cover"/);
    expect(salvaged).toMatch(/class="titlewrap"/);
    expect(salvaged).toMatch(/<h1 class="title">/);
    expect(salvaged).toMatch(/하루 45분, 네 가지 리츄얼/);
    expect(salvaged).not.toMatch(/Study Notes|cover-meta|class="mast"|Brief/i);
    expect(salvaged).not.toMatch(/연습 팁에 대한/);
    expect(salvaged.match(/<section\b[^>]*\bslide\b/gi)?.length).toBe(4);
    expect(salvaged).not.toMatch(/<section class="slide s-chapter"[^>]*>\s*<\/section>/);
    expect(salvaged).toMatch(/class="blocks"/);
    expect(salvaged).toMatch(/class="stack"/);
    expect(salvaged).toMatch(/<h1 class="ttl">왜 회화는<br>공부가 아니라<br><em>근육<\/em> 인가<\/h1>/);
    expect(salvaged).toMatch(/class="lede"/);
    expect(salvaged).toMatch(/성인 학습자는 문법/);
    expect(salvaged).not.toMatch(/class="nm"|vrail|학습 노트/i);
    expect(salvaged).not.toMatch(
      /<h1[^>]*>왜 회화는[\s\S]*<div>성인 학습자[\s\S]*<\/h1>/,
    );
    expect(salvaged).toMatch(/class="frame"/);
    expect(salvaged).toMatch(/class="head"/);
    expect(salvaged).toMatch(/class="stat"/);
    expect(salvaged).toContain('Shadowing');
    expect(salvaged).toContain('01 · 10 MIN');
    expect(salvaged).toMatch(/class="h">일주일 회화 루틴 · <em>레시피 카드<\/em>/);
    expect(salvaged).toMatch(/data-od-biennale-sparse-fill/);
    expect(salvaged).toMatch(/position:absolute;top:0;right:0/);
    expect(salvaged).toContain('Shado');
    expect(salvaged).not.toMatch(/<\/h>/);
    expect(salvaged).not.toMatch(/English Speaking Tips|쉐도잉 루틴|개요|핵심 포인트/i);

    const restyled = restyleForeignIbMagazineCover(html);
    expect(restyled).toMatch(/class="titlewrap"/);
    expect(restyled).toMatch(/class="blocks"/);
    expect(restyled).not.toMatch(/Study Notes/i);
  });

  it('restyles a no-mast IB ribbon cover onto Biennale s-cover', () => {
    const html = `<!doctype html><html lang="ko"><body>
<section class="slide cover slide-title" style="width:1920px;height:1080px">
<div class="body"><span class="ribbon">Study Notes</span>
<h1 class="display">영어 회화 공부<br>연습 팁에 대한</h1>
<p class="subhead">하루 45분, 네 가지 리츄얼로 발화 회로를 단련합니다</p></div>
<footer class="foot"><span class="conf">영어 회화 공부, 연습 팁에 대한</span></footer>
</section>
<section class="slide s-chapter"><h2>왜 회화는 근육인가</h2></section>
<style data-od-official-look-css>
:root { --sun:#F1EE2E; --paper:#E9E5DB; }
.s-cover { background: var(--paper); }
.s-cover .sunglow { position:absolute; inset:0; }
.s-cover .titlewrap { position:absolute; }
</style>
</body></html>`;
    const restyled = restyleForeignIbMagazineCover(html);
    expect(restyled).toMatch(/class="slide s-cover"/);
    expect(restyled).toMatch(/class="blocks"/);
    expect(restyled).toMatch(/class="sunglow"/);
    expect(restyled).toMatch(/class="titlewrap"/);
    expect(restyled).toMatch(/<h1 class="title">/);
    expect(restyled).toMatch(/영어 회화/);
    expect(restyled).toMatch(/하루 45분, 네 가지 리츄얼로/);
    expect(restyled).not.toMatch(/Study Notes|cover-meta|class="mast"|class="ribbon"|class="display"/i);
    expect(restyled).not.toMatch(/연습 팁에 대한/);
    expect(restyled).not.toMatch(/학습 노트|English Speaking Tips|Hartfield/i);

    const salvaged = salvageMalformedMiniMaxSlideMarkup(html);
    expect(salvaged).toMatch(/class="slide s-cover"/);
    expect(salvaged).not.toMatch(/Study Notes/i);

    const already = restyleForeignIbMagazineCover(restyled);
    expect(already).toBe(restyled);

    const daisy = html.replace(
      /data-od-official-look-css>\s*:root[\s\S]*?<\/style>/,
      'data-od-official-look-css>:root{--cream:#F5F0E6}.slide-inner{display:grid}.display{font-size:72px}</style>',
    );
    expect(restyleForeignIbMagazineCover(daisy)).toContain('class="display"');
    expect(restyleForeignIbMagazineCover(daisy)).not.toMatch(/class="slide s-cover"/);
  });

  it('does not wrap dense or already-stacked Biennale chapters', () => {
    const look = '<style data-od-official-look-css>:root{--sun:#F1EE2E;--paper:#E9E5DB}</style>';
    const dense = [
      '<section class="slide s-chapter">',
      '<h2>루틴</h2>',
      '<div style="display:grid;grid-template-columns:repeat(4,1fr)">',
      '<div>A</div><div>B</div><div>C</div><div>D</div>',
      '</div></section>',
      look,
    ].join('');
    expect(restyleBiennaleSparseChapterBodies(dense)).not.toMatch(/class="stack"/);

    const stacked = [
      '<section class="slide s-chapter">',
      '<div class="stack"><div class="ttl">이미 공식 장</div></div>',
      '</section>',
      look,
    ].join('');
    expect(restyleBiennaleSparseChapterBodies(stacked)).toBe(stacked);
  });

  it('binds sparse Biennale s-data and s-quote without inventing cards or kickers', () => {
    const look = '<style data-od-official-look-css>:root{--sun:#F1EE2E;--paper:#E9E5DB}</style>';
    const data = [
      '<section class="slide s-data">',
      '<h2>하루 45분</h2>',
      '<div style="display:grid;grid-template-columns:repeat(1,1fr)">',
      '<div><div>01 · 10 MIN</div><div>Shadowing</div></div>',
      '</div></section>',
      look,
    ].join('');
    const restyled = restyleBiennaleSparseDataBodies(data);
    expect(restyled).toMatch(/class="frame"/);
    expect(restyled).toMatch(/class="h">하루 45분/);
    expect(restyled).toMatch(/class="caption lab2">01 · 10 MIN/);
    expect(restyled).toMatch(/class="v">Shadowing/);
    expect(restyled).not.toMatch(/class="chart"/);
    expect(restyleBiennaleSparseDataBodies(restyled)).toBe(restyled);

    const charted = [
      '<section class="slide s-data">',
      '<div class="frame"><div class="head"><div class="h">출석</div></div>',
      '<div class="chart"><div class="row">2026</div></div></div>',
      '</section>',
      look,
    ].join('');
    expect(restyleBiennaleSparseDataBodies(charted)).toBe(charted);

    const quote = [
      '<section class="slide s-quote">',
      '<p>회화는 공부가 아니라 근육이다.</p>',
      '<div>수업 노트</div>',
      '</section>',
      look,
    ].join('');
    const quoted = restyleBiennaleSparseQuoteBodies(quote);
    expect(quoted).toMatch(/class="yblock"/);
    expect(quoted).toMatch(/class="qbody">회화는 공부가 아니라 근육이다/);
    expect(quoted).toMatch(/class="caption role">수업 노트/);
    expect(quoted).not.toMatch(/A note from the curator|Idun/i);
    expect(injectBiennaleSparseFillCss(quoted)).toMatch(/data-od-biennale-sparse-fill/);
    expect(injectBiennaleSparseFillCss(injectBiennaleSparseFillCss(quoted)))
      .toBe(injectBiennaleSparseFillCss(quoted));
  });

  it('reparents MiniMax auto-auto-1fr cards and 64px step lists', () => {
    const card = [
      '<div style="grid-template-rows:auto auto 1fr;background:var(--paper-warm)">',
      '<div>Step 01</div>',
      '<div style="font-weight:700">상황 8개 선정</div>',
      '</div>',
      '<div>내가 자주 겪는 상황을 8개 적고</div>',
      '</div>',
    ].join('');
    const salvagedCard = salvageMalformedMiniMaxSlideMarkup(card);
    expect(salvagedCard).toContain('상황 8개 선정');
    expect(salvagedCard).toContain('내가 자주 겪는 상황을 8개 적고');
    expect(salvagedCard.match(/<\/div>/g)?.length).toBe(4);

    const list = [
      '<ol>',
      '<li style="display:grid;grid-template-columns:64px 1fr"><div>01</div><div>청각 입력</div></li>',
      '</ol></div>',
      '<li style="display:grid;grid-template-columns:64px 1fr"><div>02</div><div>따라 말하기</div></li>',
      '<li style="display:grid;grid-template-columns:64px 1fr"><div>03</div><div>혼잣말 변환</div></li>',
    ].join('');
    const salvagedList = salvageMalformedMiniMaxSlideMarkup(list);
    expect(salvagedList).toMatch(/01[\s\S]*02[\s\S]*03[\s\S]*<\/ol>/);
    expect(salvagedList).not.toMatch(/<\/ol><\/div><li/);
  });

  it('repairs nested heading typos and empty border pad shells (루프377)', () => {
    const html = [
      '<section class="slide" data-screen-label="04 Product">',
      '<h3 style="font-size:32px">Shared Drive </p>/h3></h3>',
      '<h3 style="font-size:32px">AI Chat <h3 style="font-size:32px">AI Chat </p>',
      '<p style="font-size:18px">파일과 대화 맥락을 이해하는 AI</p>',
      '<h3>AI Apps</h3><h3>AI Apps</h3>',
      '<div style="background:#FFFDF5;border:4px solid #000;box-shadow:8px 8px 0 #000;padding:32px"> </div>',
      '<div style="width:48px;height:48px;border:3px solid #000;padding:0"></div>',
      '</section>',
    ].join('');
    const salvaged = salvageMalformedMiniMaxSlideMarkup(html);
    expect(salvaged).toMatch(/<h3[^>]*>Shared Drive\s*<\/h3>/);
    expect(salvaged).not.toMatch(/<\/p>\s*\/h3>|\s\/h3>/);
    expect(salvaged).toMatch(/<h3[^>]*>AI Chat\s*<\/h3>/);
    expect(salvaged).toContain('파일과 대화 맥락을 이해하는 AI');
    expect(salvaged.match(/AI Apps/g)?.length).toBe(1);
    expect(salvaged).not.toMatch(/padding:32px[^>]*>\s*<\/div>/);
    expect(salvaged).toMatch(/width:48px;height:48px/);
  });

  it('strips empty class-only ribbon shells without Motif attrs', () => {
    const html = '<section class="slide"><span class="ribbon"></span><h1>개요</h1></section>';
    const cleaned = stripEmptyOfficialMotifInstances(html);
    expect(cleaned).not.toMatch(/class="ribbon"/);
    expect(cleaned).toContain('<h1>개요</h1>');
  });

  it('does not reparent leftover IB catalog lists or drop Hartfield chrome', async () => {
    const html = await readFile(
      new URL(
        '../../../plugins/_official/examples/ib-pitch-book/example.html',
        import.meta.url,
      ),
      'utf8',
    );
    const salvaged = salvageMalformedMiniMaxSlideMarkup(html);
    expect(salvaged).toMatch(/Hartfield/i);
    expect(salvaged).toMatch(/id=["']now["']/);
    expect(salvaged).toContain('WACC');
    expect(salvaged).toMatch(/<ol[\s\S]*<\/ol>/);
  });

  it('reparents orphan 2x2 grid siblings and leaves PAGE chrome outside', async () => {
    const html = [
      '<section class="slide s3">',
      '<h2>Four skills</h2>',
      '<div class="grid" style="grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr">',
      '<div>L LISTENING input first</div>',
      '</div>',
      '<div>V VOCAB in context</div>',
      '<div>G GRAMMAR as repair</div>',
      '<div>S SPEAKING last</div>',
      '<div>PAGE 03 / 06</div>',
      '</section>',
    ].join('');
    const salvaged = salvageMalformedMiniMaxSlideMarkup(html);
    const grid = salvaged.match(/<div class="grid"[^>]*>[\s\S]*?<\/div>\s*<div>PAGE/i)?.[0] ?? '';
    expect(grid).toMatch(/L LISTENING[\s\S]*V VOCAB[\s\S]*G GRAMMAR[\s\S]*S SPEAKING/);
    expect(salvaged).toMatch(/<\/div>\s*<div>PAGE 03 \/ 06<\/div>/);
    expect(salvaged.match(/<div class="grid"/g)?.length).toBe(1);

    const official = await readFile(
      new URL(
        '../../../plugins/_official/examples/html-ppt-zhangzara-creative-mode/example.html',
        import.meta.url,
      ),
      'utf8',
    );
    const officialSalvaged = salvageMalformedMiniMaxSlideMarkup(official);
    expect((officialSalvaged.match(/class="cell"/g) ?? []).length)
      .toBe((official.match(/class="cell"/g) ?? []).length);
    expect(officialSalvaged).toMatch(/PRESS/);
  });

  it('drops empty official Motif ribbon and stamp shells', () => {
    const html = [
      '<section class="slide">',
      '<span data-od-official-motif-html class="ribbon"></span>',
      '<div data-od-official-motif-html class="stamp"><div class="lab"></div><div class="who"></div><div class="det"><br><br></div></div>',
      '<h1>개요</h1></section>',
    ].join('');
    const cleaned = stripEmptyOfficialMotifInstances(html);
    expect(cleaned).not.toMatch(/data-od-official-motif-html/);
    expect(cleaned).toContain('<h1>개요</h1>');
  });

  it('does not synthesize marketing titles when the brief is only a template name', () => {
    const slides = resolveTemplateCloneSlidesFromBrief({
      sourceBrief: 'Html Ppt Zhangzara Daisy Days',
      deckTitle: 'Html Ppt Zhangzara Daisy Days',
    });
    expect(slides.every((slide) => !/Html Ppt|Daisy Days|Zhangzara/i.test(slide.title))).toBe(true);
    const cloned = buildTemplateClonedDeckHtml(
      `<!doctype html><html><body>
        <section class="slide"><h1>Daisy Days</h1><p>Html Ppt Zhangzara Daisy Days</p></section>
      </body></html>`,
      slides,
      { title: 'Html Ppt Zhangzara Daisy Days' },
    );
    expect(cloned).toMatch(/<h1[^>]*>슬라이드<\/h1>/);
    expect(cloned).not.toContain('Html Ppt Zhangzara Daisy Days');
    expect(cloned).not.toContain('Daisy Days');
  });

  it('does not treat Studio slide-chrome / slide-counter as clone shells', () => {
    const html = `
<section class="slide">
  <div class="slide-chrome">01 / Studio</div>
  <h1>Cover</h1>
</section>
<section class="slide-counter">5 / 10</section>
<section class="slide"><h1>Body</h1></section>
`.trim();
    const shells = listTemplateCloneSlideShells(html);
    expect(shells).toHaveLength(2);
    expect(shells.some((shell) => /slide-chrome|slide-counter/.test(shell.attrs))).toBe(false);
    expect(shells[0]?.body).toContain('Cover');
    expect(shells[1]?.body).toContain('Body');
  });

  it('does not keep IB pitch-book finance copy on a Korean conversation brief', async () => {
    const html = await readFile(
      new URL(
        '../../../plugins/_official/examples/ib-pitch-book/example.html',
        import.meta.url,
      ),
      'utf8',
    );
    const slides = resolveTemplateCloneSlidesFromBrief({
      userInstruction: '영어 회화 표현 공부 팁, 예시에 대한 발표자료 만들어줘',
    });
    const cloned = buildTemplateClonedDeckHtml(html, slides, {
      title: slides[0]?.title,
      maxSlides: 10,
    });
    expect(cloned).toBeTruthy();
    expect(listTemplateCloneSlideShells(cloned!).length).toBe(slides.length);
    expect(cloned).not.toMatch(/Hartfield/i);
    expect(cloned).not.toMatch(/Revenue CAGR/i);
    expect(cloned).not.toMatch(/Section 5\s*·\s*DCF/i);
    expect(cloned).not.toMatch(/A discounted-cash-flow that/i);
    expect(cloned).not.toMatch(/WACC \(base\)/i);
    expect(cloned).not.toMatch(/WACC\s*[×x]/i);
    expect(cloned).not.toMatch(/<div[^>]*\b(?:demo-banner|agent-stamp|demo-pill)\b/i);
    expect(cloned).not.toMatch(/Sector context/i);
    expect(cloned).not.toMatch(/Selection criteria/i);
    expect(cloned).not.toMatch(/Fictional illustrative sample/i);
    expect(cloned).toMatch(/영어 회화|개요|핵심 포인트/);
    // 0826-N01 hoist strips the native `<div class="chrome">` prev/next/
    // counter shell (dead after `stripScriptsAndNav` and blocks compact-
    // stacked classification). The host deck viewer supplies its own chrome
    // now, so `id="total"` counter mutation is no longer part of the
    // Clone contract.
    expect(cloned).not.toMatch(/id="total"/i);
    expect(cloned).not.toMatch(/<div\b[^>]*\bclass\s*=\s*['"][^'"]*\bchrome\b/i);
  });

  it('does not keep simple-deck Filebase / Northwind demo copy on a Korean brief', async () => {
    const html = await readFile(
      new URL(
        '../../../plugins/_official/examples/simple-deck/example.html',
        import.meta.url,
      ),
      'utf8',
    );
    const slides = resolveTemplateCloneSlidesFromBrief({
      userInstruction: '영어 회화 표현 공부 팁, 예시에 대한 발표자료 만들어줘',
    });
    const cloned = buildTemplateClonedDeckHtml(html, slides, {
      title: slides[0]?.title,
      maxSlides: 10,
    });
    expect(cloned).toBeTruthy();
    expect(cloned).not.toMatch(/38×|38x/i);
    expect(cloned).not.toMatch(/Northwind/i);
    expect(cloned).not.toMatch(/Filebase/i);
    expect(cloned).not.toMatch(/The bandwidth bill is the bug/i);
  });

  it('strips deck-level demo chrome on persist heal', () => {
    const healed = healInstructionCopyCoverHeading(
      [
        '<!doctype html><html><body>',
        '<div class="demo-banner">Fictional illustrative sample.</div>',
        '<div class="agent-stamp">Generated by pitch-agent</div>',
        '<section class="slide"><h1>영어 회화 표현 공부 팁</h1></section>',
        '</body></html>',
      ].join(''),
      '영어 회화 표현 공부 팁, 예시에 대한 발표자료 만들어줘',
    );
    expect(healed).not.toMatch(/demo-banner|Fictional illustrative|pitch-agent/i);
    expect(healed).toContain('영어 회화');
  });

  it('scrubs a leftover IB catalog example when the brief is a Korean topic', async () => {
    const html = await readFile(
      new URL(
        '../../../plugins/_official/examples/ib-pitch-book/example.html',
        import.meta.url,
      ),
      'utf8',
    );
    const brief = '영어 회화 표현 공부 팁, 예시에 대한 발표자료 만들어줘';
    expect(catalogExampleShouldBeScrubbed(html, brief)).toBe(true);
    expect(catalogExampleShouldBeScrubbed(html, null)).toBe(false);
    expect(catalogExampleShouldBeScrubbed(html, null, { allowEmptyBrief: true })).toBe(true);
    expect(catalogExampleShouldBeScrubbed(html, 'ib pitch book | deck')).toBe(true);
    expect(catalogExampleShouldBeScrubbed(html, 'Hartfield & Co. WACC review')).toBe(false);
    const mixed = html.replace(
      'A discounted-cash-flow that <em>does the work</em>.',
      'A discounted-cash-flow that 영어 회화 표현 공부 팁, 예시에 · 6.',
    );
    expect(catalogExampleShouldBeScrubbed(mixed, brief)).toBe(true);
    expect(catalogExampleShouldBeScrubbed(mixed, null)).toBe(true);
    const scrubbed = scrubLeftoverCatalogExampleHtml(mixed, brief);
    expect(scrubbed).not.toMatch(/Hartfield/i);
    expect(scrubbed).not.toMatch(/WACC \(base\)/i);
    expect(scrubbed).not.toMatch(/A discounted-cash-flow that/i);
    expect(scrubbed).toMatch(/영어 회화|개요|핵심 포인트/);
  });

  it('treats a scrubbed IB chassis with placeholder copy as a leftover shell', () => {
    const scrubbedIb = [
      '<!doctype html><html><head><style>',
      `/* ${'ib-chassis '.repeat(500)} */`,
      '.slide { min-width:100vw; height:100vh } #stage { display:flex }',
      '</style></head><body>',
      '<div class="deck" id="deck">',
      '<div class="chrome"><span id="now">01</span> / <span id="total">10</span></div>',
      '<div class="stage" id="stage">',
      ...Array.from({ length: 8 }, (_, i) => {
        const title = i === 0 ? '영어 회화' : i === 1 ? '개요' : '핵심 포인트';
        return `<section class="slide"><h2>${title}</h2><p>…</p></section>`;
      }),
      '</div></div>',
      '<script>stage.style.transform = `translateX(-${i*100}vw)`</script>',
      '</body></html>',
    ].join('');
    expect(looksLikeLeftoverTemplateDemoDeck(scrubbedIb)).toBe(false);
    expect(looksLikeCatalogSwipeShell(scrubbedIb)).toBe(true);
    expect(looksLikeScrubbedCatalogExampleShell(
      scrubbedIb,
      '영어 회화 표현 공부 팁, 예시에 대한 발표자료 만들어줘',
    )).toBe(true);
    expect(looksLikeCatalogSwipeShell('<section class="slide"><h1>개요</h1></section>')).toBe(false);
  });

  it('scrubs leftover kami-deck studio copy on a Hangul trigonometry brief', async () => {
    const html = await readFile(
      new URL('../../../design-templates/kami-deck/example.html', import.meta.url),
      'utf8',
    );
    const leftover = html
      .replace(/Open Design · kami deck — Vol\. 01 \/ Issue Nº 26/i, '삼각함수')
      .replace(
        /<h1>[\s\S]*?<\/h1>/i,
        '<h1>삼각함수</h1>',
      )
      .replace(
        /<p class='tagline'>[\s\S]*?<\/p>/i,
        "<p class='tagline'>삼각함수에 대해서 설명하는 피피티 만들어줘.</p>",
      );
    const brief = '삼각함수에 대해서 설명하는 피피티 만들어줘.';
    expect(looksLikeLeftoverTemplateDemoDeck(leftover)).toBe(true);
    expect(catalogExampleShouldBeScrubbed(leftover, brief)).toBe(true);
    expect(catalogExampleShouldBeScrubbed(html, null)).toBe(false);
    expect(catalogExampleShouldBeScrubbed(html, 'Hartfield & Co. WACC review')).toBe(false);
    const daisy = await readFile(
      new URL(
        '../../../plugins/_official/examples/html-ppt-zhangzara-daisy-days/example.html',
        import.meta.url,
      ),
      'utf8',
    );
    expect(looksLikeLeftoverTemplateDemoDeck(daisy)).toBe(true);
    expect(catalogExampleShouldBeScrubbed(daisy, 'Hartfield & Co. WACC review')).toBe(false);
    const topical = [
      '<!doctype html><html><body>',
      '<section class="slide"><h1>삼각함수</h1><p>각과 비를 다루는 함수.</p></section>',
      '<section class="slide"><h2>활용</h2><p>주기와 파동.</p></section>',
      '</body></html>',
    ].join('');
    expect(looksLikeLeftoverTemplateDemoDeck(topical)).toBe(false);
    expect(catalogExampleShouldBeScrubbed(topical, brief)).toBe(false);
    const scrubbed = scrubLeftoverCatalogExampleHtml(leftover, brief);
    expect(scrubbed).not.toMatch(/Claude Design/i);
    expect(scrubbed).not.toMatch(/local-first design studio for the agent you already trust/i);
    expect(scrubbed).not.toMatch(/SKILL\.md/i);
    expect(scrubbed).toMatch(/삼각함수/);
    expect(scrubbed).not.toMatch(/만들어줘/);
    expect(scrubbed).not.toMatch(/sin\s*\(|cos\s*\(|tan\s*\(|삼각함수의 정의/i);
    expect(looksLikeLeftoverTemplateDemoDeck(scrubbed)).toBe(false);
    expect(catalogExampleShouldBeScrubbed(scrubbed, brief)).toBe(false);
    expect(() => {
      pinDeckSlidesToFixedCanvas(
        healAiGeneratedDeckMarkup(leftover, brief),
      );
    }).not.toThrow();
    expect(() => {
      pinDeckSlidesToFixedCanvas(
        healAiGeneratedDeckMarkup(scrubbed, brief),
      );
    }).not.toThrow();
  });

  it('scrubs a body-first kami leftover dump without inventing lecture copy', () => {
    const brief = '삼각함수에 대해서 설명하는 피피티 만들어줘.';
    const leftover = [
      '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/>',
      '<title>삼각함수</title>',
      '<style>#deck{position:fixed;display:flex}.slide{width:1920px;height:1080px}</style>',
      '</head><body>',
      '<section class="slide s-cover dark"><div class="slide-inner">',
      '<span class="eyebrow">Open-source design studio</span>',
      '<h1>삼각함수</h1>',
      `<p class="tagline">${brief}</p>`,
      '<div class="meta"><span>Berlin · 52.5200° N · 13.4050° E</span></div>',
      '</div></section>',
      '<section class="slide s-content"><div class="slide-inner">',
      '<div class="head"><h2>삼각함수 2</h2>',
      '<p class="lede">A local-first design studio for the agent you already trust.</p></div>',
      '<div class="body"><p>Open Design is the <strong>open-source alternative to Anthropic\'s Claude Design</strong>.',
      ' Your agent reads a folder of <code>SKILL.md</code> files.</p>',
      `<ul class="dash"><li>${brief}</li></ul>`,
      '</div></div></section>',
      '<section class="slide s-chapter dark"><div class="slide-inner"><h2>삼각함수 · 3</h2></div></section>',
      '<section class="slide s-content"><div class="slide-inner"><h2>삼각함수 · 4</h2>',
      '<ul class="dash"><li></li><li></li><li></li></ul></div></section>',
      '<div id="nav"></div><div id="hint">← / →</div>',
      '</body></html>',
    ].join('');
    expect(looksLikeLeftoverTemplateDemoDeck(leftover)).toBe(true);
    expect(catalogExampleShouldBeScrubbed(leftover, brief)).toBe(true);
    const scrubbed = scrubLeftoverCatalogExampleHtml(leftover, brief);
    expect(scrubbed).not.toMatch(/Claude Design/i);
    expect(scrubbed).not.toMatch(/local-first design studio for the agent you already trust/i);
    expect(scrubbed).not.toMatch(/SKILL\.md/i);
    expect(scrubbed).toMatch(/삼각함수/);
    expect(scrubbed).not.toMatch(/sin\s*\(|cos\s*\(|tan\s*\(/i);
    expect(looksLikeLeftoverTemplateDemoDeck(scrubbed)).toBe(false);
    expect(catalogExampleShouldBeScrubbed(scrubbed, brief)).toBe(false);
    expect(() => {
      pinDeckSlidesToFixedCanvas(healAiGeneratedDeckMarkup(leftover, brief));
    }).not.toThrow();
  });

  it('scrubs unfilled Broadside leftover on a Hangul brief and keeps official catalog', async () => {
    const brief = '삼각함수에 대해서 설명하는 피피티 만들어줘.';
    const leftover = [
      '<!doctype html><html><body>',
      '<section class="slide slide--cover orange"><h1>삼각함수</h1>',
      `<p class="lead">${brief}</p>`,
      '<span>[[Author Name]]</span></section>',
      '<section class="slide"><h2>삼각함수 2</h2><ul><li></li></ul></section>',
      '</body></html>',
    ].join('');
    expect(looksLikeLeftoverTemplateDemoDeck(leftover)).toBe(true);
    expect(catalogExampleShouldBeScrubbed(leftover, brief)).toBe(true);
    const scrubbed = scrubLeftoverCatalogExampleHtml(leftover, brief);
    expect(scrubbed).not.toMatch(/\[\[Author Name\]\]/);
    expect(scrubbed).not.toMatch(/만들어줘/);
    expect(scrubbed).toMatch(/삼각함수/);
    const official = await readFile(
      new URL(
        '../../../plugins/_official/examples/html-ppt-zhangzara-broadside/example.html',
        import.meta.url,
      ),
      'utf8',
    );
    expect(looksLikeLeftoverTemplateDemoDeck(official)).toBe(true);
    expect(catalogExampleShouldBeScrubbed(official, null)).toBe(false);
    expect(catalogExampleShouldBeScrubbed(official, 'Hartfield & Co. WACC review')).toBe(false);
  });
});

describe('stripNonSlotWrappers (0826-N01 F4)', () => {
  it('drops unknown card wrappers that are not on any class list', () => {
    const html = [
      '<h2>영어 회화</h2>',
      '<div class="weird-unknown-grid">',
      '<div class="weird-card">Option A leftover</div>',
      '<div class="weird-card">Option B leftover</div>',
      '</div>',
      '<ul><li></li><li></li></ul>',
    ].join('');
    const next = stripNonSlotWrappers(html);
    expect(next).toContain('<h2>영어 회화</h2>');
    expect(next).toContain('<ul>');
    expect(next).not.toMatch(/weird-unknown-grid|weird-card|Option A/);
  });

  it('treats hero-title as a slot and drops poster leftover', () => {
    const html = [
      '<div class="hero-title">Apex</div>',
      '<div class="hero-title">Group</div>',
      '<div class="tag-body">Building scalable solutions for enterprise partners worldwide since 2019.</div>',
    ].join('');
    const next = stripNonSlotWrappers(html);
    expect(next).toContain('hero-title');
    expect(next).toContain('Apex');
    expect(next).not.toMatch(/Building scalable|tag-body/);
  });

  it('keeps only the first outline list and drops a sibling pre', () => {
    const html = [
      '<h2>영어 회화</h2>',
      '<ul class="outline"><li>포인트 1</li></ul>',
      '<ul class="second"><li>Team Structure &amp; Resource Allocation</li></ul>',
      '<pre class="hc-codebox">brew install hermes-agent</pre>',
    ].join('');
    const next = stripNonSlotWrappers(html);
    expect(next).toContain('<h2>영어 회화</h2>');
    expect(next).toContain('포인트 1');
    expect(next).not.toMatch(/Team Structure|hermes-agent|hc-codebox|class="second"/);
  });

  it('keeps layout ancestors of the first heading', () => {
    const html = [
      '<div class="slide-inner">',
      '<div class="body">',
      '<div><h2>Title</h2></div>',
      '<div class="kpi-grid"><div class="kpi">14.8x</div></div>',
      '</div></div>',
    ].join('');
    const next = stripNonSlotWrappers(html);
    expect(next).toContain('slide-inner');
    expect(next).toContain('class="body"');
    expect(next).toContain('<h2>Title</h2>');
    expect(next).not.toMatch(/kpi-grid|14\.8/);
  });
});

describe('0901-N02-C fillAndTrimCardPeers', () => {
  it('keeps only as many info-cards as body lines', () => {
    const html = [
      '<h2>KPI</h2>',
      '<div class="cards-grid">',
      '<div class="info-card"><h4>A</h4><p>aa</p></div>',
      '<div class="info-card"><h4>B</h4><p>bb</p></div>',
      '<div class="info-card"><h4>C</h4><p>cc</p></div>',
      '</div>',
    ].join('');
    const next = fillAndTrimCardPeers(html, ['매출', '리텐션']);
    expect([...(next.matchAll(/\binfo-card\b/gi))].length).toBe(2);
    expect(next).toContain('매출');
    expect(next).toContain('리텐션');
    expect(next).not.toMatch(/<h4>\s*A\s*<\/h4>/i);
    expect(next).not.toMatch(/<h4>\s*B\s*<\/h4>/i);
    expect(next).not.toMatch(/<h4>\s*C\s*<\/h4>/i);
    expect(next).not.toContain('<p>aa</p>');
    expect(next).not.toContain('<p>cc</p>');
  });

  it('trims Daisy Days slide-cards leftover demo peers', async () => {
    const html = await readFile(
      new URL(
        '../../../plugins/_official/examples/html-ppt-zhangzara-daisy-days/example.html',
        import.meta.url,
      ),
      'utf8',
    );
    const cloned = buildTemplateClonedDeckHtml(
      html,
      [
        { title: '분기 전략 개요', roleHint: 'cover' },
        { title: '핵심 KPI', body: '매출\n리텐션', roleHint: 'cards' },
      ],
      {
        title: '분기 전략 개요',
        templateId: 'example-html-ppt-zhangzara-daisy-days',
      },
    );
    expect(cloned).toBeTruthy();
    expect(cloned).toContain('핵심 KPI');
    expect(cloned).toContain('매출');
    expect(cloned).toContain('리텐션');
    expect(cloned).not.toContain('Creative Expression');
    expect(cloned).not.toContain('Critical Thinking');
    expect(cloned).not.toContain('Collaboration');
    expect(cloned).not.toContain('Curiosity');
    const cardsSlide = listTemplateCloneSlideShells(cloned!).find((shell) => (
      /\bslide-cards\b/i.test(shell.attrs)
    ));
    expect(cardsSlide).toBeTruthy();
    expect([...(cardsSlide!.body.matchAll(/\binfo-card\b/gi))].length).toBe(2);
  });
});


describe('0901-N02-C2 template slot maps', () => {
  it('resolves Daisy Days by id and fingerprint', async () => {
    expect(
      resolveTemplateCloneSlotMap({ templateId: 'example-html-ppt-zhangzara-daisy-days' }),
    ).toBeTruthy();
    expect(
      resolveTemplateCloneSlotMap({ templateId: 'plugins/html-ppt-zhangzara-daisy-days' }),
    ).toBeTruthy();
    const html = await readFile(
      new URL(
        '../../../plugins/_official/examples/html-ppt-zhangzara-daisy-days/example.html',
        import.meta.url,
      ),
      'utf8',
    );
    expect(resolveTemplateCloneSlotMap({ html })).toBeTruthy();
  });

  it('trims Daisy weekly day-cards to body line count', () => {
    const html = [
      '<h2>주간</h2>',
      '<div class="weekly-grid">',
      '<div class="day-card"><div class="day-header pink">Monday</div><div class="day-body"><ul><li>Reading</li><li>Writing</li></ul></div></div>',
      '<div class="day-card"><div class="day-header green">Tuesday</div><div class="day-body"><ul><li>Numbers</li></ul></div></div>',
      '<div class="day-card"><div class="day-header coral">Wednesday</div><div class="day-body"><ul><li>Science</li></ul></div></div>',
      '</div>',
    ].join('');
    const map = resolveTemplateCloneSlotMap({
      templateId: 'example-html-ppt-zhangzara-daisy-days',
    });
    const next = fillAndTrimCardPeers(html, ['킥오프', '리뷰'], map);
    expect([...(next.matchAll(/\bday-card\b/gi))].length).toBe(2);
    expect(next).toContain('킥오프');
    expect(next).toContain('리뷰');
    expect(next).not.toContain('Monday');
    expect(next).not.toContain('Wednesday');
    expect(next).not.toContain('Reading');
    expect(next).not.toContain('Science');
  });

  it('trims Daisy timeline-cards to body line count', () => {
    const flat = [
      '<h2>일정</h2>',
      '<div class="timeline-wrap">',
      '<div class="timeline-card"><h4>Morning</h4><p>a</p></div>',
      '<div class="timeline-card"><h4>Noon</h4><p>b</p></div>',
      '<div class="timeline-card"><h4>Evening</h4><p>c</p></div>',
      '</div>',
    ].join('');
    const map = resolveTemplateCloneSlotMap({
      templateId: 'html-ppt-zhangzara-daisy-days',
    });
    const next = fillAndTrimCardPeers(flat, ['오프닝', '클로징'], map);
    expect([...(next.matchAll(/\btimeline-card\b/gi))].length).toBe(2);
    expect(next).toContain('오프닝');
    expect(next).toContain('클로징');
    expect(next).not.toContain('Morning');
    expect(next).not.toContain('Evening');
  });
});

describe('0901-N02-C3 additional template slot maps', () => {
  it('resolves C3 template ids', () => {
    expect(resolveTemplateCloneSlotMap({ templateId: 'html-ppt-product-launch' })).toBeTruthy();
    expect(resolveTemplateCloneSlotMap({ templateId: 'example-html-ppt-zhangzara-block-frame' })).toBeTruthy();
    expect(resolveTemplateCloneSlotMap({ templateId: 'html-ppt-zhangzara-blue-professional' })).toBeTruthy();
    expect(resolveTemplateCloneSlotMap({ templateId: 'html-ppt-zhangzara-capsule' })).toBeTruthy();
    expect(resolveTemplateCloneSlotMap({ templateId: 'html-ppt-zhangzara-bold-poster' })).toBeTruthy();
  });

  it('trims peer-driven price-cards inside grid g3 hosts', () => {
    const html = [
      '<h2>Pricing</h2>',
      '<div class="grid g3 mt-l">',
      '<div class="price-card"><h4>Starter</h4><p>a</p></div>',
      '<div class="price-card"><h4>Pro</h4><p>b</p></div>',
      '<div class="price-card"><h4>Enterprise</h4><p>c</p></div>',
      '</div>',
    ].join('');
    const next = fillAndTrimCardPeers(html, ['베이직', '프로']);
    expect([...(next.matchAll(/\bprice-card\b/gi))].length).toBe(2);
    expect(next).toContain('베이직');
    expect(next).toContain('프로');
    expect(next).not.toContain('Enterprise');
    expect(next).not.toContain('Starter');
  });

  it('trims team-grid team-cards', () => {
    const html = [
      '<div class="team-grid">',
      '<div class="team-card"><h4>Ada</h4><p>CEO</p></div>',
      '<div class="team-card"><h4>Bob</h4><p>CTO</p></div>',
      '<div class="team-card"><h4>Cara</h4><p>CPO</p></div>',
      '</div>',
    ].join('');
    const next = fillAndTrimCardPeers(html, ['김민수', '이서연']);
    expect([...(next.matchAll(/\bteam-card\b/gi))].length).toBe(2);
    expect(next).toContain('김민수');
    expect(next).not.toContain('Cara');
  });

  it('trims top-level pillar peers without a wrapper host', () => {
    const html = [
      '<div class="pillar"><h4>One</h4><p>a</p></div>',
      '<div class="pillar"><h4>Two</h4><p>b</p></div>',
      '<div class="pillar"><h4>Three</h4><p>c</p></div>',
    ].join('');
    const next = fillAndTrimCardPeers(html, ['신뢰', '속도']);
    expect([...(next.matchAll(/\bpillar\b/gi))].length).toBe(2);
    expect(next).toContain('신뢰');
    expect(next).toContain('속도');
    expect(next).not.toContain('Three');
  });

  it('trims capsule pillar-cards via cards-grid', () => {
    const html = [
      '<div class="cards-grid">',
      '<div class="pillar-card"><h4>A</h4><p>aa</p></div>',
      '<div class="pillar-card"><h4>B</h4><p>bb</p></div>',
      '<div class="pillar-card"><h4>C</h4><p>cc</p></div>',
      '</div>',
    ].join('');
    const map = resolveTemplateCloneSlotMap({ templateId: 'html-ppt-zhangzara-capsule' });
    const next = fillAndTrimCardPeers(html, ['첫째', '둘째'], map);
    expect([...(next.matchAll(/\bpillar-card\b/gi))].length).toBe(2);
    expect(next).toContain('첫째');
    expect(next).not.toContain('>C<');
  });

  it('keeps capsule pillar-card inner structure (card-icon + h3 + p) (루프373)', () => {
    const html = [
      '<div class="cards-grid">',
      '<div class="pillar-card">',
      '<div class="card-icon pill-coral">I</div>',
      '<h3>Clarity of Purpose</h3>',
      '<p>Before any action is taken.</p>',
      '</div>',
      '<div class="pillar-card">',
      '<div class="card-icon pill-lime">II</div>',
      '<h3>Structured Flexibility</h3>',
      '<p>Rigorous frameworks need not constrain creativity.</p>',
      '</div>',
      '<div class="pillar-card">',
      '<div class="card-icon pill-sky">III</div>',
      '<h3>Measured Impact</h3>',
      '<p>Success is not a feeling but a quantity.</p>',
      '</div>',
      '</div>',
    ].join('');
    const map = resolveTemplateCloneSlotMap({ templateId: 'html-ppt-zhangzara-capsule' });
    const next = fillAndTrimCardPeers(html, ['핵심 기능'], map);
    expect(next).toMatch(
      /<div class="pillar-card">\s*<div class="card-icon pill-coral">I<\/div>\s*<h3>핵심 기능<\/h3>\s*<p><\/p>\s*<\/div>/,
    );
    expect(next).not.toMatch(/<div class="pillar-card">\s*<\/div>/);
    expect([...(next.matchAll(/\bpillar-card\b/gi))].length).toBe(1);
  });

  it('capsule LOOK seed fill preserves cards-grid DOM for brief-like outline (루프373)', async () => {
    const html = await readFile(
      new URL(
        '../../../plugins/_official/examples/html-ppt-zhangzara-capsule/example.html',
        import.meta.url,
      ),
      'utf8',
    );
    const briefLine = 'www.teamver.com 사이트 분석해서 서비스 소개 슬라이드 만들어줘.';
    const cloned = buildTemplateClonedDeckHtml(
      html,
      [
        { title: 'Teamver 소개', roleHint: 'cover' },
        { title: '서비스 개요', body: 'AI 슬라이드 생성 플랫폼', roleHint: 'body' },
        { title: '핵심 가치', body: '협업\n자동화\n품질', roleHint: 'cards' },
      ],
      { title: 'Teamver 소개', templateId: 'html-ppt-zhangzara-capsule', brief: briefLine },
    );
    expect(cloned).toBeTruthy();
    const slide3 = listTemplateCloneSlideShells(cloned!).find((shell) => /\bslide-3\b/.test(shell.attrs));
    expect(slide3).toBeTruthy();
    expect(slide3!.body).toMatch(/<div class="pillar-card">[\s\S]*<div class="card-icon/);
    expect(slide3!.body).not.toMatch(/<div class="pillar-card">\s*<\/div>/);
    expect(slide3!.body).toContain('핵심 가치');
  });

  it('rewrites brief-parroting capsule titles and drops instruction body from cards (루프373)', async () => {
    const html = await readFile(
      new URL(
        '../../../plugins/_official/examples/html-ppt-zhangzara-capsule/example.html',
        import.meta.url,
      ),
      'utf8',
    );
    const briefLine = 'www.teamver.com 사이트 분석해서 서비스 소개 슬라이드 만들어줘.';
    const raw = JSON.stringify({
      title: 'www.teamver.com 사이',
      slides: [
        { title: 'www.teamver.com 사이', roleHint: 'cover' },
        { title: 'www.teamver.com 사이 2', roleHint: 'body', body: briefLine },
        { title: 'www.teamver.com 사이 · 3', roleHint: 'cards', body: briefLine },
      ],
    });
    const filled = applyTemplateCloneSlotFill(html, raw, {
      templateId: 'html-ppt-zhangzara-capsule',
      brief: briefLine,
    });
    expect(filled).toBeTruthy();
    expect(filled!.html).not.toContain('만들어줘');
    expect(filled!.html).toMatch(/teamver|Teamver|서비스|소개/i);
    const slide3 = listTemplateCloneSlideShells(filled!.html).find((s) => /\bslide-3\b/.test(s.attrs));
    expect(slide3?.body).toMatch(/<div class="pillar-card">[\s\S]*<div class="card-icon/);
    expect(slide3?.body).toContain('핵심 기능');
  });

  it('block-frame hero fill keeps deco and drops empty list rows (루프375)', async () => {
    const html = await readFile(
      new URL(
        '../../../plugins/_official/examples/html-ppt-zhangzara-block-frame/example.html',
        import.meta.url,
      ),
      'utf8',
    );
    const brief = 'www.teamver.com 사이트 분석해서 서비스 소개 슬라이드 만들어줘.';
    const cloned = buildTemplateClonedDeckHtml(
      html,
      [
        { title: 'Teamver와 AI를 하나의 워크스페이스로', roleHint: 'cover' },
        {
          title: 'Teamver — Smarter & Faster',
          body: brief,
          roleHint: 'process',
        },
        { title: '핵심 가치', body: '대화\n파일\nAI', roleHint: 'cards' },
      ],
      {
        title: 'Teamver와 AI를 하나의 워크스페이스로',
        templateId: 'html-ppt-zhangzara-block-frame',
        brief,
      },
    );
    expect(cloned).toBeTruthy();
    const pinned = pinDeckSlidesToFixedCanvas(cloned!);
    expect(pinned).toMatch(/hero-frame/);
    expect(pinned).not.toMatch(/<li>\s*<\/li>/);
    expect(pinned).toMatch(/split-visual|col-left|feature-card|cards-row/i);
  });
});

describe('0901-N02-C4 prefixed *-card peer heuristic', () => {
  it('trims xp-card peers inside xp-grid-2 without a slot map', () => {
    const html = [
      '<h2>자동화</h2>',
      '<div class="xp-grid-2">',
      '<div class="xp-card peach"><h4>邮件</h4><p>a</p></div>',
      '<div class="xp-card mint"><h4>订餐</h4><p>b</p></div>',
      '<div class="xp-card sky"><h4>会议</h4><p>c</p></div>',
      '</div>',
    ].join('');
    const next = fillAndTrimCardPeers(html, ['메일', '예약']);
    expect([...(next.matchAll(/\bxp-card\b/gi))].length).toBe(2);
    expect(next).toContain('메일');
    expect(next).toContain('예약');
    expect(next).not.toContain('会议');
    expect(next).not.toContain('邮件');
  });

  it('trims hc-card peers inside hc-grid-3 without a slot map', () => {
    const html = [
      '<div class="hc-grid-3">',
      '<div class="hc-card"><h4>Alpha</h4><p>a</p></div>',
      '<div class="hc-card"><h4>Beta</h4><p>b</p></div>',
      '<div class="hc-card"><h4>Gamma</h4><p>c</p></div>',
      '</div>',
    ].join('');
    const next = fillAndTrimCardPeers(html, ['신뢰', '속도']);
    expect([...(next.matchAll(/\bhc-card\b/gi))].length).toBe(2);
    expect(next).toContain('신뢰');
    expect(next).not.toContain('Gamma');
  });

  it('trims column-card via card-title and does not treat card-icon as peer', () => {
    const html = [
      '<div class="columns-grid">',
      '<div class="column-card"><div class="card-icon">A</div><div class="card-title">EXPAND</div><div class="card-text">reach demo</div></div>',
      '<div class="column-card"><div class="card-icon">B</div><div class="card-title">DEPTH</div><div class="card-text">depth demo</div></div>',
      '<div class="column-card"><div class="card-icon">C</div><div class="card-title">SPEED</div><div class="card-text">speed demo</div></div>',
      '</div>',
    ].join('');
    const next = fillAndTrimCardPeers(html, ['확장', '깊이']);
    expect([...(next.matchAll(/\bcolumn-card\b/gi))].length).toBe(2);
    expect(next).toContain('확장');
    expect(next).toContain('깊이');
    expect(next).not.toContain('EXPAND');
    expect(next).not.toContain('SPEED');
    expect(next).not.toContain('reach demo');
    expect(next).not.toContain('speed demo');
    // card-icon deco stays on kept peers; never becomes its own trim unit.
    expect([...(next.matchAll(/\bcard-icon\b/gi))].length).toBe(2);
  });

  it('trims team-member peers and fills member-name', () => {
    const html = [
      '<div class="team-grid">',
      '<div class="team-member"><div class="member-name">Ada</div><div class="member-role">CEO</div></div>',
      '<div class="team-member"><div class="member-name">Bob</div><div class="member-role">CTO</div></div>',
      '<div class="team-member"><div class="member-name">Cara</div><div class="member-role">CPO</div></div>',
      '</div>',
    ].join('');
    const next = fillAndTrimCardPeers(html, ['김민수', '이서연']);
    expect([...(next.matchAll(/\bteam-member\b/gi))].length).toBe(2);
    expect(next).toContain('김민수');
    expect(next).toContain('이서연');
    expect(next).not.toContain('Cara');
    expect(next).not.toContain('Ada');
    expect(next).not.toContain('CEO');
  });
});

describe('0901-N02-C5 prefixed *-step peer heuristic', () => {
  it('trims kb-step peers and fills kb-step-title', () => {
    const html = [
      '<div class="kb-pipeline">',
      '<div class="kb-step"><div class="kb-step-num">01</div><div class="kb-step-title">采集</div><div class="kb-step-body">a</div></div>',
      '<div class="kb-step"><div class="kb-step-num">02</div><div class="kb-step-title">去噪</div><div class="kb-step-body">b</div></div>',
      '<div class="kb-step"><div class="kb-step-num">03</div><div class="kb-step-title">Wiki</div><div class="kb-step-body">c</div></div>',
      '</div>',
    ].join('');
    const next = fillAndTrimCardPeers(html, ['수집', '정제']);
    expect([...(next.matchAll(/\bclass="kb-step(?:\s|")/gi))].length).toBe(2);
    expect(next).toContain('수집');
    expect(next).toContain('정제');
    expect(next).not.toContain('Wiki');
    expect(next).not.toContain('采集');
    expect(next).not.toMatch(/kb-step-body">[^<]/i);
  });

  it('trims timeline-step peers via step-title', () => {
    const html = [
      '<div class="timeline">',
      '<div class="timeline-step"><div class="step-title">Research</div><div class="step-desc">a</div></div>',
      '<div class="timeline-step"><div class="step-title">Build</div><div class="step-desc">b</div></div>',
      '<div class="timeline-step"><div class="step-title">Launch</div><div class="step-desc">c</div></div>',
      '</div>',
    ].join('');
    const next = fillAndTrimCardPeers(html, ['조사', '구축']);
    expect([...(next.matchAll(/\btimeline-step\b/gi))].length).toBe(2);
    expect(next).toContain('조사');
    expect(next).toContain('구축');
    expect(next).not.toContain('Launch');
    expect(next).not.toContain('Research');
  });

  it('trims xw-step peers inside xw-steps host', () => {
    const html = [
      '<div class="xw-steps">',
      '<div class="xw-step"><div class="xw-num">1</div><div class="xw-txt">生产会更便宜</div></div>',
      '<div class="xw-step"><div class="xw-num">2</div><div class="xw-txt">复制会更快</div></div>',
      '<div class="xw-step"><div class="xw-num">3</div><div class="xw-txt">AI 做错</div></div>',
      '</div>',
    ].join('');
    const next = fillAndTrimCardPeers(html, ['비용 하락', '복제 가속']);
    expect([...(next.matchAll(/\bxw-step\b/gi))].length).toBe(2);
    expect(next).toContain('비용 하락');
    expect(next).toContain('복제 가속');
    expect(next).not.toContain('AI 做错');
  });

  it('trims bare step peers with .t/.d slots', () => {
    const html = [
      '<div class="flow">',
      '<div class="step s-1"><div class="n">01</div><div class="t">Discover</div><div class="d">aa</div></div>',
      '<div class="step s-2"><div class="n">02</div><div class="t">Define</div><div class="d">bb</div></div>',
      '<div class="step s-3"><div class="n">03</div><div class="t">Deliver</div><div class="d">cc</div></div>',
      '</div>',
    ].join('');
    const next = fillAndTrimCardPeers(html, ['발견', '정의']);
    expect([...(next.matchAll(/\bclass="step\b/gi))].length).toBe(2);
    expect(next).toContain('발견');
    expect(next).toContain('정의');
    expect(next).not.toContain('Deliver');
    expect(next).not.toContain('Discover');
    expect(next).not.toContain('>aa<');
  });

  it('does not treat counted section tokens like five-step as peers', () => {
    const html = [
      '<div class="wrap">',
      '<div class="five-step"><h4>One</h4><p>a</p></div>',
      '<div class="five-step"><h4>Two</h4><p>b</p></div>',
      '<div class="five-step"><h4>Three</h4><p>c</p></div>',
      '</div>',
    ].join('');
    const next = fillAndTrimCardPeers(html, ['하나', '둘']);
    expect([...(next.matchAll(/\bfive-step\b/gi))].length).toBe(3);
    expect(next).toContain('One');
    expect(next).not.toContain('하나');
  });
});

describe('0901-N02-C6 multi-host fillAndTrimCardPeers', () => {
  it('trims both cards-grid and timeline hosts in one slide body', () => {
    const html = [
      '<h2>분기</h2>',
      '<div class="cards-grid">',
      '<div class="info-card"><h4>A</h4><p>aa</p></div>',
      '<div class="info-card"><h4>B</h4><p>bb</p></div>',
      '<div class="info-card"><h4>C</h4><p>cc</p></div>',
      '</div>',
      '<div class="timeline">',
      '<div class="timeline-step"><div class="step-title">Research</div><div class="step-desc">x</div></div>',
      '<div class="timeline-step"><div class="step-title">Build</div><div class="step-desc">y</div></div>',
      '<div class="timeline-step"><div class="step-title">Launch</div><div class="step-desc">z</div></div>',
      '</div>',
    ].join('');
    const next = fillAndTrimCardPeers(html, ['매출', '리텐션']);
    expect([...(next.matchAll(/\binfo-card\b/gi))].length).toBe(2);
    expect([...(next.matchAll(/\btimeline-step\b/gi))].length).toBe(2);
    expect(next).toContain('매출');
    expect(next).toContain('리텐션');
    expect(next).not.toContain('>C<');
    expect(next).not.toContain('Launch');
    expect(next).not.toContain('Research');
  });

  it('is idempotent after both hosts are already sized', () => {
    const html = [
      '<div class="cards-grid">',
      '<div class="info-card"><h4>매출</h4><p></p></div>',
      '<div class="info-card"><h4>리텐션</h4><p></p></div>',
      '</div>',
      '<div class="timeline">',
      '<div class="timeline-step"><div class="step-title">매출</div><div class="step-desc"></div></div>',
      '<div class="timeline-step"><div class="step-title">리텐션</div><div class="step-desc"></div></div>',
      '</div>',
    ].join('');
    const once = fillAndTrimCardPeers(html, ['매출', '리텐션']);
    const twice = fillAndTrimCardPeers(once, ['매출', '리텐션']);
    expect(twice).toBe(once);
    expect([...(twice.matchAll(/\binfo-card\b/gi))].length).toBe(2);
    expect([...(twice.matchAll(/\btimeline-step\b/gi))].length).toBe(2);
  });
});

describe('0901-N02-C7 *-stat / kpi peer heuristic', () => {
  it('trims grove-stat peers inside stats-row', () => {
    const html = [
      '<div class="stats-row">',
      '<div class="grove-stat"><div class="grove-stat-val">73%</div><div class="grove-stat-label">Distrust</div></div>',
      '<div class="grove-stat"><div class="grove-stat-val">4.8x</div><div class="grove-stat-label">Engagement</div></div>',
      '<div class="grove-stat"><div class="grove-stat-val">12</div><div class="grove-stat-label">Markets</div></div>',
      '</div>',
    ].join('');
    const next = fillAndTrimCardPeers(html, ['신뢰 하락', '참여 배수']);
    expect([...(next.matchAll(/\bclass="grove-stat"/gi))].length).toBe(2);
    expect(next).toContain('신뢰 하락');
    expect(next).toContain('참여 배수');
    expect(next).not.toContain('Markets');
    expect(next).not.toContain('Distrust');
    expect(next).not.toMatch(/grove-stat-val">[^<]+/i);
  });

  it('trims bare kpi peers and fills label', () => {
    const html = [
      '<div class="row">',
      '<div class="kpi"><div class="label">Paid conv.</div><div class="value">3.82%</div></div>',
      '<div class="kpi"><div class="label">MRR</div><div class="value">$148k</div></div>',
      '<div class="kpi"><div class="label">Signups</div><div class="value">12,430</div></div>',
      '</div>',
    ].join('');
    const next = fillAndTrimCardPeers(html, ['전환율', '월매출']);
    expect([...(next.matchAll(/\bclass="kpi"/gi))].length).toBe(2);
    expect(next).toContain('전환율');
    expect(next).toContain('월매출');
    expect(next).not.toContain('Signups');
    expect(next).not.toContain('Paid conv.');
    expect(next).not.toMatch(/class="value">[^<]+/i);
  });

  it('trims bare soft-editorial stat peers via .lab', () => {
    const html = [
      '<div class="grid">',
      '<div class="stat a"><div class="lab">of new accounts</div><div class="v">68%</div></div>',
      '<div class="stat b"><div class="v">28</div><div class="lab">interviews</div></div>',
      '<div class="stat c"><div class="v">9</div><div class="lab">teams</div></div>',
      '</div>',
    ].join('');
    const next = fillAndTrimCardPeers(html, ['신규 계정', '인터뷰']);
    expect([...(next.matchAll(/\bclass="stat\b/gi))].length).toBe(2);
    expect(next).toContain('신규 계정');
    expect(next).toContain('인터뷰');
    expect(next).not.toContain('teams');
    expect(next).not.toContain('of new accounts');
  });

  it('does not treat slide-stat / s-stat / card-stat as peers', () => {
    const slide = [
      '<div class="wrap">',
      '<div class="slide-stat"><h4>One</h4><p>a</p></div>',
      '<div class="slide-stat"><h4>Two</h4><p>b</p></div>',
      '<div class="slide-stat"><h4>Three</h4><p>c</p></div>',
      '</div>',
    ].join('');
    expect(fillAndTrimCardPeers(slide, ['하나', '둘'])).toContain('One');
    expect(fillAndTrimCardPeers(slide, ['하나', '둘'])).not.toContain('하나');

    const section = [
      '<div class="wrap">',
      '<div class="s-stat"><h4>One</h4><p>a</p></div>',
      '<div class="s-stat"><h4>Two</h4><p>b</p></div>',
      '<div class="s-stat"><h4>Three</h4><p>c</p></div>',
      '</div>',
    ].join('');
    expect([...(fillAndTrimCardPeers(section, ['하나', '둘']).matchAll(/\bs-stat\b/gi))].length).toBe(3);

    // card-stat stays inside column-card; columns-grid still trims via column-card (C4).
    const columns = [
      '<div class="columns-grid">',
      '<div class="column-card"><div class="card-title">A</div><div class="card-stat">24</div></div>',
      '<div class="column-card"><div class="card-title">B</div><div class="card-stat">25</div></div>',
      '<div class="column-card"><div class="card-title">C</div><div class="card-stat">26</div></div>',
      '</div>',
    ].join('');
    const next = fillAndTrimCardPeers(columns, ['확장', '깊이']);
    expect([...(next.matchAll(/\bcolumn-card\b/gi))].length).toBe(2);
    expect([...(next.matchAll(/\bcard-stat\b/gi))].length).toBe(2);
  });
});

describe('0901-N02-C8 process/timeline host allowlist + orphan arrows', () => {
  it('trims process-flow process-steps and drops trailing process-arrows', () => {
    const html = [
      '<div class="process-flow">',
      '<div class="process-step"><div class="step-title">Discover</div><div class="step-desc">a</div></div>',
      '<div class="process-arrow">&rarr;</div>',
      '<div class="process-step"><div class="step-title">Practice</div><div class="step-desc">b</div></div>',
      '<div class="process-arrow">&rarr;</div>',
      '<div class="process-step"><div class="step-title">Reflect</div><div class="step-desc">c</div></div>',
      '</div>',
    ].join('');
    const next = fillAndTrimCardPeers(html, ['발견', '연습']);
    expect([...(next.matchAll(/\bprocess-step\b/gi))].length).toBe(2);
    expect([...(next.matchAll(/\bprocess-arrow\b/gi))].length).toBe(1);
    expect(next).toContain('발견');
    expect(next).toContain('연습');
    expect(next).not.toContain('Reflect');
    expect(next).not.toContain('Discover');
  });

  it('trims timeline-track and kb-pipeline via named hosts', () => {
    const timeline = [
      '<div class="timeline-track">',
      '<div class="timeline-step"><div class="step-title">A</div><div class="step-desc">a</div></div>',
      '<div class="timeline-step"><div class="step-title">B</div><div class="step-desc">b</div></div>',
      '<div class="timeline-step"><div class="step-title">C</div><div class="step-desc">c</div></div>',
      '</div>',
    ].join('');
    const tNext = fillAndTrimCardPeers(timeline, ['평가', '보호']);
    expect([...(tNext.matchAll(/\btimeline-step\b/gi))].length).toBe(2);
    expect(tNext).toContain('평가');
    expect(tNext).not.toContain('>C<');

    const pipeline = [
      '<div class="kb-pipeline">',
      '<div class="kb-step"><div class="kb-step-title">采集</div><div class="kb-step-body">a</div></div>',
      '<div class="kb-step"><div class="kb-step-title">去噪</div><div class="kb-step-body">b</div></div>',
      '<div class="kb-step"><div class="kb-step-title">Wiki</div><div class="kb-step-body">c</div></div>',
      '</div>',
    ].join('');
    const pNext = fillAndTrimCardPeers(pipeline, ['수집', '정제']);
    expect([...(pNext.matchAll(/\bclass="kb-step(?:\s|")/gi))].length).toBe(2);
    expect(pNext).toContain('수집');
    expect(pNext).not.toContain('Wiki');
  });

  it('trims cycle-grid cycle-steps via *-grid host and drops orphan cycle-arrows', () => {
    const html = [
      '<div class="cycle-grid">',
      '<div class="cycle-step"><div class="cycle-title">build</div><div class="cycle-desc">a</div></div>',
      '<div class="cycle-arrow">→</div>',
      '<div class="cycle-step"><div class="cycle-title">measure</div><div class="cycle-desc">b</div></div>',
      '<div class="cycle-arrow">→</div>',
      '<div class="cycle-step"><div class="cycle-title">learn</div><div class="cycle-desc">c</div></div>',
      '</div>',
    ].join('');
    const next = fillAndTrimCardPeers(html, ['구축', '측정']);
    expect([...(next.matchAll(/\bcycle-step\b/gi))].length).toBe(2);
    expect([...(next.matchAll(/\bcycle-arrow\b/gi))].length).toBe(1);
    expect(next).toContain('구축');
    expect(next).toContain('측정');
    expect(next).not.toContain('learn');
    expect(next).not.toContain('build');
  });
});

describe('0901-N02-C9 lbl fill · postit · flow arrows', () => {
  it('trims hc-card peers and fills .lbl without inventing val/desc', () => {
    const html = [
      '<div class="hc-grid-3">',
      '<div class="hc-card"><div class="lbl">install time</div><div class="val">42s</div><div class="desc">demo a</div></div>',
      '<div class="hc-card"><div class="lbl">first token</div><div class="val">1.8s</div><div class="desc">demo b</div></div>',
      '<div class="hc-card"><div class="lbl">first PR</div><div class="val">3d</div><div class="desc">demo c</div></div>',
      '</div>',
    ].join('');
    const next = fillAndTrimCardPeers(html, ['설치 시간', '첫 토큰']);
    expect([...(next.matchAll(/\bhc-card\b/gi))].length).toBe(2);
    expect(next).toContain('설치 시간');
    expect(next).toContain('첫 토큰');
    expect(next).not.toContain('first PR');
    expect(next).not.toContain('install time');
    expect(next).not.toMatch(/class="val">[^<]+/i);
    expect(next).not.toContain('demo c');
  });

  it('prefers h4 over .lbl on ts-card peers', () => {
    const html = [
      '<div class="ts-grid-3">',
      '<div class="ts-card"><div class="lbl">L1</div><h4>Green</h4><p>a</p></div>',
      '<div class="ts-card"><div class="lbl">L2</div><h4>Amber</h4><p>b</p></div>',
      '<div class="ts-card"><div class="lbl">L3</div><h4>Red</h4><p>c</p></div>',
      '</div>',
    ].join('');
    const next = fillAndTrimCardPeers(html, ['허용', '주의']);
    expect([...(next.matchAll(/\bts-card\b/gi))].length).toBe(2);
    expect(next).toContain('허용');
    expect(next).toContain('주의');
    expect(next).not.toContain('Red');
    expect(next).toContain('L1'); // label chrome kept when h4 is the title slot
  });

  it('trims feature-postit peers and ignores statement-postit chrome', () => {
    const html = [
      '<div class="features">',
      '<div class="feature-postit"><h3>Strategy</h3><p>a</p></div>',
      '<div class="feature-postit"><h3>Design</h3><p>b</p></div>',
      '<div class="feature-postit"><h3>Ship</h3><p>c</p></div>',
      '</div>',
    ].join('');
    const next = fillAndTrimCardPeers(html, ['전략', '디자인']);
    expect([...(next.matchAll(/\bfeature-postit\b/gi))].length).toBe(2);
    expect(next).toContain('전략');
    expect(next).not.toContain('Ship');

    const statement = [
      '<div class="wrap">',
      '<div class="statement-postit"><h4>One</h4><p>a</p></div>',
      '<div class="statement-postit"><h4>Two</h4><p>b</p></div>',
      '<div class="statement-postit"><h4>Three</h4><p>c</p></div>',
      '</div>',
    ].join('');
    const denied = fillAndTrimCardPeers(statement, ['하나', '둘']);
    expect([...(denied.matchAll(/\bstatement-postit\b/gi))].length).toBe(3);
    expect(denied).not.toContain('하나');
  });

  it('trims broadside flow steps and drops orphan flow-arrows', () => {
    const html = [
      '<div class="flow">',
      '<div class="flow-step"><div class="flow-title">Discover</div><div class="flow-desc">a</div></div>',
      '<div class="flow-arrow">→</div>',
      '<div class="flow-step"><div class="flow-title">Define</div><div class="flow-desc">b</div></div>',
      '<div class="flow-arrow">→</div>',
      '<div class="flow-step"><div class="flow-title">Deploy</div><div class="flow-desc">c</div></div>',
      '</div>',
    ].join('');
    const next = fillAndTrimCardPeers(html, ['발견', '정의']);
    expect([...(next.matchAll(/\bflow-step\b/gi))].length).toBe(2);
    expect([...(next.matchAll(/\bflow-arrow\b/gi))].length).toBe(1);
    expect(next).toContain('발견');
    expect(next).not.toContain('Deploy');
  });
});

describe('0901-N02 heal↔clone integration', () => {
  it('Daisy LOOK seed → slot-fill → heal keeps motif and drops demo peers', async () => {
    const html = await readFile(
      new URL(
        '../../../plugins/_official/examples/html-ppt-zhangzara-daisy-days/example.html',
        import.meta.url,
      ),
      'utf8',
    );
    const brief = '분기 전략 KPI와 실행 단계';
    const cloned = buildTemplateClonedDeckHtml(
      html,
      [
        { title: '분기 전략', roleHint: 'cover' },
        { title: '핵심 KPI', body: '매출\n리텐션', roleHint: 'cards' },
        { title: '실행 단계', body: '발견\n연습', roleHint: 'process' },
      ],
      {
        title: '분기 전략',
        templateId: 'example-html-ppt-zhangzara-daisy-days',
      },
    );
    expect(cloned).toBeTruthy();
    const healed = pinDeckSlidesToFixedCanvas(
      healAiGeneratedDeckMarkup(cloned!, brief),
    );
    expect(healed).toContain('핵심 KPI');
    expect(healed).toContain('매출');
    expect(healed).toContain('리텐션');
    expect(healed).not.toContain('Creative Expression');
    expect(healed).not.toContain('Critical Thinking');
    expect(healed).toContain('발견');
    expect(healed).toContain('연습');
    expect(healed).not.toContain('Discover');
    expect(healed).not.toContain('Reflect');
    // Motif / daisy chrome should survive heal.
    expect(healed).toMatch(/deco-daisy|daisy|slide-cards|process-flow/i);
    const cardsSlide = listTemplateCloneSlideShells(healed).find((shell) => (
      /\bslide-cards\b/i.test(shell.attrs)
    ));
    if (cardsSlide) {
      expect([...(cardsSlide.body.matchAll(/\binfo-card\b/gi))].length).toBe(2);
    }
  });

  it('hermes hc-grid fragment → fill → heal keeps lbl titles', () => {
    const slideBody = [
      '<h2>핵심 지표</h2>',
      '<div class="hc-grid-3">',
      '<div class="hc-card"><div class="lbl">install time</div><div class="val">42s</div><div class="desc">demo a</div></div>',
      '<div class="hc-card"><div class="lbl">first token</div><div class="val">1.8s</div><div class="desc">demo b</div></div>',
      '<div class="hc-card"><div class="lbl">first PR</div><div class="val">3d</div><div class="desc">demo c</div></div>',
      '</div>',
    ].join('');
    const trimmed = fillAndTrimCardPeers(slideBody, ['설치 시간', '첫 토큰']);
    const deck = [
      '<!doctype html><html><body class="tpl-hermes-cyber-terminal">',
      `<section class="slide">${trimmed}</section>`,
      '</body></html>',
    ].join('');
    const healed = pinDeckSlidesToFixedCanvas(
      healAiGeneratedDeckMarkup(deck, '에이전트 설치 지표'),
    );
    expect(healed).toContain('설치 시간');
    expect(healed).toContain('첫 토큰');
    expect(healed).not.toContain('first PR');
    expect(healed).not.toContain('install time');
    expect([...(healed.matchAll(/\bhc-card\b/gi))].length).toBe(2);
    expect(healed).toMatch(/tpl-hermes|hc-grid/i);
  });

  it('oc-grid fragment → fill → heal keeps oc-card titles', () => {
    const slideBody = [
      '<h2>비교</h2>',
      '<div class="oc-grid-2">',
      '<div class="oc-card"><h4>Notion</h4><p>demo a</p></div>',
      '<div class="oc-card"><h4>Obsidian</h4><p>demo b</p></div>',
      '<div class="oc-card"><h4>Roam</h4><p>demo c</p></div>',
      '</div>',
    ].join('');
    const trimmed = fillAndTrimCardPeers(slideBody, ['노션', '옵시디언']);
    const deck = [
      '<!doctype html><html><body class="tpl-obsidian-claude-gradient">',
      `<section class="slide">${trimmed}</section>`,
      '</body></html>',
    ].join('');
    const healed = pinDeckSlidesToFixedCanvas(
      healAiGeneratedDeckMarkup(deck, '지식 도구 비교'),
    );
    expect(healed).toContain('노션');
    expect(healed).toContain('옵시디언');
    expect(healed).not.toContain('Roam');
    expect(healed).not.toContain('Notion');
    expect([...(healed.matchAll(/\boc-card\b/gi))].length).toBe(2);
    expect(healed).toMatch(/tpl-obsidian|oc-grid/i);
  });

  it('kb-grid fragment → fill → heal keeps kb-card titles', () => {
    const slideBody = [
      '<div class="kb-grid-bg"></div>',
      '<h2>원판 vs 업그레이드</h2>',
      '<div class="kb-grid-2">',
      '<div class="kb-card"><h4>One-shot write</h4><p>demo a</p></div>',
      '<div class="kb-card"><h4>Feedback loop</h4><p>demo b</p></div>',
      '<div class="kb-card"><h4>Unused spare</h4><p>demo c</p></div>',
      '</div>',
    ].join('');
    const trimmed = fillAndTrimCardPeers(slideBody, ['일회성 기록', '피드백 루프']);
    // Decorative kb-grid-bg must not be mistaken for a card host / trimmed away.
    expect(trimmed).toMatch(/\bkb-grid-bg\b/);
    const deck = [
      '<!doctype html><html><body class="tpl-knowledge-arch-blueprint">',
      `<section class="slide">${trimmed}</section>`,
      '</body></html>',
    ].join('');
    const healed = pinDeckSlidesToFixedCanvas(
      healAiGeneratedDeckMarkup(deck, '지식 아키텍처 비교'),
    );
    expect(healed).toContain('일회성 기록');
    expect(healed).toContain('피드백 루프');
    expect(healed).not.toContain('Unused spare');
    expect(healed).not.toContain('One-shot write');
    expect([...(healed.matchAll(/\bkb-card\b/gi))].length).toBe(2);
    expect(healed).toMatch(/tpl-knowledge|kb-grid-2/i);
    expect(healed).toMatch(/\bkb-grid-bg\b/);
  });

  it('scatterbrain LOOK seed → slot-fill → heal keeps sticky motif', async () => {
    const html = await readFile(
      new URL(
        '../../../plugins/_official/examples/html-ppt-zhangzara-scatterbrain/example.html',
        import.meta.url,
      ),
      'utf8',
    );
    const brief = '워크숍 전략과 비교';
    const cloned = buildTemplateClonedDeckHtml(
      html,
      [
        { title: '워크숍 킥오프', roleHint: 'cover' },
        { title: '핵심 축', body: '전략\n디자인', roleHint: 'cards' },
        { title: '비교', body: '이전\n이후', roleHint: 'cards' },
      ],
      {
        title: '워크숍 킥오프',
        templateId: 'example-html-ppt-zhangzara-scatterbrain',
      },
    );
    expect(cloned).toBeTruthy();
    const healed = pinDeckSlidesToFixedCanvas(
      healAiGeneratedDeckMarkup(cloned!, brief),
    );
    const bodyOnly = healed.replace(/<style[\s\S]*?<\/style>/gi, '');
    expect(healed).toContain('워크숍 킥오프');
    expect(healed).toContain('전략');
    expect(healed).toContain('디자인');
    expect(healed).toContain('이전');
    expect(healed).toContain('이후');
    expect(bodyOnly).not.toContain('Strategy');
    expect(bodyOnly).not.toContain('Launch');
    expect(bodyOnly).not.toContain('Finding the Problem');
    expect(bodyOnly).not.toContain('<h3>Before</h3>');
    // Sticky / doodle motif should survive heal.
    expect(healed).toMatch(/post-it|feature-postit|col-postit|compare-postit|doodle|Caveat|Shrikhand/i);
    const stickyPeers = [
      ...bodyOnly.matchAll(/class="[^"]*\b(?:feature|col|compare)-postit\b/gi),
    ].length;
    expect(stickyPeers).toBeGreaterThanOrEqual(4);
  });

  it('0901-N02-C12: 3-line cards prefer feature-postit over col-postit', async () => {
    const html = await readFile(
      new URL(
        '../../../plugins/_official/examples/html-ppt-zhangzara-scatterbrain/example.html',
        import.meta.url,
      ),
      'utf8',
    );
    const brief = '세 축 워크숍';
    const cloned = buildTemplateClonedDeckHtml(
      html,
      [
        { title: '킥오프', roleHint: 'cover' },
        { title: '세 축', body: '전략\n디자인\n런칭', roleHint: 'cards' },
        { title: '로드맵', body: '기반\n제작', roleHint: 'timeline' },
      ],
      {
        title: '킥오프',
        templateId: 'example-html-ppt-zhangzara-scatterbrain',
      },
    );
    expect(cloned).toBeTruthy();
    const bodyOnly = (cloned ?? '').replace(/<style[\s\S]*?<\/style>/gi, '');
    expect([...bodyOnly.matchAll(/class="[^"]*\bfeature-postit\b/gi)].length).toBe(3);
    expect(bodyOnly).toContain('전략');
    expect(bodyOnly).toContain('디자인');
    expect(bodyOnly).toContain('런칭');
    expect(bodyOnly).not.toContain('Strategy');
    expect(bodyOnly).not.toContain('Launch');
    // Sticky timeline rows trim to outline lines.
    expect([...bodyOnly.matchAll(/class="[^"]*\btimeline-row\b/gi)].length).toBe(2);
    expect(bodyOnly).toContain('기반');
    expect(bodyOnly).toContain('제작');
    expect(bodyOnly).not.toContain('Phase Three');
    const healed = pinDeckSlidesToFixedCanvas(
      healAiGeneratedDeckMarkup(cloned!, brief),
    );
    expect(healed).toMatch(/feature-postit|timeline-layout|post-it|Caveat/i);
    expect(healed).toContain('런칭');
    expect(healed).not.toContain('Phase Three');
  });
});

describe('0901-N02-C10 compare/col-postit polish', () => {
  it('trims compare-postit peers and drops orphan compare-vs', () => {
    const html = [
      '<div class="compare-layout">',
      '<div class="compare-postit left"><h3>Before</h3><ul><li>a</li></ul></div>',
      '<div class="compare-vs">vs</div>',
      '<div class="compare-postit right"><h3>After</h3><ul><li>b</li></ul></div>',
      '<div class="compare-vs">vs</div>',
      '<div class="compare-postit"><h3>Spare</h3><ul><li>c</li></ul></div>',
      '</div>',
    ].join('');
    const next = fillAndTrimCardPeers(html, ['이전', '이후']);
    expect([...(next.matchAll(/\bcompare-postit\b/gi))].length).toBe(2);
    expect([...(next.matchAll(/\bcompare-vs\b/gi))].length).toBe(1);
    expect(next).toContain('이전');
    expect(next).toContain('이후');
    expect(next).not.toContain('Spare');
    expect(next).not.toContain('Before');
  });

  it('trims col-postit peers inside two-col-layout', () => {
    const html = [
      '<div class="two-col-layout">',
      '<div class="col-postit"><h3>Finding the Problem</h3><p>a</p></div>',
      '<div class="col-postit"><h3>Crafting the Answer</h3><p>b</p></div>',
      '<div class="col-postit"><h3>Shipping Extra</h3><p>c</p></div>',
      '</div>',
    ].join('');
    const next = fillAndTrimCardPeers(html, ['문제 발견', '해답 설계']);
    expect([...(next.matchAll(/\bcol-postit\b/gi))].length).toBe(2);
    expect(next).toContain('문제 발견');
    expect(next).toContain('해답 설계');
    expect(next).not.toContain('Shipping Extra');
    expect(next).not.toContain('Finding the Problem');
  });

  it('still denies statement-postit and main-title-postit hero chrome', () => {
    const html = [
      '<div class="wrap">',
      '<div class="statement-postit"><h4>One</h4><p>a</p></div>',
      '<div class="main-title-postit"><h4>Two</h4><p>b</p></div>',
      '<div class="hero-title-postit"><h4>Three</h4><p>c</p></div>',
      '</div>',
    ].join('');
    const denied = fillAndTrimCardPeers(html, ['하나', '둘']);
    expect(denied).not.toContain('하나');
    expect([...(denied.matchAll(/\bstatement-postit\b/gi))].length).toBe(1);
    expect([...(denied.matchAll(/\bmain-title-postit\b/gi))].length).toBe(1);
    expect([...(denied.matchAll(/\bhero-title-postit\b/gi))].length).toBe(1);
  });
});

describe('hoistCloneSlidesOutOfFlexTrack', () => {
  it('unwraps leftover <section id="stage"> and <main class="stage"> slide tracks', () => {
    const sectionStage = [
      '<!doctype html><html><body>',
      '<section class="stage" id="stage">',
      '<section class="slide" style="width:1920px;height:1080px">One</section>',
      '<section class="slide" style="width:1920px;height:1080px">Two</section>',
      '</section>',
      '</body></html>',
    ].join('');
    const sectionOut = hoistCloneSlidesOutOfFlexTrack(sectionStage);
    expect(sectionOut).not.toMatch(/<section\b[^>]*\bid\s*=\s*["']stage["']/i);
    expect(sectionOut).toContain('class="slide"');
    expect([...(sectionOut.matchAll(/<section\b[^>]*\bclass\s*=\s*["'][^"']*\bslide\b/gi))].length).toBe(2);

    const mainStage = [
      '<!doctype html><html><body>',
      '<main class="stage">',
      '<section class="slide">One</section>',
      '<section class="slide">Two</section>',
      '</main>',
      '</body></html>',
    ].join('');
    const mainOut = hoistCloneSlidesOutOfFlexTrack(mainStage);
    expect(mainOut).not.toMatch(/<main\b[^>]*\bclass\s*=\s*["'][^"']*\bstage\b/i);
    expect([...(mainOut.matchAll(/<section\b[^>]*\bclass\s*=\s*["'][^"']*\bslide\b/gi))].length).toBe(2);
  });

  it('unwraps leftover <div class="slide"> tracks inside #stage', () => {
    const html = [
      '<!doctype html><html><body>',
      '<div class="stage" id="stage">',
      '<div class="slide" style="width:1920px;height:1080px"><div class="pad">One</div></div>',
      '<div class="slide" style="width:1920px;height:1080px"><div class="pad">Two</div></div>',
      '</div>',
      '</body></html>',
    ].join('');
    const out = hoistCloneSlidesOutOfFlexTrack(html);
    expect(out).not.toMatch(/\bid\s*=\s*["']stage["']/i);
    expect([...(out.matchAll(/<div\b[^>]*\bclass\s*=\s*["'][^"']*\bslide\b/gi))].length).toBe(2);
    expect(out).toContain('One');
    expect(out).toContain('Two');
  });

  it('unwraps leftover #stage when the only residue is empty MiniMax deco', () => {
    const emptyDeco = [
      '<!doctype html><html><body>',
      '<div class="stage" id="stage">',
      '<div class="deco-orbit" aria-hidden="true"></div>',
      '<section class="slide" style="width:1920px;height:1080px">One</section>',
      '<section class="slide" style="width:1920px;height:1080px">Two</section>',
      '</div>',
      '</body></html>',
    ].join('');
    const commentDeco = [
      '<!doctype html><html><body>',
      '<div class="stage" id="stage">',
      '<div class="deco-orbit" aria-hidden="true"><!-- motif --></div>',
      '<section class="slide" style="width:1920px;height:1080px">One</section>',
      '<section class="slide" style="width:1920px;height:1080px">Two</section>',
      '</div>',
      '</body></html>',
    ].join('');
    for (const html of [emptyDeco, commentDeco]) {
      const out = hoistCloneSlidesOutOfFlexTrack(html);
      expect(out).not.toMatch(/\bid\s*=\s*["']stage["']/i);
      expect(out).not.toMatch(/deco-orbit/i);
      expect([...(out.matchAll(/<section\b[^>]*\bclass\s*=\s*["'][^"']*\bslide\b/gi))].length).toBe(2);
    }
  });
});

describe('루프376 stripLeafEmptyListAndParagraphShells', () => {
  it('drops <ul> whose direct <li>s are all empty', () => {
    const html = '<div class="split-content"><h2>Smarter &amp; Faster</h2><ul class="content-list"><li></li><li></li><li></li></ul></div>';
    const out = stripLeafEmptyListAndParagraphShells(html);
    expect(out).toBe('<div class="split-content"><h2>Smarter &amp; Faster</h2></div>');
  });

  it('drops <li> whose only text is whitespace or &nbsp;', () => {
    const html = '<ul><li>  </li><li>&nbsp;</li><li><br></li></ul>';
    const out = stripLeafEmptyListAndParagraphShells(html);
    expect(out).toBe('');
  });

  it('keeps a list when any <li> has visible text', () => {
    const html = '<ul><li></li><li>Kept</li><li></li></ul>';
    expect(stripLeafEmptyListAndParagraphShells(html)).toBe(html);
  });

  it('keeps a <li> when it holds SVG / img / other visible media', () => {
    const html = '<ul><li><img src="x.png" alt=""></li></ul>';
    expect(stripLeafEmptyListAndParagraphShells(html)).toBe(html);
  });

  it('drops empty <p class="hero-subtitle"> shells', () => {
    const html = '<div class="hero-frame"><h1>Cover</h1><p class="hero-subtitle"></p><p>Body</p></div>';
    const out = stripLeafEmptyListAndParagraphShells(html);
    expect(out).toBe('<div class="hero-frame"><h1>Cover</h1><p>Body</p></div>');
  });

  it('is idempotent — a second pass changes nothing', () => {
    const html = '<div><ul><li></li></ul><p></p><p>Real</p></div>';
    const once = stripLeafEmptyListAndParagraphShells(html);
    const twice = stripLeafEmptyListAndParagraphShells(once);
    expect(twice).toBe(once);
    expect(once).toBe('<div><p>Real</p></div>');
  });
});

describe('루프376 fillSlideShell drops title-only empty content-list shells end-to-end', () => {
  it('slot-fill of a split-content template slide skips empty <li> shells', () => {
    const seed = [
      '<!doctype html><html><head><style>.motif{color:#FCDF6C}</style></head><body>',
      '<section class="slide slide-title cover"><h1>Demo Cover</h1></section>',
      '<section class="slide slide-6"><div class="split-content"><h2>Demo Title</h2><ul class="content-list"><li>Demo A</li><li>Demo B</li><li>Demo C</li><li>Demo D</li></ul></div></section>',
      '</body></html>',
    ].join('');
    const filled = applyTemplateCloneSlotFill(seed, {
      title: '분기 전략',
      slides: [
        { title: '표지', roleHint: 'cover' },
        { title: 'Smarter & Faster', roleHint: 'body' },
      ],
    });
    expect(filled).not.toBeNull();
    // Empty content-list stays out of the second slide — no orphan pills.
    expect(filled!.html).not.toMatch(/<li>\s*<\/li>/);
    expect(filled!.html).not.toMatch(/<ul[^>]*>\s*<\/ul>/);
    // Real body copy from the outline is respected (heading swap survives).
    expect(filled!.html).toContain('Smarter &amp; Faster');
    // Motif still visible.
    expect(filled!.html).toContain('.motif{color:#FCDF6C}');
  });
});
