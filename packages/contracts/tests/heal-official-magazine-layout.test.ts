import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  extractOfficialDeckLookAssets,
  LOOK_NEUTRALIZE_CSS,
  mergeOfficialDeckLookCss,
} from '../src/html/deck-template-look-css';
import { healDeckHtmlForStandaloneExport } from '../src/html/deckPdfExport';
import {
  healOfficialMagazineLayoutDensity,
  healSparseLeftoverCoverComposition,
  healSparseOfficialMagazineCover,
  peelMisplacedBodyChromeFromCapsuleCover,
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
    expect(LOOK_NEUTRALIZE_CSS).toContain('od-slide-inner-canvas-fill');
    expect(LOOK_NEUTRALIZE_CSS).toContain('od-slide-inner-min-fill');
    expect(LOOK_NEUTRALIZE_CSS).toContain('od-magazine-optical-place');
    expect(LOOK_NEUTRALIZE_CSS).toContain('od-magazine-body-spread');
    expect(LOOK_NEUTRALIZE_CSS).toContain('od-magazine-body-fill');
    expect(LOOK_NEUTRALIZE_CSS).toContain('od-magazine-lede-fill');
    expect(LOOK_NEUTRALIZE_CSS).toContain('od-magazine-cover-solo');
    expect(LOOK_NEUTRALIZE_CSS).toContain('od-magazine-title-fill');
    expect(LOOK_NEUTRALIZE_CSS).toContain('od-look-slot-flow');
    expect(LOOK_NEUTRALIZE_CSS).toContain('od-look-slot-flow-ext');
    expect(LOOK_NEUTRALIZE_CSS).toContain('od-sibling-chrome-above-flow');
    expect(LOOK_NEUTRALIZE_CSS).toMatch(
      /\.slide\s+\.od-magazine-title-fill\s+h2\.section[\s\S]*font-size:\s*72px\s*!important/,
    );
    expect(LOOK_NEUTRALIZE_CSS).toMatch(
      /\.slide\.cover\s+\.body:not\(:has\(\.cover-meta\)\)/,
    );
    expect(LOOK_NEUTRALIZE_CSS).toMatch(
      /\.slide\s+\.slide-inner\s+h2\.section[\s\S]*font-size:\s*56px\s*!important/,
    );
    expect(LOOK_NEUTRALIZE_CSS).toMatch(
      /\.slide\.cover\s+\.body[\s\S]*align-items:\s*center\s*!important/,
    );
    expect(LOOK_NEUTRALIZE_CSS).toMatch(
      /\[data-od-slide-flow\]:has\(\.slide-inner\)[\s\S]*padding:\s*0\s*!important/,
    );
    expect(LOOK_NEUTRALIZE_CSS).toMatch(
      /\.slide\s+\.slide-inner[\s\S]*width:\s*100%\s*!important/,
    );
    const innerFillBlock = LOOK_NEUTRALIZE_CSS.match(
      /od-slide-inner-canvas-fill:[\s\S]*?od-magazine-optical-place/,
    )?.[0] ?? '';
    expect(innerFillBlock).toMatch(/min-height:\s*100%\s*!important/);
    expect(innerFillBlock).not.toMatch(/min-height:\s*0\s*!important/);
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

  it('heals a stub cover when official look CSS is only a fragment sheet', () => {
    const fragment = [
      '<!doctype html><html><head></head><body>',
      '<section class="slide slide-title" style="display:flex;justify-content:center">',
      '<h1>영어 회화 표현 공부 팁, 예시에</h1>',
      '</section>',
      '<style data-od-official-look-css>.cover h1.display{font-size:96px}</style>',
      '<section class="slide"><h2>문법으로 외운 회화는 왜 입에서 안 나올까</h2></section>',
      '</body></html>',
    ].join('');
    const healed = healOfficialMagazineLayoutDensity(fragment, BRIEF);
    expect(healed).toMatch(/<h1 class="display">/);
    expect(healed).toMatch(/cover-meta/);
    expect(healed).toMatch(/문법으로 외운 회화/);
    expect(healed).not.toMatch(/English Speaking Tips|쉐도잉|In context/i);
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
    expect(healed).toMatch(/style="[^"]*width:100%;min-height:100%/);
    expect(healed).toMatch(/class="cover-meta"/);
    expect(healed).toMatch(/<h2 class="section">/);
    expect(healed).not.toMatch(/class="od-magazine-sparse-spread"/);
    expect(healed).toMatch(/class="body"[^>]*justify-content:flex-start/);
    expect(healed).not.toMatch(/class="body"[^>]*justify-content:center/);
    expect(healed).toMatch(/class="lede"/);
    expect(healed).toMatch(/class="body"[^>]*height:100%/);
    expect(healed).toMatch(/문법으로 외운 회화/);
    expect(healed).not.toMatch(/Hartfield|NorthPeak|WACC/i);
    expect(healed).not.toMatch(/English Speaking Tips|쉐도잉 루틴|In context/i);
    expect(healed).not.toMatch(/Study Notes/i);
    expect(healed).toMatch(/학습 노트/);
    expect(healed).not.toMatch(/<\/p="">/);
    expect(healed).not.toMatch(/<\/div>\s*·\s*Small talk/);
    expect(healed).not.toMatch(/첫 만남 · Small talk/);
    expect(healed).not.toMatch(/개요|핵심 포인트|다음 단계|핵심 내용을 한 장에/);
    expect(healed).not.toMatch(
      /<section\b[^>]*\bcover\b[^>]*style="[^"]*\bdisplay\s*:\s*flex/i,
    );
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
    expect(repairCompactFirstFillMarkup(
      '<div>의견 표현 · Agree / Disagree · Agree / Disagree</div>',
    )).toBe('<div>의견 표현 · Agree / Disagree</div>');
    expect(repairCompactFirstFillMarkup(
      '<div>첫 만남 · Small talk</div> · Small talk<section class="slide">',
    )).toBe('<div>첫 만남 · Small talk</div><section class="slide">');
    expect(repairCompactFirstFillMarkup(
      '<div>바로 쓸 표현</div> 첫 만남 - Small talk<section class="slide">',
    )).toBe('<div>바로 쓸 표현</div><section class="slide">');
    expect(stripEmptyOfficialTextChromeMotifs(
      '<div class="demo-banner"></div><span class="demo-pill">  </span><h2>Keep</h2>',
    )).toBe('<h2>Keep</h2>');
  });

  it('does not rewrite Daisy, Studio, or weekly-update sparse covers into IB magazine chrome', () => {
    const daisy = join(
      dirname(fileURLToPath(import.meta.url)),
      '../../../plugins/_official/examples/html-ppt-zhangzara-daisy-days/example.html',
    );
    const weekly = join(
      dirname(fileURLToPath(import.meta.url)),
      '../../../plugins/_official/examples/weekly-update/example.html',
    );
    const studio = join(
      dirname(fileURLToPath(import.meta.url)),
      '../../../plugins/_official/examples/html-ppt-zhangzara-studio/example.html',
    );
    const sparse = `<!doctype html><html lang="ko"><body>
<section class="slide slide-title" style="width:1920px;height:1080px">
<h1>Linux Internals for Senior Engineers</h1></section>
<section class="slide"><h2>Body</h2><p>Keep this page.</p></section>
</body></html>`;
    for (const examplePath of [daisy, weekly, studio]) {
      const assets = extractOfficialDeckLookAssets(readFileSync(examplePath, 'utf8'));
      const merged = mergeOfficialDeckLookCss(sparse, assets);
      const healed = healOfficialMagazineLayoutDensity(merged, 'Linux internals explainer');
      expect(healed, examplePath).toContain('Linux Internals for Senior Engineers');
      expect(healed, examplePath).not.toMatch(/English Speaking|학습 노트|쉐도잉/i);
      expect(healed, examplePath).not.toMatch(/<h1 class="display">/);
    }
  });

  it('uses later slide titles instead of inventing topic copy', () => {
    const official = readFileSync(IB_EXAMPLE, 'utf8');
    const assets = extractOfficialDeckLookAssets(official);
    const expo = `<!doctype html><html lang="ko"><body>
<section class="slide slide-title" style="width:1920px;height:1080px"><h1>expo 소개</h1></section>
<section class="slide"><h2>설치</h2><p>SDK를 설치합니다.</p></section>
</body></html>`;
    const healed = healOfficialMagazineLayoutDensity(
      mergeOfficialDeckLookCss(expo, assets),
      'expo에 대해서 설명하는 피피티 만들어줘',
    );
    expect(healed).toMatch(/expo/i);
    expect(healed).toMatch(/설치/);
    expect(healed).toMatch(/<h2 class="section">설치<\/h2>/);
    expect(healed).toMatch(/style="[^"]*width:100%;min-height:100%/);
    expect(healed).not.toMatch(/쉐도잉|English Speaking Tips|회화 표현/i);
    expect(healed).not.toMatch(/개요|핵심 포인트|다음 단계|핵심 내용을 한 장에/);
  });

  it('does not promote leftover outline chips or invent a cover TOC', () => {
    const official = readFileSync(IB_EXAMPLE, 'utf8');
    const assets = extractOfficialDeckLookAssets(official);
    const leftoverOnly = `<!doctype html><html lang="ko"><body>
<section class="slide slide-title"><h1>영어 회화 표현 공부 팁, 예시에</h1></section>
<section class="slide"><p>예시를 중심으로 바로 쓸 문장을 정리합니다.</p>
<div>첫 만남 · Small talk</div> · Small talk</div>
</section>
</body></html>`;
    const healed = healOfficialMagazineLayoutDensity(
      mergeOfficialDeckLookCss(leftoverOnly, assets),
      BRIEF,
    );
    expect(healed).toMatch(/예시를 중심으로 바로 쓸 문장/);
    expect(healed).toMatch(/class="subhead">예시를 중심으로 바로 쓸 문장/);
    expect(healed).toMatch(/od-magazine-cover-solo/);
    expect(healed).not.toMatch(/class="cover-meta"/);
    expect(healed).not.toMatch(/첫 만남 · Small talk/);
    expect(healed).not.toMatch(/class="od-magazine-sparse-spread"/);
    expect(healed).not.toMatch(/개요|핵심 포인트|다음 단계|핵심 내용을 한 장에/);
    expect(healed).not.toMatch(/English Speaking Tips|쉐도잉|In context/i);
  });

  it('scrubs leftover from an already-framed magazine inner', () => {
    const official = readFileSync(IB_EXAMPLE, 'utf8');
    const assets = extractOfficialDeckLookAssets(official);
    const framed = `<!doctype html><html lang="ko"><body>
<section class="slide cover">
  <div class="slide-inner">
    <header class="mast"><div class="brand">영어 회화</div></header>
    <div class="body">
      <h1 class="display">영어 회화 표현 공부 팁</h1>
      <div class="cover-meta">
        <div class="row"><span class="k">01</span><span class="v">첫 만남 · Small talk</span></div>
        <div class="row"><span class="k">02</span><span class="v">바로 쓸 표현</span></div>
      </div>
    </div>
  </div>
</section>
<section class="slide">
  <div class="slide-inner">
    <h2 class="section">바로 쓸 표현</h2>
    <p>Nice to meet you.</p>
    <li>첫 만남 - Small talk</li>
  </div>
</section>
</body></html>`;
    const healed = healOfficialMagazineLayoutDensity(
      mergeOfficialDeckLookCss(framed, assets),
      BRIEF,
    );
    expect(healed).toContain('영어 회화 표현 공부 팁');
    expect(healed).toContain('바로 쓸 표현');
    expect(healed).toContain('Nice to meet you.');
    expect(healed).not.toMatch(/첫 만남 · Small talk/);
    expect(healed).not.toMatch(/첫 만남 - Small talk/);
    expect(healed).toMatch(/<h1 class="display">/);
  });

  it('does not invent 슬라이드 when preview heal has no brief', () => {
    const official = readFileSync(IB_EXAMPLE, 'utf8');
    const assets = extractOfficialDeckLookAssets(official);
    const emptyTitle = `<!doctype html><html lang="ko"><body>
<section class="slide slide-title"><h1></h1></section>
<section class="slide"><h2>바로 쓸 표현</h2><p>Nice to meet you.</p></section>
</body></html>`;
    const healed = healOfficialMagazineLayoutDensity(
      mergeOfficialDeckLookCss(emptyTitle, assets),
    );
    expect(healed).not.toMatch(/<h1 class="display">/);
    expect(healed).not.toMatch(/학습 노트/);
    expect(healed).toContain('바로 쓸 표현');
  });

  it('polishes an existing stub title when preview heal has no brief', () => {
    const official = readFileSync(IB_EXAMPLE, 'utf8');
    const assets = extractOfficialDeckLookAssets(official);
    const stub = `<!doctype html><html lang="ko"><body>
<section class="slide slide-title"><h1>영어 회화 표현 공부 팁, 예시에</h1></section>
<section class="slide"><h2>바로 쓸 표현</h2><p>Nice to meet you.</p></section>
</body></html>`;
    const healed = healOfficialMagazineLayoutDensity(
      mergeOfficialDeckLookCss(stub, assets),
    );
    expect(healed).toMatch(/<h1 class="display">/);
    expect(healed).toMatch(/영어 회화 표현 공부 팁/);
    expect(healed).not.toMatch(/English Speaking Tips|쉐도잉/i);
  });

  it('keeps requested Hangul middle-dot copy and does not two-pane a leftover aside', () => {
    const official = readFileSync(IB_EXAMPLE, 'utf8');
    const assets = extractOfficialDeckLookAssets(official);
    const hangulDot = `<!doctype html><html lang="ko"><body>
<section class="slide slide-title"><h1>영어 회화</h1></section>
<section class="slide"><h2>연습 순서</h2>
<p>짧게 말해 본 뒤 바로 고쳐 씁니다.</p>
<div>듣기 · 따라 말하기</div>
<li>첫 만남 - Small talk</li>
</section>
</body></html>`;
    const healed = healOfficialMagazineLayoutDensity(
      mergeOfficialDeckLookCss(hangulDot, assets),
      BRIEF,
    );
    expect(healed).toMatch(/듣기 · 따라 말하기/);
    expect(healed).not.toMatch(/첫 만남 - Small talk/);
    expect(healed).not.toMatch(/class="od-magazine-sparse-spread"/);
  });

  it('two-panes only requested asides, not leftover · chips', () => {
    const official = readFileSync(IB_EXAMPLE, 'utf8');
    const assets = extractOfficialDeckLookAssets(official);
    const requested = `<!doctype html><html lang="ko"><body>
<section class="slide slide-title"><h1>영어 회화</h1></section>
<section class="slide"><h2>연습 순서</h2>
<p>짧게 말해 본 뒤 바로 고쳐 씁니다.</p>
<div>듣기 연습</div>
<div>따라 말하기</div>
</section>
</body></html>`;
    const healed = healOfficialMagazineLayoutDensity(
      mergeOfficialDeckLookCss(requested, assets),
      BRIEF,
    );
    expect(healed).toMatch(/class="od-magazine-sparse-spread"/);
    expect(healed).toMatch(/듣기 연습/);
    expect(healed).toMatch(/따라 말하기/);
    expect(healed).not.toMatch(/첫 만남 · Small talk/);
  });

  it('keeps an on-brief cover that already has title and prose', () => {
    const official = readFileSync(IB_EXAMPLE, 'utf8');
    const assets = extractOfficialDeckLookAssets(official);
    const onBrief = `<!doctype html><html lang="ko"><body>
<section class="slide"><h1>영어 회화 표현 공부 팁</h1>
<p>예시를 중심으로 바로 쓸 문장을 정리합니다.</p></section>
<section class="slide"><h2>바로 쓸 표현</h2><p>Nice to meet you.</p></section>
</body></html>`;
    const healed = healOfficialMagazineLayoutDensity(
      mergeOfficialDeckLookCss(onBrief, assets),
      BRIEF,
    );
    expect(healed).toContain('영어 회화 표현 공부 팁');
    expect(healed).toContain('예시를 중심으로 바로 쓸 문장을 정리합니다.');
    expect(healed).not.toMatch(/<h1 class="display">/);
    expect(healed).not.toMatch(/학습 노트/);
  });

  it('starts dense magazine body copy at the top of the 16:9 page', () => {
    const official = readFileSync(IB_EXAMPLE, 'utf8');
    const assets = extractOfficialDeckLookAssets(official);
    const dense = `<!doctype html><html lang="ko"><body>
<section class="slide slide-title"><h1>영어 회화</h1></section>
<section class="slide"><h2>단계별 연습</h2>
<p>${'회화는 짧은 문장을 반복해서 입 근육에 익힙니다. '.repeat(16)}</p>
<ul><li>듣기</li><li>따라 말하기</li><li>바꿔 말하기</li><li>실제 대화</li><li>복습</li></ul>
</section>
</body></html>`;
    const healed = healOfficialMagazineLayoutDensity(
      mergeOfficialDeckLookCss(dense, assets),
      BRIEF,
    );
    expect(healed).toMatch(/class="body"[^>]*justify-content:flex-start/);
    expect(healed).toMatch(/class="body"[^>]*height:100%/);
    expect(healed).toMatch(/class="od-magazine-fill-track"/);
  });

  it('grows a title+lede body into the remaining 16:9 well', () => {
    const official = readFileSync(IB_EXAMPLE, 'utf8');
    const assets = extractOfficialDeckLookAssets(official);
    const ledeOnly = `<!doctype html><html lang="ko"><body>
<section class="slide slide-title"><h1>영어 회화</h1></section>
<section class="slide"><h2>문법으로 외운 회화는 왜 입에서 안 나올까</h2>
<p>한국인 학습자가 가장 자주 만나는 벽은 알면서도 말하지 못하는 간극입니다.</p>
</section>
</body></html>`;
    const healed = healOfficialMagazineLayoutDensity(
      mergeOfficialDeckLookCss(ledeOnly, assets),
      BRIEF,
    );
    expect(healed).toMatch(/class="od-magazine-lede-fill"/);
    expect(healed).toMatch(/class="lede"/);
    expect(healed).toMatch(/알면서도 말하지 못하는/);
    expect(healed).not.toMatch(/class="od-magazine-sparse-spread"/);
  });

  it('pins a 2×2 card grid into the magazine 1fr row instead of centering it', () => {
    const official = readFileSync(IB_EXAMPLE, 'utf8');
    const assets = extractOfficialDeckLookAssets(official);
    const cards = `<!doctype html><html lang="ko"><body>
<section class="slide slide-title"><h1>영어 회화</h1></section>
<section class="slide"><h2>바로 쓸 수 있는 표현</h2>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px">
<div><h3>첫 만남</h3><p>Nice to meet you.</p></div>
<div><h3>동의</h3><p>That makes sense.</p></div>
<div><h3>되묻기</h3><p>Could you say that again?</p></div>
<div><h3>마무리</h3><p>Let’s pick this up next time.</p></div>
</div>
</section>
</body></html>`;
    const healed = healOfficialMagazineLayoutDensity(
      mergeOfficialDeckLookCss(cards, assets),
      BRIEF,
    );
    expect(healed).toMatch(/class="od-magazine-fill-track"/);
    expect(healed).toMatch(/class="body"[^>]*justify-content:flex-start/);
    expect(healed).not.toMatch(/class="body"[^>]*justify-content:center/);
    expect(healed).toMatch(/바로 쓸 수 있는 표현/);
    expect(healed).toMatch(/Nice to meet you/);
  });

  it('reframes a sparse MiniMax slide-inner and fills a two-item list', () => {
    const official = readFileSync(IB_EXAMPLE, 'utf8');
    const assets = extractOfficialDeckLookAssets(official);
    const framed = `<!doctype html><html lang="ko"><body>
<section class="slide slide-title"><h1>영어 회화</h1></section>
<section class="slide">
<div class="slide-inner" style="width:min(1320px,92vw);height:min(820px,86vh)">
<h2>연습 순서</h2>
<p>짧게 말해 본 뒤 바로 고쳐 씁니다.</p>
<ul><li>듣기 연습</li><li>따라 말하기</li></ul>
</div>
</section>
</body></html>`;
    const healed = healOfficialMagazineLayoutDensity(
      mergeOfficialDeckLookCss(framed, assets),
      BRIEF,
    );
    expect(healed).toMatch(/class="od-magazine-fill-track"/);
    expect(healed).toMatch(/class="lede"/);
    expect(healed).toMatch(/듣기 연습/);
    expect(healed).toMatch(/따라 말하기/);
    expect(healed).toMatch(/class="slide-inner"[^>]*width:100%;min-height:100%/);
    expect(healed).not.toMatch(/class="slide-inner"[^>]*min\(1320px/);
    expect(healed).not.toMatch(
      /class="od-magazine-fill-track"[^>]*>[\s\S]*class="lede"/,
    );
  });

  it('grows a heading-only body into the remaining 16:9 well', () => {
    const official = readFileSync(IB_EXAMPLE, 'utf8');
    const assets = extractOfficialDeckLookAssets(official);
    const headingOnly = `<!doctype html><html lang="ko"><body>
<section class="slide slide-title"><h1>영어 회화</h1></section>
<section class="slide"><h2>문법으로 외운 회화는 왜 입에서 안 나올까</h2>
<div>첫 만남 · Small talk</div> · Small talk</div>
</section>
</body></html>`;
    const healed = healOfficialMagazineLayoutDensity(
      mergeOfficialDeckLookCss(headingOnly, assets),
      BRIEF,
    );
    expect(healed).toMatch(/class="od-magazine-title-fill"/);
    expect(healed).toMatch(/<h2 class="section">문법으로 외운 회화는 왜 입에서 안 나올까<\/h2>/);
    expect(healed).not.toMatch(/첫 만남 · Small talk/);
    expect(healed).not.toMatch(/class="od-magazine-lede-fill"/);
    expect(healed).not.toMatch(/class="od-magazine-fill-track"/);
    expect(healed).not.toMatch(/개요|핵심 포인트|쉐도잉|English Speaking Tips/i);
  });

  it('keeps the lede above a list instead of swallowing it into the fill track', () => {
    const official = readFileSync(IB_EXAMPLE, 'utf8');
    const assets = extractOfficialDeckLookAssets(official);
    const mixed = `<!doctype html><html lang="ko"><body>
<section class="slide slide-title"><h1>영어 회화</h1></section>
<section class="slide"><h2>연습 순서</h2>
<div>짧게 말해 본 뒤 바로 고쳐 씁니다.</div>
<ul><li>듣기 연습</li><li>따라 말하기</li></ul>
</section>
</body></html>`;
    const healed = healOfficialMagazineLayoutDensity(
      mergeOfficialDeckLookCss(mixed, assets),
      BRIEF,
    );
    expect(healed).toMatch(/class="lede">짧게 말해 본 뒤 바로 고쳐 씁니다\./);
    expect(healed).toMatch(/class="od-magazine-fill-track"/);
    expect(healed).toMatch(/듣기 연습/);
    expect(healed).not.toMatch(
      /class="od-magazine-fill-track"[^>]*>[\s\S]*class="lede"/,
    );
    expect(healed).not.toMatch(/class="od-magazine-lede-fill"/);
    expect(healed).not.toMatch(/English Speaking Tips|쉐도잉|개요|핵심 포인트/i);
  });

  it('does not reframe a dense official IB body slide-inner', () => {
    const official = readFileSync(IB_EXAMPLE, 'utf8').replace(
      '<style>',
      '<style data-od-official-look-css>',
    );
    const healed = healOfficialMagazineLayoutDensity(official, 'Hartfield Board materials');
    expect(healed).toContain('NorthPeak');
    expect(healed).toContain('Disclaimers, sources');
    expect(healed).not.toMatch(/od-magazine-lede-fill/);
    expect(healed).not.toMatch(/od-magazine-fill-track/);
    expect(healed).not.toMatch(/od-magazine-cover-solo/);
    expect(healed).not.toMatch(/od-magazine-title-fill/);
  });

  it('does not scrub official IB catalog copy as leftover', () => {
    const official = readFileSync(IB_EXAMPLE, 'utf8').replace(
      '<style>',
      '<style data-od-official-look-css>',
    );
    const healed = healOfficialMagazineLayoutDensity(official, 'Hartfield Board materials');
    expect(healed).toContain('Hartfield');
    expect(healed).toContain('Board of Directors');
    expect(healed).toContain('NorthPeak');
    expect(healed).toContain('Project');
    expect(healed).toContain('Atlas');
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
    expect(pinned).toContain('od-slide-inner-canvas-fill');
    expect(pinned).toContain('od-slide-inner-min-fill');
    expect(pinned).toContain('od-magazine-optical-place');
    expect(pinned).toContain('od-magazine-body-spread');
    expect(pinned).toContain('od-magazine-body-fill');
    expect(pinned).toContain('od-magazine-lede-fill');
    expect(pinned).toContain('od-magazine-cover-solo');
    expect(pinned).toContain('od-magazine-title-fill');
    expect(pinned).toMatch(/style="[^"]*width:100%;min-height:100%/);
    expect(pinned).not.toMatch(/data-od-slide-flow[^>]*padding:80px/);
    expect(pinned).not.toMatch(/data-od-slide-flow[^>]*justify-content:center/);
    expect(pinned).toMatch(
      /\[data-od-slide-flow\]:has\(\.slide-inner\)[\s\S]*padding:\s*0\s*!important/,
    );
  });

  it('leaves catalog IB presenter paper at 1320×820 even if pin CSS is injected', () => {
    const official = readFileSync(IB_EXAMPLE, 'utf8');
    expect(official).toMatch(/width:\s*min\(1320px/);
    const pinned = pinDeckSlidesToFixedCanvas(official);
    expect(pinned).toMatch(/width:\s*min\(1320px/);
    const pinCss = pinned.match(
      /<style data-od-deck-fixed-canvas-pin>[\s\S]*?<\/style>/i,
    )?.[0] ?? '';
    expect(pinCss).not.toMatch(/^\s*\.slide\s*>\s*\.slide-inner\s*\{/m);
  });

  it('standalone export heals a sparse IB cover without inventing topic copy', () => {
    const official = readFileSync(IB_EXAMPLE, 'utf8');
    const assets = extractOfficialDeckLookAssets(official);
    const merged = mergeOfficialDeckLookCss(SPARSE_COVER, assets);
    const exported = healDeckHtmlForStandaloneExport(merged);
    expect(exported).toMatch(/<h1 class="display">/);
    expect(exported).toMatch(/영어 회화 표현/);
    expect(exported).toMatch(/문법으로 외운 회화/);
    expect(exported).not.toMatch(/English Speaking Tips|쉐도잉|In context/i);
    expect(exported).not.toMatch(/첫 만남 · Small talk/);
    expect(exported).not.toMatch(/<\/p="">/);
    expect(exported).toMatch(/:not\(\[data-od-slide-flow\]\)/);
  });

  it('heals biennale compact fill without IB magazine chrome or leftover prompt tails', () => {
    const brief = '영어 회화 공부, 연습 팁에 대한 발표자료';
    const biennale = `<!doctype html><html lang="ko"><body>
<section class="slide cover slide-title" style="width:1920px;height:1080px">
<div class="body" style="display:grid;grid-template-columns:1.3fr 1fr;gap:48px">
<div><span class="ribbon">Study Notes</span>
<h1 class="display">영어 회화 공부<br>연습 팁에 대한</h1>
<p class="subhead">하루 45분, 네 가지 리츄얼로 발화 회로 를 단련합니다</p></div>
<aside class="cover-meta"><div class="row"><div class="k">Brief</div><div class="v">영어 회화 공부, 연습 팁에 대한</div></div></aside>
</div>
<footer class="foot"><span class="conf">영어 회화 공부, 연습 팁에 대한</span></footer>
</section>
<section class="slide s-chapter" style="width:1920px;height:1080px;background:#0a0a0a"></section>
<section class="slide s-chapter" style="width:1920px;height:1080px;background:#0a0a0a;color:#E9E5DB">
<h1 style="color:#DCD6C4">왜 회화는<br><br>공부가 아니라<br><br><em>근육</em> 인가
<div style="margin-top:48px;color:#E9E5DB">성인 학습자는 문법·단어를 입력해도 회화에서 자동으로 끌어오지 못합니다.</div>
</h1>
<div style="width:560px;height:560px;position:relative;pointer-events:none">
<div style="position:relative;width:100%;height:100%;border-radius:50%;background:radial-gradient(circle,#F1EE2E,transparent)"></div>
<div style="position:relative;transform:translate(-50%,-50%)">1%</div>
</div>
</section>
<section class="slide s-data">
<h2>하루 45분</h2>
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:28px">
<div style="min-height:420px">Shadowing</div>
</div>
</section>
<section class="slide s-data">
<h2>일주일 회화 루틴 · <em>레시피 카드</em>
<div style="display:grid;grid-template-columns:repeat(2,1fr)"><div>Shado</div></div></h>
</section>
<style data-od-official-look-css>
:root { --paper:#E9E5DB; --sun:#F1EE2E; --ink:#1B2566; }
.display { font-family:'Instrument Serif',serif; }
.s-chapter { background: var(--paper); }
</style>
</body></html>`;
    const healed = healOfficialMagazineLayoutDensity(biennale, brief);
    expect(healed).toContain('영어 회화 공부');
    expect(healed).toContain('하루 45분, 네 가지 리츄얼로');
    expect(healed).toContain('발화 회로를');
    expect(healed).not.toMatch(/회로\s+를/);
    expect(healed).toContain('성인 학습자는 문법');
    expect(healed).toContain('Shadowing');
    expect(healed).toContain('레시피 카드');
    expect(healed).not.toMatch(/\bShado\b/);
    expect(healed).not.toMatch(/연습 팁에 대한/);
    expect(healed).not.toMatch(/Study Notes|Working notes/i);
    expect(healed).not.toMatch(/<\/h>/);
    expect(healed).not.toMatch(/<h1[^>]*>[\s\S]*성인 학습자[\s\S]*<\/h1>/);
    expect(healed).not.toMatch(/<br><br>/);
    expect(healed).not.toMatch(/class="cover-meta"/);
    expect(healed).toMatch(/class="slide s-cover"/);
    expect(healed).toMatch(/class="blocks"/);
    expect(healed).toMatch(/class="titlewrap"/);
    expect(healed).toMatch(/<h1 class="title">/);
    expect(healed).toMatch(/class="subline"/);
    expect(healed).toMatch(/class="stack"/);
    expect(healed).toMatch(/<h1 class="ttl">/);
    expect(healed).toMatch(/class="lede"/);
    expect(healed).toMatch(/class="glow"/);
    expect(healed).toMatch(/class="frame"/);
    expect(healed).toMatch(/class="head"/);
    expect(healed).toMatch(/class="stat"/);
    expect(healed).toMatch(/class="v">Shadowing/);
    expect(healed).not.toMatch(/class="chart"/);
    expect(healed).toMatch(/data-od-biennale-sparse-fill/);
    expect(healed).toMatch(/:not\(:has\(\.footer-row\)\)/);
    expect(healed).toMatch(/:not\(:has\(\.nm\)\)/);
    expect(healed).not.toMatch(/class="nm"|vrail/);
    expect(healed).not.toMatch(/class="(?:mast|ribbon|display|foot|conf)"/);
    expect((healed.match(/<section\b[^>]*\bslide\b/gi) ?? []).length).toBe(4);
    expect(healed).not.toMatch(/학습 노트|핵심 내용을 한 장에|English Speaking Tips|쉐도잉/i);
    expect(healed).toMatch(/s-chapter[^>]*background:var\(--paper\)/);
    expect(healed).toMatch(/color:var\(--ink\)/);
    expect(healed).not.toMatch(/(?<![\w-])color\s*:\s*#(?:E9E5DB|DCD6C4)\b/i);
    expect(healed).toContain('--paper:#E9E5DB');
    expect(healed).toContain('#F1EE2E');
    expect(healed).toMatch(/width:560px;height:560px;position:absolute/);
    expect(healed).toMatch(/position:absolute;width:100%;height:100%;border-radius:50%;background:radial-gradient/);
    expect(healed).toMatch(/position:absolute;transform:translate\(-50%,-50%\)/);

    const pinned = pinDeckSlidesToFixedCanvas(healed);
    expect(pinned).toMatch(/width:560px;height:560px;position:absolute/);
    expect(pinned).toMatch(/position:absolute;transform:translate\(-50%,-50%\)/);
    expect(pinned).toMatch(/position:absolute;width:100%;height:100%;border-radius:50%;background:radial-gradient/);
  });

  it('does not invent Biennale chrome on the official example', () => {
    const official = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        '../../../plugins/_official/examples/html-ppt-zhangzara-biennale-yellow/example.html',
      ),
      'utf8',
    );
    const healed = healOfficialMagazineLayoutDensity(official);
    expect(healed).toContain('Aurora');
    expect(healed).toContain('date-rail');
    expect(healed).toContain('footer-row');
    expect(healed).toMatch(/class="nm"/);
    expect(healed).toMatch(/class="chart"/);
    expect(healed).toMatch(/class="qbody"/);
    expect(healed).not.toMatch(/학습 노트|English Speaking Tips/i);
  });
});

