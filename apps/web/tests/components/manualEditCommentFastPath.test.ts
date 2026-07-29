import { describe, expect, it } from 'vitest';
import { buildManualEditCommentFastPath } from '../../src/components/manualEditCommentFastPath';
import type { ChatCommentAttachment } from '../../src/types';

function attachment(overrides: Partial<ChatCommentAttachment> = {}): ChatCommentAttachment {
  return {
    id: 'c1',
    order: 1,
    filePath: 'deck.html',
    elementId: 'el-1',
    selector: '[data-od-id="el-1"]',
    label: 'Title',
    comment: '회사 이름 눈에 잘 띄게 수정',
    currentText: 'Teamver Inc.',
    pagePosition: { x: 0, y: 0, width: 10, height: 10 },
    htmlHint: '<h1>Teamver Inc.</h1>',
    selectionKind: 'element',
    ...overrides,
  };
}

describe('buildManualEditCommentFastPath — deterministic client-side comment edits', () => {
  it('handles the visibility emphasis pattern with a fontWeight bump', () => {
    // "눈에 잘 띄게" without any explicit weight in the current styles
    // must bump fontWeight to 700 so the user's edit lands without
    // waiting on the model's element-patch. Original user glitch:
    // model kept emitting empty element-patch → 3 auto-continue retries
    // → generic incomplete_output banner.
    const result = buildManualEditCommentFastPath({
      attachment: attachment({ comment: '회사 이름 눈에 잘 띄게 수정' }),
      currentStyles: { fontSize: '22px' },
    });
    expect(result, 'fast-path must match visibility emphasis pattern').not.toBeNull();
    if (!result) return;
    expect(result.patches).toHaveLength(1);
    const [patch] = result.patches;
    expect(patch).toMatchObject({
      id: 'el-1',
      kind: 'set-style',
    });
    if (patch && patch.kind === 'set-style') {
      expect(patch.styles.fontWeight).toBe('700');
      // fontSize should grow by 25% (22 → 27.5) so the emphasis is
      // actually visible in the preview — not a no-op weight change.
      // The +4 lower bound only kicks in when the ratio bump would
      // produce less than that (e.g. current 12px → 16px).
      expect(patch.styles.fontSize).toBe('27.5px');
    }
  });

  it('handles the explicit text-color pattern with a hex mapping', () => {
    const result = buildManualEditCommentFastPath({
      attachment: attachment({ comment: '글자를 빨간색으로 바꿔줘' }),
      currentStyles: {},
    });
    expect(result, 'fast-path must match text-color pattern').not.toBeNull();
    if (!result) return;
    const setStyle = result.patches.find((patch) => patch.kind === 'set-style');
    expect(setStyle, 'must include a set-style patch').toBeTruthy();
    if (setStyle && setStyle.kind === 'set-style') {
      expect(setStyle.styles.color).toBe('#ef4444');
    }
  });

  it('handles quoted text replacement patterns', () => {
    // Real user-reported comment shape: "'김개발 작업물' 로 멘트 수정".
    const result = buildManualEditCommentFastPath({
      attachment: attachment({ comment: "'김개발 작업물' 로 멘트 수정" }),
      currentStyles: {},
    });
    expect(result, 'fast-path must match quoted-text pattern').not.toBeNull();
    if (!result) return;
    const setText = result.patches.find((patch) => patch.kind === 'set-text');
    expect(setText, 'must include a set-text patch').toBeTruthy();
    if (setText && setText.kind === 'set-text') {
      expect(setText.value).toBe('김개발 작업물');
    }
  });

  it('defers to the model for pod attachments', () => {
    expect(
      buildManualEditCommentFastPath({
        attachment: attachment({ selectionKind: 'pod', podMembers: [] }),
        currentStyles: {},
      }),
    ).toBeNull();
  });

  it('defers to the model for visual annotations (screenshot / stroke marks)', () => {
    expect(
      buildManualEditCommentFastPath({
        attachment: attachment({ selectionKind: 'visual', markKind: 'stroke' }),
        currentStyles: {},
      }),
    ).toBeNull();
  });

  it('defers to the model when the elementId is a bare pin / file-comment placeholder', () => {
    expect(
      buildManualEditCommentFastPath({
        attachment: attachment({ elementId: 'pin-abc' }),
        currentStyles: {},
      }),
    ).toBeNull();
    expect(
      buildManualEditCommentFastPath({
        attachment: attachment({ elementId: 'file-comment-1' }),
        currentStyles: {},
      }),
    ).toBeNull();
  });

  it('defers to the model for ambiguous natural-language requests the parser cannot resolve', () => {
    // "레이아웃을 더 세련되게" — no quoted text, no color keyword,
    // no font multiplier, no visibility emphasis. Ambiguous by design;
    // the model has to interpret this via element-patch / deck-patch.
    expect(
      buildManualEditCommentFastPath({
        attachment: attachment({ comment: '레이아웃을 더 세련되게 정리해줘' }),
        currentStyles: {},
      }),
    ).toBeNull();
  });

  it('handles the remove-element pattern for "삭제" / "지워" / "없애" / "숨겨"', () => {
    for (const removalCue of ['이 텍스트 삭제해줘', '여기 지워', '이거 없애', '이 카드 숨겨']) {
      const result = buildManualEditCommentFastPath({
        attachment: attachment({ comment: removalCue }),
        currentStyles: {},
      });
      expect(result, `must match removal cue "${removalCue}"`).not.toBeNull();
      if (!result) continue;
      expect(result.patches).toHaveLength(1);
      expect(result.patches[0]).toMatchObject({ id: 'el-1', kind: 'remove-element' });
    }
  });

  it('handles standalone size keywords ("크게" / "작게") without an explicit multiplier', () => {
    // The multiplier path (parseFontSize) requires "N배" / "N x" so a
    // bare "크게 해줘" falls through. The standalone-size parser
    // bumps the current fontSize by ±25% instead. Real user comments
    // rarely include the multiplier — they just say "크게".
    const bigger = buildManualEditCommentFastPath({
      attachment: attachment({ comment: '더 크게 해줘' }),
      currentStyles: { fontSize: '20px' },
    });
    expect(bigger, 'must match bare 크게').not.toBeNull();
    if (!bigger) return;
    const bumpUp = bigger.patches.find((patch) => patch.kind === 'set-style');
    if (bumpUp && bumpUp.kind === 'set-style') {
      // 20 × 1.25 = 25; parseStandaloneSizeKeyword's floor is +2, so 25.
      expect(bumpUp.styles.fontSize).toBe('25px');
    }

    const smaller = buildManualEditCommentFastPath({
      attachment: attachment({ comment: '조금 작게 줄여줘' }),
      currentStyles: { fontSize: '20px' },
    });
    expect(smaller, 'must match bare 작게').not.toBeNull();
    if (!smaller) return;
    const bumpDown = smaller.patches.find((patch) => patch.kind === 'set-style');
    if (bumpDown && bumpDown.kind === 'set-style') {
      expect(bumpDown.styles.fontSize).toBe('16px');
    }
  });

  it('handles underline / strikethrough text-decoration requests', () => {
    const underline = buildManualEditCommentFastPath({
      attachment: attachment({ comment: '여기 밑줄 그어줘' }),
      currentStyles: {},
    });
    expect(underline).not.toBeNull();
    if (underline) {
      const style = underline.patches.find((patch) => patch.kind === 'set-style');
      if (style && style.kind === 'set-style') {
        expect(style.styles.textDecoration).toBe('underline');
      }
    }

    const strike = buildManualEditCommentFastPath({
      attachment: attachment({ comment: '취소선 표시해줘' }),
      currentStyles: {},
    });
    expect(strike).not.toBeNull();
    if (strike) {
      const style = strike.patches.find((patch) => patch.kind === 'set-style');
      if (style && style.kind === 'set-style') {
        expect(style.styles.textDecoration).toBe('line-through');
      }
    }
  });

  it('handles text-align requests ("가운데" / "왼쪽" / "오른쪽" / "양쪽")', () => {
    const cases: Array<[string, string]> = [
      ['가운데 정렬', 'center'],
      ['중앙 정렬', 'center'],
      ['왼쪽 정렬', 'left'],
      ['오른쪽 정렬', 'right'],
      ['양쪽 정렬', 'justify'],
      ['center align', 'center'],
    ];
    for (const [note, expected] of cases) {
      const result = buildManualEditCommentFastPath({
        attachment: attachment({ comment: note }),
        currentStyles: {},
      });
      expect(result, `must match text-align cue "${note}"`).not.toBeNull();
      if (!result) continue;
      const style = result.patches.find((patch) => patch.kind === 'set-style');
      if (style && style.kind === 'set-style') {
        expect(style.styles.textAlign).toBe(expected);
      }
    }
  });

  it('defers to the model when the comment is blank', () => {
    expect(
      buildManualEditCommentFastPath({
        attachment: attachment({ comment: '' }),
        currentStyles: {},
      }),
    ).toBeNull();
  });
});
