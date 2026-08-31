/**
 * 루프180 · pitch-deck cover gradient must not become deck paper.
 *
 * 사용자 리포트 (2026-08-31 · 삼각함수):
 *   MiniMax가 pitch-deck 카탈로그로 삼각함수 슬라이드를 생성했으나 콘텐츠
 *   생성 실패 → 제목-only 슬라이드 2장. 렌더 결과: 모든 슬라이드에
 *   `linear-gradient(135deg,#3b5bff,#7a46ff,#d94cff)` 배경 강제 + 검은
 *   텍스트 하나. 사용자 리포트: "결과물 내용 없음 + 템플릿 적용 안됨".
 *
 * 근본 원인:
 *   `inferDeckSlidePaperSurface`가 `identityHostBg` 추출 시 selector가
 *   `.tpl-*` 로 시작하고 `.slide`를 포함하지 않으면 통과시킴. 하지만
 *   pitch-deck의 `.tpl-pitch-deck .mega { background: var(--grad); }`,
 *   `.tpl-pitch-deck .cover-blob { background: var(--grad); }`,
 *   `.tpl-pitch-deck .avatar { background: var(--grad); }` 등 하위 요소
 *   (텍스트 fill / blob / avatar / dot / metric number) 도 매치되어 그
 *   그라디언트가 슬라이드 paper로 오탐.
 *
 * 그리고 `isDecorativeBackground` 는 리터럴 `gradient(` / `url(` /
 * `image-set(` 만 검사하므로 `var(--grad)` 는 non-decorative 로 취급.
 * paper background = `var(--grad)` → 모든 슬라이드 배경에 그라디언트.
 *
 * 축 방어 2개:
 *   A. identity host 매칭을 template host **자체** 만 매치 — 하위 요소 제외
 *   B. var 이름 힌트로 gradient 인식 (`--grad`, `--grad-*`, `--gradient-*` 등)
 */

import { describe, expect, it } from 'vitest';
import {
  inferDeckSlidePaperSurface,
  repairDeckSlideSurfaceBleed,
} from '../../src/artifacts/deck-slide-surface';

const PITCH_DECK_GRADIENT_FIXTURE = [
  '<!doctype html><html lang="ko"><head><meta charset="utf-8"/>',
  '<style data-od-official-motif-deco-css="">',
  '.slide [data-od-official-motif-html].cover-blob{position:absolute;right:0;top:0;width:560px;height:560px;border-radius:50%;background:var(--grad);filter:blur(8px);opacity:.35;z-index:-1}',
  '</style>',
  '</head>',
  '<body class="tpl-pitch-deck" style="margin:0">',
  '<section class="slide slide-title" style="width:1920px;height:1080px;padding:80px 88px"><div data-od-slide-flow=""><h1>삼각함수</h1></div></section>',
  '<section class="slide" style="width:1920px;height:1080px;padding:80px 88px"><div data-od-slide-flow=""><h1>삼각함수</h1></div></section>',
  '<style data-od-official-look-css="">',
  ':root { --bg: #ffffff; --bg-soft: #f7f7f8; --surface: #ffffff; --border: rgba(0,0,0,.08); --text-1: #111216; --text-2: #55596a; --text-3: #8a8f9e; --accent: #3b6cff; --grad: linear-gradient(135deg,#3b6cff,#7a5cff 55%,#ff5c8a); --grad-soft: linear-gradient(135deg,#eef2ff,#f5ecff 55%,#ffeef5); --font-sans: "Inter",sans-serif; }',
  'html,body{margin:0;padding:0;background:var(--bg);color:var(--text-1);font-family:var(--font-sans)}',
  '.slide{position:absolute;inset:0;display:flex;flex-direction:column;padding:72px 96px}',
  '.tpl-pitch-deck{ --bg:#ffffff;--surface:#ffffff; --grad:linear-gradient(135deg,#3b5bff 0%,#7a46ff 55%,#d94cff 100%); --grad-soft:linear-gradient(135deg,#eef1ff,#f4edff 55%,#fbedff); }',
  '.tpl-pitch-deck .mega{font-size:180px;font-weight:900;background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent}',
  '.tpl-pitch-deck .cover-bg{position:absolute;inset:0;background:var(--grad-soft);z-index:-1}',
  '.tpl-pitch-deck .cover-blob{position:absolute;right:0;top:0;width:560px;height:560px;border-radius:50%;background:var(--grad);filter:blur(8px);opacity:.35;z-index:-1}',
  '.tpl-pitch-deck .brand-dot{display:inline-block;width:14px;height:14px;border-radius:50%;background:var(--grad)}',
  '.tpl-pitch-deck .avatar{width:96px;height:96px;border-radius:50%;background:var(--grad)}',
  '.tpl-pitch-deck .ask-box{background:var(--grad);color:#fff;padding:56px 64px}',
  '.tpl-pitch-deck .metric .n{font-size:72px;font-weight:900;background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent}',
  '.tpl-pitch-deck .traction-bar .bar{background:var(--grad);border-radius:8px 8px 0 0}',
  '</style>',
  '</body></html>',
].join('\n');

