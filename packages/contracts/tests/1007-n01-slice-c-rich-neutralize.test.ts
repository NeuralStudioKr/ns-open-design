import { describe, expect, it } from 'vitest';
import { neutralizeClonedDeckModelHtml } from '../src/template-clone-fill.js';

/**
 * 1007-N01 슬라이스 C — 리치(official-rich)/legacy prompt-fill 가 모델이 저작한
 * full HTML 을 그대로 persist 할 때(merge substance gate 가 raw 를 내보내는 경로),
 * JSON slot-fill 과 동일한 데크-레벨 주제오염 중립화·카탈로그 demo 스크럽이
 * 적용되는지(가드 우회 불가), 그리고 on-topic 리치 본문/밀도는 보존되는지
 * (임의 합성 주입 없음) 검증한다.
 */

const visibleText = (html: string): string =>
  html
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// 모델이 저작한 리치 덱: 2번째 슬라이드의 3-카드가 kit copy-pack 의 Teamver
// 하드코드 title(같은 보드/권한 경계/결과 이력)을 그대로 상속했다고 가정.
const RICH_MODEL_DECK = [
  '<!doctype html><html lang="ko"><head><style>.slide{width:1920px}</style></head><body>',
  '<section class="slide"><h1>React 상태 관리</h1>',
  '<p>React는 단순한 라이브러리가 아니라 "UI = f(state)" 모델로 상태를 선언적으로 다룬다.</p></section>',
  '<section class="slide"><div class="grid" style="grid-template-columns:repeat(3,1fr)">',
  '<div class="nb-card"><h3>같은 보드</h3><p>팀이 하나의 화면에서 함께 작업한다.</p></div>',
  '<div class="nb-card"><h3>권한 경계</h3><p>역할별로 접근 범위를 제한한다.</p></div>',
  '<div class="nb-card"><h3>결과 이력</h3><p>변경 사항을 시간순으로 추적한다.</p></div>',
  '</div></section>',
  '</body></html>',
].join('\n');

describe('1007-N01 슬라이스 C — neutralizeClonedDeckModelHtml (리치 persist 가드)', () => {
  it('non-Teamver 브리프: Teamver 하드코드 pack 카피를 토픽-중립으로 중립화', () => {
    const out = neutralizeClonedDeckModelHtml(RICH_MODEL_DECK, {
      brief: 'React 상태 관리의 핵심 개념을 소개하는 발표',
      deckTitle: 'React 상태 관리',
    });
    // Teamver 제품 특유 명명이 사라진다.
    expect(out).not.toContain('같은 보드');
    expect(out).not.toContain('권한 경계');
    expect(out).not.toContain('결과 이력');
    // 토픽-중립 명사구로 치환된다.
    expect(out).toContain('통합 화면');
    expect(out).toContain('역할 정의');
    expect(out).toContain('변경 이력');
  });

  it('모델의 on-topic 리치 본문/밀도/슬라이드 수를 보존(합성 주입·슬라이드 삭감 없음)', () => {
    const out = neutralizeClonedDeckModelHtml(RICH_MODEL_DECK, {
      brief: 'React 상태 관리',
      deckTitle: 'React 상태 관리',
    });
    // 정상 본문은 그대로.
    expect(out).toContain('"UI = f(state)"');
    expect(out).toContain('역할별로 접근 범위를 제한한다.');
    // 슬라이드 수 불변.
    expect((out.match(/class="slide"/g) ?? []).length).toBe(
      (RICH_MODEL_DECK.match(/class="slide"/g) ?? []).length,
    );
    // 임의 합성 금지: 가시 텍스트가 늘어나지 않는다(중립화는 '제거/치환'만).
    expect(visibleText(out).length).toBeLessThanOrEqual(visibleText(RICH_MODEL_DECK).length);
    // 날조 수치/주제중립 플레이스홀더가 주입되지 않는다.
    expect(out).not.toMatch(/의미와 적용 기준을 한 문장으로/);
    expect(out).not.toMatch(/핵심 맥락과 다음 단계/);
    expect(out).not.toMatch(/\$\d+[KMB]\b/); // 날조 시장규모/매출 금지
  });

  it('Teamver 제품 브리프: neutralize 는 no-op (on-topic Teamver 본문 보존)', () => {
    const teamverDeck = RICH_MODEL_DECK.replace('React 상태 관리', '팀버 제품 소개');
    const out = neutralizeClonedDeckModelHtml(teamverDeck, {
      brief: '팀버(Teamver) 협업 보드 제품 소개',
      deckTitle: '팀버 제품 소개',
    });
    // Teamver 브리프에서는 pack 원문이 유지된다.
    expect(out).toContain('같은 보드');
    expect(out).toContain('권한 경계');
    expect(out).toContain('결과 이력');
  });

  it('idempotent: 두 번 돌려도 동일 (persist chokepoint 재실행 안전)', () => {
    const once = neutralizeClonedDeckModelHtml(RICH_MODEL_DECK, {
      brief: 'React 상태 관리',
      deckTitle: 'React 상태 관리',
    });
    const twice = neutralizeClonedDeckModelHtml(once, {
      brief: 'React 상태 관리',
      deckTitle: 'React 상태 관리',
    });
    expect(twice).toBe(once);
  });

  it('빈/공백 입력은 그대로 통과(방어적)', () => {
    expect(neutralizeClonedDeckModelHtml('', {})).toBe('');
    expect(neutralizeClonedDeckModelHtml('   ', {})).toBe('   ');
  });
});
