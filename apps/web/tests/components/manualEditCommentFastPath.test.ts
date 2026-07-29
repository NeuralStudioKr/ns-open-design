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
    comment: '폰트 2배 키우고, 글자색도 노란색으로 변경하라.',
    currentText: 'Title',
    pagePosition: { x: 0, y: 0, width: 10, height: 10 },
    htmlHint: '<h1>Title</h1>',
    selectionKind: 'element',
    ...overrides,
  };
}

describe('buildManualEditCommentFastPath', () => {
  it('builds a style patch for deterministic Korean font/color requests', () => {
    const result = buildManualEditCommentFastPath({
      attachment: attachment(),
      currentStyles: { fontSize: '22px' },
    });

    expect(result?.patches).toEqual([
      {
        id: 'el-1',
        kind: 'set-style',
        styles: { fontSize: '44px', color: '#facc15' },
      },
    ]);
  });

  it('builds text and style patches when the replacement is explicit', () => {
    const result = buildManualEditCommentFastPath({
      attachment: attachment({
        comment: '글자를 수정하라. => "조직 구성 관련 내용 소개" 그리고 폰트 크기 44px로 변경하라.',
      }),
      currentStyles: { fontSize: '22px' },
    });

    expect(result?.patches).toEqual([
      { id: 'el-1', kind: 'set-text', value: '조직 구성 관련 내용 소개' },
      { id: 'el-1', kind: 'set-style', styles: { fontSize: '44px' } },
    ]);
  });

  it('uses computed comment styles for multiplier font-size requests', () => {
    const result = buildManualEditCommentFastPath({
      attachment: attachment({
        comment: '폰트 사이즈 두배로 키워줘',
        style: { fontSize: '18px' },
      }),
      currentStyles: { fontSize: '18px' },
    });

    expect(result?.patches).toEqual([
      { id: 'el-1', kind: 'set-style', styles: { fontSize: '36px' } },
    ]);
  });

  it('does not fast-path image or multi-element comments', () => {
    expect(buildManualEditCommentFastPath({
      attachment: attachment({ imageAttachments: [{ name: 'mark.png', path: 'mark.png' }] }),
      currentStyles: { fontSize: '22px' },
    })).toBeNull();

    expect(buildManualEditCommentFastPath({
      attachment: attachment({ selectionKind: 'pod' }),
      currentStyles: { fontSize: '22px' },
    })).toBeNull();
  });

  it('falls back to the AI path for ambiguous critique requests', () => {
    expect(buildManualEditCommentFastPath({
      attachment: attachment({ comment: '이 부분을 좀 더 보기 좋게 만들어줘.' }),
      currentStyles: { fontSize: '22px' },
    })).toBeNull();
  });

  it('builds a visibility emphasis patch for 눈에 잘 띄게 requests', () => {
    const result = buildManualEditCommentFastPath({
      attachment: attachment({ comment: '회사 이름 눈에 잘 띄게 수정' }),
      currentStyles: { fontSize: '24px', fontWeight: '400' },
    });

    expect(result?.patches).toEqual([
      {
        id: 'el-1',
        kind: 'set-style',
        styles: { fontWeight: '700', fontSize: '30px' },
      },
    ]);
  });

  it('handles natural-language 이름을 X로 replacement without quotes', () => {
    const result = buildManualEditCommentFastPath({
      attachment: attachment({ comment: '이름을 김강사로 바꿔줘' }),
      currentStyles: {},
    });

    expect(result?.patches).toEqual([
      { id: 'el-1', kind: 'set-text', value: '김강사' },
    ]);
  });

  it('handles 제목을 X로 변경 pattern', () => {
    const result = buildManualEditCommentFastPath({
      attachment: attachment({ comment: '제목을 새 커리큘럼 안내로 변경' }),
      currentStyles: {},
    });

    expect(result?.patches).toEqual([
      { id: 'el-1', kind: 'set-text', value: '새 커리큘럼 안내' },
    ]);
  });

  it('handles quoted 멘트 수정 pattern', () => {
    const result = buildManualEditCommentFastPath({
      attachment: attachment({ comment: "'김개발 작업물' 로 멘트 수정" }),
      currentStyles: {},
    });

    expect(result?.patches).toEqual([
      { id: 'el-1', kind: 'set-text', value: '김개발 작업물' },
    ]);
  });

  it('does not steal font-size directives via 이름을 크게 pattern', () => {
    expect(buildManualEditCommentFastPath({
      attachment: attachment({ comment: '이름을 크게' }),
      currentStyles: { fontSize: '22px' },
    })).toBeNull();
  });

  it('does not steal color directives via 글자를 빨간색으로 pattern', () => {
    const result = buildManualEditCommentFastPath({
      attachment: attachment({ comment: '글자를 빨간색으로 바꿔줘' }),
      currentStyles: {},
    });
    expect(result?.patches).toEqual([
      { id: 'el-1', kind: 'set-style', styles: { color: '#ef4444' } },
    ]);
  });
});
