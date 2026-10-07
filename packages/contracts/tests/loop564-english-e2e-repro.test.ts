import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  buildTemplateClonedDeckHtml,
  neutralizeTeamverPackCopyInDeckHtml,
  sanitizePersistedDeckHostLeaks,
  type TemplateCloneSlideContent,
} from '../src/template-clone-fill';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../../');
const EXAMPLE = join(REPO_ROOT, 'plugins/_official/examples/html-ppt-product-launch/example.html');

const ENGLISH_TOPIC = '영어 회화 실력, 매일 20분 안에 끌어올리는 법';
// 실제 생성 덱에서 heal/pack 이 주입했던 Teamver 제품 문구들.
const TEAMVER_RE =
  /같은 보드|권한 경계|결과 이력|워크스페이스|감사 로그|초안과 수정|초안·수정|한 흐름이 된다|한곳에 모인다|보드를 열고|보드로 옮기|보기·고치기|댓글과 버전|조직 기본값|한 팀 보드|파일 밖으로 흩어지지|함께 고칠 사람|함께할 사람|AI 초안을 만들고/;

function visible(html: string): string {
  const body = /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html;
  return body
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function teamverHits(html: string): string[] {
  const vis = visible(html);
  return [...new Set([...vis.matchAll(new RegExp(TEAMVER_RE.source, 'g'))].map((m) => m[0]))];
}

/**
 * 1007-N01 (topic contamination, follow-up) — 사용자가 '영어 회화' 덱에서
 * Teamver 오염이 그대로 남는다고 보고. 루트코즈: persist 경로
 * (`sanitizePersistedDeckHostLeaks` → `salvageMalformedMiniMaxSlideMarkup`
 * → `healProductLaunchLeftoverCatalogCopy`) 는 brief 없이 호출되는데, Teamver
 * 게이트가 `brief ?? dest`(= 덱 HTML) 로 폴백하면서 덱 chrome 의
 * `data-teamver-pad` · `<style data-teamver-template-clone-size>` 토큰을
 * "teamver" 로 오탐 → 모든 저장 덱에서 게이트가 true 가 되어 Teamver 카피를
 * 재주입했다. 가시 텍스트만 보고 판정하도록 고쳤다.
 */
describe('1007-N01 · 영어 회화 end-to-end 오염 방지 (실제 생성·저장 경로)', () => {
  const seed = readFileSync(EXAMPLE, 'utf8');
  // 모델이 title 만 채우고 lead/body/cards 는 비운 상황 — kit pack/heal 이
  // 빈 슬롯을 채우며 Teamver 문구를 주입하던 조건.
  const slides: TemplateCloneSlideContent[] = Array.from({ length: 10 }, (_, i) => ({
    title: i === 0 ? ENGLISH_TOPIC : `영어 회화 ${i + 1}`,
    kicker: '',
    lead: '',
    body: '',
  }));

  const built = buildTemplateClonedDeckHtml(seed, slides, {
    title: ENGLISH_TOPIC,
    brief: ENGLISH_TOPIC,
  });

  it('buildTemplateClonedDeckHtml 가 비-Teamver 토픽에 Teamver 카피를 주입하지 않는다', () => {
    expect(built).toBeTruthy();
    expect(teamverHits(built ?? '')).toEqual([]);
  });

  it('persist 경로(sanitizePersistedDeckHostLeaks)가 Teamver 카피를 재주입하지 않는다', () => {
    const persisted = sanitizePersistedDeckHostLeaks(built ?? '');
    expect(teamverHits(persisted)).toEqual([]);
  });

  it('덱 chrome 의 data-teamver-* 토큰이 토픽 게이트를 오염시키지 않는다', () => {
    // chrome 토큰은 존재하지만(사이즈/pad 스타일) 가시 텍스트에는 teamver 가 없다.
    const b = built ?? '';
    expect(/data-teamver/i.test(b)).toBe(true);
    expect(/teamver/i.test(visible(b))).toBe(false);
  });
});

/**
 * neutralize 안전망의 순서 버그 회귀 가드: body(전체 문장) 맵이 title(명사) 맵
 * 보다 먼저 돌아야 '초안과 수정을 같은 보드에서 끝낸다' 가 '통합 화면' 명사만
 * 바뀐 반쪽 Teamver 문장으로 남지 않는다. (src 는 NFC 이므로 입력도 NFC 로 정규화.)
 */
describe('1007-N01 · neutralize body-before-title 순서', () => {
  const T = '영어 회화';
  it('cover/intro Teamver lede 전체 문장을 토픽-중립으로 치환한다', () => {
    const html = (
      `<p class="lede">${T}는 초안과 수정을 같은 보드에서 끝낸다.</p>`
      + `<p class="lede">${T}는 팀이 같은 맥락에서 AI 초안을 만들고 고치게 한다.</p>`
    ).normalize('NFC');
    const out = neutralizeTeamverPackCopyInDeckHtml(html, T, T);
    expect(out).not.toMatch(/초안과 수정을 .*끝낸다/);
    expect(out).not.toMatch(/AI 초안을 만들고 고치게 한다/);
    expect(out).not.toMatch(/통합 화면에서 끝낸다/);
  });
});
