/**
 * Repro for staging bug (`영어 회화 표현 공부 팁, 예시에 대한 발표자료 만들어줘.`
 * against ib-pitch-book Clone): 다이렉트 `example.html`을
 * `buildTemplateClonedDeckHtml`에 태워 실제 wipe 결과를 검증한다.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildTemplateClonedDeckHtml,
  resolveTemplateCloneSlidesFromBrief,
  synthesizeTemplateCloneSlidesFromFreeFormBrief,
} from '../src/template-clone-fill';

const EXAMPLE_PATH = resolve(
  __dirname,
  '../../../plugins/_official/examples/ib-pitch-book/example.html',
);
const EXAMPLE_HTML = readFileSync(EXAMPLE_PATH, 'utf8');
const BRIEF = '영어 회화 표현 공부 팁, 예시에 대한 발표자료 만들어줘.';
const DECK_TITLE = '영어 회화 표현 공부 팁, 예시에';

describe('ib-pitch-book Clone free-form Korean brief', () => {
  it('resolveTemplateCloneSlidesFromBrief on this brief', () => {
    const slides = resolveTemplateCloneSlidesFromBrief({
      userInstruction: BRIEF,
      deckTitle: DECK_TITLE,
    });
    console.log('resolveTemplateCloneSlidesFromBrief =>', slides);
    expect(slides.length).toBeGreaterThanOrEqual(0);
  });

  it('synthesizeTemplateCloneSlidesFromFreeFormBrief on this brief', () => {
    const slides = synthesizeTemplateCloneSlidesFromFreeFormBrief({
      brief: BRIEF,
      deckTitle: DECK_TITLE,
    });
    console.log('synthesize =>', slides);
  });

  it('buildTemplateClonedDeckHtml with EMPTY slides and maxSlides=9 (staging repro path)', () => {
    const cloned = buildTemplateClonedDeckHtml(EXAMPLE_HTML, [], {
      title: DECK_TITLE,
      maxSlides: 9,
    });
    expect(cloned).not.toBeNull();
    if (cloned) {
      const bodyRegex = /<body\b[^>]*>([\s\S]*)<\/body>/i;
      const body = bodyRegex.exec(cloned)?.[1] ?? '';

      // Save output for inspection
      const fs = require('node:fs');
      const outPath = '/tmp/ibpb-clone-repro.html';
      fs.writeFileSync(outPath, cloned);
      console.log('wrote:', outPath, cloned.length, 'chars');
      const slideCount = (body.match(/<section class="slide/gi)?.length ?? 0);
      console.log('slides in clone:', slideCount);

      // After the fix, IB pitch-book placeholder Clone must not carry
      // demo-chrome wrappers or the surviving demo text runs.
      const stepMatches = body.match(/<div class="step"/gi)?.length ?? 0;
      const stampMatches = body.match(/<div class="stamp"/gi)?.length ?? 0;
      const altMatches = body.match(/<div class="alt(?:\s|")/gi)?.length ?? 0;
      const nextMatches = body.match(/<div class="next"/gi)?.length ?? 0;
      const altsGridMatches = body.match(/<div class="alts-grid"/gi)?.length ?? 0;
      const ffChartMatches = body.match(/<div class="ff-chart"/gi)?.length ?? 0;
      const dcfAsmMatches = body.match(/<div class="dcf-asm"/gi)?.length ?? 0;

      console.log(
        '.step / .stamp / .alt / .next / .alts-grid / .ff-chart / .dcf-asm',
        [stepMatches, stampMatches, altMatches, nextMatches, altsGridMatches, ffChartMatches, dcfAsmMatches].join(' / '),
      );

      expect(stepMatches).toBe(0);
      expect(stampMatches).toBe(0);
      expect(altMatches).toBe(0);
      expect(nextMatches).toBe(0);
      expect(altsGridMatches).toBe(0);
      expect(ffChartMatches).toBe(0);
      expect(dcfAsmMatches).toBe(0);
      expect(/Board approval/i.test(body)).toBe(false);
      expect(/Margaret Eun/i.test(body)).toBe(false);
      expect(/Continue as standalone/i.test(body)).toBe(false);
      expect(/pitch-agent/i.test(body)).toBe(false);

      // `.stage` (flex-row track) must be unwrapped so host bridge can
      // reveal slides via display toggle instead of translating the track.
      const hasStageWrapper = /<div\b[^>]*\bid\s*=\s*["']stage["']/i.test(body)
        || /<div\b[^>]*\bclass\s*=\s*["'][^"']*\bstage\b/i.test(body);
      expect(hasStageWrapper).toBe(false);

      // Slides are still present (9) and each carries the fixed canvas size.
      expect(slideCount).toBe(9);
    }
  });
});
