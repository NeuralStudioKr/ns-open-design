/**
 * 루프168 · MiniMax kami-deck catalog leftover regression.
 *
 * 실제 사용자 fixture (2026-08-28) — MiniMax API가 부분 실행 실패
 * (`AGENT_EXECUTION_FAILED`) 후 남긴 kami-deck example.html leftover이
 * `ProjectView.tsx`의 recover / same-turn-reuse persist 경로 (line 8253 /
 * line 10274) 를 통과했다. 두 경로는 `healAiGeneratedDeckMarkup`은 부르지만
 * `scrubLeftoverCatalogExampleHtml`을 부르지 않아서 leftover가 그대로 저장·
 * 렌더되었다. 근본 방어: `healAiGeneratedDeckMarkup` 자체가 catalog leftover
 * 를 감지하면 스크럽을 선행하도록 통합 (idempotent — persist 경로는
 * 스크럽을 한 번 더 걸어도 no-op).
 *
 * 추가 방어: dash-list `<li>` 도 tagline / lede 처럼 brief-leak 슬롯이다.
 * 사용자 fixture의 `<ul class="dash"><li>${brief}</li></ul>` 이 그대로 노출
 * 되었으므로 `scrubBriefLeakFromMetaSlots` 가 li 도 처리해야 한다.
 */

import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  dropTitleOnlyNumberedLeftoverSlides,
  healAiGeneratedDeckMarkup,
  scrubBriefLeakFromMetaSlots,
  stripEmptyLeftoverPresenterChrome,
} from '../src/html/heal-ai-generated-deck.js';

const USER_KAMI_LEFTOVER_FIXTURE_ROUND168 = [
  "<!DOCTYPE html>",
  "<html lang='en'><head><meta charset='utf-8' />",
  "<title>삼각함수</title>",
  "<meta name='description' content='Open Design as a kami slide deck. Warm parchment with ink-blue cover and chapter slides, serif at one weight, no italic.' />",
  '<style>.slide{width:1920px;height:1080px}</style>',
  '</head><body>',
  "<section class='slide s-cover dark' data-slide-kind='cover' style=\"width:1920px;height:1080px;box-sizing:border-box\">",
  "  <div class='slide-inner'>",
  "    <span class='eyebrow'>Open-source design studio</span>",
  '    <h1>삼각함수</h1>',
  "    <p class='tagline'>삼각함수에 대해서 설명하는 피피티 만들어줘.</p>",
  "    <div class='meta'>",
  '      <span>Berlin · 52.5200° N · 13.4050° E</span>',
  "      <span class='rule'></span>",
  '      <span>MMXXVI</span>',
  '    </div>',
  '  </div>',
  '</section>',
  "<section class='slide s-content' data-slide-kind='content' style=\"width:1920px;height:1080px;box-sizing:border-box\">",
  "  <div class='slide-inner'>",
  "    <div class='head'>",
  "      <p class='num'>01.1</p>",
  '      <h2>삼각함수 2</h2>',
  "      <p class='lede'>A local-first design studio for the agent you already trust.</p>",
  '    </div>',
  "    <div class='body'>",
  "      <p> Open Design is the <strong>open-source alternative to Anthropic's Claude Design</strong>. It runs on your laptop. Your agent reads a folder of <code>SKILL.md</code> files and a folder of <code>DESIGN.md</code> systems, then produces real files — landing pages, decks, white papers, dashboards. </p>",
  "      <ul class='dash'><li>삼각함수에 대해서 설명하는 피피티 만들어줘.</li></ul>",
  "      <div class='tag-row'> <span class='tag'>Apache-2.0</span> <span class='tag'>Local-first</span> <span class='tag'>BYOK</span> </div>",
  '    </div>',
  '  </div>',
  '</section>',
  "<section class='slide s-chapter dark' data-slide-kind='chapter' style=\"width:1920px;height:1080px;box-sizing:border-box\">",
  "  <div class='slide-inner'>",
  "    <p class='num'></p>",
  '    <h2>삼각함수 · 3</h2>',
  '  </div>',
  '</section>',
  "<section class='slide s-content' data-slide-kind='content' style=\"width:1920px;height:1080px;box-sizing:border-box\">",
  "  <div class='slide-inner'>",
  "    <div class='head'><h2>삼각함수 · 4</h2></div>",
  "    <div class='body'><ul class='dash'><li></li><li></li><li></li></ul></div>",
  '  </div>',
  '</section>',
  '</body></html>',
].join('\n');

