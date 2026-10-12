import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  extractOfficialDeckLookAssets,
  mergeOfficialDeckLookCss,
  healProductLaunchLeftoverCatalogCopy,
} from '../src/index.js';

/**
 * 1007-N01 슬라이스 C 단계4 — official-rich(product-launch) 덱의 배치·정렬 결함
 * 4건(A 표지 수직 균형, B 제목 표지-전체 접두 중복, C 콘텐츠 수직 분배, D 본문
 * 빈 카드)에 대한 최소 회귀. 임의 합성 없이 (B) 접두 억제·짧은 라벨, (D) 빈 카드
 * 제거+그리드 refit, (A/C) 렌더 CSS 수직 균형을 검증한다. 비-product-launch 및
 * 짧은 topic 의 slot-fill 동작은 불변임을 함께 고정한다.
 */

const EXAMPLES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../plugins/_official/examples',
);

const TEAMVER_BRIEF = '뉴럴스튜디오/Teamver 소개. Agentic AI OS 기반 AI-native company.';

function visibleHeadings(html: string): string[] {
  return [...html.matchAll(/<h[12]\b[^>]*>([\s\S]*?)<\/h[12]>/gi)].map((m) =>
    m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(),
  );
}

describe('1007-N01 단계4 — 결함B: 구조적 heading 이 표지 제목 전체를 접두하지 않는다', () => {
  const makeDeck = (coverTitle: string) => `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${coverTitle}</title></head>
<body class="tpl-product-launch">
<section class="slide dark" data-title="Cover"><div class="hero-shot"></div><p class="kicker">Intro</p><h1 class="h1">${coverTitle}</h1></section>
<section class="slide dark" data-title="Overview"><p class="kicker">01</p><h2 class="h2">핵심</h2>
<div class="grid g3"><div class="feature-card"><h4>AI for Everyone</h4><p class="dim">조직의 모든 구성원이 활용할 수 있어야 합니다.</p></div><div class="feature-card"><h4>Reduce Failure</h4><p class="dim">실패를 줄이는 구조와 검증이 먼저입니다.</p></div><div class="feature-card"><h4>PoC to Production</h4><p class="dim">실제 문제를 해결할 때 가치가 있습니다.</p></div></div></section>
</body></html>`;

  it('표지 제목이 문장형(장문)이면 접두 없이 짧은 섹션 라벨만 쓴다', () => {
    const coverTitle = 'AI 협업과 AI 직원을 현실로.';
    const out = healProductLaunchLeftoverCatalogCopy(makeDeck(coverTitle), TEAMVER_BRIEF);
    const headings = visibleHeadings(out);
    // 콘텐츠 heading 이 "AI 협업과 AI 직원을 현실로. 핵심 …" 로 이어붙지 않는다.
    expect(out).not.toMatch(/현실로\.?\s*핵심/);
    // broken heading("핵심")은 짧은 구조 라벨로 복원된다(표지 중복 없음).
    expect(headings.some((h) => h === '핵심 근거' || h === '핵심 내용')).toBe(true);
    // 모델이 쓴 카드 본문은 보존된다(임의 합성/삭제 아님).
    expect(out).toContain('조직의 모든 구성원이 활용할 수 있어야 합니다.');
  });

  it('짧은 topic 명사이면 기존처럼 "${topic} …" 접두를 유지한다(slot-fill 동작 불변)', () => {
    const out = healProductLaunchLeftoverCatalogCopy(makeDeck('엔진엑스'), '엔진엑스 주제 소개');
    const headings = visibleHeadings(out);
    // 짧은 topic 명사는 접두가 보존된다(표지 중복/과길이 아님).
    expect(headings.some((h) => h.startsWith('엔진엑스') && /핵심 근거$/.test(h))).toBe(true);
  });
});