describe('deck-slide-surface · 루프180 pitch-deck cover gradient', () => {
  describe('axis A · identity host selector must be exact', () => {
    it('does NOT infer var(--grad) as paper from .tpl-pitch-deck .mega text-fill', () => {
      const paper = inferDeckSlidePaperSurface(PITCH_DECK_GRADIENT_FIXTURE);
      // The catalog defines `--bg: #ffffff` on both :root and .tpl-pitch-deck.
      // Paper resolution should either return null (nothing solid to promote)
      // or resolve to a non-gradient surface — never the cover gradient.
      if (paper) {
        expect(paper.background).not.toMatch(/var\(--grad\b\)/i);
        expect(paper.background).not.toMatch(/var\(--grad-soft\)/i);
        expect(paper.background).not.toMatch(/linear-gradient/i);
      }
    });

    it('surface-bleed style must not carry var(--grad) as background', () => {
      const repaired = repairDeckSlideSurfaceBleed(PITCH_DECK_GRADIENT_FIXTURE);
      const bleed = repaired.match(/<style[^>]*data-od-slide-surface-bleed[^>]*>([\s\S]*?)<\/style>/i);
      // Either no bleed at all (paper stays white → no injection), or a bleed
      // whose background is NOT the deck gradient.
      if (bleed) {
        expect(bleed[1]).not.toMatch(/background:\s*var\(--grad\b\)/i);
        expect(bleed[1]).not.toMatch(/background:\s*var\(--grad-soft\)/i);
      }
    });
  });

  describe('axis B · var-name gradient hint', () => {
    it('treats var(--grad) as decorative even without literal gradient() text', () => {
      // Independent fixture: only vars, no per-element rules. Ensures the
      // var-name heuristic on its own protects against gradient promotion.
      const html = [
        '<!doctype html><html><head><style>',
        ':root { --grad: linear-gradient(135deg,#f00,#00f); --bg: #ffffff; --text-1: #111; }',
        'html, body, .tpl-x { background: var(--grad); }',
        '.tpl-x .slide { background: var(--grad); }',
        '</style></head>',
        '<body class="tpl-x"><section class="slide"><h1>Cover</h1></section></body></html>',
      ].join('');
      const paper = inferDeckSlidePaperSurface(html);
      // Even when body/slide reference `var(--grad)`, paper resolution
      // must not promote a gradient var onto html/body/.slide as solid paper.
      // Paper can be null (safest — no promotion) or a non-gradient solid.
      if (paper) {
        expect(paper.background).not.toMatch(/var\(--grad\b\)/i);
        expect(paper.background).not.toMatch(/linear-gradient/i);
      }
    });

    it('still resolves solid identity host backgrounds (e.g. --hc-bg on Hermes)', () => {
      // Regression guard — do not over-broaden. Solid identity host bg
      // (Hermes cyber terminal, Bold Poster, etc.) must still be picked.
      const html = [
        '<!doctype html><html><head><style>',
        ':root{--bg:#ffffff;--fg:#111}',
        '.tpl-hermes-cyber-terminal{--hc-bg:#0a0c10;--hc-ink:#e8f0ea;background:var(--hc-bg);color:var(--hc-ink)}',
        '.tpl-hermes-cyber-terminal .slide{background:var(--hc-bg);color:var(--hc-ink)}',
        '</style></head>',
        '<body class="tpl-hermes-cyber-terminal">',
        '<section class="slide" style="width:1920px;height:1080px"><h1>$ cover</h1></section>',
        '</body></html>',
      ].join('');
      expect(inferDeckSlidePaperSurface(html)?.background.toLowerCase()).toBe('#0a0c10');
    });
  });

  describe('end-to-end · user fixture round-trip', () => {
    it('renders without slide gradient paper — content stays visible on white', () => {
      const repaired = repairDeckSlideSurfaceBleed(PITCH_DECK_GRADIENT_FIXTURE);
      // The visible symptom in the user screenshot: purple gradient covering
      // the entire slide with `삼각함수` alone. This test locks the fix:
      // gradient never lands on the slide surface via the bleed pass.
      const bleed = repaired.match(/<style[^>]*data-od-slide-surface-bleed[^>]*>([\s\S]*?)<\/style>/i);
      if (bleed) {
        expect(bleed[1]).not.toMatch(/linear-gradient/i);
        expect(bleed[1]).not.toMatch(/var\(--grad\b\)/i);
      }
    });
  });
});
