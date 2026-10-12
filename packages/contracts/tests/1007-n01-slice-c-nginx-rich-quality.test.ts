import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  extractOfficialDeckLookAssets,
  mergeOfficialDeckLookCss,
  healAiGeneratedDeckMarkup,
  HEADING_COUNT_RECONCILED_ATTR,
  OFFICIAL_DECK_MOTIF_HTML_ATTR,
} from '../src/index.js';

/**
 * 1007-N01 슬라이스 C — official-rich 로 뽑은 'nginx 기초와 심화' 덱에서 나온
 * 품질 결함 중 호스트 레이어에서 고치는 2건(결함3 hero-shot 겹침, 결함4 리치
 * slot 재조정)의 최소 회귀. 거대한 전체 덱 대신 결함을 재현하는 최소 snippet 만
 * 쓴다. 결함1·2(모델 저작 프롬프트)는 web 테스트에서 검증한다.
 */

const EXAMPLES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../plugins/_official/examples',
);

/** <style> 블록을 지운 뒤 body 상의 .hero-shot 모티프 DIV 수를 센다(CSS 규칙 제외). */
function bodyHeroShotDivCount(html: string): number {
  const noStyle = html.replace(/<style\b[\s\S]*?<\/style>/gi, ' ');
  return (noStyle.match(/class="[^"]*\bhero-shot\b[^"]*"/g) ?? []).length;
}

function listSlides(html: string): string[] {
  const noStyle = html.replace(/<style\b[\s\S]*?<\/style>/gi, ' ');
  return noStyle.split(/<section\b[^>]*class="[^"]*\bslide\b/i).slice(1);
}

