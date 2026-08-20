// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  buildGroupResizeMemberStarts,
  buildGroupResizeStylePatches,
  canGroupBoundingResize,
  computeGroupResizePreviewUpdates,
  groupResizeDeltaMoved,
  unionRectFromMemberStarts,
} from '../../src/edit-mode/manual-edit-group-resize';
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
  width: string,
  height: string,
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
      width,
      height,
    },
    cssPosition: 'absolute',
    layoutWidth: rect.width,
    layoutHeight: rect.height,
    isLayoutContainer: false,
    outerHtml: `<div data-od-id="${id}">${id}</div>`,
  };
}

const boxA = absoluteTarget(
  'box-a',
  { x: 10, y: 20, width: 80, height: 40 },
  '10px',
  '20px',
  '80px',
  '40px',
);
const boxB = absoluteTarget(
  'box-b',
  { x: 120, y: 60, width: 100, height: 50 },
  '120px',
  '60px',
  '100px',
  '50px',
);

describe('manual-edit-group-resize', () => {
  it('requires at least two resizable absolute targets', () => {
    expect(canGroupBoundingResize([boxA, boxB])).toBe(true);
    expect(canGroupBoundingResize([boxA])).toBe(false);
  });

  it('builds a union rect from member starts', () => {
    const members = buildGroupResizeMemberStarts([boxA, boxB]);
    expect(unionRectFromMemberStarts(members)).toEqual({
      x: 10,
      y: 20,
      width: 210,
      height: 90,
    });
  });

  it('scales every member from the union SE handle', () => {
    const members = buildGroupResizeMemberStarts([boxA, boxB]);
    const union = unionRectFromMemberStarts(members)!;
    expect(groupResizeDeltaMoved(union, 'se', 42, 18)).toBe(true);
    const updates = computeGroupResizePreviewUpdates(union, members, 'se', 42, 18);
    expect(updates[0]?.styles.width).toBe('96px');
    expect(updates[0]?.styles.height).toBe('48px');
    expect(updates[1]?.styles.width).toBe('120px');
    expect(updates[1]?.styles.height).toBe('60px');
  });

  it('builds per-target resize patches for batch save', () => {
    const members = buildGroupResizeMemberStarts([boxA, boxB]);
    const { patches, parsedDoc } = buildGroupResizeStylePatches(
      baseSource,
      members,
      'se',
      42,
      18,
    );
    expect(patches).toHaveLength(2);
    expect({ patches, parsedDoc }).toHaveProperty('parsedDoc');
    expect(patches.find((patch) => patch.id === 'box-a')?.styles).toMatchObject({
      width: '96px',
      height: '48px',
    });
  });
});
