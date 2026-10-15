import { describe, expect, it } from 'vitest';

import {
  applyTemplateClonePromptFillLookMerge,
  briefLooksLikeGeneralKnowledgeHowToTopic,
  healAiGeneratedDeckMarkup,
  healOfficialMagazineLayoutDensity,
  healProductLaunchLeftoverCatalogCopy,
  stripCoverLedeDuplicatingCardKpi,
  htmlLooksLikeJsonLookSlotFill,
  htmlLooksLikeMixedLookAndOfficialRich,
  htmlLooksLikeOfficialRichDeck,
  injectSparseG2FillCss,
  neutralizeClonedDeckModelHtml,
} from '../src/index.js';

const PERSUASION = '읽히지 않는 글, 왜 매력적으로 들리지 않을까?';
const SECRET = '논리적 설득력의 비밀';

const JSON_LOOK_FRONT = [
  '<!doctype html><html lang="ko"><head><meta charset="utf-8"/><title>deck</title></head>',
  '<body class="tpl-product-launch">',
  '<section class="slide dark slide-title cover"><div data-od-slide-flow>',
  `<h1>${PERSUASION}</h1><p>웹 독자의 평균 이탈 결정 시간</p></div></section>`,
  '<section class="slide"><div data-od-slide-flow><h2>독자의 뇌는 8초 만에 떠난다</h2>',
  '<div class="grid g3"><div class="feature-card"><h4>8초</h4>',
  '<p>웹 독자의 평균 이탈 결정 시간</p></div></div></div></section>',
  '<section class="slide"><div data-od-slide-flow><h2>한 문단, 한 가지 메시지</h2>',
  '<div class="stack"><div class="step"><div class="n">1</div><div><h4>도입</h4></div></div></div>',
  '</div></section>',
  `<section class="slide"><div data-od-slide-flow><h2>${SECRET}</h2>`,
  '<div class="grid g2">',
  '<div class="feature-card"><h4>데이터</h4><p>통계와 수치는 신뢰의 기반이 되지만 출처를 명확히 밝혀야 합니다.</p></div>',
  '<div class="feature-card"><h4>사례</h4><p>실제 사용자의 경험담은 추상적 주장을 구체적인 이야기로 바꿔줍니다.</p></div>',
  '</div></div></section>',
  '</body></html>',
].join('');

const MIXED_LOOK_RICH = [
  JSON_LOOK_FRONT.replace('</body></html>', ''),
  '<section class="slide" style="background:linear-gradient(120deg,#ff5a36 0%,#ffb36b 100%)">',
  `<div data-od-slide-flow><h2 style="font-family:'Playfair Display',serif;font-size:88px">닫는 장</h2>`,
  '<p>모델이 쓴 리치 본문</p></div></section>',
  '</body></html>',
].join('');

const OFFICIAL_RICH_HOW_TO = [
  '<!doctype html><html lang="ko"><head><meta charset="utf-8"/>',
  `<title>${PERSUASION}</title>`,
  '<style data-od-official-look-css>.s-cover .titlewrap{bottom:80px}</style>',
  '</head><body class="tpl-product-launch">',
  '<section class="slide s-cover"><div data-od-slide-flow>',
  `<h1 class="title">${PERSUASION}</h1></div></section>`,
  '<section class="slide"><div data-od-slide-flow>',
  '<h2 style="font-family:\'Playfair Display\',serif">한 문단</h2>',
  '<p>문단마다 한 가지 결만 남긴다.</p></div></section>',
  '</body></html>',
].join('');

const LOOK_SEED = [
  '<!doctype html><html><body class="tpl-product-launch">',
  '<section class="slide"><h1>Cover</h1></section>',
  '<section class="slide"><h2>Two</h2><div class="grid g2"></div></section>',
  '<section class="slide"><h2>Three</h2></section>',
  '</body></html>',
].join('');

describe('1007-N01 슬라이스 K — how-to 판정 확장', () => {
  it('설득/읽히지 않는 글 브리프를 how-to 로 본다', () => {
    expect(briefLooksLikeGeneralKnowledgeHowToTopic(PERSUASION)).toBe(true);
    expect(briefLooksLikeGeneralKnowledgeHowToTopic(SECRET)).toBe(true);
    expect(briefLooksLikeGeneralKnowledgeHowToTopic('삼성전자 소개 발표자료')).toBe(false);
  });
});