describe('heal-ai-generated-deck · 루프168 catalog leftover integration', () => {
  const brief = '삼각함수에 대해서 설명하는 피피티 만들어줘.';

  it('scrubs kami-deck catalog leftover on the heal-only recover/reuse path', () => {
    // recover(line 8253) / same-turn reuse(line 10274) call heal without a
    // preceding scrubLeftoverCatalogExampleHtml. That is the exact path this
    // user hit — heal must own the leftover scrub, not the callers.
    const out = healAiGeneratedDeckMarkup(USER_KAMI_LEFTOVER_FIXTURE_ROUND168, brief);
    expect(out).not.toMatch(/Claude Design/i);
    expect(out).not.toMatch(/local-first design studio for the agent you already trust/i);
    expect(out).not.toMatch(/SKILL\.md/i);
    expect(out).not.toMatch(/Apache-2\.0/);
    expect(out).not.toMatch(/BYOK/);
    expect(out).not.toMatch(/Berlin · 52\.5200/);
    expect(out).not.toMatch(/MMXXVI/);
    // Brief itself must be scrubbed from tagline AND dash-list li.
    expect(out).not.toMatch(new RegExp(brief.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    // Topic word must survive — heal is a transform, not a wipe.
    expect(out).toMatch(/삼각함수/);
  });

  it('leaves clean AI decks unchanged (no false-positive scrub)', () => {
    const clean = [
      '<!DOCTYPE html><html><body>',
      '<section class="slide s-cover"><h1>삼각함수</h1>',
      '<p class="tagline">각과 비를 다루는 함수의 세계</p></section>',
      '<section class="slide s-content"><h2>정의</h2>',
      '<p>직각삼각형의 변의 길이 비.</p>',
      '<ul class="dash"><li>sin, cos, tan</li></ul></section>',
      '</body></html>',
    ].join('');
    const out = healAiGeneratedDeckMarkup(clean, '삼각함수 발표자료');
    // Content survives — no scrub trigger.
    expect(out).toMatch(/삼각함수/);
    expect(out).toMatch(/각과 비를 다루는 함수의 세계/);
    expect(out).toMatch(/sin, cos, tan/);
  });

  it('idempotent — a second heal pass equals the first', () => {
    const once = healAiGeneratedDeckMarkup(USER_KAMI_LEFTOVER_FIXTURE_ROUND168, brief);
    const twice = healAiGeneratedDeckMarkup(once, brief);
    expect(twice).toBe(once);
  });

  it('scrubs brief leak inside <li> too (dash-list slot)', () => {
    const brief2 = '삼각함수에 대해서 설명하는 피피티 만들어줘.';
    const html = `<ul class='dash'><li>${brief2}</li><li>내용</li></ul>`;
    const out = scrubBriefLeakFromMetaSlots(html, brief2);
    // The brief-only <li> becomes empty; the other <li> survives.
    expect(out).toMatch(/<li>\s*<\/li>/);
    expect(out).toMatch(/<li>내용<\/li>/);
    expect(out).not.toContain(brief2);
  });

  it('scrubs brief leak in <li> even when a dash-list is authored with plain <ul>', () => {
    const brief2 = '삼각함수에 대해서 설명하는 피피티 만들어줘.';
    const html = `<ul><li>${brief2}</li></ul>`;
    const out = scrubBriefLeakFromMetaSlots(html, brief2);
    expect(out).not.toContain(brief2);
  });
});

describe('heal-ai-generated-deck · 루프172–174 leftover hardening', () => {
  const brief = '삼각함수에 대해서 설명하는 피피티 만들어줘.';

  it('does not wipe official English kami example when heal has no brief', async () => {
    const official = await readFile(
      new URL('../../../design-templates/kami-deck/example.html', import.meta.url),
      'utf8',
    );
    const out = healAiGeneratedDeckMarkup(official, null);
    expect(out).toMatch(/Claude Design/i);
    expect(out).toMatch(/52\.5200/);
    expect(out).toContain('id=\'nav\'');
  });

  it('scrubs a partial kami leftover that dropped the Claude Design paragraph', () => {
    const leftover = [
      '<!doctype html><html><body>',
      '<section class="slide s-cover"><span class="eyebrow">Open-source design studio</span>',
      '<h1>삼각함수</h1>',
      '<div class="meta">Berlin · 52.5200° N · 13.4050° E</div></section>',
      '<section class="slide s-chapter"><h2>삼각함수 · 3</h2></section>',
      '<section class="slide s-content"><h2>삼각함수 · 4</h2>',
      '<ul class="dash"><li></li><li></li><li></li></ul></section>',
      '<div id="nav"></div><div id="hint">← / →</div>',
      '</body></html>',
    ].join('');
    const out = healAiGeneratedDeckMarkup(leftover, brief);
    expect(out).not.toMatch(/Open-source design studio/i);
    expect(out).not.toMatch(/52\.5200/);
    expect(out).toMatch(/삼각함수/);
    expect(out).not.toMatch(/sin\s*\(|cos\s*\(|tan\s*\(/i);
  });

  it('drops title-only numbered leftover slides without inventing lecture copy', () => {
    const html = [
      '<section class="slide s-cover"><h1>삼각함수</h1><p>각과 비</p></section>',
      '<section class="slide s-chapter"><h2>삼각함수 · 3</h2><p class="num"></p></section>',
      '<section class="slide s-content"><h2>삼각함수 2</h2><p>직각삼각형의 변의 길이 비.</p></section>',
      '<section class="slide s-content"><h2>삼각함수 · 4</h2><ul class="dash"><li></li><li></li></ul></section>',
    ].join('');
    const dropped = dropTitleOnlyNumberedLeftoverSlides(html, brief);
    expect(dropped).toMatch(/삼각함수/);
    expect(dropped).toMatch(/직각삼각형의 변의 길이 비/);
    expect(dropped).not.toMatch(/삼각함수 · 3/);
    expect(dropped).not.toMatch(/삼각함수 · 4/);
    expect(dropped).toMatch(/삼각함수 2/);
    const healed = healAiGeneratedDeckMarkup(html, brief);
    expect(healed).toMatch(/직각삼각형의 변의 길이 비/);
    expect(healed).not.toMatch(/삼각함수 · 3/);
  });

  it('strips empty leftover presenter chrome only when there is no presenter script', () => {
    const leftover = [
      '<section class="slide"><h1>삼각함수</h1></section>',
      '<div id="nav"></div>',
      '<div id="hint">← / →</div>',
      '<div class="deck-progress"><div class="bar"></div></div>',
    ].join('');
    const stripped = stripEmptyLeftoverPresenterChrome(leftover);
    expect(stripped).not.toMatch(/id="nav"/);
    expect(stripped).not.toMatch(/id="hint"/);
    expect(stripped).not.toMatch(/deck-progress/);
    const officialish = `${leftover}<script>function go(){}</script>`;
    expect(stripEmptyLeftoverPresenterChrome(officialish)).toContain('id="nav"');
  });
});
