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

describe('buildManualEditCommentFastPath — disabled client-side fast path', () => {
  it('always defers to the model element-patch / deck-patch contract', () => {
    expect(
      buildManualEditCommentFastPath({
        attachment: attachment({ comment: '회사 이름 눈에 잘 띄게 수정' }),
        currentStyles: { fontSize: '22px' },
      }),
    ).toBeNull();
    expect(
      buildManualEditCommentFastPath({
        attachment: attachment({ comment: '글자를 빨간색으로 바꿔줘' }),
        currentStyles: {},
      }),
    ).toBeNull();
    expect(
      buildManualEditCommentFastPath({
        attachment: attachment({ comment: "'김개발 작업물' 로 멘트 수정" }),
        currentStyles: {},
      }),
    ).toBeNull();
    expect(
      buildManualEditCommentFastPath({
        attachment: attachment({ selectionKind: 'pod', podMembers: [] }),
        currentStyles: {},
      }),
    ).toBeNull();
    expect(
      buildManualEditCommentFastPath({
        attachment: attachment({ comment: '' }),
        currentStyles: {},
      }),
    ).toBeNull();
  });
});
