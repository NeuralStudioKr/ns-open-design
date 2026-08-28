import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DECK_SLIDE_FLOW_ATTR,
  pinDeckSlidesToFixedCanvas,
} from '../src/html/deck-fixed-canvas.js';

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

// 루프158 회귀 방지 방어층 — MiniMax `.pill` / `.stamp` / marker가 슬라이드 콘텐츠
// 사이에 끼어들어도 pin이 두 개 이상의 `[data-od-slide-flow]` 오버레이를 만들면
// 안 된다. absolute inset:0 wrapper가 겹치면 표지가 통째로 사라지는 회귀가
// 되풀이됐다 (사용자 리포트 2026-08-28 · staging MiniMax).
//
// 이 파일은 다양한 MiniMax 스트림 형태(모티프↔콘텐츠 인터리브, footer 배지,
// step/flow slot, 다중 슬라이드, 이미 pin된 상태 등)에 대해 다음 invariant를
// 강제한다:
//   (a) 슬라이드당 [data-od-slide-flow] wrapper ≤ 1개
//   (b) 콘텐츠 텍스트가 유실되지 않음
//   (c) idempotent: pin(pin(html)) === pin(html)
//   (d) 명시적으로 chrome인 지문(.pill / .stamp) 이 삭제되지 않음
//
// 주의: `data-od-official-motif-html` 인스턴스는 luupp161(본문과 같은 paint
// 클래스 시 official 인스턴스 drop)에 의해 사라질 수 있으므로 이 파일의
// invariant는 `.pill` / `.stamp`만 필수 지문으로 요구한다.

