import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  healInstructionCopyCoverHeading,
  healSparseDeckCoverLayout,
  sanitizeTemplateCloneDeckTitle,
  synthesizeTemplateCloneOutlineFromBrief,
  titleIsUrlOnlyOrUrlFragment,
} from '../src/template-clone-fill.js';

/**
 * User report 2026-09-02: user brief was `www.teamver.com 사이(트) …` — the
 * LOOK seed produced a single neubrutalism slide with the URL fragment as
 * the h1. Prior heal path (`healSparseDeckCoverLayout`) then REBUILT the
 * cover as IB magazine shape (`h1.display` + `.mast` + `--paper`/`--ink`)
 * because look CSS hadn't been merged yet — the neubrutalism kit CSS
 * injected later collides with the IB shell, rendering an unstyled cream
 * card on a cream letterbox with the URL fragment as title/footer.
 *
 * Loop387 fixes:
 *   (a) `looksLikeInstructionCopy` rejects URL-only / URL + short trailing
 *       fragment briefs so they never derive a cover title.
 *   (b) `healSparseDeckCoverLayout` skips rebuild when the destination
 *       carries non-IB kit signals (numbered slide role classes, hero-frame
 *       layout wrappers, `nb-*` utility classes, kit tokens like `--cream`
 *       / `--pink`).
 */
const FIXTURE_PATH = join(
  __dirname,
  'fixtures',
  'teamver-neubrutalism-url-brief-cover.html',
);
const FIXTURE_HTML = readFileSync(FIXTURE_PATH, 'utf8');
const BRIEF = 'www.teamver.com 사이';

describe('teamver neubrutalism URL-brief cover fixture (2026-09-02 user report)', () => {
  it('titleIsUrlOnlyOrUrlFragment detects URL + short fragment as instruction leak', () => {
    expect(titleIsUrlOnlyOrUrlFragment('www.teamver.com 사이')).toBe(true);
    expect(titleIsUrlOnlyOrUrlFragment('www.teamver.com')).toBe(true);
    expect(titleIsUrlOnlyOrUrlFragment('https://www.example.com hi')).toBe(true);
    // A URL followed by a real topic (>=5 chars) is NOT a leak.
    expect(titleIsUrlOnlyOrUrlFragment('www.teamver.com 서비스 소개')).toBe(false);
  });

  it('sanitizeTemplateCloneDeckTitle rejects URL-fragment titles', () => {
    expect(sanitizeTemplateCloneDeckTitle('www.teamver.com 사이')).toBeNull();
    expect(sanitizeTemplateCloneDeckTitle('https://foo.bar')).toBeNull();
  });

  it('synthesizeTemplateCloneOutlineFromBrief rescues a URL-only brief to a brand title (루프389)', () => {
    const outline = synthesizeTemplateCloneOutlineFromBrief({
      userBrief: 'www.teamver.com 사이',
      deckTitle: '슬라이드',
    });
    expect(outline).not.toBeNull();
    expect(outline!.title).toMatch(/팀버|Teamver/);
    expect(outline!.title).not.toMatch(/www\.teamver\.com/);
    expect(outline!.slides[0]?.title).toMatch(/팀버|Teamver/);
  });

  it('healInstructionCopyCoverHeading rewrites URL-fragment titles without IB magazine rebuild', () => {
    const healed = healInstructionCopyCoverHeading(FIXTURE_HTML, BRIEF, '슬라이드');
    expect(healed).toMatch(/팀버|Teamver/);
    expect(healed).not.toMatch(/www\.teamver\.com 사이/);
    // No IB magazine cover shape appears.
    expect(healed).not.toMatch(/<h1\s+class="display">/);
    expect(healed).not.toMatch(/border-top:6px\s+solid\s+var\(--ink\)/);
    expect(healed).not.toMatch(/<span\s+class="conf">/);
  });

  it('healSparseDeckCoverLayout skips rebuild when neubrutalism kit signals are present', () => {
    const healed = healSparseDeckCoverLayout(FIXTURE_HTML, BRIEF, '슬라이드');
    // No rebuild — output is the untouched fixture (or superset that keeps
    // the neubrutalism shell intact).
    expect(healed).toBe(FIXTURE_HTML);
    expect(healed).not.toMatch(/<h1\s+class="display">/);
    expect(healed).not.toMatch(/border-top:6px\s+solid\s+var\(--ink\)/);
    expect(healed).toMatch(/class="hero-frame"/);
  });

  it('healSparseDeckCoverLayout still rebuilds an IB magazine cover when signals are absent', () => {
    // Sanity: with NO kit signals, the heal is allowed to rebuild
    // (IB-magazine mode) — the loop387 guard is targeted, not universal.
    const ibStub = [
      '<!doctype html><html><body>',
      '<section class="slide cover" style="width:1920px;height:1080px;box-sizing:border-box;justify-content:center;text-align:center">',
      '<h1>www.teamver.com 사이</h1>',
      '</section>',
      '<section class="slide"><h2>둘째 장</h2></section>',
      '</body></html>',
    ].join('');
    // Pass null deckTitle so brief drives the cover (deckTitle '슬라이드' would
    // pin as preferred and short-circuit `isGenericDeckArtifactTitle`).
    const healed = healSparseDeckCoverLayout(ibStub, '삼각함수', null);
    // Rebuild fired — coverTitle came from brief ('삼각함수'). The URL in the
    // stub was not derived because it wasn't the brief.
    expect(healed).toContain('h1 class="display"');
    expect(healed).toContain('삼각함수');
    expect(healed).not.toContain('www.teamver.com 사이');
  });
});