/**
 * User report 2026-09-04 — leftover IB magazine cover on Neutral body slides.
 * Title-only `h1.display` + footer echoing the title + undefined `--paper`.
 * Official look CSS is absent, so healSparseOfficialMagazineCover no-ops.
 */
const LEFTOVER_IB_NEUTRAL_COVER = `<!doctype html>
<html lang="ko"><head>
  <meta charset="utf-8" />
  <style data-od-deck-fixed-canvas-pin="">.slide{width:1920px!important;height:1080px!important}</style>
</head>
<body style="margin:0">
<section class="slide cover" style="width:1920px;height:1080px;box-sizing:border-box;overflow:visible;position:relative;background:var(--paper);color:var(--ink);padding:56px 72px 48px;border-top:6px solid var(--ink);display:grid;grid-template-rows:auto 1fr auto">
  <div data-od-slide-flow="" style="display:grid;grid-template-rows:auto 1fr auto;overflow:visible;color:var(--ink);padding:56px 72px 48px;box-sizing:border-box">
    <div class="body" style="display:grid;grid-template-columns:1fr;gap:48px;align-items:end;padding:24px 0 16px">
      <div><h1 class="display">팀버 소개</h1></div>
    </div>
    <footer class="foot" style="display:flex;justify-content:space-between;align-items:center;padding-top:14px;border-top:1px solid var(--rule)">
      <span class="conf">팀버 소개</span>
    </footer>
  </div>
</section>
<section class="slide" data-screen-label="02 What is Teamver" style="width:1920px;height:1080px;box-sizing:border-box;padding:80px 88px;background:#0f172a;color:#f8fafc;display:flex;flex-direction:column;justify-content:center;font-family:'Inter','Pretendard','Noto Sans KR',sans-serif">
  <div data-od-slide-flow style="display:flex;flex-direction:column;justify-content:center;font-family:'Inter','Pretendard','Noto Sans KR',sans-serif;color:#f8fafc;padding:80px 88px;box-sizing:border-box">
    <p style="font:600 20px/1 sans-serif;letter-spacing:.12em;color:#38bdf8;margin:0 0 24px">02</p>
    <h2 style="font:800 64px/1.05 sans-serif;margin:0 0 28px">팀단위로 일하는 사람들을 위한 새로운 협업 OS</h2>
    <p style="font:28px/1.6 sans-serif;margin:0;color:#cbd5e1;max-width:38rem">Teamver(팀버)는 프로젝트·조직·커뮤니케이션 데이터를 하나로 묶어, 분산된 팀이 한 화면에서 협업하도록 설계된 B2B SaaS 협업 플랫폼입니다.</p>
  </div>
</section>
<section class="slide" data-screen-label="03 Core Value" style="width:1920px;height:1080px;background:#f8fafc;color:#0f172a;font-family:'Inter','Pretendard',sans-serif">
  <p>03</p>
  <h2>도구 7개 · 로그인 7번</h2>
  <div>72%</div>
</section>
</body></html>`;

