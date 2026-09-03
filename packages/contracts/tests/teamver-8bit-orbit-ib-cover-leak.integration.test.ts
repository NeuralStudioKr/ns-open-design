import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  healSparseDeckCoverLayout,
  officialLookIsEightBitOrbit,
  restyleForeignIbMagazineCover,
  salvageMalformedMiniMaxSlideMarkup,
  stripNeoBrutalVarFallbackOnEightBit,
} from '../src/template-clone-fill.js';

/**
 * User report 2026-09-03: user selected the 8-bit Orbit template and asked
 * for a 팀버 소개 deck. The persisted deck arrived with slides 2-9 in proper
 * pixel-orbit chrome (`.pixel-box`, `.pixel-label`, `.starfield`, dark-void
 * background, neon-pink/cyan/yellow palette) but slide 1 rendered as an IB
 * magazine cover (`.mast` + `<h1 class="display">` + `.foot` on
 * `background:var(--paper);color:var(--ink)`) with a cream letterbox bleed.
 *
 * Loop390 fixes (soyeon parallel + follow-up):
 *   (a) `officialLookIsEightBitOrbit` fingerprints the kit from look CSS
 *       (`--neon-*`, `--dark-void`, `.pixel-hero-text`, `.pixel-box`) or
 *       body chrome (`.pixel-box` + `scanlines/grain/starfield` +
 *       kit-palette hex/vars).
 *   (b) `destHasNonIbKitSignals` catches pixel-orbit signals plus
 *       `data-od-neobrutal-var-fallback` presence so
 *       `healSparseDeckCoverLayout` never rebuilds an IB magazine cover.
 *   (c) `restyleForeignIbMagazineCover` restyles any IB magazine cover
 *       chrome that slipped through onto the 8-bit orbit hero shape
 *       (`.slide.bg-grid.scanlines.grain.crt-glow` + `.starfield` +
 *       `.slide-content` with `.hero-subtitle` + `.pixel-hero-text`).
 *   (d) `stripNeoBrutalVarFallbackOnEightBit` clears the loop386 cream
 *       `--paper`/`--ink` fallback that only makes sense on neubrutal decks.
 */
const FIXTURE_PATH = join(
  __dirname,
  'fixtures',
  'teamver-8bit-orbit-ib-cover-leak.html',
);
const FIXTURE_HTML = readFileSync(FIXTURE_PATH, 'utf8');
const BRIEF = 'www.teamver.com 사이트 분석해서 서비스 소개 슬라이드 만들어줘.';

describe('teamver 8-bit orbit IB cover leak fixture (2026-09-03 user report)', () => {
  it('officialLookIsEightBitOrbit fingerprints this deck', () => {
    expect(officialLookIsEightBitOrbit(FIXTURE_HTML)).toBe(true);
  });

  it('healSparseDeckCoverLayout skips IB rebuild when Pixel Orbit signals are present', () => {
    const healed = healSparseDeckCoverLayout(FIXTURE_HTML, BRIEF, '팀버 소개');
    // No IB magazine rebuild — output stays exactly the fixture.
    expect(healed).toBe(FIXTURE_HTML);
  });

  it('restyleForeignIbMagazineCover replaces IB mast/display cover with pixel-orbit hero', () => {
    const restyled = restyleForeignIbMagazineCover(FIXTURE_HTML);
    // IB magazine chrome is gone from the cover.
    expect(restyled).not.toMatch(/<h1\s+class="display">/);
    expect(restyled).not.toMatch(/<header\s+class="mast"/);
    expect(restyled).not.toMatch(/<footer\s+class="foot"/);
    expect(restyled).not.toMatch(/background:var\(--paper\)/);
    // Pixel Orbit hero landed.
    expect(restyled).toMatch(/class="slide bg-grid scanlines grain crt-glow"/);
    expect(restyled).toMatch(/class="pixel-hero-text"/);
    expect(restyled).toMatch(/class="starfield"/);
    expect(restyled).toMatch(/class="hero-subtitle"/);
    expect(restyled).toMatch(/--dark-void,#0A0E27/);
    expect(restyled).toMatch(/팀버/);
  });

  it('restyle preserves subsequent 8-bit orbit body slides untouched', () => {
    const restyled = restyleForeignIbMagazineCover(FIXTURE_HTML);
    expect(restyled).toMatch(/data-screen-label="02 WHAT IS TEAMVER"/);
    expect(restyled).toMatch(/data-screen-label="03 WHY TEAMVER"/);
    expect(restyled).toMatch(/class="pixel-label"/);
    expect(restyled).toMatch(/팀버<br>란\?/);
  });

  it('restyle is idempotent — running twice does not re-rewrite an already-restyled hero', () => {
    const once = restyleForeignIbMagazineCover(FIXTURE_HTML);
    const twice = restyleForeignIbMagazineCover(once);
    expect(twice).toBe(once);
  });

  it('stripNeoBrutalVarFallbackOnEightBit removes the cream fallback for this deck', () => {
    const restyled = restyleForeignIbMagazineCover(FIXTURE_HTML);
    expect(restyled).toMatch(/data-od-neobrutal-var-fallback/);
    const stripped = stripNeoBrutalVarFallbackOnEightBit(restyled);
    expect(stripped).not.toMatch(/data-od-neobrutal-var-fallback/);
    // The letterbox bleed style is separate — kept.
    expect(stripped).toMatch(/data-od-slide-surface-bleed/);
  });

  it('salvageMalformedMiniMaxSlideMarkup end-to-end restyles cover and clears neo fallback', () => {
    const salvaged = salvageMalformedMiniMaxSlideMarkup(FIXTURE_HTML, BRIEF);
    // IB shape gone.
    expect(salvaged).not.toMatch(/<h1\s+class="display">/);
    expect(salvaged).not.toMatch(/<header\s+class="mast"/);
    expect(salvaged).not.toMatch(/<span\s+class="conf">/);
    // Pixel-orbit hero landed.
    expect(salvaged).toMatch(/class="slide bg-grid scanlines grain crt-glow"/);
    expect(salvaged).toMatch(/class="pixel-hero-text"/);
    // Cream fallback var block dropped.
    expect(salvaged).not.toMatch(/data-od-neobrutal-var-fallback/);
    // Motif deco + look CSS blocks preserved.
    expect(salvaged).toMatch(/data-od-official-motif-deco-css/);
    expect(salvaged).toMatch(/data-od-official-look-css/);
    // Content copy preserved.
    expect(salvaged).toMatch(/팀버/);
  });

  it('salvage is idempotent — repeated salvage produces the same output', () => {
    const once = salvageMalformedMiniMaxSlideMarkup(FIXTURE_HTML, BRIEF);
    const twice = salvageMalformedMiniMaxSlideMarkup(once, BRIEF);
    expect(twice).toBe(once);
  });
});
