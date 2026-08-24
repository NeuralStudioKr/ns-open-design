// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  buildGroupGeometryPatches,
  canGroupAlign,
  canGroupDistribute,
  computeGroupAlignPreviewUpdates,
  computeGroupDistributePreviewUpdates,
} from '../../src/edit-mode/manual-edit-group-align';
import { emptyManualEditStyles, type ManualEditTarget } from '../../src/edit-mode/types';

const baseSource = `<!doctype html><html><body>
  <div data-od-id="box-a" style="position:absolute;left:10px;top:20px;width:80px;height:40px;">A</div>
  <div data-od-id="box-b" style="position:absolute;left:120px;top:60px;width:100px;height:50px;">B</div>
  <div data-od-id="box-c" style="position:absolute;left:60px;top:120px;width:60px;height:30px;">C</div>
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
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    },
    cssPosition: 'absolute',
    isLayoutContainer: false,
    outerHtml: `<div data-od-id="${id}">${id}</div>`,
  };
}

const boxA = absoluteTarget('box-a', { x: 10, y: 20, width: 80, height: 40 }, '10px', '20px');
const boxB = absoluteTarget('box-b', { x: 120, y: 60, width: 100, height: 50 }, '120px', '60px');
const boxC = absoluteTarget('box-c', { x: 60, y: 120, width: 60, height: 30 }, '60px', '120px');

describe('manual-edit-group-align', () => {
  it('aligns absolute targets to the union left edge', () => {
    expect(canGroupAlign([boxA, boxB])).toBe(true);
    const updates = computeGroupAlignPreviewUpdates([boxA, boxB], 'left');
    expect(updates.find((item) => item.id === 'box-a')?.styles.left).toBe('10px');
    expect(updates.find((item) => item.id === 'box-b')?.styles.left).toBe('10px');
  });

  it('requires three targets for distribute', () => {
    expect(canGroupDistribute([boxA, boxB])).toBe(false);
    expect(canGroupDistribute([boxA, boxB, boxC])).toBe(true);
  });

  it('builds geometry patches for align actions', () => {
    const updates = computeGroupAlignPreviewUpdates([boxA, boxB], 'top');
    const { patches, parsedDoc } = buildGroupGeometryPatches(baseSource, updates);
    expect(patches).toHaveLength(2);
    expect({ patches, parsedDoc }).toHaveProperty('parsedDoc');
    expect(patches.every((patch) => patch.kind === 'set-style')).toBe(true);
  });

  it('distributes targets evenly on the horizontal axis', () => {
    const spacedA = absoluteTarget('box-a', { x: 10, y: 20, width: 50, height: 40 }, '10px', '20px');
    const spacedB = absoluteTarget('box-b', { x: 150, y: 20, width: 50, height: 40 }, '150px', '20px');
    const spacedC = absoluteTarget('box-c', { x: 280, y: 20, width: 50, height: 40 }, '280px', '20px');
    const updates = computeGroupDistributePreviewUpdates([spacedA, spacedB, spacedC], 'horizontal');
    const byId = Object.fromEntries(
      updates.map((update) => [update.id, Number.parseInt(String(update.styles.left), 10)]),
    );
    expect(byId['box-a']).toBe(10);
    expect(byId['box-b']).toBe(145);
    expect(byId['box-c']).toBe(280);
  });
});
