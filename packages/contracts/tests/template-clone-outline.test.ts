import { describe, expect, it } from 'vitest';

import {
  TEMPLATE_CLONE_OUTLINE_MAX_SLIDES,
  applyTemplateCloneSlotFill,
  decideTemplateCloneSlotFillTerminal,
  inferTemplateCloneContentRole,
  outlineLooksLikeHtmlDump,
  parseTemplateCloneDeckOutline,
} from '../src/template-clone-fill.js';

describe('0901-N02 outlineLooksLikeHtmlDump', () => {
  it('rejects doctype / section.slide dumps', () => {
    expect(outlineLooksLikeHtmlDump('<!doctype html><html><body></body></html>')).toBe(true);
    expect(
      outlineLooksLikeHtmlDump('<section class="slide"><h1>Hi</h1></section>'),
    ).toBe(true);
    expect(outlineLooksLikeHtmlDump('<div class="slide s-cover">x</div>')).toBe(true);
    expect(outlineLooksLikeHtmlDump('<style>.a{}</style><p>x</p>')).toBe(true);
  });

  it('allows plain JSON text', () => {
    expect(outlineLooksLikeHtmlDump('{"title":"A","slides":[{"title":"B"}]}')).toBe(false);
  });
});

describe('0901-N02 parseTemplateCloneDeckOutline', () => {
  it('parses a plain object outline', () => {
    const outline = parseTemplateCloneDeckOutline({
      title: '분기 전략',
      slides: [
        { title: '표지', body: '한 줄', roleHint: 'cover' },
        { title: '포인트', body: '하나\n둘\n셋', roleHint: 'list' },
      ],
    });
    expect(outline).toEqual({
      title: '분기 전략',
      slides: [
        { title: '표지', body: '한 줄', roleHint: 'cover' },
        { title: '포인트', body: '하나\n둘\n셋', roleHint: 'list' },
      ],
    });
  });

  it('parses fenced JSON and ignores invalid roleHint', () => {
    const raw = [
      '여기 JSON입니다:',
      '```json',
      '{"title":"덱","slides":[{"title":"본문","roleHint":"not-a-role"}]}',
      '```',
    ].join('\n');
    const outline = parseTemplateCloneDeckOutline(raw);
    expect(outline).toEqual({
      title: '덱',
      slides: [{ title: '본문' }],
    });
  });

  it('rejects HTML dumps', () => {
    expect(
      parseTemplateCloneDeckOutline(
        '<!doctype html><section class="slide"><h1>Nope</h1></section>',
      ),
    ).toBeNull();
  });

  it('drops empty titles and caps at max slides', () => {
    const slides = Array.from({ length: TEMPLATE_CLONE_OUTLINE_MAX_SLIDES + 5 }, (_, i) => ({
      title: i === 2 ? '   ' : `슬라이드 ${i + 1}`,
    }));
    const outline = parseTemplateCloneDeckOutline({ title: '캡', slides });
    expect(outline).not.toBeNull();
    expect(outline!.slides).toHaveLength(TEMPLATE_CLONE_OUTLINE_MAX_SLIDES);
    expect(outline!.slides[0]!.title).toBe('슬라이드 1');
    expect(outline!.slides.some((s) => s.title.trim() === '')).toBe(false);
  });

  it('returns null when no usable slides remain', () => {
    expect(parseTemplateCloneDeckOutline({ title: 'x', slides: [{ title: '' }] })).toBeNull();
    expect(parseTemplateCloneDeckOutline({ title: 'x', slides: 'nope' })).toBeNull();
  });

  it('falls back deck title to first slide title', () => {
    const outline = parseTemplateCloneDeckOutline({
      slides: [{ title: '첫 장' }, { title: '둘째' }],
    });
    expect(outline?.title).toBe('첫 장');
    expect(outline?.slides).toHaveLength(2);
  });
});

describe('0901-N02 roleHint infer', () => {
  it('prefers roleHint over index-0 cover default', () => {
    expect(
      inferTemplateCloneContentRole(
        { title: '표지 아닌 리스트', body: 'a\nb', roleHint: 'list' },
        0,
        3,
      ),
    ).toBe('list');
  });

  it('keeps cover default without roleHint', () => {
    expect(inferTemplateCloneContentRole({ title: '표지' }, 0, 3)).toBe('cover');
  });
});