describe('1007-N01 슬라이스 C — nginx 리치 덱 품질 결함(호스트 레이어)', () => {
  describe('결함3 — hero-shot 는 표지 전용(콘텐츠 슬라이드에 주입/잔존 금지)', () => {
    const productLaunch = readFileSync(
      join(EXAMPLES_DIR, 'html-ppt-product-launch/example.html'),
      'utf8',
    );

    it('표지+콘텐츠 다중 슬라이드 머지 시 hero-shot 모티프 DIV 는 표지 1개뿐', () => {
      const assets = extractOfficialDeckLookAssets(productLaunch)!;
      // assets 는 표지의 .hero-shot 을 모티프 인스턴스로 포함한다(전제 확인).
      expect(assets.motifHtml.join('\n')).toMatch(/class="[^"]*\bhero-shot\b/);

      const dest = `<!doctype html><html lang="ko"><head><meta charset="utf-8"></head><body>
<section class="slide"><h1>Nginx 기초와 심화</h1><p class="lede">리버스 프록시 입문</p></section>
<section class="slide"><h2>핵심 개념 한 장 정리</h2><div class="grid"><div class="feature-card"><h4>프록시</h4><p>요청을 백엔드로 전달한다.</p></div></div></section>
<section class="slide"><h2>리버스 프록시</h2><div class="step"><div class="n">1</div><p>업스트림을 정의한다.</p></div></section>
<section class="slide"><h2>마무리</h2><p>운영 체크리스트.</p></section>
</body></html>`;
      expect(bodyHeroShotDivCount(dest)).toBe(0);

      const merged = mergeOfficialDeckLookCss(dest, assets);
      // body 상 hero-shot 모티프 DIV 는 정확히 1개(표지)만 남는다.
      expect(bodyHeroShotDivCount(merged)).toBe(1);
      const slides = listSlides(merged);
      expect(slides.length).toBe(4);
      // 1번 슬라이드(표지)에만 hero-shot, 콘텐츠 슬라이드엔 없다.
      expect(slides[0]).toMatch(/class="[^"]*\bhero-shot\b/);
      expect(slides[1]).not.toMatch(/class="[^"]*\bhero-shot\b/);
      expect(slides[2]).not.toMatch(/class="[^"]*\bhero-shot\b/);
      expect(slides[3]).not.toMatch(/class="[^"]*\bhero-shot\b/);
      // idempotent.
      expect(mergeOfficialDeckLookCss(merged, assets)).toBe(merged);
    });

    it('이미 콘텐츠 슬라이드에 깔린 hero-shot 은 재heal 시 제거(표지는 유지)', () => {
      const assets = extractOfficialDeckLookAssets(productLaunch)!;
      const heroDiv = `<div ${OFFICIAL_DECK_MOTIF_HTML_ATTR} class="hero-shot"></div>`;
      const dest = `<!doctype html><html lang="ko"><head><meta charset="utf-8"></head><body>
<section class="slide">${heroDiv}<h1>Nginx 기초와 심화</h1></section>
<section class="slide">${heroDiv}<h2>리버스 프록시</h2><p>업스트림으로 요청을 전달한다.</p></section>
<section class="slide">${heroDiv}<h2>운영 디버깅</h2><p>로그와 튜닝의 실전 루틴.</p></section>
</body></html>`;
      expect(bodyHeroShotDivCount(dest)).toBe(3);

      const merged = mergeOfficialDeckLookCss(dest, assets);
      const slides = listSlides(merged);
      // 표지(0)만 hero-shot 유지, 콘텐츠(1·2)는 제거.
      expect(slides[0]).toMatch(/class="[^"]*\bhero-shot\b/);
      expect(slides[1]).not.toMatch(/class="[^"]*\bhero-shot\b/);
      expect(slides[2]).not.toMatch(/class="[^"]*\bhero-shot\b/);
      expect(bodyHeroShotDivCount(merged)).toBe(1);
      // 본문은 보존.
      expect(merged).toContain('업스트림으로 요청을 전달한다.');
      expect(merged).toContain('로그와 튜닝의 실전 루틴.');
    });
  });

  describe('결함4 — 리치(모델 저작)에서는 slot 재조정(그리드 shrink·heading reconcile) 비활성', () => {
    const MODEL_DECK = [
      '<!doctype html><html lang="ko"><head><meta charset="utf-8"></head><body>',
      '<section class="slide"><h2>리버스 프록시의 5가지 요소</h2>',
      '<div class="grid" style="display:grid;grid-template-columns:repeat(5,1fr)">',
      '<div class="card"><h3>프록시 패스</h3><p>업스트림으로 요청을 전달하는 핵심 지시어입니다.</p></div>',
      '<div class="card"><h3>헤더 전달</h3><p>클라이언트 정보를 백엔드로 넘기는 설정입니다.</p></div>',
      '<div class="card"><h3>버퍼링</h3><p>응답을 버퍼에 담아 성능을 조절하는 옵션입니다.</p></div>',
      '</div></section>',
      '</body></html>',
    ].join('\n');

    it('기본(slot-fill)에서는 기존대로 재조정이 돈다(게이트 무력화 아님)', () => {
      const out = healAiGeneratedDeckMarkup(MODEL_DECK, '리버스 프록시');
      // 레거시 slot-fill 동작은 그대로: heading 숫자 재조정 흔적이 남는다.
      expect(out).toContain(HEADING_COUNT_RECONCILED_ATTR);
      expect(out).toMatch(/3가지 요소/);
      expect(out).toMatch(/grid-template-columns:\s*repeat\(3,/);
    });

    it('리치(preserveModelLayout)에서는 모델 레이아웃 보존: reconcile 흔적/트랙 shrink 없음', () => {
      const out = healAiGeneratedDeckMarkup(MODEL_DECK, '리버스 프록시', {
        preserveModelLayout: true,
      });
      // host 가 heading 을 다시 쓰지 않는다.
      expect(out).not.toContain(HEADING_COUNT_RECONCILED_ATTR);
      expect(out).toMatch(/5가지 요소/);
      expect(out).not.toMatch(/3가지 요소/);
      // 모델이 선언한 5-트랙을 보존(자식 수로 깎지 않음).
      expect(out).toMatch(/grid-template-columns:\s*repeat\(5,/);
      // 본문/카드 수는 그대로.
      expect((out.match(/class="card"/g) ?? []).length).toBe(3);
      expect(out).toContain('업스트림으로 요청을 전달하는 핵심 지시어입니다.');
    });
  });
});
