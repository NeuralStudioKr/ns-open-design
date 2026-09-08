import { describe, expect, it } from 'vitest';

import {
  STALLED_PARTIAL_DECK_MIN_CHARS,
  STALLED_PARTIAL_DECK_STATUS_CODE,
  formatStalledPartialDeckNotice,
  stalledRunPartialDeckText,
} from '../../src/teamver/stalledRunDeckSalvage';

const partialDeck = `작성 중입니다.\n<artifact type="deck" identifier="deck">\n<!doctype html>\n<html lang="ko"><head><style>${'a'.repeat(600)}</style></head>`;

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

  it('exposes a user-facing notice under a distinct status code', () => {
    expect(STALLED_PARTIAL_DECK_STATUS_CODE).toBe('stalled_partial_deck');
    expect(formatStalledPartialDeckNotice()).toMatch(/멈춰/);
  });
});
