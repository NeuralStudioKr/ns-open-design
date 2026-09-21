import { describe, expect, it } from 'vitest';

import {
  STALLED_HEAD_PREAMBLE_STATUS_CODE,
  STALLED_PARTIAL_DECK_MIN_CHARS,
  STALLED_PARTIAL_DECK_STATUS_CODE,
  formatStalledHeadPreambleNotice,
  formatStalledPartialDeckNotice,
  stalledRunHeadPreambleText,
  stalledRunPartialDeckText,
} from '../../src/teamver/stalledRunDeckSalvage';

const headOnlyCssDump = `작성 중입니다.\n<artifact type="deck" identifier="deck">\n<!doctype html>\n<html lang="ko"><head><style>${'a'.repeat(600)}</style></head>`;
const partialDeck = [
  '작성 중입니다.',
  '<artifact type="deck" identifier="deck">',
  '<!doctype html>',
  '<html lang="ko"><body>',
  '<section class="slide"><h1>분기 전략</h1><p>한 분기를 한 문장으로 정리합니다.</p></section>',
  '</body></html>',
  '<!-- pad -->'.repeat(30),
].join('\n');

describe('루프477 stalled deck salvage eligibility', () => {
  it('salvages a stalled slide run that already streamed deck html', () => {
    expect(
      stalledRunPartialDeckText({
        errorCode: 'AGENT_EXECUTION_STALLED',
        slideOnlyMvp: true,
        streamedText: partialDeck,
      }),
    ).toBe(partialDeck);
  });

  it('keeps the plain failure path for non-stall errors', () => {
    expect(
      stalledRunPartialDeckText({
        errorCode: 'AGENT_EXECUTION_FAILED',
        slideOnlyMvp: true,
        streamedText: partialDeck,
      }),
    ).toBeNull();
  });

  it('루프491 salvages daemon FAILED stalls that still carry the stall phrase', () => {
    expect(
      stalledRunPartialDeckText({
        errorCode: 'AGENT_EXECUTION_FAILED',
        errorDetail: 'Agent stalled without emitting any new output for 120s.',
        slideOnlyMvp: true,
        streamedText: partialDeck,
      }),
    ).toBe(partialDeck);
  });

  it('only applies to slide-only runs', () => {
    expect(
      stalledRunPartialDeckText({
        errorCode: 'AGENT_EXECUTION_STALLED',
        slideOnlyMvp: false,
        streamedText: partialDeck,
      }),
    ).toBeNull();
  });

  it('skips a stall that never opened an html document', () => {
    expect(
      stalledRunPartialDeckText({
        errorCode: 'AGENT_EXECUTION_STALLED',
        slideOnlyMvp: true,
        streamedText: `작성 중입니다. ${'가'.repeat(600)}`,
      }),
    ).toBeNull();
  });

  it('skips a bare artifact/head stub below the min length', () => {
    expect(
      stalledRunPartialDeckText({
        errorCode: 'AGENT_EXECUTION_STALLED',
        slideOnlyMvp: true,
        streamedText: '<artifact type="deck" identifier="deck">\n<!doctype html>\n<html lang="ko"><head>',
      }),
    ).toBeNull();
    expect(STALLED_PARTIAL_DECK_MIN_CHARS).toBeGreaterThan(0);
  });

  it('루프541 does not salvage a head/CSS dump as a saved deck', () => {
    expect(
      stalledRunPartialDeckText({
        errorCode: 'AGENT_EXECUTION_STALLED',
        slideOnlyMvp: true,
        streamedText: headOnlyCssDump,
      }),
    ).toBeNull();
    expect(
      stalledRunHeadPreambleText({
        errorCode: 'AGENT_EXECUTION_STALLED',
        slideOnlyMvp: true,
        streamedText: headOnlyCssDump,
      }),
    ).toBe(headOnlyCssDump);
  });

  it('루프540 hands a head preamble stub to finalize/auto-continue', () => {
    const stub = [
      'Teamver 서비스 소개 슬라이드를 C Cobalt Grid 템플릿 비주얼로 작성 중입니다.',
      '<artifact type="deck" identifier="deck">',
      '<!doctype html>',
      '<html lang="ko">',
      '<head>',
    ].join('\n');
    expect(
      stalledRunPartialDeckText({
        errorCode: 'AGENT_EXECUTION_STALLED',
        slideOnlyMvp: true,
        streamedText: stub,
      }),
    ).toBeNull();
    expect(
      stalledRunHeadPreambleText({
        errorCode: 'AGENT_EXECUTION_STALLED',
        slideOnlyMvp: true,
        streamedText: stub,
      }),
    ).toBe(stub);
    expect(STALLED_HEAD_PREAMBLE_STATUS_CODE).toBe('stalled_head_preamble');
    expect(formatStalledHeadPreambleNotice()).toMatch(/머리글/);
  });

  it('루프540 does not treat a titled slide as a head preamble', () => {
    const withSlide = `${partialDeck}\n<body><section class="slide"><h1>표지</h1></section></body>`;
    expect(
      stalledRunHeadPreambleText({
        errorCode: 'AGENT_EXECUTION_STALLED',
        slideOnlyMvp: true,
        streamedText: withSlide,
      }),
    ).toBeNull();
  });

  it('루프541 treats an opened html shell without <head> as a preamble', () => {
    const htmlOnly = [
      '작성 중입니다.',
      '<artifact type="deck" identifier="deck">',
      '<!doctype html>',
      '<html lang="ko">',
    ].join('\n');
    expect(
      stalledRunPartialDeckText({
        errorCode: 'AGENT_EXECUTION_STALLED',
        slideOnlyMvp: true,
        streamedText: htmlOnly,
      }),
    ).toBeNull();
    expect(
      stalledRunHeadPreambleText({
        errorCode: 'AGENT_EXECUTION_STALLED',
        slideOnlyMvp: true,
        streamedText: htmlOnly,
      }),
    ).toBe(htmlOnly);
  });

  it('루프541 still salvages a titled partial deck after a long head', () => {
    expect(
      stalledRunPartialDeckText({
        errorCode: 'AGENT_EXECUTION_STALLED',
        slideOnlyMvp: true,
        streamedText: partialDeck,
      }),
    ).toBe(partialDeck);
    expect(
      stalledRunHeadPreambleText({
        errorCode: 'AGENT_EXECUTION_STALLED',
        slideOnlyMvp: true,
        streamedText: partialDeck,
      }),
    ).toBeNull();
  });

  it('exposes a user-facing notice under a distinct status code', () => {
    expect(STALLED_PARTIAL_DECK_STATUS_CODE).toBe('stalled_partial_deck');
    expect(formatStalledPartialDeckNotice()).toMatch(/멈춰/);
    // 루프529 — succeeded salvage must not promise a Retry dock button.
    expect(formatStalledPartialDeckNotice()).toMatch(/채팅에서 이어서/);
    expect(formatStalledPartialDeckNotice()).not.toMatch(/다시 시도/);
  });
});
