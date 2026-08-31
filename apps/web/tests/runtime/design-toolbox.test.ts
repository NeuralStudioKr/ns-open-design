import { describe, expect, it } from 'vitest';

import {
  DESIGN_TOOLBOX_INSTRUCTION_MARKER,
  attachPendingDesignToolboxInstruction,
  looksLikeDesignToolboxExpandedDraft,
  resolveDesignToolboxVisibleBody,
  withDesignToolboxInstruction,
} from '../../src/runtime/design-toolbox';

const VISUAL_POLISH_TITLE = '디자인 다듬기 / 출시 준비 완료';
const AUTO_MATCH_TITLE = 'Match next step';

describe('design toolbox compact drafts', () => {
  it('uses the action title when the composer is empty', () => {
    expect(resolveDesignToolboxVisibleBody({
      actionTitle: VISUAL_POLISH_TITLE,
      activeDraft: '',
    })).toBe(VISUAL_POLISH_TITLE);
  });

  it('replaces a leftover resource-index dump instead of leaving it in the input', () => {
    const dump = [
      '@creative-director',
      '현재 대상: 파일 · deck.html.',
      '선택된 skill: creative-director.',
      '전역 리소스 인덱스: skill(40), 플러그인(0).',
      '검색 가능한 skill: creative-director, frontend-skill.',
      '워크플로 규칙: 먼저 미적 목표와 제약을 정의한 다음 리소스를 검색하고 매칭하세요.',
      '이 디자인을 출시 준비가 될 때까지 다듬으세요.',
    ].join('\n');
    expect(looksLikeDesignToolboxExpandedDraft(dump)).toBe(true);
    expect(resolveDesignToolboxVisibleBody({
      actionTitle: VISUAL_POLISH_TITLE,
      activeDraft: dump,
    })).toBe(VISUAL_POLISH_TITLE);
  });

  it('keeps user notes that are not a toolbox dump', () => {
    expect(resolveDesignToolboxVisibleBody({
      actionTitle: VISUAL_POLISH_TITLE,
      activeDraft: '@creative-director\n표지 제목만 더 크게',
    })).toBe('표지 제목만 더 크게');
  });

  it('replaces a previous compact action title when switching actions', () => {
    expect(resolveDesignToolboxVisibleBody({
      actionTitle: VISUAL_POLISH_TITLE,
      activeDraft: `@creative-director\n${AUTO_MATCH_TITLE}`,
      actionTitles: [AUTO_MATCH_TITLE, VISUAL_POLISH_TITLE],
    })).toBe(VISUAL_POLISH_TITLE);
  });

  it('hides the workflow prompt behind the instruction marker', () => {
    const sent = withDesignToolboxInstruction(
      VISUAL_POLISH_TITLE,
      'Polish this design until it is ready to ship.',
    );
    expect(sent).toContain(VISUAL_POLISH_TITLE);
    expect(sent).toContain(DESIGN_TOOLBOX_INSTRUCTION_MARKER);
    expect(sent).toContain('Polish this design until it is ready to ship.');
  });

  it('attaches the pending instruction only while the action title is still in the draft', () => {
    expect(attachPendingDesignToolboxInstruction({
      prompt: VISUAL_POLISH_TITLE,
      instruction: 'full workflow',
      actionTitle: VISUAL_POLISH_TITLE,
    })).toContain('full workflow');
    expect(attachPendingDesignToolboxInstruction({
      prompt: '표지 제목만 바꿔줘',
      instruction: 'full workflow',
      actionTitle: VISUAL_POLISH_TITLE,
    })).toBe('표지 제목만 바꿔줘');
  });
});
