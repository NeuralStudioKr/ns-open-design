import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

  it('parses Canvas source-brief "Visible headings:" line as slide titles', () => {
    // Canvas → Slide compose ships an inline "Visible headings: A / B / C"
    // line in the user message when the assistant never produced HTML; the
    // final outline fallback reads it to synthesize a placeholder deck.
    const items = extractSlideOutlineItems(
      [
        'Canvas title: 여행자를 위한 이탈리아 기본 지식',
        'Canvas sections: 6',
        'Visible headings: 지리 · 기본정보 / 주요관광지 / 음식문화 / 여행팁 / 알아둘 문화 / 결론',
        'Source preview: ...',
      ].join('\n'),
    );
    expect(items.length).toBeGreaterThanOrEqual(6);
    expect(items.map((item) => item.title)).toEqual([
      '지리 · 기본정보',
      '주요관광지',
      '음식문화',
      '여행팁',
      '알아둘 문화',
      '결론',
    ]);
  });

  it('recovers Visible headings from a whitespace-collapsed Source brief line', () => {
    // Regression: canvasCreateSlidesRunPrompt used to compact the whole brief
    // with \\s+ → " ", burying "Visible headings:" mid-line. Outline fallback
    // then returned null after incomplete-html-document-shell and the user
    // only saw incomplete_output.
    const compacted = [
      'Canvas title: 여행자를 위한 이탈리아 기본 지식',
      'Canvas sections: 6',
      'Visible headings: 지리 · 기본정보 / 주요관광지 / 음식문화 / 여행팁 / 알아둘 문화 / 결론',
      'Source preview: Keep the travel sections.',
    ].join(' ');
    const items = extractSlideOutlineItems(`[Source brief]\n${compacted}`);
    expect(items.map((item) => item.title)).toEqual([
      '지리 · 기본정보',
      '주요관광지',
      '음식문화',
      '여행팁',
      '알아둘 문화',
      '결론',
    ]);
    expect(
      buildEmergencySlideDeckFromOutline(compacted, {
        deckTitle: '여행자를 위한 이탈리아 기본 지식',
      }),
    ).toContain('<section class="slide">');
  });

  it('does not treat a two-item "Visible headings:" list as a full outline', () => {
    // Guard: a barely-there heading list should not be spun into a placeholder
    // deck. The outline builder still needs 3+ items.
    const items = extractSlideOutlineItems(
      'Visible headings: 개요 / 결론',
    );
    // extractCanvasSourceHeadingSlides requires ≥ 2 to fire, but the outline
    // builder in buildEmergencySlideDeckFromOutline still requires ≥ 3 to
    // return HTML — so a two-item brief cannot short-circuit auto-continue.
    expect(items.length).toBeLessThan(3);
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
    expect(html).toContain('width=1920, initial-scale=1, maximum-scale=1');
    expect(html).toContain('.slide { width: 1920px; height: 1080px;');
    expect(html).not.toContain('min-height: 100vh');
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

  it('titles outline persist from heal brief when the conversation has no topic', () => {
    const messages = [
      {
        id: 'u1',
        role: 'user',
        content: '[Deliverable instruction]\nContinue the deck.',
        createdAt: 1,
      },
      {
        id: 'a1',
        role: 'assistant',
        content: '슬라이드 구성:\n01 시장\n02 전략\n03 실행',
        createdAt: 2,
      },
    ] as ChatMessage[];
    const art = buildEmergencyArtifactFromMessages(messages, null, {
      brief: 'AI 트렌드 발표자료를 만들어줘',
      deckTitle: 'Html Ppt Zhangzara Daisy Days',
    });
    expect(art?.title).toMatch(/AI 트렌드/);
    expect(art?.html).toContain('<title>');
    expect(art?.html).not.toContain('Presentation');
  });
});

describe('outline last-resort title fallback', () => {
  it('does not use English Presentation or 발표 자료 as the HTML title', () => {
    const html = buildEmergencySlideDeckFromOutline('1. Intro\n2. Body\n3. Close');
    expect(html).toContain('<title>Intro</title>');
    expect(html).not.toContain('Presentation');
    expect(html).not.toContain('발표 자료');
    expect(html).not.toContain('Key points for');
    expect(html).toContain('에 대한 핵심 내용을 정리합니다');
  });

  it('titles a host URL request in Korean instead of company overview', () => {
    const messages = [
      {
        id: 'u1',
        role: 'user',
        content: 'https://neuralstudio.kr make a company presentation',
        createdAt: 1,
      },
      {
        id: 'a1',
        role: 'assistant',
        content: '1. Intro\n2. Body\n3. Close',
        createdAt: 2,
      },
    ] as ChatMessage[];
    const art = buildEmergencyArtifactFromMessages(messages);
    expect(art?.title).toBe('Neuralstudio 소개');
    expect(art?.title).not.toMatch(/company overview/i);
  });

  it('passes heal brief/title into outline last-resort persist', () => {
    const recovery = readFileSync(
      resolve(__dirname, '../../src/runtime/slide-deliverable-recovery.ts'),
      'utf8',
    );
    expect(recovery).toContain('brief: options.healBrief, deckTitle: options.healTitle');
    const source = readFileSync(
      resolve(__dirname, '../../src/artifacts/emergency-deck.ts'),
      'utf8',
    );
    expect(source).not.toContain("'Presentation'");
    expect(source).not.toContain('company overview');
    expect(source).not.toContain('Key points for');
    expect(source).toContain("|| '슬라이드'");
  });
});