describe('1007-N01 슬라이스 K — official-rich persist / LOOK salvage 금지', () => {
  it('how-to official-rich 는 look-css 를 유지하고 LOOK merge 하지 않는다', () => {
    const out = neutralizeClonedDeckModelHtml(OFFICIAL_RICH_HOW_TO, {
      brief: PERSUASION,
      deckTitle: PERSUASION,
    });
    expect(htmlLooksLikeOfficialRichDeck(out)).toBe(true);
    expect(out).toContain('data-od-official-look-css');
    expect(out).toContain('Playfair');
    expect(applyTemplateClonePromptFillLookMerge(LOOK_SEED, OFFICIAL_RICH_HOW_TO, {
      brief: PERSUASION,
    })).toBeNull();
  });

  it('json LOOK 만 있는 부분 덱은 official-rich 로 보지 않는다', () => {
    expect(htmlLooksLikeJsonLookSlotFill(JSON_LOOK_FRONT)).toBe(true);
    expect(htmlLooksLikeOfficialRichDeck(JSON_LOOK_FRONT)).toBe(false);
    expect(htmlLooksLikeMixedLookAndOfficialRich(MIXED_LOOK_RICH)).toBe(true);
    expect(applyTemplateClonePromptFillLookMerge(LOOK_SEED, MIXED_LOOK_RICH, {
      brief: PERSUASION,
    })).toBeNull();
  });
});

describe('1007-N01 슬라이스 K — 빈 step 축소 · g2 빈 하반신', () => {
  it('본문 없는 step 은 합성하지 않고 제거한다', () => {
    const out = healProductLaunchLeftoverCatalogCopy(JSON_LOOK_FRONT, PERSUASION);
    expect(out).toContain(SECRET);
    expect(out).toContain('통계와 수치는 신뢰의 기반');
    expect(out).not.toMatch(/<h4[^>]*>\s*도입\s*<\/h4>/);
    expect(out).not.toContain('class="step"');
  });

  it('g2 빈 하반신은 합성 카피 없이 stretch·센터 CSS 를 넣는다', () => {
    const injected = injectSparseG2FillCss(JSON_LOOK_FRONT);
    expect(injected).toContain('data-od-sparse-g2-fill');
    expect(injected).toContain('justify-content:center');
    expect(injected).toContain('.grid.g2');
    expect(injected).toContain('통계와 수치는 신뢰의 기반');
    const healed = healAiGeneratedDeckMarkup(JSON_LOOK_FRONT, PERSUASION);
    expect(healed).toContain('data-od-sparse-g2-fill');
    expect(healed).not.toMatch(/임의의|지금 다뤄야|핵심 질문/);
  });
});

describe('1007-N01 슬라이스 K — 커버 KPI lede 중복 제거', () => {
  it('뒤 장 feature-card KPI 와 같은 커버 lede 를 붙이지 않고, 이미 있으면 제거한다', () => {
    const stripped = stripCoverLedeDuplicatingCardKpi(JSON_LOOK_FRONT);
    const coverEnd = stripped.search(/<h2>\s*독자의 뇌는/);
    const cover = coverEnd > 0 ? stripped.slice(0, coverEnd) : stripped;
    expect(cover).toContain(PERSUASION);
    expect(cover).not.toContain('웹 독자의 평균 이탈 결정 시간');
    expect(stripped).toContain('웹 독자의 평균 이탈 결정 시간');
    const leftoverCover = JSON_LOOK_FRONT
      .replace('slide dark slide-title cover', 'slide cover')
      .replace('<h1>', '<h1 class="display">');
    const composed = healOfficialMagazineLayoutDensity(leftoverCover, PERSUASION);
    const composedCoverEnd = composed.search(/<h2>\s*독자의 뇌는/);
    const composedCover = composedCoverEnd > 0 ? composed.slice(0, composedCoverEnd) : composed;
    expect(composedCover).not.toContain('웹 독자의 평균 이탈 결정 시간');
  });
});

describe('1007-N01 슬라이스 K — G/F/H/I 불변', () => {
  it('how-to official-rich neutralize 는 feature-card LOOK 으로 바꾸지 않는다', () => {
    const out = neutralizeClonedDeckModelHtml(OFFICIAL_RICH_HOW_TO, {
      brief: '독자를 사로잡는 한 문장',
      deckTitle: '독자를 사로잡는 한 문장',
    });
    expect(out).toContain('data-od-official-look-css');
    expect(out).toContain('s-cover');
    expect(out).not.toContain('feature-card');
    expect(out).not.toContain('data-od-heading-count-reconciled');
  });
});
