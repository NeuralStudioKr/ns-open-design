/**
 * 루프178 · Unresolved template placeholder scrub whitelist (defence-in-depth).
 *
 * Broadside 카탈로그 leftover는 upstream 루프175–176이 fingerprint
 * (`[[Author Name]]`)를 `looksLikeLeftoverTemplateDemoDeck` 에 추가하고
 * `scrubTemplatePlaceholderSlots`(3-토큰 좁은 whitelist · Hangul gate)로
 * 처리했음. 사용자 fixture(2026-08-28 · 삼각함수)는 이미 완벽 해결.
 *
 * 이 루프178은 defence-in-depth: 다른 business-template 카탈로그가
 * `[Company Name]`·`[Client]`·`[Project]`·`[Version]` 같은 더 넓은
 * placeholder 세트를 leftover로 남길 때 대비.
 *
 * Whitelist(23토큰) + wrapper-only 매칭 + Hangul-gate 조합:
 *   - `<span>[[Author Name]]</span>` — 전체 텍스트 100% placeholder → 클리어
 *   - `<p>replace [Company] with...</p>` — 인라인 언급 → 보존
 *   - `[Smith 2024]` (citation) → 보존 (whitelist 미매치)
 *   - `[참고]`, `[주1]`, `[1]` → 보존 (whitelist 미매치)
 *   - 영문 dest + null brief → 보존 (Hangul-gate skip · upstream 계약 준수)
 */

import { describe, expect, it } from 'vitest';
import {
  healAiGeneratedDeckMarkup,
  scrubUnresolvedTemplatePlaceholders,
} from '../src/html/heal-ai-generated-deck.js';

describe('루프178 · scrubUnresolvedTemplatePlaceholders', () => {
  it('strips [[Author Name]] · [Year] · [Author Name] · [Title]', () => {
    const html = [
      '<span>[[Author Name]]</span>',
      '<span>[Year]</span>',
      '<span>[Author Name]</span>',
      '<span>[Title]</span>',
      '<span>[[Company]]</span>',
      '<span>[Subtitle]</span>',
      '<span>[Date]</span>',
    ].join('');
    const out = scrubUnresolvedTemplatePlaceholders(html);
    expect(out).not.toMatch(/\[\[Author Name\]\]/);
    expect(out).not.toMatch(/\[Year\]/);
    expect(out).not.toMatch(/\[Author Name\]/);
    expect(out).not.toMatch(/\[Title\]/);
    expect(out).not.toMatch(/\[\[Company\]\]/);
    expect(out).not.toMatch(/\[Subtitle\]/);
    expect(out).not.toMatch(/\[Date\]/);
  });

  it('does not eat Korean bracketed prose ([참고], [1], [주1])', () => {
    const html = [
      '<p>[참고] 이 부분은 예시입니다.</p>',
      '<p>각주 [1] 논문 인용.</p>',
      '<p>[주1] 부연 설명.</p>',
    ].join('');
    const out = scrubUnresolvedTemplatePlaceholders(html);
    expect(out).toContain('[참고]');
    expect(out).toContain('[1]');
    expect(out).toContain('[주1]');
  });

  it('does not eat citation-style [Author 2024] refs that carry a year', () => {
    const html = '<p>연구에 따르면 [Smith 2024] 결과는 명확합니다.</p>';
    const out = scrubUnresolvedTemplatePlaceholders(html);
    expect(out).toContain('[Smith 2024]');
  });

  it('is idempotent — a second pass matches nothing new', () => {
    const html = '<span>[[Author Name]]</span><span>[Year]</span>';
    const once = scrubUnresolvedTemplatePlaceholders(html);
    const twice = scrubUnresolvedTemplatePlaceholders(once);
    expect(twice).toBe(once);
  });

  it('healAiGeneratedDeckMarkup scrubs the wider placeholder whitelist on Hangul dest', () => {
    // Hangul topic present → catalog leftover heuristic gate fires and
    // placeholder scrub runs. Widest whitelist covers business-template
    // tokens beyond upstream's narrow 3-token set.
    const html = [
      '<section class="slide">',
      '<h1>회사 소개</h1>',
      '<span class="corner-label">[[Company Name]]</span>',
      '<span class="corner-label">[Client]</span>',
      '<span class="corner-label">[Project]</span>',
      '<span class="corner-label">[Version]</span>',
      '<span class="corner-label">[[Author Name]]</span>',
      '</section>',
    ].join('');
    const out = healAiGeneratedDeckMarkup(html, null);
    expect(out).not.toMatch(/\[\[Company Name\]\]/);
    expect(out).not.toMatch(/\[Client\]/);
    expect(out).not.toMatch(/\[Project\]/);
    expect(out).not.toMatch(/\[Version\]/);
    expect(out).not.toMatch(/\[\[Author Name\]\]/);
  });

  it('preserves [[Author Name]] on English-only dest (upstream contract)', () => {
    // Official English catalogs / gallery demos must stay intact. Only
    // Hangul dest triggers placeholder scrub.
    const english = [
      '<section class="slide">',
      '<h1>Broadside Demo</h1>',
      '<span class="broadside-num">[[Author Name]]</span>',
      '<span class="broadside-num">[Year]</span>',
      '</section>',
    ].join('');
    const out = healAiGeneratedDeckMarkup(english, null);
    expect(out).toMatch(/\[\[Author Name\]\]/);
    expect(out).toMatch(/\[Year\]/);
  });
});