describe('1007-N01 단계4 — 결함D: 본문 빈 카드 제거 + 그리드 컬럼 refit', () => {
  const makeFounderDeck = (secondCard: string) => `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>Teamver 소개</title></head>
<body class="tpl-product-launch">
<section class="slide dark" data-title="Cover"><div class="hero-shot"></div><h1 class="h1">Teamver 소개</h1></section>
<section class="slide dark" data-title="Founder"><h2 class="h2">Founder &amp; Leadership</h2>
<div class="grid g2"><div class="feature-card"><h4>ADVISOR · 조성훈 교수</h4><p class="dim">서울대 산업공학과 교수.</p></div>${secondCard}</div></section>
</body></html>`;

  it('제목만 있고 본문이 빈 카드는 통째로 제거하고 그리드를 g1 로 refit(지어내 채우지 않음)', () => {
    const emptyCard = '<div class="feature-card"><h4>ADVISOR · 나유리 이사</h4><p class="dim"></p></div>';
    const out = healProductLaunchLeftoverCatalogCopy(makeFounderDeck(emptyCard), TEAMVER_BRIEF);
    // 빈 카드(나유리)는 제거된다.
    expect(out).not.toContain('나유리');
    // orphan heading 으로 남지 않는다.
    expect(out).not.toMatch(/<h4\b[^>]*>\s*ADVISOR · 나유리/);
    // 본문 있는 카드는 보존.
    expect(out).toContain('서울대 산업공학과 교수.');
    // 남은 카드는 1개 → 그리드 컬럼이 g1 로 refit(g2 잔존 금지). 덱에 그리드는 1개뿐.
    expect((out.match(/class="feature-card"/g) ?? []).length).toBe(1);
    expect(out).toMatch(/\bg1\b/);
    expect(out).not.toMatch(/\bg2\b/);
  });

  it('모델이 준 on-topic 본문 카드는 보존한다(빈 카드가 없으면 collapse 비발동)', () => {
    const fullCard = '<div class="feature-card"><h4>ADVISOR · 나유리 이사</h4><p class="dim">현대경제연구원 책임연구원 출신.</p></div>';
    const out = healProductLaunchLeftoverCatalogCopy(makeFounderDeck(fullCard), TEAMVER_BRIEF);
    expect(out).toContain('나유리');
    expect(out).toContain('현대경제연구원 책임연구원 출신.');
    // 두 카드 모두 유지 → g2 보존.
    expect((out.match(/class="feature-card"/g) ?? []).length).toBe(2);
    expect(out).toMatch(/\bg2\b/);
  });
});

describe('1007-N01 단계4 — 결함A/C: product-launch 수직 균형 CSS(렌더 레이어, 스코프 한정)', () => {
  const productLaunch = readFileSync(
    join(EXAMPLES_DIR, 'html-ppt-product-launch/example.html'),
    'utf8',
  );
  const assets = extractOfficialDeckLookAssets(productLaunch)!;

  const dest = `<!doctype html><html lang="ko"><head><meta charset="utf-8"></head><body>
<section class="slide dark"><h1>Teamver 소개</h1></section>
<section class="slide dark"><h2>핵심 내용</h2><div class="grid"><div class="feature-card"><h4>A</h4><p>본문.</p></div></div></section>
</body></html>`;

  it('merge 결과에 product-launch 수직 균형 규칙이 들어간다', () => {
    const merged = mergeOfficialDeckLookCss(dest, assets);
    expect(merged).toContain('od-product-launch-vertical-balance');
    // identity host class 로 스코프 → 다른(그리드) 킷의 bare .slide 를 건드리지 않는다.
    expect(merged).toMatch(/body\.tpl-product-launch\s+\.slide[^{]*\{[^}]*justify-content:\s*center/i);
  });

  it('수직 균형 규칙은 bare ".slide{justify-content:center}" 를 전역 강제하지 않는다(그리드 킷 보호)', () => {
    const merged = mergeOfficialDeckLookCss(dest, assets);
    // 전역 .slide 에 justify-content:center !important 를 직접 걸지 않는다
    // (스코프는 반드시 body.tpl-product-launch 접두).
    expect(merged).not.toMatch(/(^|[^-\w.])\.slide\s*\{[^}]*justify-content:\s*center\s*!important/i);
  });
});
