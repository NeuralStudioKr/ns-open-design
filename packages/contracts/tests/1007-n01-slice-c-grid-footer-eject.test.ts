import { describe, expect, it } from 'vitest';
import {
  ejectTrailingChromeFooterFromGrid,
  healAiGeneratedDeckMarkup,
} from '@open-design/contracts';

const BRIEF = '리눅스 커널 소개 발표자료';

function grid2colWithTrailingFooter(): string {
  return [
    '<!doctype html><html lang="ko"><body>',
    '<section class="slide"><h2>핵심 기능</h2>',
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px">',
    '<div class="card"><h3>기능 A</h3><p>설명 A 본문입니다.</p></div>',
    '<div class="card"><h3>기능 B</h3><p>설명 B 본문입니다.</p></div>',
    '<footer class="deck-footer">1 / 6</footer>',
    '</div>',
    '</section>',
    '</body></html>',
  ].join('');
}

describe('1007-N01 결함3(b) — footer/pager grid-in 오삽입 eject', () => {
  it('카드 그리드(≥2트랙)의 마지막 자식 footer 를 그리드 밖으로 eject 한다', () => {
    const out = ejectTrailingChromeFooterFromGrid(grid2colWithTrailingFooter(), BRIEF);
    // 그리드 close 직후 형제로 이동.
    expect(out).toMatch(/<\/div>\s*<footer class="deck-footer">1 \/ 6<\/footer>/);
    // footer 가 더 이상 카드 본문 바로 뒤(그리드 안)가 아니다.
    expect(out).not.toMatch(/설명 B 본문입니다\.<\/p><\/div>\s*<footer[^>]*>1 \/ 6<\/footer>\s*<\/div>/);
    // 카드 2장은 보존(내용 생성·삭제 없음).
    expect(out).toContain('기능 A');
    expect(out).toContain('기능 B');
    expect(out).toContain('1 / 6');
  });

  it('멱등: 두 번 실행해도 동일(이미 eject 된 footer 는 재이동 없음)', () => {
    const once = ejectTrailingChromeFooterFromGrid(grid2colWithTrailingFooter(), BRIEF);
    const twice = ejectTrailingChromeFooterFromGrid(once, BRIEF);
    expect(twice).toBe(once);
  });

  it('1-track(단일 컬럼) 그리드의 footer-row 는 보존(의도된 레이아웃)', () => {
    const html = [
      '<!doctype html><html lang="ko"><body>',
      '<section class="slide"><h2>표지</h2>',
      '<div style="display:grid;grid-template-columns:1fr;gap:24px">',
      '<div class="card"><h3>본문</h3><p>단일 컬럼 본문입니다.</p></div>',
      '<footer class="deck-footer">1 / 6</footer>',
      '</div>',
      '</section>',
      '</body></html>',
    ].join('');
    expect(ejectTrailingChromeFooterFromGrid(html, BRIEF)).toBe(html);
  });

  it('footer 가 마지막 자식이 아니면 건드리지 않는다', () => {
    const html = [
      '<!doctype html><html lang="ko"><body>',
      '<section class="slide"><h2>핵심</h2>',
      '<div style="display:grid;grid-template-columns:1fr 1fr">',
      '<footer class="deck-footer">1 / 6</footer>',
      '<div class="card"><h3>A</h3><p>본문 A 입니다.</p></div>',
      '</div>',
      '</section>',
      '</body></html>',
    ].join('');
    expect(ejectTrailingChromeFooterFromGrid(html, BRIEF)).toBe(html);
  });

  it('그리드가 없으면 no-op', () => {
    const html =
      '<!doctype html><html lang="ko"><body>'
      + '<section class="slide"><h2>표지</h2><p>그리드 없는 슬라이드입니다.</p></section>'
      + '</body></html>';
    expect(ejectTrailingChromeFooterFromGrid(html, BRIEF)).toBe(html);
  });
});

describe('1007-N01 결함3(a) — 리치(preserveModelLayout) 에서도 교정 동작', () => {
  it('리치 heal 이 footer-in-grid 오삽입을 eject 한다(모델 레이아웃 보존 모드)', () => {
    const healed = healAiGeneratedDeckMarkup(grid2colWithTrailingFooter(), BRIEF, {
      preserveModelLayout: true,
    });
    // 교정(footer eject)은 리치에서도 적용.
    expect(healed).toMatch(/<\/div>\s*<footer class="deck-footer">1 \/ 6<\/footer>/);
    // 트랙 수 보존: 선언된 2트랙이 유지된다(리치는 트랙 shrink 안 함).
    // normalizeEqualFrTracksToMinmax 가 1fr→minmax(0,1fr) 로 정규화하지만 트랙 수는 2 그대로.
    const cols = /grid-template-columns:\s*([^;"']+)/i.exec(healed)?.[1] ?? '';
    expect(cols).toMatch(/^(?:1fr\s+1fr|minmax\(0,\s*1fr\)\s+minmax\(0,\s*1fr\))$/);
    // 모델 카드 내용은 보존.
    expect(healed).toContain('기능 A');
    expect(healed).toContain('기능 B');
  });
});
