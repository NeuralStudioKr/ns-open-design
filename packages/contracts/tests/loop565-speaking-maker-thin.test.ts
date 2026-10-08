import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  healProductLaunchLeftoverCatalogCopy,
  listTemplateCloneSlideShells,
  sanitizePersistedDeckHostLeaks,
} from '../src/template-clone-fill';

/**
 * 1007-N01 (loop565) — 실제 생성 덱 "스피킹 메이커 — 영어 회화 실전 훈련 가이드".
 * Teamver 문구는 사라졌지만 호스트 템플릿이 만든 topic-neutral 합성·빈칸·잔해·
 * 배치 문제가 남았다. 정책: 임의(하드코드/합성/topic-neutral) 폴백 주입 금지,
 * 적절한 내용은 덱 안 모델 원문에서만, 못 채우면 박스/노드를 줄여 빈칸이 없게.
 */
describe('루프565 · Speaking Maker thin deck (호스트 템플릿 잔재 제거)', () => {
  const html = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), 'fixtures/loop565-speaking-maker-thin.html'),
    'utf8',
  );

  const SYNTH_LEDE_RE =
    /핵심을 한눈에 짚어 본다|꼭 짚어야 할 내용을 간추린다|오늘부터 바로 시작해 본다|핵심을 이어서 정리한다|다루는 문제와 제공 가치|핵심 맥락과 다음 단계를 정리/;
  const HOST_KICKER_RE =
    /<p[^>]*\bkicker\b[^>]*>\s*(?:이렇게 씁니다|남기는 것|정착 순서|이어서|다음에|쓰는 단위)\s*<\/p>|<p[^>]*\bkicker\b[^>]*>[^<]*(?:가 하는 일|한 장면|한눈에|기준)\s*<\/p>/;

  function sectionsOf(src: string): string[] {
    return src.match(/<section\b[\s\S]*?<\/section>/gi) ?? [];
  }
  function isCenterNonCover(section: string): boolean {
    const cls = /<section\b[^>]*\bclass\s*=\s*["']([^"']*)["']/i.exec(section)?.[1] ?? '';
    const tokens = cls.trim().split(/\s+/);
    return tokens.includes('center') && !tokens.includes('slide-title');
  }

  for (const [label, run] of [
    ['persist', (s: string) => sanitizePersistedDeckHostLeaks(s)],
    ['heal(no-brief)', (s: string) => healProductLaunchLeftoverCatalogCopy(s, null as unknown as string)],
  ] as const) {
    describe(label, () => {
      const healed = run(html);

      it('slide 수(10)와 모델 on-topic 본문을 유지한다', () => {
        expect(listTemplateCloneSlideShells(healed)).toHaveLength(10);
        // 모델이 쓴 실제 내용은 그대로 보존(덮어쓰기·삭제 금지).
        expect(healed).toMatch(/섀도잉 4박자 루틴/);
        expect(healed).toMatch(/TED Talks/);
        expect(healed).toMatch(/Elsa Speak/);
        expect(healed).toMatch(/italki/);
        expect(healed).toMatch(/>\s*15분\s*</);
        expect(healed).toMatch(/>\s*10분\s*</);
        expect(healed).toMatch(/입문부터 프리토킹까지/); // 모델 kicker 보존
      });

      it('문제1 — topic-neutral 합성 lede/kicker/brand 잔재가 없다', () => {
        expect(healed).not.toMatch(SYNTH_LEDE_RE);
        expect(healed).not.toMatch(HOST_KICKER_RE);
        // 잘린 제목 복사 brand 제거.
        expect(healed).not.toMatch(/class="brand"[^>]*>\s*원어민처럼 말해 내는 90일\s*</);
      });

      it('문제2 — 빈 price-card amount 노드가 없다', () => {
        expect(healed).not.toMatch(/<div\b[^>]*\bamount\b[^>]*>\s*<\/div>/i);
      });

      it('문제3 — price-card 본문/제품명을 복사한 중복 li가 없다', () => {
        expect(healed).not.toMatch(/<li>\s*Elsa Speak\s*<\/li>/);
        expect(healed).not.toMatch(/<li>\s*Speak\s*<\/li>/);
        expect(healed).not.toMatch(/<li>\s*italki\s*<\/li>/);
        expect(healed).not.toMatch(/<li>[^<]*IPA 기반 발음 채점[^<]*<\/li>/);
      });

      it('문제4 — 잘린 "F1" 꼬리가 정리된다(모델 원문은 보존)', () => {
        expect(healed).not.toMatch(/F1(?![0-9])/);
        // 꼬리만 제거하고 앞 문장은 유지.
        expect(healed).toMatch(/원본과 비교해/);
        expect(healed).toMatch(/IPA 기반 발음 채점과 실시간 피드백으로/);
      });

      it('문제5 — Ship 슬라이드의 빈 flex:1 좌캠 패널이 없다', () => {
        expect(healed).not.toMatch(/<div\b[^>]*flex\s*:\s*1(?![\d.])[^>]*>\s*<\/div>/i);
      });

      it('문제6 — center(비표지) 슬라이드에 빈 hero-shot 오브가 없다', () => {
        for (const section of sectionsOf(healed)) {
          if (!isCenterNonCover(section)) continue;
          expect(section).not.toMatch(/class="hero-shot"/);
        }
      });

      it('빈 feature-card·step·price-card 카드 shell이 남지 않는다', () => {
        expect(healed).not.toMatch(
          /<div\b[^>]*\b(?:feature-card|price-card|step|card)\b[^>]*>\s*<\/div>/i,
        );
        // 2카드 grid는 g2 유지(세 번째 카드 지어내지 않음).
        const seat = sectionsOf(healed).find((s) => s.includes('하루 30분 배분')) ?? '';
        expect((seat.match(/\bfeature-card\b/g) ?? []).length).toBe(2);
        expect(seat).toMatch(/\bg2\b/);
        expect(seat).not.toMatch(/\bg3\b/);
      });
    });
  }
});
