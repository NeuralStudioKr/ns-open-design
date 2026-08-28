// 루프167 — MiniMax는 각 슬라이드 flow 끝에 인라인 스타일 uppercase monospace
// 텍스트(EDITION 01 · PAGE 06 / 06 · CHAPTER 03 등)를 붙인다. 이 텍스트에는
// class가 없어서 기존 `.slide-footer` / `.slide-meta` CSS 규칙이 잡아내지
// 못하고, flex-column flow에서 앞쪽에 몰려 slide 하단에 큰 공백이 남는다.
// 사용자가 지적한 "요소 배치 부적절"의 잔재 중 하나 (staging MiniMax English
// deck 06 CLOSING · 03/06 · 05/06 슬라이드).
//
// 해결: pin 단계에서 flow의 후행 연속 footer-스타일 요소 시퀀스의 첫 번째에
// `class="slide-footer"` 를 부여한다. 기존 look CSS
// `.slide > [data-od-slide-flow] > .slide-footer { margin-top: auto }` 가
// 자동으로 발동해 footer 그룹이 하단에 정렬된다.
//
// 검증 축:
//   A) 인라인 uppercase + monospace 스타일 문자열 조합을 감지
//   B) 후행 연속 시퀀스의 첫 요소에만 class 부여
//   C) 텍스트 유실 없음
//   D) 이미 class 가 있는 요소도 안전하게 확장

import { describe, expect, it } from 'vitest';
import { pinDeckSlidesToFixedCanvas } from '../src/html/deck-fixed-canvas';

function firstSlideFlowInner(html: string): string {
  const m = html.match(/<div\s+data-od-slide-flow\b[^>]*>([\s\S]*?)<\/div>\s*(?:<\/section>|<div\s+class="pill"|<div\s+class="stamp")/i);
  return m?.[1] ?? '';
}

