import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  healAiGeneratedDeckMarkup,
} from '../src/html/heal-ai-generated-deck.js';
import {
  salvageMalformedMiniMaxSlideMarkup,
} from '../src/template-clone-fill.js';

/**
 * User report 2026-09-02 — neubrutalism template, brief:
 * "www.teamver.com 사이트 분석해서 서비스 소개 슬라이드 만들어줘"
 *
 * The Clone slot-fill first turn produced a reasonable deck, but the follow-up
 * "수정 반영" turn had the model rewrite HTML directly and shipped severely
 * mangled markup (nested `<h3>`, orphan `</p>/h3></h3>`, single-child flex
 * wrappers, empty `<ul>` / `<p>` shells, empty border+padding chrome cards).
 *
 * This fixture pins the observed bug so future heal regressions surface here
 * instead of at runtime. The expectations are conservative and describe
 * *user-visible* improvements — not exact HTML shape — so heal iterations can
 * change internal markup freely as long as the end-user output stays clean.
 */
const FIXTURE_PATH = join(
  __dirname,
  'fixtures',
  'teamver-neubrutalism-modify-turn.html',
);
const FIXTURE_HTML = readFileSync(FIXTURE_PATH, 'utf8');
const BRIEF = 'www.teamver.com 사이트 분석해서 서비스 소개 슬라이드 만들어줘';

function pipeline(html: string, brief: string): string {
  return healAiGeneratedDeckMarkup(
    salvageMalformedMiniMaxSlideMarkup(html),
    brief,
  );
}

describe('teamver neubrutalism modify-turn fixture (2026-09-02 user report)', () => {
  const out = pipeline(FIXTURE_HTML, BRIEF);

  it('drops the empty <ul class="content-list"> shell on slide 2 (loop376)', () => {
    // 4 orphan numbered pills were visible under "Teamver — Smarter & Faster".
    expect(out).not.toMatch(/<ul[^>]*\bcontent-list\b[^>]*>\s*<li>\s*<\/li>/);
    expect(out).not.toMatch(/<li>\s*<\/li>\s*<li>\s*<\/li>/);
  });

  it('drops the empty <p class="hero-subtitle"> shell on slide 1 (loop376)', () => {
    expect(out).not.toMatch(/<p\b[^>]*\bhero-subtitle\b[^>]*>\s*<\/p>/);
  });

  it('unwraps the single-child flex wrapper around the Slack/Notion grid (loop379)', () => {
    // Grid still holds all four cards, wrapper no longer adds an extra 24px push.
    expect(out).not.toMatch(
      /<div\s+style="display:flex;align-items:center;gap:16px;margin-bottom:24px"\s*>\s*<div\s+style="display:grid/,
    );
    // All four service names still render.
    for (const label of ['Slack', 'Notion', 'Drive', 'ChatGPT']) {
      expect(out).toContain(label);
    }
  });

  it('repairs broken `<h3>Shared Drive </p>/h3></h3>` typos (loop377)', () => {
    // Bare `/h3>` (no `<`) and stray `</p>/h3>` sequences are gone. Real
    // `</hN>` closes are fine — only reject bare `/hN>` preceded by non-`<`.
    expect(out).not.toMatch(/[^<]\/h[1-6]>/);
    expect(out).not.toMatch(/<\/p>\s*\/h[1-6]>/);
    // Doubled heading with the same text collapses to one visible copy.
    const sharedDriveMatches = out.match(/Shared Drive/g) ?? [];
    expect(sharedDriveMatches.length).toBeLessThanOrEqual(1);
    expect(out.match(/AI Chat/g)?.length ?? 0).toBeLessThanOrEqual(1);
    expect(out.match(/AI Apps/g)?.length ?? 0).toBeLessThanOrEqual(1);
  });

  it('strips empty padded border card chromes (loop377)', () => {
    // `<div style="background:#FFFDF5;border:...;box-shadow:...;padding:32px"></div>` shells
    // between real content blocks should be gone.
    const emptyPaddedBorderRe =
      /<div\b[^>]*border\s*:\s*[^"]*solid[^"]*;[^"]*padding\s*:[^"]*"[^>]*>\s*<\/div>/gi;
    expect(out.match(emptyPaddedBorderRe)?.length ?? 0).toBe(0);
  });

  it('keeps real body copy from the modify turn intact', () => {
    for (const phrase of [
      '팀의 일이 너무 많이',
      '흩어져 있습니다',
      'Teamver — 대화 + 파일 + AI + 결과물',
      '도구가 늘수록 업무 맥락은 끊어집니다',
      'Channels &amp; DM',
      'Shared Drive',
    ]) {
      expect(out).toContain(phrase);
    }
  });

  it('keeps the neubrutalism kit color washes on all six model slides', () => {
    // Slides 3–8 all shipped inline `background:#FFDC8B` (cream). The letterbox
    // bleed / heal must not strip those inline paints — losing them collapses
    // the deck to a white host over cream slides.
    expect(out.match(/background:#FFDC8B/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('does not invent lecture / demo copy or leak the brief into headings', () => {
    // Heal must not synthesize placeholder body text or leak "www.teamver.com"
    // into a slide heading.
    expect(out).not.toContain('Lorem ipsum');
    expect(out).not.toContain('실카피');
    expect(out).not.toMatch(/<h[1-3][^>]*>[^<]*www\.teamver\.com[^<]*<\/h[1-3]>/);
  });

  it('is idempotent — a second pipeline pass changes nothing', () => {
    const twice = pipeline(out, BRIEF);
    expect(twice).toBe(out);
  });
});
