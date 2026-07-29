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

  it('defers to the model when the comment is blank', () => {
    expect(
      buildManualEditCommentFastPath({
        attachment: attachment({ comment: '' }),
        currentStyles: {},
      }),
    ).toBeNull();
  });
});