describe('heal leftover IB cover on Neutral body (loop427)', () => {
  it('does not rebuild the leftover Neutral cover through the official-look gate', () => {
    expect(healSparseOfficialMagazineCover(LEFTOVER_IB_NEUTRAL_COVER, '팀버 소개')).toBe(
      LEFTOVER_IB_NEUTRAL_COVER,
    );
  });

  it('composes the leftover cover with the slide-2 product lead and Neutral paint', () => {
    const healed = healOfficialMagazineLayoutDensity(LEFTOVER_IB_NEUTRAL_COVER, '팀버 소개');
    const cover = healed.slice(
      healed.search(/<section\b[^>]*\bcover\b/i),
      healed.search(/<section\b[^>]*data-screen-label="02/i),
    );
    expect(cover).toContain('팀버 소개');
    expect(cover).toContain('Teamver(팀버)는 프로젝트·조직·커뮤니케이션');
    expect(cover).toContain('data-od-cover-composed="neutral"');
    expect(cover).toMatch(/background:#0f172a/);
    expect(cover).toMatch(/color:#f8fafc/);
    expect(cover).toMatch(/font-family:'Inter','Pretendard'/);
    expect(cover).toMatch(/>01</);
    expect(cover).not.toMatch(/var\(--paper\)/);
    expect(cover).not.toMatch(/class="conf"/);
    expect(cover).not.toMatch(/학습 노트|Working notes/i);
    expect(cover).not.toMatch(/72%|2\.3x|100%/);
    expect(cover).not.toMatch(/class="mast"|class="ribbon"|class="slide-inner"/);
    expect(healed).toContain('data-od-deck-fixed-canvas-pin');
    expect(healed).toContain('팀단위로 일하는 사람들을 위한');
    expect(healed).toContain('72%');
  });

  it('is idempotent and does not steal the lead off slide 2', () => {
    const once = healSparseLeftoverCoverComposition(LEFTOVER_IB_NEUTRAL_COVER, '팀버 소개');
    const twice = healSparseLeftoverCoverComposition(once, '팀버 소개');
    expect(twice).toBe(once);
    expect((once.match(/Teamver\(팀버\)는 프로젝트/g) ?? []).length).toBe(2);
  });

  it('does not invent a Neutral slate cover on Daisy official look', () => {
    const daisy = join(
      dirname(fileURLToPath(import.meta.url)),
      '../../../plugins/_official/examples/html-ppt-zhangzara-daisy-days/example.html',
    );
    const sparse = `<!doctype html><html lang="ko"><body>
<section class="slide slide-title" style="width:1920px;height:1080px">
<h1>Linux Internals for Senior Engineers</h1></section>
<section class="slide"><h2>Body</h2><p>Keep this page.</p></section>
</body></html>`;
    const assets = extractOfficialDeckLookAssets(readFileSync(daisy, 'utf8'));
    const merged = mergeOfficialDeckLookCss(sparse, assets);
    const healed = healSparseLeftoverCoverComposition(merged, 'Linux internals explainer');
    expect(healed).toBe(merged);
  });
});

const CAPSULE_EXAMPLE = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../plugins/_official/examples/html-ppt-zhangzara-capsule/example.html',
);

describe('peel misplaced body chrome from Capsule cover (loop437)', () => {
  it('leaves the official English Capsule example untouched', () => {
    const official = readFileSync(CAPSULE_EXAMPLE, 'utf8');
    expect(peelMisplacedBodyChromeFromCapsuleCover(official)).toBe(official);
    expect(healOfficialMagazineLayoutDensity(official)).toContain('CAPSULE');
    expect(healOfficialMagazineLayoutDensity(official)).toContain('pillar-card');
  });

  it('peels pillar and neo cards off slide-1 and keeps title chrome', () => {
    const official = readFileSync(CAPSULE_EXAMPLE, 'utf8');
    const dumped = official.replace(
      '</h1>\n  </div>\n\n  <!-- SLIDE 2:',
      `</h1>
    <div class="cards-grid">
      <div class="pillar-card"><h3>핵심 기능</h3><p>직접적인 가치</p></div>
    </div>
    <div style="border:4px solid #000;box-shadow:6px 6px 0 #000">협업</div>
  </div>

  <!-- SLIDE 2:`,
    );
    expect(dumped).toContain('pillar-card');
    const peeled = peelMisplacedBodyChromeFromCapsuleCover(dumped);
    const cover = peeled.slice(
      peeled.search(/class="slide slide-1/),
      peeled.search(/SLIDE 2:/),
    );
    expect(cover).toContain('main-title');
    expect(cover).toContain('CAPSULE');
    expect(cover).toContain('deco-pills');
    expect(cover).toContain('title-pill');
    expect(cover).not.toContain('pillar-card');
    expect(cover).not.toContain('cards-grid');
    expect(cover).not.toContain('협업');
    expect(peeled).toMatch(/class="slide slide-3"[\s\S]*pillar-card/);
    expect(peelMisplacedBodyChromeFromCapsuleCover(peeled)).toBe(peeled);
    const viaDensity = healOfficialMagazineLayoutDensity(dumped, '팀버 소개');
    const densityCover = viaDensity.slice(
      viaDensity.search(/class="slide slide-1/),
      viaDensity.search(/SLIDE 2:/),
    );
    expect(densityCover).not.toContain('pillar-card');
    expect(densityCover).toContain('CAPSULE');
  });
});
