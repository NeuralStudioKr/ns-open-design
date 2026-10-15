import { describe, it, expect } from 'vitest';

import {
  briefLooksLikeGeneralKnowledgeHowToTopic,
  neutralizeClonedDeckModelHtml,
} from '../src/template-clone-fill';
import {
  collapseTitleOnlyHowToContentSlides,
  healAiGeneratedDeckMarkup,
  stripIncompleteNumericPlaceholders,
} from '../src/html/heal-ai-generated-deck';

const WRITING_SENTENCE = '독자를 사로잡는 한 문장';
const WRITING_TIPS = '글을 매력적으로 쓰는 팁';

function officialRichHowToDeck(): string {
  return [
    '<!doctype html><html lang="ko"><head><meta charset="utf-8"/>',
    `<title>${WRITING_SENTENCE}</title>`,
    '<style data-od-official-look-css>.s-cover .titlewrap{bottom:80px}</style>',
    '</head><body class="tpl-product-launch">',
    `<section class="slide s-cover" data-title="Cover"><div data-od-slide-flow>`,
    `<h1 class="title">왜 '쓸모 있는 글'이 필요한가</h1>`,
    '<p>첫 문장이 기대를 잡지 못하면 독자는 3초 안에 떠난다.</p></div></section>',
    '<section class="slide"><div data-od-slide-flow>',
    ' <h2>3가지 비결 미리보기</h2>',
    '<p>첫 문장, 한 문장 한 메시지, 구체적 이미지.</p>',
    '<div style="display:grid;grid-template-columns:repeat(3,1fr)">',
    '<div class="card"><h3>첫 문장</h3><p>호기심을 한 줄에 압축한다.</p></div>',
    '<div class="card"><h3>한 메시지</h3><p>문단마다 한 가지 결만 남긴다.</p></div>',
    '<div class="card"><h3>이미지</h3><p>추상 명사 대신 감각 단어를 고른다.</p></div>',
    '</div></div></section>',
    '</body></html>',
  ].join('');
}

function titleOnlyHowToDeck(): string {
  return [
    '<!doctype html><html lang="ko"><head><title>deck</title></head><body>',
    `<section class="slide slide-title"><h1>${WRITING_SENTENCE}</h1></section>`,
    '<section class="slide center tc" data-title="Introducing"><h1>왜 쓸모 있는 글이 필요한가</h1></section>',
    '<section class="slide"><h2>비결 01 · 첫 문장</h2>',
    '<p>첫 문장에서 구체적 장면을 던지면 체류가 길어진다.</p></section>',
    '<section class="slide dark" data-title="Ship"><h2>비결 04 · 능동태의 힘</h2></section>',
    '<section class="slide center tc"><h1>비결 05 · 리듬과 호흡</h1></section>',
    '</body></html>',
  ].join('');
}

describe('1007-N01 슬라이스 G — how-to 판정기 (v1.4.16 경로)', () => {
  it('독자를 사로잡는 한 문장 / 글쓰기 팁을 how-to로 본다', () => {
    expect(briefLooksLikeGeneralKnowledgeHowToTopic(WRITING_SENTENCE)).toBe(true);
    expect(briefLooksLikeGeneralKnowledgeHowToTopic(`${WRITING_SENTENCE} 슬라이드 만들어줘`)).toBe(true);
    expect(briefLooksLikeGeneralKnowledgeHowToTopic(WRITING_TIPS)).toBe(true);
    expect(briefLooksLikeGeneralKnowledgeHowToTopic('영어 회화 공부법')).toBe(true);
    expect(briefLooksLikeGeneralKnowledgeHowToTopic('읽히지 않는 글, 왜 매력적으로 들리지 않을까?')).toBe(true);
    expect(briefLooksLikeGeneralKnowledgeHowToTopic('논리적 설득력의 비밀')).toBe(true);
    expect(briefLooksLikeGeneralKnowledgeHowToTopic('삼성전자 소개 발표자료')).toBe(false);
    expect(briefLooksLikeGeneralKnowledgeHowToTopic('')).toBe(false);
  });
});

