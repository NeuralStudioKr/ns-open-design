import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  dedupeAdjacentSentencePunctuation,
  salvageMalformedMiniMaxSlideMarkup,
  stripNestedBoldNumberTypoPrefix,
} from '../src/template-clone-fill.js';

/**
 * User report 2026-09-03 (loop395): after loops 390-394 stabilized structure
 * the deck still rendered two visible copy bugs:
 *
 *   1. Slide 3 CONTENT LIBRARY paragraph read "자체 큐레이션한 1 1,200+개 문화
 *      콘텐츠를…" — the model started to type the number in bold
 *      (`<b>1 `), reopened another `<b>` with the full number
 *      (`<b>1,200+개 문화 콘텐츠</b>`), then closed both. The stray leading
 *      `1 ` reads like a duplicated digit.
 *   2. Slide 4 Step 01 description ended "…초기 셋업 평균 30분 . ." — the
 *      model closed bold with a period (`<b>30분</b>.`) *and* wrote the
 *      sentence-terminating period after the close (`</div>.`), rendering
 *      as a visible stutter.
 *
 * Loop395 fixes:
 *   (a) `stripNestedBoldNumberTypoPrefix` drops the outer `<b>N </b>`
 *       wrapper only when the immediately-nested `<b>` opens with a real
 *       comma-triplet or decimal number (`1,200`, `12.5`). Emphasis
 *       chains like `<b>1위 <b>SaaS</b></b>` stay intact.
 *   (b) `dedupeAdjacentSentencePunctuation` collapses duplicate `.` / `!`
 *       / `?` pairs that straddle a close tag (inline or block) or plain
 *       whitespace. Ellipses (`...`) survive via negative look-behind /
 *       look-ahead on the same mark.
 */
describe('loop395 — nested-bold number typo + duplicate sentence punctuation', () => {
  it('stripNestedBoldNumberTypoPrefix drops the outer <b>N </b> wrapper before a real number', () => {
    const input = '<p>자체 큐레이션한 <b>1 <b>1,200+개 문화 콘텐츠</b>를 카테고리별로 즉시 검색·예약할 수 있습니다.</b></p>';
    const out = stripNestedBoldNumberTypoPrefix(input);
    expect(out).toBe('<p>자체 큐레이션한 <b>1,200+개 문화 콘텐츠</b>를 카테고리별로 즉시 검색·예약할 수 있습니다.</p>');
  });

  it('stripNestedBoldNumberTypoPrefix also drops when inner uses a decimal number', () => {
    const input = '<p>가격은 <b>1 <b>12.5억원</b>부터 시작합니다.</b></p>';
    const out = stripNestedBoldNumberTypoPrefix(input);
    expect(out).toBe('<p>가격은 <b>12.5억원</b>부터 시작합니다.</p>');
  });

  it('stripNestedBoldNumberTypoPrefix does not touch <b>1위 <b>SaaS</b></b> emphasis chain (inner not a number)', () => {
    const input = '<b>1위 <b>SaaS</b></b>';
    const out = stripNestedBoldNumberTypoPrefix(input);
    expect(out).toBe(input);
  });

  it('stripNestedBoldNumberTypoPrefix does not touch balanced <b>A <b>B</b></b> without number prefix', () => {
    const input = '<b>Foo <b>Bar</b></b>';
    const out = stripNestedBoldNumberTypoPrefix(input);
    expect(out).toBe(input);
  });

  it('dedupeAdjacentSentencePunctuation collapses `.</div>.` stutter', () => {
    const input = '<div>초기 셋업 평균 <b>30분</b>.</div>.';
    const out = dedupeAdjacentSentencePunctuation(input);
    expect(out).toBe('<div>초기 셋업 평균 <b>30분</b>.</div>');
  });

  it('dedupeAdjacentSentencePunctuation collapses whitespace-separated ". ." stutter', () => {
    const input = '<p>30분 . .</p>';
    const out = dedupeAdjacentSentencePunctuation(input);
    expect(out).toBe('<p>30분 .</p>');
  });

  it('dedupeAdjacentSentencePunctuation collapses `!!` and `??` pairs', () => {
    expect(dedupeAdjacentSentencePunctuation('Great!!')).toBe('Great!');
    expect(dedupeAdjacentSentencePunctuation('Really??')).toBe('Really?');
  });

  it('dedupeAdjacentSentencePunctuation preserves ellipses `...` intact', () => {
    const input = 'ellipsis is fine: 그런데... 그래.';
    const out = dedupeAdjacentSentencePunctuation(input);
    expect(out).toBe(input);
  });

  it('dedupeAdjacentSentencePunctuation preserves long ellipses `!!!` / `????` intact', () => {
    expect(dedupeAdjacentSentencePunctuation('Wow!!!')).toBe('Wow!!!');
    expect(dedupeAdjacentSentencePunctuation('Really????')).toBe('Really????');
  });

  it('salvageMalformedMiniMaxSlideMarkup end-to-end applies both fixes to the user-report fixture', () => {
    const fixture = readFileSync(
      join(__dirname, 'fixtures', 'teamver-neubrutal-empty-lead-and-b-orphan.html'),
      'utf8',
    );
    const salv = salvageMalformedMiniMaxSlideMarkup(fixture, 'brief');
    // Fix 1: the "1 1,200" typo prefix is gone; the real number survives.
    expect(salv).not.toMatch(/자체 큐레이션한\s*1\s+1,200/);
    expect(salv).toMatch(/1,200\+개 문화 콘텐츠/);
  });

  it('salvage is idempotent after loop395', () => {
    const fixture = readFileSync(
      join(__dirname, 'fixtures', 'teamver-neubrutal-empty-lead-and-b-orphan.html'),
      'utf8',
    );
    const once = salvageMalformedMiniMaxSlideMarkup(fixture, 'brief');
    const twice = salvageMalformedMiniMaxSlideMarkup(once, 'brief');
    expect(twice).toBe(once);
  });
});
