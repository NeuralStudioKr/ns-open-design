import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  sanitizePersistedDeckHostLeaks,
  officialLookIsProductLaunchHalo,
  healProductLaunchLeftoverCatalogCopy,
} from '../src/template-clone-fill.js';

/**
 * 1007-N01 (9/4 품질 기준선) — 사용자가 제시한 2026-09-04 결과물은 official-look
 * Broadside 킷에 모델이 직접 쓴 리치 HTML(스탯 카드 40%+/#1/220k+, 3-기둥 카드의
 * 2~3문장 본문, PHASE 1/2/3, 코드 예시)로 "본문 밀도 + 요소 배치"의 목표치다.
 *
 * 현재 heal 파이프라인(product-launch 중심)이 이런 모델-저작 리치 덱을 "얇게"
 * 깎아서는 안 된다. 이 테스트는 persist sanitize가 리치 본문·스탯·구조를 그대로
 * 보존(density 유지)하고, product-launch heal이 발동하지 않음을 보장한다.
 */
describe('ref-0904 quality-bar — 모델 리치 official-look 덱 density 보존', () => {
  it('persist sanitize가 9/4 리치 본문·스탯·3기둥·PHASE를 얇게 깎지 않는다', async () => {
    const ref = await readFile(
      new URL('./fixtures/ref-0904-broadside-react-quality-bar.html', import.meta.url),
      'utf8',
    );

    // product-launch halo가 아니라 official-look Broadside → product-launch heal 비발동.
    expect(officialLookIsProductLaunchHalo(ref)).toBe(false);
    expect(healProductLaunchLeftoverCatalogCopy(ref, null)).toBe(ref);

    const sanitized = sanitizePersistedDeckHostLeaks(ref);

    // 1) 스탯 카드 값/라벨 보존.
    for (const token of ['40%+', '#1', '220k+', 'State of JS 2023', 'facebook/react']) {
      expect(sanitized).toContain(token);
    }
    // 2) 3-기둥 카드의 완결된 다문장 본문 보존(1줄 템플릿으로 축약 금지).
    expect(sanitized).toContain(
      '재사용 가능한 UI 단위. 함수형 컴포넌트가 표준이며, props를 입력으로 받고 JSX 엘리먼트를 반환합니다. 디자인 시스템을 구성하는 최소 단위입니다.',
    );
    expect(sanitized).toContain('JavaScript 안의 XML-like 문법');
    expect(sanitized).toContain('props는 부모→자식 단방향 데이터');
    // 3) 긴 리드/서술 본문 보존.
    expect(sanitized).toContain('React는 단순한 라이브러리가 아니라 "UI = f(state)"');
    expect(sanitized).toContain('메모리 안의 경량 트리(Virtual DOM)에 변경 사항을 계산한 뒤');
    // 4) PHASE 1/2/3 배치 보존.
    for (const phase of ['PHASE 1', 'PHASE 2', 'PHASE 3']) {
      expect(sanitized).toContain(phase);
    }

    // 5) 슬라이드 수 불변(10슬라이드 중 fixture는 4개 수록) + 빈 박스/합성 주입 없음.
    const slideCount = (sanitized.match(/class="slide"/g) ?? []).length;
    expect(slideCount).toBe((ref.match(/class="slide"/g) ?? []).length);
    expect(sanitized).not.toMatch(/의미와 적용 기준을 한 문장으로/);
    expect(sanitized).not.toMatch(/핵심 맥락과 다음 단계/);
    // 리치 본문 길이가 눈에 띄게 깎이지 않았는지(밀도 유지)의 하한 가드.
    const visibleLen = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().length;
    expect(visibleLen(sanitized)).toBeGreaterThanOrEqual(Math.floor(visibleLen(ref) * 0.95));
  });

  it('9/4 경로(official-look 모델 full HTML)는 class 기반 슬롯이 아니다 — 경로 분기 근거', async () => {
    const ref = await readFile(
      new URL('./fixtures/ref-0904-broadside-react-quality-bar.html', import.meta.url),
      'utf8',
    );
    // 9/4 밀도의 출처: 모델이 inline-styled full HTML을 직접 저작(스탯/코드/다문장
    // 카드). 현재 thin 경로(product-launch JSON slot-fill)의 고정 class 슬롯
    // (feature-card/price-card/amount/lede/kicker)이 아니므로 slot-fill·heal이
    // 본문을 깎지 않는다. 이 구조적 차이를 테스트로 고정한다.
    expect(officialLookIsProductLaunchHalo(ref)).toBe(false);
    expect(ref).not.toMatch(/class="(?:feature-card|price-card|amount|lede|kicker)"/);
    expect(ref).toMatch(/grid-template-columns:repeat\(3,/); // 모델이 직접 쓴 3열 리치 레이아웃
  });
});