describe('1007-N01 슬라이스 G — official-rich persist 후 LOOK 재작성 없음', () => {
  it('리치 how-to HTML은 neutralize 후에도 official-look-css·모델 구조를 유지한다', () => {
    const source = officialRichHowToDeck();
    const out = neutralizeClonedDeckModelHtml(source, {
      brief: WRITING_SENTENCE,
      deckTitle: WRITING_SENTENCE,
    });
    expect(out).toContain('data-od-official-look-css');
    expect(out).toContain('s-cover');
    expect(out).toContain("왜 '쓸모 있는 글'이 필요한가");
    expect(out).toContain('첫 문장이 기대를 잡지 못하면');
    expect(out).not.toContain('feature-card');
    expect(out).not.toContain('data-od-heading-count-reconciled');
    expect((out.match(/class="slide"/g) ?? []).length).toBe(
      (source.match(/class="slide"/g) ?? []).length,
    );
  });

  it('how-to heal은 heading-count-reconcile을 건너뛰고 모델 본문을 보존한다', () => {
    const source = officialRichHowToDeck().replace(
      '<h2>3가지 비결 미리보기</h2>',
      ' <h2>7가지 비결 미리보기</h2>',
    );
    const out = healAiGeneratedDeckMarkup(source, WRITING_SENTENCE);
    expect(out).not.toContain('data-od-heading-count-reconciled');
    expect(out).toContain('7가지 비결 미리보기');
    expect(out).toContain('호기심을 한 줄에 압축한다');
    expect(out).toContain('data-od-official-look-css');
  });
});

describe('1007-N01 슬라이스 G — 제목만 슬라이드 축소', () => {
  it('표지는 남기고 본문 없는 제목만 장을 제거한다', () => {
    const out = collapseTitleOnlyHowToContentSlides(titleOnlyHowToDeck(), WRITING_SENTENCE);
    expect(out).toContain(WRITING_SENTENCE);
    expect(out).toContain('비결 01 · 첫 문장');
    expect(out).toContain('첫 문장에서 구체적 장면을 던지면');
    expect(out).not.toContain('비결 04 · 능동태의 힘');
    expect(out).not.toContain('비결 05 · 리듬과 호흡');
    expect(out).not.toContain('왜 쓸모 있는 글이 필요한가');
  });

  it('엔티티 소개 브리프에서는 제목만 장을 지우지 않는다', () => {
    const out = collapseTitleOnlyHowToContentSlides(
      titleOnlyHowToDeck(),
      '삼성전자 소개 발표자료',
    );
    expect(out).toContain('비결 04 · 능동태의 힘');
    expect(out).toContain('비결 05 · 리듬과 호흡');
  });
});

describe('1007-N01 슬라이스 G — 빈 숫자 구절 날조 없이 제거', () => {
  it('이탈률은 %까지 문장을 지우고 60%는 남긴다', () => {
    const html = [
      '<section class="slide"><h2>비결 01</h2>',
      '<h4>2015년 미디엄 팀이 분석한 결과, 첫 문장이 약한 글의 이탈률은 %까지 치솟았다. 반대로 첫 문장에서 구체적 숫자나 감각을 던진 글은 평균 2.3배 더 오래 읽혔다.</h4>',
      '<p>30단어가 넘는 문장은 끝까지 읽히지 않을 확률이 60%에 달한다.</p>',
      '</section>',
    ].join('');
    const out = stripIncompleteNumericPlaceholders(html);
    expect(out).not.toContain('이탈률은 %까지');
    expect(out).not.toMatch(/(?<!\d)%까지/);
    expect(out).toContain('2.3배');
    expect(out).toContain('60%');
    expect(out).not.toMatch(/이탈률은\s+\d+%/);
  });
});
