import { describe, expect, it } from 'vitest';
import {
  buildEmergencyArtifactFromMessages,
  buildEmergencySlideDeckFromOutline,
  extractSlideOutlineItems,
  looksLikeSlideOutline,
} from '../../src/artifacts/emergency-deck';
import type { ChatMessage } from '../../src/types';

describe('extractSlideOutlineItems', () => {
  it('parses numbered Korean slide outlines', () => {
    const items = extractSlideOutlineItems(
      '슬라이드 구성:\n01 표지\n02 시장 현황\n03 핵심 전략\n04 실행 계획',
    );
    expect(items.map((item) => item.title)).toEqual([
      '표지',
      '시장 현황',
      '핵심 전략',
      '실행 계획',
    ]);
  });

  it('parses dotted numbered outlines', () => {
    const items = extractSlideOutlineItems(
      '1. Cover\n2. Problem\n3. Solution\n4. Roadmap',
    );
    expect(items).toHaveLength(4);
    expect(items[0]?.title).toBe('Cover');
  });
});

describe('looksLikeSlideOutline', () => {
  it('detects plan-only outlines with three or more slides', () => {
    expect(
      looksLikeSlideOutline('슬라이드 구성:\n01 표지\n02 배경\n03 결론'),
    ).toBe(true);
  });

  it('does not treat short prose as an outline', () => {
    expect(looksLikeSlideOutline('슬라이드 한 장에 ROI를 보여주세요.')).toBe(false);
  });
});

describe('buildEmergencySlideDeckFromOutline', () => {
  it('builds a valid HTML deck from an outline', () => {
    const html = buildEmergencySlideDeckFromOutline(
      '슬라이드 구성:\n01 AI 도입 효과\n02 비용 절감\n03 생산성\n04 리스크\n05 로드맵\n06 Q&A',
      { deckTitle: 'AI 도입 효과' },
    );
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('</html>');
    expect(html).toContain('<section class="slide">');
    expect(html).toContain('AI 도입 효과');
    expect(html!.length).toBeGreaterThan(256);
  });

  it('refuses thin prose instead of inventing a six-slide skeleton', () => {
    const html = buildEmergencySlideDeckFromOutline(
      '기업 AI 도입 효과에 대한 프레젠테이션을 만들어 주세요.',
      { deckTitle: 'AI 도입 효과' },
    );
    expect(html).toBeNull();
  });

  it('does not use progress prose as the cover title', () => {
    const html = buildEmergencySlideDeckFromOutline(
      'NeuralStudio 회사 소개 덱을 Retro Windows 스타일로 만들고 있어요.\n발표 개요를 정리합니다.',
    );
    expect(html).toBeNull();
  });
});

describe('buildEmergencyArtifactFromMessages', () => {
  it('refuses progress-only assistant turns without a real outline or HTML', () => {
    const messages = [
      {
        id: 'u1',
        role: 'user',
        content: 'https://neuralstudio.kr 분석해서 회사 소개 PPT 만들어줘',
        createdAt: 1,
      },
      {
        id: 'a1',
        role: 'assistant',
        content: 'NeuralStudio 회사 소개 덱을 Retro Windows 스타일로 만들고 있어요.',
        createdAt: 2,
      },
    ] as ChatMessage[];

    expect(buildEmergencyArtifactFromMessages(messages)).toBeNull();
  });
});
