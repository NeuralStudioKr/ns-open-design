/**
 * 루프572 — persist heal for leftover-wipe remnants already saved in
 * Block Frame HTML. User report 2026-09-21: `Teamver가 `, `로 연결되는`,
 * `빠르게을 시작`, `대상 고객별 메시지 다음`, empty `.list-num` 02.
 *
 * 0921-N06 stops NEW substring wipes. This slice empties remnants that
 * already landed. Do not invent replacement copy.
 */

import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

import { healAiGeneratedDeckMarkup } from '../src/html/heal-ai-generated-deck.js';
import { healBrokenServiceIntroLeftoverRemnants } from '../src/template-clone-fill.js';

const BRIEF = 'www.teamver.com 사이트 분석해서 서비스 소개 슬라이드 만들어줘.';
const FIXTURE_URL = new URL(
  './fixtures/loop572-block-frame-remnant.html',
  import.meta.url,
);

function visible(html: string): string {
  return String(html ?? '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

describe('루프572 · Block Frame leftover remnant persist heal', () => {
  it('empties truncated lead, particle fragments, leftover titles, empty list-num', async () => {
    const raw = await readFile(FIXTURE_URL, 'utf8');
    expect(raw).toMatch(/Teamver가 /);
    expect(raw).toMatch(/로 연결되는/);
    expect(raw).toMatch(/빠르게을/);
    expect(raw).toMatch(/대상 고객별 메시지 다음/);
    expect(raw).toMatch(/<span class="list-num">02<\/span>\s*<\/li>/);

    const healed = healAiGeneratedDeckMarkup(raw, BRIEF);
    const text = visible(healed);
    expect(text).not.toMatch(/Teamver가\s*$|Teamver가\s{2,}/);
    expect(text).not.toMatch(/(?:^|\s)(?:로|으로|을|를)\s+/);
    expect(text).not.toMatch(/빠르게을|다음는|을 시작 판단/);
    expect(text).not.toMatch(/대상 고객별 메시지 다음|측정해야 할 지표 쓰는 길/);
    expect(healed).not.toMatch(/<li\b[^>]*>\s*<span\b[^>]*\blist-num\b[^>]*>02<\/span>\s*<\/li>/i);
    expect(text).toContain('마케팅·PM·콘텐츠 팀이 같은 보드에서');
    expect(text).toContain('Teamver 소개');
  });

  it('does not invent replacement copy for a remnant-only leaf', () => {
    const healed = healBrokenServiceIntroLeftoverRemnants(
      '<p class="hero-subtitle">Teamver가 </p><p class="step-desc">로 연결되는 명확한 행동 경로</p>',
    );
    expect(healed).not.toMatch(/파일·대화·템플릿|한눈에|\d+%/);
    expect(visible(healed)).not.toMatch(/Teamver가|로 연결되는/);
  });

  it('keeps filled content-list items and drops list-num-only pills', () => {
    const healed = healBrokenServiceIntroLeftoverRemnants(
      [
        '<ul class="content-list">',
        '<li><span class="list-num">01</span><span>Discovery phase to map stakeholder needs.</span></li>',
        '<li><span class="list-num">02</span></li>',
        '<li><span class="list-num">03</span><span></span></li>',
        '</ul>',
      ].join(''),
    );
    expect(healed).toContain('Discovery phase to map stakeholder needs.');
    expect(healed).toMatch(/<span class="list-num">01<\/span>/);
    expect(healed).not.toMatch(/<span class="list-num">02<\/span>/);
    expect(healed).not.toMatch(/<span class="list-num">03<\/span>/);
  });

  it('official English Block Frame example stays a no-op', async () => {
    const official = await readFile(
      new URL(
        '../../../plugins/_official/examples/html-ppt-zhangzara-block-frame/example.html',
        import.meta.url,
      ),
      'utf8',
    );
    const healed = healBrokenServiceIntroLeftoverRemnants(official);
    expect(healed).toBe(official);
    expect(healed).toContain('Discovery phase to map stakeholder needs');
    expect(healed).toContain('Iterative wireframing with rapid feedback loops');
  });
});
