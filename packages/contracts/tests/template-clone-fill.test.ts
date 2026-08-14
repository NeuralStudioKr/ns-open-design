import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import {
  buildTemplateClonedDeckHtml,
  classifyTemplateCloneShellRole,
  inferTemplateCloneContentRole,
  listTemplateCloneSlideShells,
  looksLikeInstructionCopy,
  normalizeTemplateCssForFixedCanvas,
  pickTemplateShellsForContent,
  resolveTemplateCloneSlideCountHint,
  resolveTemplateCloneSlidesFromBrief,
  sanitizeTemplateCloneDeckTitle,
} from '../src/template-clone-fill.js';

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
    expect(sanitizeTemplateCloneDeckTitle('Expo SDK 개요')).toBe('Expo SDK 개요');
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
    expect(cloned).toMatch(/<h1[^>]*>Presentation<\/h1>/);
    expect(cloned).not.toContain('Html Ppt Zhangzara Daisy Days');
    expect(cloned).not.toContain('Daisy Days');
  });
});