describe('0901-N02 applyTemplateCloneSlotFill', () => {
  it('swaps outline titles into seed shells without emitting model HTML', () => {
    const seed = [
      '<!doctype html><html><head><style>.motif{color:#FCDF6C}</style></head><body>',
      '<section class="slide slide-title cover"><h1>Demo Cover</h1><p>Lead</p></section>',
      '<section class="slide slide-welcome"><h2>Demo List</h2><ul><li>a</li><li>b</li></ul></section>',
      '</body></html>',
    ].join('');
    const filled = applyTemplateCloneSlotFill(seed, {
      title: '분기 전략',
      slides: [
        { title: '분기 전략 개요', body: '한 줄 리드', roleHint: 'cover' },
        { title: '핵심 KPI', body: '매출\n리텐션', roleHint: 'list' },
      ],
    });
    expect(filled).not.toBeNull();
    expect(filled!.title).toBe('분기 전략');
    expect(filled!.html).toContain('분기 전략 개요');
    expect(filled!.html).toContain('핵심 KPI');
    expect(filled!.html).toContain('매출');
    expect(filled!.html).toContain('.motif{color:#FCDF6C}');
    expect(filled!.html).not.toContain('Demo Cover');
  });

  it('returns null for HTML dumps', () => {
    expect(
      applyTemplateCloneSlotFill(
        '<section class="slide"><h1>x</h1></section>',
        '<!doctype html><section class="slide"><h1>Nope</h1></section>',
      ),
    ).toBeNull();
  });

  it('0901-N02-C: trims unfilled info-card peers to body line count', () => {
    const seed = [
      '<!doctype html><html><head><style>.motif{color:#FCDF6C}.cards-grid{display:grid}</style></head><body>',
      '<section class="slide slide-title cover"><h1>Demo Cover</h1></section>',
      '<section class="slide slide-cards"><h2>Demo Cards</h2>',
      '<div class="cards-grid">',
      '<div class="info-card"><div class="card-icon">A</div><h4>Creative Expression</h4><p>Explore imagination.</p></div>',
      '<div class="info-card"><div class="card-icon">B</div><h4>Critical Thinking</h4><p>Develop skills.</p></div>',
      '<div class="info-card"><div class="card-icon">C</div><h4>Collaboration</h4><p>Build teamwork.</p></div>',
      '</div></section>',
      '</body></html>',
    ].join('');
    const filled = applyTemplateCloneSlotFill(seed, {
      title: '분기 전략',
      slides: [
        { title: '표지', roleHint: 'cover' },
        { title: '핵심 KPI', body: '매출\n리텐션', roleHint: 'cards' },
      ],
    });
    expect(filled).not.toBeNull();
    expect(filled!.html).toContain('핵심 KPI');
    expect(filled!.html).toContain('매출');
    expect(filled!.html).toContain('리텐션');
    expect(filled!.html).toContain('.motif{color:#FCDF6C}');
    expect([...(filled!.html.matchAll(/\binfo-card\b/gi))].length).toBe(2);
    expect(filled!.html).not.toContain('Creative Expression');
    expect(filled!.html).not.toContain('Critical Thinking');
    expect(filled!.html).not.toContain('Collaboration');
    expect(filled!.html).not.toContain('Explore imagination');
  });
});

describe('0901-N02 decideTemplateCloneSlotFillTerminal (B5)', () => {
  const seed = [
    '<section class="slide slide-title cover"><h1>Demo</h1></section>',
    '<section class="slide"><h2>Body</h2><p>x</p></section>',
  ].join('');

  it('returns slot-fill when outline parses', () => {
    const decision = decideTemplateCloneSlotFillTerminal({
      rawFinalText: JSON.stringify({
        title: '덱',
        slides: [{ title: '표지', roleHint: 'cover' }, { title: '본문' }],
      }),
      seedHtml: seed,
      repairAlreadyAttempted: false,
    });
    expect(decision.kind).toBe('slot-fill');
    if (decision.kind === 'slot-fill') {
      expect(decision.html).toContain('표지');
      expect(decision.title).toBe('덱');
    }
  });

  it('keeps LOOK seed immediately on HTML dump (skip repair churn)', () => {
    const decision = decideTemplateCloneSlotFillTerminal({
      rawFinalText: '<!doctype html><section class="slide"><h1>Nope</h1></section>',
      seedHtml: seed,
      repairAlreadyAttempted: false,
    });
    expect(decision.kind).toBe('seed-fallback');
    if (decision.kind === 'seed-fallback') {
      expect(decision.html).toContain('slide-title');
      expect(decision.html).toContain('Demo');
      expect(decision.html).not.toContain('Nope');
    }
  });

  it('queues repair once when outline is soft-invalid (not an HTML dump)', () => {
    expect(
      decideTemplateCloneSlotFillTerminal({
        rawFinalText: '{"title":"덱","slides":[{"title":',
        seedHtml: seed,
        repairAlreadyAttempted: false,
      }),
    ).toEqual({ kind: 'queue-repair' });
  });

  it('falls back to LOOK seed after repair was attempted (0901-N02-D)', () => {
    const decision = decideTemplateCloneSlotFillTerminal({
      rawFinalText: '<!doctype html><section class="slide"><h1>Nope</h1></section>',
      seedHtml: seed,
      repairAlreadyAttempted: true,
    });
    expect(decision.kind).toBe('seed-fallback');
    if (decision.kind === 'seed-fallback') {
      expect(decision.html).toContain('slide-title');
      expect(decision.html).toContain('Demo');
      expect(decision.html).not.toContain('Nope');
    }
  });

  it('aborts when repair failed and seed is missing', () => {
    expect(
      decideTemplateCloneSlotFillTerminal({
        rawFinalText: '<!doctype html><section class="slide"><h1>Nope</h1></section>',
        seedHtml: '',
        repairAlreadyAttempted: true,
      }),
    ).toEqual({ kind: 'abort' });
  });

  it('prefers a loose JSON title on seed-fallback', () => {
    const decision = decideTemplateCloneSlotFillTerminal({
      rawFinalText: '{"title":"분기 전략","slides":[',
      seedHtml: seed,
      repairAlreadyAttempted: true,
    });
    expect(decision.kind).toBe('seed-fallback');
    if (decision.kind === 'seed-fallback') {
      expect(decision.title).toBe('분기 전략');
      expect(decision.html).toBe(seed);
      expect(decision.html).not.toContain('<!doctype');
    }
  });
});
