// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { applyManualEditPatch } from '../../src/edit-mode/source-patches';
import {
  buildManualEditStylePatchesForTargets,
  manualEditSelectionIdsEqual,
  mergeInspectorStylesForTargets,
  nextManualEditSelectionIds,
  shouldFlushManualEditStylesOnSelectionBoundary,
} from '../../src/edit-mode/manual-edit-multi-select';
import { emptyManualEditStyles, type ManualEditTarget } from '../../src/edit-mode/types';

const baseSource = `<!doctype html><html><body>
  <h1 data-od-id="title" style="color:#111111;font-size:24px">Title</h1>
  <p data-od-id="body" style="color:#222222;font-size:16px">Body</p>
</body></html>`;

const catalog: ManualEditTarget[] = [
  {
    id: 'title',
    kind: 'text',
    label: 'Title',
    tagName: 'h1',
    className: '',
    text: 'Title',
    rect: { x: 0, y: 0, width: 100, height: 40 },
    fields: { text: 'Title' },
    attributes: { 'data-od-id': 'title' },
    styles: emptyManualEditStyles(),
    isLayoutContainer: false,
    outerHtml: '<h1 data-od-id="title">Title</h1>',
  },
  {
    id: 'body',
    kind: 'text',
    label: 'Body',
    tagName: 'p',
    className: '',
    text: 'Body',
    rect: { x: 0, y: 60, width: 100, height: 24 },
    fields: { text: 'Body' },
    attributes: { 'data-od-id': 'body' },
    styles: emptyManualEditStyles(),
    isLayoutContainer: false,
    outerHtml: '<p data-od-id="body">Body</p>',
  },
];

describe('manual-edit-multi-select', () => {
  it('replaces selection without additive modifier', () => {
    expect(nextManualEditSelectionIds(['title'], 'body', false)).toEqual(['body']);
  });

  it('toggles ids with additive modifier', () => {
    expect(nextManualEditSelectionIds(['title'], 'body', true)).toEqual(['title', 'body']);
    expect(nextManualEditSelectionIds(['title', 'body'], 'title', true)).toEqual(['body']);
  });

  it('detects mixed style keys across targets', () => {
    const { styles, mixedKeys } = mergeInspectorStylesForTargets(catalog, (id) => ({
      ...emptyManualEditStyles(),
      color: id === 'title' ? '#111111' : '#222222',
      fontSize: id === 'title' ? '24px' : '16px',
    }));
    expect(mixedKeys.has('color')).toBe(true);
    expect(mixedKeys.has('fontSize')).toBe(true);
    expect(styles.color).toBe('');
    expect(styles.fontSize).toBe('');
  });

  it('builds one set-style patch per changed target', () => {
    const patches = buildManualEditStylePatchesForTargets(baseSource, ['title', 'body'], {
      color: '#ef4444',
    });
    expect(patches).toHaveLength(2);
    expect(patches.map((patch) => patch.id).sort()).toEqual(['body', 'title']);
    expect(patches.every((patch) => patch.kind === 'set-style' && patch.styles.color === '#ef4444')).toBe(true);
  });

  it('flushes pending mult styles when the selection set changes', () => {
    expect(shouldFlushManualEditStylesOnSelectionBoundary(['title', 'body'], ['title'])).toBe(true);
    expect(shouldFlushManualEditStylesOnSelectionBoundary(['title', 'body'], ['title', 'body'])).toBe(false);
    expect(manualEditSelectionIdsEqual(['title', 'body'], ['body', 'title'])).toBe(false);
  });
});
