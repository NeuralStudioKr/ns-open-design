// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  buildGroupMoveMemberStarts,
  buildGroupMoveStylePatches,
  canGroupBoundingMove,
  computeGroupMoveMemberStyles,
  computeGroupMovePreviewUpdates,
  groupMoveDeltaMoved,
  groupMoveHistoryLabel,
  groupMoveStylesBefore,
} from '../../src/edit-mode/manual-edit-group-move';
import { emptyManualEditStyles, type ManualEditTarget } from '../../src/edit-mode/types';

const baseSource = `<!doctype html><html><body>
  <div data-od-id="box-a" style="position:absolute;left:10px;top:20px;width:80px;height:40px;">A</div>
  <div data-od-id="box-b" style="position:absolute;left:120px;top:60px;width:100px;height:50px;">B</div>
</body></html>`;

function absoluteTarget(
  id: string,
  rect: { x: number; y: number; width: number; height: number },
  left: string,
  top: string,
): ManualEditTarget {
  return {
    id,
    kind: 'text',
    label: id,
    tagName: 'div',
    className: '',
    text: id,
    rect,
    fields: { text: id },
    attributes: { 'data-od-id': id },
    styles: {
      ...emptyManualEditStyles(),
      position: 'absolute',
      left,
      top,
    },
    cssPosition: 'absolute',
    isLayoutContainer: false,
    outerHtml: `<div data-od-id="${id}">${id}</div>`,
  };
}

const boxA = absoluteTarget('box-a', { x: 10, y: 20, width: 80, height: 40 }, '10px', '20px');
const boxB = absoluteTarget('box-b', { x: 120, y: 60, width: 100, height: 50 }, '120px', '60px');
const flowTarget: ManualEditTarget = {
  ...boxA,
  id: 'flow',
  cssPosition: 'static',
  styles: { ...emptyManualEditStyles() },
};

describe('manual-edit-group-move', () => {
  it('requires at least two movable absolute targets', () => {
    expect(canGroupBoundingMove([boxA, boxB])).toBe(true);
    expect(canGroupBoundingMove([boxA])).toBe(false);
    expect(canGroupBoundingMove([boxA, flowTarget])).toBe(false);
  });

  it('applies the same content delta to every member', () => {
    const members = buildGroupMoveMemberStarts([boxA, boxB]);
    const updates = computeGroupMovePreviewUpdates(members, 24, 12);
    expect(updates).toHaveLength(2);
    expect(updates[0]).toMatchObject({
      id: 'box-a',
      styles: { left: '34px', top: '32px' },
      rect: { x: 34, y: 32, width: 80, height: 40 },
    });
    expect(updates[1]).toMatchObject({
      id: 'box-b',
      styles: { left: '144px', top: '72px' },
      rect: { x: 144, y: 72, width: 100, height: 50 },
    });
  });

  it('ignores sub-threshold jitter', () => {
    const members = buildGroupMoveMemberStarts([boxA, boxB]);
    expect(groupMoveDeltaMoved(members, 1, 0)).toBe(false);
    expect(groupMoveDeltaMoved(members, 3, 0)).toBe(true);
  });

  it('builds per-target style patches for batch save', () => {
    const members = buildGroupMoveMemberStarts([boxA, boxB]);
    const patches = buildGroupMoveStylePatches(baseSource, members, 24, 12);
    expect(patches).toHaveLength(2);
    expect(patches.map((patch) => patch.id).sort()).toEqual(['box-a', 'box-b']);
    expect(patches.find((patch) => patch.id === 'box-a')?.styles).toMatchObject({
      left: '34px',
      top: '32px',
    });
    expect(patches.find((patch) => patch.id === 'box-b')?.styles).toMatchObject({
      left: '144px',
      top: '72px',
    });
  });

  it('captures cascade-safe rollback styles', () => {
    const before = groupMoveStylesBefore([
      {
        ...boxA,
        styles: { ...boxA.styles, left: 'auto', top: '20px' },
      },
    ]);
    expect(before['box-a']).toEqual({ left: '', top: '20px', right: '', bottom: '' });
  });

  it('labels group move history with member count', () => {
    expect(groupMoveHistoryLabel(2)).toBe('Move: 2 elements');
  });

  it('computes member styles via shared move math', () => {
    const members = buildGroupMoveMemberStarts([boxA]);
    const styles = computeGroupMoveMemberStyles(members[0]!, 10, 5);
    expect(styles).toMatchObject({ left: '20px', top: '25px' });
  });
});
