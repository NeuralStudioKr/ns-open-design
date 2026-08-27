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
    expect(LOOK_NEUTRALIZE_CSS).toContain('od-slide-inner-canvas-fill');
    expect(LOOK_NEUTRALIZE_CSS).toContain('od-slide-inner-min-fill');
    expect(LOOK_NEUTRALIZE_CSS).toContain('od-magazine-optical-place');
    expect(LOOK_NEUTRALIZE_CSS).toContain('od-magazine-body-spread');
    expect(LOOK_NEUTRALIZE_CSS).toContain('od-magazine-body-fill');
    expect(LOOK_NEUTRALIZE_CSS).toContain('od-magazine-lede-fill');
    expect(LOOK_NEUTRALIZE_CSS).toContain('od-magazine-cover-solo');
    expect(LOOK_NEUTRALIZE_CSS).toContain('od-magazine-title-fill');
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
});