const FLOW_TAG_RE = new RegExp(`<div\\s+${DECK_SLIDE_FLOW_ATTR}\\b`, 'gi');
const SLIDE_HOST_RE = /<section\b[^>]*\bclass\s*=\s*["'][^"']*\bslide\b[^"']*["'][^>]*>[\s\S]*?<\/section>/gi;

function countFlowWrappersPerSlide(html: string): number[] {
  const counts: number[] = [];
  const slides = html.match(SLIDE_HOST_RE) ?? [];
  for (const slide of slides) {
    counts.push((slide.match(FLOW_TAG_RE) ?? []).length);
  }
  return counts;
}

function stripWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

type MiniMaxScenario = {
  label: string;
  html: string;
  expectedPhrases: string[];
  expectedMotifPatterns: RegExp[];
};

function buildScenarios(): MiniMaxScenario[] {
  const scenarios: MiniMaxScenario[] = [];

  // 1) 사용자 리포트 재현 — MiniMax 영어 회화 표지 · PRESS PLAY marker + SPEAKING pill.
  //    표지는 <slide-title> 클래스, motif → 텍스트 → pill → 텍스트 → marker 순.
  scenarios.push({
    label: 'cover with motif → LEARNING SERIES → pill → h1 → inline marker → footer',
    html: [
      '<!doctype html><html lang="ko"><body>',
      '<section class="slide slide-title" data-screen-label="01 Cover" style="width:1920px;height:1080px;box-sizing:border-box;position:relative;padding:56px 96px;background:#EFE9D9;color:#0F0F0F">',
      '<div data-od-official-motif-html class="marker display" style="position:absolute;pointer-events:none;z-index:1">PRESS PLAY</div>',
      '<div style="position:relative;font-family:monospace;font-size:22px;letter-spacing:.18em">LEARNING SERIES 2025</div>',
      '<div class="pill" style="position:absolute;right:96px;top:64px;border:2px solid #0F0F0F;padding:8px 18px;border-radius:999px;background:#F5C518">SPEAKING</div>',
      '<h1 style="position:relative;margin:0;font-family:\'Archivo Black\',sans-serif;font-size:184px;line-height:.92">SPOKEN<br>ENGLISH,<br>PRACTICED.</h1>',
      '<p style="position:relative;margin:0;max-width:1080px;font-size:36px;line-height:1.35">Daily 30 min routine.</p>',
      '<div class="marker display" style="position:relative;width:520px;height:120px;background:#F06CA8;border:4px solid #0F0F0F">DAILY 30 MIN</div>',
      '<div style="position:relative;font-family:monospace;font-size:22px">EDITION 01</div>',
      '<div style="position:relative;font-family:monospace;font-size:22px">PAGE 01 / 06</div>',
      '</section>',
      '</body></html>',
    ].join(''),
    expectedPhrases: [
      'LEARNING SERIES',
      'SPOKEN',
      'ENGLISH',
      'PRACTICED.',
      'Daily 30 min routine.',
      'DAILY 30 MIN',
      'PAGE 01',
    ],
    // luupp161이 body와 같은 `.marker` paint 클래스인 official motif를 drop할
    // 수 있으므로 여기서는 `.pill`만 필수 지문으로 요구한다.
    expectedMotifPatterns: [
      /class="pill"[^>]*>[^<]*SPEAKING/i,
    ],
  });

  // 2) 마감 슬라이드 — stamp (position:absolute) + pill + step 카드.
  scenarios.push({
    label: 'closing slide with stamp + pill + step cards',
    html: [
      '<!doctype html><html><body>',
      '<section class="slide s8" data-screen-label="06 Close" style="width:1920px;height:1080px;box-sizing:border-box;position:relative;padding:56px 96px;background:#EFE9D9;color:#0F0F0F">',
      '<div data-od-official-motif-html class="marker display" style="position:absolute;pointer-events:none;z-index:1">PRESS PLAY</div>',
      '<div class="pill" style="position:absolute;right:96px;top:64px;background:#F06CA8">DAY 1</div>',
      '<h2 style="position:relative;margin:0;font-size:140px;line-height:.95">YOUR FIRST<br>30 MINUTES.</h2>',
      '<div style="position:relative;display:grid;grid-template-columns:repeat(3,1fr);gap:28px">',
      '<div style="border:4px solid #0F0F0F;background:#FFF;padding:28px">STEP 1 - 8 MIN</div>',
      '<div style="border:4px solid #0F0F0F;background:#FFF;padding:28px">STEP 2 - 10 MIN</div>',
      '<div style="border:4px solid #0F0F0F;background:#FFF;padding:28px">STEP 3 - 12 MIN</div>',
      '</div>',
      '<div class="stamp" style="position:absolute;right:120px;bottom:140px;width:340px;height:340px;background:#F06CA8;border:4px solid #EFE9D9">START NOW</div>',
      '<div style="position:relative;font-family:monospace;font-size:22px">ENGLISH</div>',
      '<div style="position:relative;font-family:monospace;font-size:22px">PAGE 06 /</div>',
      '</section>',
      '</body></html>',
    ].join(''),
    expectedPhrases: [
      'YOUR FIRST',
      '30 MINUTES.',
      'STEP 1',
      'STEP 2',
      'STEP 3',
      'PAGE 06',
    ],
    expectedMotifPatterns: [
      /class="pill"[^>]*>[^<]*DAY 1/i,
      /class="stamp"[^>]*>[^<]*START NOW/i,
    ],
  });

  // 3) 이미 pin이 두 번 적용된(멀티 flow) 상태로 스트림된 HTML — idempotency.
  //    이전 회귀가 이 형태를 만들었기 때문에, 재차 pin 후 flow가 1개로 병합되어야 한다.
  scenarios.push({
    label: 're-pinning already-multiflowed HTML collapses to one flow',
    html: [
      '<!doctype html><html><body>',
      '<section class="slide slide-title" data-screen-label="01 Cover" style="width:1920px;height:1080px;box-sizing:border-box;position:relative;padding:56px 96px;background:#EFE9D9">',
      '<div data-od-official-motif-html class="marker display" style="position:absolute;pointer-events:none;z-index:1">PRESS PLAY</div>',
      `<div ${DECK_SLIDE_FLOW_ATTR} style="position:relative;background:#EFE9D9;padding:56px 96px">`,
      '<div>LEARNING SERIES</div>',
      '</div>',
      '<div class="pill" style="position:absolute;right:96px;top:64px">SPEAKING</div>',
      `<div ${DECK_SLIDE_FLOW_ATTR} style="position:relative;background:#EFE9D9;padding:56px 96px">`,
      '<h1>SPOKEN ENGLISH.</h1>',
      '<div class="marker" style="position:relative">DAILY</div>',
      '<div>PAGE 01</div>',
      '</div>',
      '</section>',
      '</body></html>',
    ].join(''),
    expectedPhrases: ['LEARNING SERIES', 'SPOKEN ENGLISH.', 'DAILY', 'PAGE 01'],
    expectedMotifPatterns: [
      /class="pill"[^>]*>[^<]*SPEAKING/i,
    ],
  });

  // 4) 세 개의 슬라이드가 나란히 있는 덱 — 슬라이드별 독립적인 flow invariant.
  scenarios.push({
    label: 'multi-slide deck each keeps ≤1 flow',
    html: [
      '<!doctype html><html><body>',
      // Slide 1 — cover with pill.
      '<section class="slide" style="width:1920px;height:1080px;position:relative;padding:96px;background:#111;color:#fff">',
      '<div data-od-official-motif-html class="marker" style="position:absolute">*</div>',
      '<h1>ONE</h1>',
      '<div class="pill" style="position:absolute;right:96px;top:64px">BADGE</div>',
      '<p>Alpha copy</p>',
      '</section>',
      // Slide 2 — content only.
      '<section class="slide" style="width:1920px;height:1080px;position:relative;padding:96px">',
      '<h2>TWO</h2>',
      '<p>Beta copy</p>',
      '</section>',
      // Slide 3 — chrome only (no textual content).
      '<section class="slide" style="width:1920px;height:1080px;position:relative;padding:96px">',
      '<div data-od-official-motif-html class="marker" style="position:absolute">*</div>',
      '<div class="pill" style="position:absolute">Empty</div>',
      '<h3>THREE</h3>',
      '</section>',
      '</body></html>',
    ].join(''),
    expectedPhrases: ['ONE', 'TWO', 'THREE', 'Alpha copy', 'Beta copy'],
    expectedMotifPatterns: [
      /class="pill"[^>]*>[^<]*BADGE/i,
    ],
  });

  // 5) footer chrome이 콘텐츠 사이에 흩어진 형태 — 사용자 리포트에서 자주 관측되는
  //    "05 / CHECKLIST" 같은 배지가 컨텐츠 흐름을 쪼갠다.
  scenarios.push({
    label: 'floating footer badges interleaved with content',
    html: [
      '<!doctype html><html><body>',
      '<section class="slide" style="width:1920px;height:1080px;position:relative;padding:80px">',
      '<h2>SECTION</h2>',
      '<div class="pill" style="position:absolute;left:80px;bottom:32px">05 CHECKLIST</div>',
      '<p>Body copy A.</p>',
      '<p>Body copy B.</p>',
      '<div class="pill" style="position:absolute;right:80px;bottom:32px">PAGE 05</div>',
      '</section>',
      '</body></html>',
    ].join(''),
    expectedPhrases: ['SECTION', 'Body copy A.', 'Body copy B.'],
    expectedMotifPatterns: [/class="pill"[^>]*>[^<]*PAGE 05/i],
  });

  // 6) marker 텍스트가 인라인 흐름에 있는(=position:relative) 경우 — motif가 아니라
  //    "콘텐츠 클래스만 marker인" 케이스는 flow 안에 남아야 한다.
  scenarios.push({
    label: 'inline .marker with position:relative stays inside flow',
    html: [
      '<!doctype html><html><body>',
      '<section class="slide" style="width:1920px;height:1080px;position:relative;padding:80px">',
      '<h1>HELLO</h1>',
      '<div class="marker" style="position:relative;background:#F06CA8">HIGHLIGHT</div>',
      '<p>Follow-up copy.</p>',
      '</section>',
      '</body></html>',
    ].join(''),
    expectedPhrases: ['HELLO', 'HIGHLIGHT', 'Follow-up copy.'],
    expectedMotifPatterns: [],
  });

  return scenarios;
}

describe('pinDeckSlidesToFixedCanvas — flow wrap invariants', () => {
  const scenarios = buildScenarios();

  for (const scenario of scenarios) {
    it(`[${scenario.label}] every slide has ≤1 data-od-slide-flow wrapper`, () => {
      const pinned = pinDeckSlidesToFixedCanvas(scenario.html);
      const counts = countFlowWrappersPerSlide(pinned);
      // 슬라이드마다 wrapper는 0개(콘텐츠가 없거나 chrome only) 또는 1개.
      for (const count of counts) {
        expect(count).toBeLessThanOrEqual(1);
      }
      // 콘텐츠가 있는 시나리오는 최소 1개는 wrap되어야 한다 — 표지·마감 케이스.
      if (counts.length > 0) {
        expect(counts.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(1);
      }
    });

    it(`[${scenario.label}] preserves content phrases`, () => {
      const pinned = pinDeckSlidesToFixedCanvas(scenario.html);
      const normalized = stripWhitespace(pinned);
      for (const phrase of scenario.expectedPhrases) {
        expect(normalized).toContain(phrase);
      }
    });

    it(`[${scenario.label}] preserves motif fingerprints`, () => {
      const pinned = pinDeckSlidesToFixedCanvas(scenario.html);
      for (const pattern of scenario.expectedMotifPatterns) {
        expect(pinned).toMatch(pattern);
      }
    });

    it(`[${scenario.label}] is idempotent — pin(pin(x)) === pin(x)`, () => {
      const once = pinDeckSlidesToFixedCanvas(scenario.html);
      const twice = pinDeckSlidesToFixedCanvas(once);
      expect(twice).toBe(once);
    });
  }

  it('does not clip motif marker below flow overlay when flow lacks background', () => {
    const html = [
      '<!doctype html><html><body>',
      '<section class="slide" style="width:1920px;height:1080px;position:relative;padding:56px 96px;background:#EFE9D9">',
      '<div data-od-official-motif-html class="marker" style="position:absolute;left:96px;bottom:160px">PRESS PLAY</div>',
      '<h1>HERO</h1>',
      '</section>',
      '</body></html>',
    ].join('');
    const pinned = pinDeckSlidesToFixedCanvas(html);
    // flow wrapper의 인라인 style에는 host의 background가 복사되면 안 된다 —
    // 그렇지 않으면 flow overlay가 marker를 덮어 화면에서 사라진다.
    const flowOpenMatch = pinned.match(new RegExp(`<div\\s+${DECK_SLIDE_FLOW_ATTR}[^>]*>`, 'i'));
    expect(flowOpenMatch).not.toBeNull();
    expect(flowOpenMatch?.[0] ?? '').not.toMatch(/background/i);
  });

  // 회귀 가드 — 사용자 리포트(2026-08-28 staging MiniMax 영어 회화 덱).
  // 이 fixture는 이전 pin 결과가 slide당 여러 [data-od-slide-flow] 오버레이를
  // 생성해 표지 콘텐츠가 통째로 가려진 상태다. 재차 pin에 통과시키면
  // 모든 슬라이드에 wrapper가 최대 1개로 병합되어야 한다.
  it('user-reported MiniMax English-conversation deck collapses to ≤1 flow per slide', () => {
    const html = readFileSync(
      join(FIXTURES_DIR, 'minimax-cover-with-motifs.staging-report.html'),
      'utf-8',
    );
    // Sanity: fixture는 실제로 다중 flow 상태(≥2)여야 회귀 가드로 의미가 있다.
    expect((html.match(/<div\s+data-od-slide-flow\b/gi) ?? []).length).toBeGreaterThanOrEqual(2);

    const pinned = pinDeckSlidesToFixedCanvas(html);
    // 슬라이드별 flow wrapper 개수 검증.
    const slides = pinned.match(/<section\b[^>]*\bclass\s*=\s*["'][^"']*\bslide\b[^"']*["'][\s\S]*?<\/section>/gi) ?? [];
    expect(slides.length).toBeGreaterThanOrEqual(3);
    for (const slide of slides) {
      const count = (slide.match(/<div\s+data-od-slide-flow\b/gi) ?? []).length;
      expect(count).toBeLessThanOrEqual(1);
    }
    // 표지의 시그니처 텍스트가 사라지지 않아야 한다.
    expect(pinned).toMatch(/SPOKEN[\s\S]*ENGLISH[\s\S]*PRACTICED/);
    // Idempotent — 사용자 상태를 두 번 통과시켜도 동일 결과여야 한다.
    const twice = pinDeckSlidesToFixedCanvas(pinned);
    expect(twice).toBe(pinned);
  });

  // V-2 회귀 방어 — MiniMax는 종종 `<ul style="position:absolute">` 형태로
  // 리스트/카드 트랙을 오프페이지에 park한다. `ABS_FLOW_OPEN_RE`가 `ul/ol/li`
  // 같은 목록 컨테이너 태그를 whitelist에 포함하지 않으면 flow flatten이
  // 이 태그를 건너뛰고, 배지·리스트가 카드 위에 겹쳐 보인다.
  it('flattens absolute-positioned list containers (ul/ol/li) into document flow', () => {
    const html = [
      '<!doctype html><html><body>',
      '<section class="slide" style="width:1920px;height:1080px;position:relative;padding:80px">',
      '<h2>ITEMS</h2>',
      '<ul style="position:absolute;top:200px;left:80px;list-style:none;margin:0;padding:0">',
      '<li style="position:absolute;top:0;left:0">First</li>',
      '<li style="position:absolute;top:60px;left:0">Second</li>',
      '</ul>',
      '</section>',
      '</body></html>',
    ].join('');
    const pinned = pinDeckSlidesToFixedCanvas(html);
    // Absolute + top/left offsets must be flattened on non-motif ul/li.
    // Content 요소는 flow 안에서 정상 배치되어야 한다.
    const flowMatch = pinned.match(
      new RegExp(`<div\\s+${DECK_SLIDE_FLOW_ATTR}[^>]*>([\\s\\S]*?)</div>`, 'i'),
    );
    expect(flowMatch).not.toBeNull();
    const flowInner = flowMatch?.[1] ?? '';
    // The ul must live inside flow (content, not chrome) AND its inline
    // style must have position:absolute flattened.
    expect(flowInner).toContain('<ul');
    // After flatten, no `position:absolute` should remain on the ul.
    const ulTag = flowInner.match(/<ul\b[^>]*>/i)?.[0] ?? '';
    expect(ulTag).not.toMatch(/position\s*:\s*absolute/i);
    const liTags = flowInner.match(/<li\b[^>]*>/gi) ?? [];
    for (const li of liTags) {
      expect(li).not.toMatch(/position\s*:\s*absolute/i);
    }
  });

  it('flow wrapper never carries `position:absolute` inline (pin CSS owns positioning)', () => {
    const html = [
      '<!doctype html><html><body>',
      '<section class="slide" style="width:1920px;height:1080px;position:relative;padding:96px">',
      '<div class="pill" style="position:absolute;right:96px;top:64px">PILL</div>',
      '<h1>TITLE</h1>',
      '</section>',
      '</body></html>',
    ].join('');
    const pinned = pinDeckSlidesToFixedCanvas(html);
    const flowOpenMatch = pinned.match(new RegExp(`<div\\s+${DECK_SLIDE_FLOW_ATTR}[^>]*>`, 'i'));
    expect(flowOpenMatch).not.toBeNull();
    // 인라인 flow style에 `position:*`이 새어들면 CSS `position:absolute !important`와
    // 충돌하지는 않지만 (specificity), 불필요한 오염이므로 방어.
    expect(flowOpenMatch?.[0] ?? '').not.toMatch(/position\s*:/i);
  });
});
