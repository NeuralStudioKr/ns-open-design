import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  extractOfficialDeckLookAssets,
  LOOK_NEUTRALIZE_CSS,
  mergeOfficialDeckLookCss,
} from '../src/html/deck-template-look-css';
import {
  healOfficialMagazineLayoutDensity,
  healSparseOfficialMagazineCover,
  repairCompactFirstFillMarkup,
  stripEmptyOfficialTextChromeMotifs,
} from '../src/html/heal-official-magazine-layout';
import { pinDeckSlidesToFixedCanvas } from '../src/html/deck-fixed-canvas';

const IB_EXAMPLE = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../plugins/_official/examples/ib-pitch-book/example.html',
);

const BRIEF = '영어 회화 표현 공부 팁, 예시에 대한 발표자료 만들어줘';

const SPARSE_COVER = `<!doctype html>
<html lang="ko"><head>
  <meta charset="utf-8" />
</head><body>
<section class="slide slide-title" style="width:1920px;height:1080px;box-sizing:border-box;overflow:visible;display:flex;flex-direction:column;justify-content:center;padding:80px 88px">
<span data-od-official-motif-html="" class="ribbon" style="position:absolute;pointer-events:none;z-index:1"></span>
<div data-od-slide-flow="" style="display:flex;flex-direction:column;justify-content:center;overflow:visible;padding:80px 88px;box-sizing:border-box">
<h1>영어 회화 표현 공부 팁, 예시에</h1></div></section>
<section class="slide" style="width:1920px;height:1080px">
<div data-od-official-motif-html="" class="stamp" style="position:absolute;pointer-events:none;z-index:1">
  <div class="lab"></div><div class="who"></div><div class="det"><br><br></div>
</div>
<div data-od-slide-flow="">
  <h2>문법으로 외운 회화는 왜 입에서 안 나올까</h2>
  <p="">한국인 학습자가 가장 자주 만나는 벽은 알면서도 말하지 못하는 간극입니다.</p="">
  <div>첫 만남 · Small talk</div> · Small talk</div>
</div>
</section>
</body></html>`;

describe('heal official magazine layout density', () => {
  it('LOOK_NEUTRALIZE does not restack the slide flow clip wrapper', () => {
    expect(LOOK_NEUTRALIZE_CSS).toMatch(/:not\(\[data-od-slide-flow\]\)/);
  });

  it('does not extract empty IB ribbon/stamp as Motif', () => {
    const official = readFileSync(IB_EXAMPLE, 'utf8');
    const assets = extractOfficialDeckLookAssets(official);
    expect(assets?.css).toMatch(/h1\.display/);
    const motif = (assets?.motifHtml ?? []).join('\n');
    expect(motif).not.toMatch(/class="[^"]*\bribbon\b[^"]*"/i);
    expect(motif).not.toMatch(/<span[^>]*\bribbon\b[^>]*>\s*<\/span>/i);
    expect(motif).not.toMatch(/class="[^"]*\bstamp\b[^"]*"[^>]*>\s*<div class="lab">/i);
  });

  it('merge + heal turns the truncated cover into a magazine title', () => {
    const official = readFileSync(IB_EXAMPLE, 'utf8');
    const assets = extractOfficialDeckLookAssets(official);
    const merged = mergeOfficialDeckLookCss(SPARSE_COVER, assets);
    expect(merged).not.toMatch(/<span[^>]*\bribbon\b[^>]*>\s*<\/span>/i);

    const healed = healOfficialMagazineLayoutDensity(merged, BRIEF);
    expect(healed).toMatch(/<h1 class="display">/);
    expect(healed).toMatch(/영어 회화 표현/);
    expect(healed).not.toMatch(/영어 회화 표현 공부 팁, 예시에<\/h1>/);
    expect(healed).toMatch(/<span class="ribbon">[^<]+<\/span>/);
    expect(healed).toMatch(/class="slide-inner"/);
    expect(healed).toMatch(/class="cover-meta"/);
    expect(healed).toMatch(/문법으로 외운 회화/);
    expect(healed).not.toMatch(/Hartfield|NorthPeak|WACC/i);
    expect(healed).not.toMatch(/<\/p="">/);
    expect(healed).not.toMatch(/<\/div>\s*·\s*Small talk/);
    expect(healed).toMatch(/첫 만남 · Small talk/);
  });

  it('strips empty official ribbon/stamp shells and repairs first-fill tags', () => {
    const stripped = stripEmptyOfficialTextChromeMotifs(SPARSE_COVER);
    expect(stripped).not.toMatch(/class="ribbon"/);
    expect(stripped).not.toMatch(/class="stamp"/);

    const repaired = repairCompactFirstFillMarkup(SPARSE_COVER);
    expect(repaired).not.toMatch(/<\/p="">/);
    expect(repaired).toMatch(/<\/p>/);
    expect(repaired).not.toMatch(/<\/div>\s*·\s*Small talk/);
    expect(repaired).toMatch(/첫 만남 · Small talk/);
  });

  it('does not rebuild a dense official IB cover', () => {
    const official = readFileSync(IB_EXAMPLE, 'utf8').replace(
      '<style>',
      '<style data-od-official-look-css>',
    );
    const healed = healSparseOfficialMagazineCover(official, 'Hartfield Board materials');
    expect(healed).toContain('Project');
    expect(healed).toContain('Atlas');
    expect(healed).toContain('NorthPeak');
    expect(healed).toMatch(/h1 class="display"/);
  });

  it('pin + neutralize upgrade keeps flow out of the relative stacking rule', () => {
    const official = readFileSync(IB_EXAMPLE, 'utf8');
    const assets = extractOfficialDeckLookAssets(official);
    const merged = mergeOfficialDeckLookCss(SPARSE_COVER, assets);
    const healed = healOfficialMagazineLayoutDensity(merged, BRIEF);
    const pinned = pinDeckSlidesToFixedCanvas(healed);
    expect(pinned).toMatch(/data-od-slide-flow/);
    expect(pinned).toMatch(/:not\(\[data-od-slide-flow\]\)/);
    expect(pinned).toMatch(/<h1 class="display">/);
  });
});