describe('pinDeckSlidesToFixedCanvas — mark trailing MiniMax footer texts (루프167)', () => {
  it('adds class="slide-footer" to the first of two trailing uppercase+monospace footer texts', () => {
    const html = `<!doctype html><html><body>
<section class="slide" data-screen-label="01 COVER" style="position:relative;width:1920px;height:1080px;background:#EFE9D9;overflow:hidden">
  <div style="position:relative;font-family:'JetBrains Mono',monospace;font-size:22px;letter-spacing:.18em;text-transform:uppercase">LEARNING SERIES · 2025</div>
  <h1 style="position:relative;margin:0;font-family:'Archivo Black',sans-serif;font-size:184px">SPOKEN ENGLISH.</h1>
  <p style="position:relative;margin:0;font-size:36px">일주일 안에 입이 트이는 영어 회화.</p>
  <div style="position:relative;font-family:'JetBrains Mono',monospace;font-size:22px;letter-spacing:.14em;text-transform:uppercase">EDITION 01</div>
  <div style="position:relative;font-family:'JetBrains Mono',monospace;font-size:22px;letter-spacing:.14em;text-transform:uppercase">PAGE 01 / 06</div>
</section>
</body></html>`;

    const pinned = pinDeckSlidesToFixedCanvas(html, { force: true });
    const inner = firstSlideFlowInner(pinned);
    // Trailing footer sequence: EDITION 01 (n-2) + PAGE 01/06 (n-1). First of
    // sequence (EDITION 01) must gain class="slide-footer".
    const editionMatch = inner.match(/<div\b[^>]*>[^<]*EDITION\s*01[^<]*<\/div>/i)?.[0] ?? '';
    expect(editionMatch).toMatch(/class="slide-footer"/);
    // The LEARNING SERIES kicker is ALSO uppercase+monospace but it sits at
    // the top — the walk stops at the first non-footer child (h1). So the
    // kicker must NOT be marked as footer.
    const kickerMatch = inner.match(/<div\b[^>]*>[^<]*LEARNING\s+SERIES[^<]*<\/div>/i)?.[0] ?? '';
    expect(kickerMatch).not.toMatch(/class=".*slide-footer/);
    // Content preserved
    expect(pinned).toContain('SPOKEN ENGLISH');
    expect(pinned).toContain('EDITION 01');
    expect(pinned).toContain('PAGE 01 / 06');
    expect(pinned).toContain('LEARNING SERIES');
  });

  it('handles a single trailing footer element', () => {
    const html = `<!doctype html><html><body>
<section class="slide" data-screen-label="06 CLOSING" style="position:relative;width:1920px;height:1080px;background:#1F8A4C;overflow:hidden">
  <h2 style="margin:0;font-size:140px">YOUR FIRST 30 MINUTES.</h2>
  <div style="display:grid;grid-template-columns:repeat(3,1fr)"><div>STEP 1</div><div>STEP 2</div><div>STEP 3</div></div>
  <div style="position:relative;font-family:'JetBrains Mono',monospace;font-size:22px;letter-spacing:.14em;text-transform:uppercase">PAGE 06 / 06</div>
</section>
</body></html>`;

    const pinned = pinDeckSlidesToFixedCanvas(html, { force: true });
    const pageMatch = pinned.match(/<div\b[^>]*>[^<]*PAGE\s*06[^<]*<\/div>/i)?.[0] ?? '';
    expect(pageMatch).toMatch(/class="slide-footer"/);
  });

  it('preserves existing class when adding slide-footer', () => {
    const html = `<!doctype html><html><body>
<section class="slide" data-screen-label="02 WHY" style="position:relative;width:1920px;height:1080px;background:#EFE9D9;overflow:hidden">
  <h2 style="margin:0;font-size:120px">GRINDING GRAMMAR.</h2>
  <div class="meta" style="position:relative;font-family:'JetBrains Mono',monospace;font-size:22px;text-transform:uppercase">ENGLISH · WEEK 2</div>
  <div style="position:relative;font-family:'JetBrains Mono',monospace;font-size:22px;text-transform:uppercase">PAGE 02 / 06</div>
</section>
</body></html>`;

    const pinned = pinDeckSlidesToFixedCanvas(html, { force: true });
    const metaMatch = pinned.match(/<div\b[^>]*\bclass="[^"]*"[^>]*>[^<]*ENGLISH\s*·\s*WEEK\s*2/i)?.[0] ?? '';
    // Class must contain BOTH 'meta' (original) and 'slide-footer' (added).
    expect(metaMatch).toMatch(/class="[^"]*\bmeta\b[^"]*"/i);
    expect(metaMatch).toMatch(/class="[^"]*\bslide-footer\b[^"]*"/i);
  });

  it('does NOT mark a footer-style element that appears BEFORE non-footer content', () => {
    // Kicker at top + body + kicker at bottom → only bottom sequence marked.
    const html = `<!doctype html><html><body>
<section class="slide" style="position:relative;width:1920px;height:1080px;overflow:hidden">
  <div style="font-family:'JetBrains Mono',monospace;text-transform:uppercase">SECTION 03 · WHY</div>
  <h2 style="font-size:100px">GRAMMAR.</h2>
  <p>content</p>
  <div style="font-family:'JetBrains Mono',monospace;text-transform:uppercase">PAGE 03</div>
</section>
</body></html>`;
    const pinned = pinDeckSlidesToFixedCanvas(html, { force: true });
    const kickerMatch = pinned.match(/<div\b[^>]*>[^<]*SECTION\s*03[^<]*<\/div>/i)?.[0] ?? '';
    expect(kickerMatch).not.toMatch(/\bslide-footer\b/);
    const pageMatch = pinned.match(/<div\b[^>]*>[^<]*PAGE\s*03[^<]*<\/div>/i)?.[0] ?? '';
    expect(pageMatch).toMatch(/\bslide-footer\b/);
  });

  it('is idempotent — pin(pin(x)) === pin(x)', () => {
    const html = `<!doctype html><html><body>
<section class="slide" style="position:relative;width:1920px;height:1080px;overflow:hidden">
  <h1 style="font-size:100px">TITLE.</h1>
  <div style="font-family:'JetBrains Mono',monospace;text-transform:uppercase">PAGE 01</div>
</section>
</body></html>`;
    const pinned1 = pinDeckSlidesToFixedCanvas(html, { force: true });
    const pinned2 = pinDeckSlidesToFixedCanvas(pinned1, { force: true });
    expect(pinned2).toBe(pinned1);
  });
});
