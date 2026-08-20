// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  applyManualEditPatches,
  buildManualEditStylePatchesForTargets,
  concurrentPendingOwnsTipYieldReseedStyles,
  manualEditSelectionIdsEqual,
  mergeInspectorStylesForTargets,
  collectPendingManualEditStyleDraftKeys,
  mixedKeysForPendingStyleDraft,
  nextManualEditSelectionIds,
  planManualEditMultiInspectorReseed,
  resolveTipYieldIdentityStyles,
  shouldReadMultiInspectorStylesFromSourceOnly,
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

  it('recomputes mixedKeys for pending style drafts without returning merged styles', () => {
    const read = (id: string) => ({
      ...emptyManualEditStyles(),
      color: id === 'title' ? '#111111' : '#222222',
      fontWeight: '700',
    });
    const mixed = mixedKeysForPendingStyleDraft(catalog, read);
    expect(mixed.has('color')).toBe(true);
    expect(mixed.has('fontWeight')).toBe(false);
    // Helper is mixedKeys-only — callers keep pending draft.styles intact.
    expect(mixedKeysForPendingStyleDraft([], read).size).toBe(0);
  });

  it('excludes pending draft keys from mixedKeys so Mixed does not fight the draft', () => {
    const read = (id: string) => ({
      ...emptyManualEditStyles(),
      color: id === 'title' ? '#111111' : '#222222',
      fontSize: id === 'title' ? '24px' : '16px',
      zIndex: id === 'title' ? '2' : '1',
    });
    const mixed = mixedKeysForPendingStyleDraft(catalog, read, { color: '#ef4444' });
    expect(mixed.has('color')).toBe(false);
    expect(mixed.has('fontSize')).toBe(true);
    const withPerTarget = mixedKeysForPendingStyleDraft(
      catalog,
      read,
      {},
      { perTargetStyles: { title: { zIndex: '9' }, body: { zIndex: '9' } } },
    );
    expect(withPerTarget.has('zIndex')).toBe(false);
    expect(withPerTarget.has('fontSize')).toBe(true);
    expect(collectPendingManualEditStyleDraftKeys({
      styles: { color: '#fff' },
      perTargetStyles: { title: { left: '10px' } },
    }).has('left')).toBe(true);
  });

  it('plans multi inspector reseed with concurrent pending keeping draft styles', () => {
    const read = (id: string) => ({
      ...emptyManualEditStyles(),
      color: id === 'title' ? '#111111' : '#222222',
      fontSize: '16px',
    });
    const full = planManualEditMultiInspectorReseed({
      selectedIds: ['title', 'body'],
      readStyles: read,
    });
    expect(full.styles?.color).toBe('');
    expect(full.mixedKeys.has('color')).toBe(true);
    expect(full.mixedKeys.has('fontSize')).toBe(false);
    const concurrent = planManualEditMultiInspectorReseed({
      selectedIds: ['title', 'body'],
      readStyles: read,
      concurrentPending: { styles: { color: '#ef4444' } },
    });
    expect(concurrent.styles).toBeNull();
    expect(concurrent.mixedKeys.has('color')).toBe(false);
    // perTargetStyles-only pending still owns Mixed exclude keys (59).
    const perTargetOnly = planManualEditMultiInspectorReseed({
      selectedIds: ['title', 'body'],
      readStyles: read,
      concurrentPending: {
        styles: {},
        perTargetStyles: { title: { fontSize: '20px' }, body: { fontSize: '20px' } },
      },
    });
    expect(perTargetOnly.styles).toBeNull();
    expect(perTargetOnly.mixedKeys.has('fontSize')).toBe(false);
    expect(perTargetOnly.mixedKeys.has('color')).toBe(true);
    // Empty pending shell must not block tip-yield source reseed.
    const emptyPending = planManualEditMultiInspectorReseed({
      selectedIds: ['title', 'body'],
      readStyles: read,
      concurrentPending: { styles: {}, perTargetStyles: {} },
    });
    expect(emptyPending.styles).not.toBeNull();
    expect(emptyPending.mixedKeys.has('color')).toBe(true);
    // Tip-yield during flush: pending with draft keys must never return styles.
    expect(concurrentPendingOwnsTipYieldReseedStyles({
      styles: { color: '#ef4444' },
    })).toBe(true);
    expect(concurrentPendingOwnsTipYieldReseedStyles({
      styles: {},
      perTargetStyles: { title: { left: '10px' } },
    })).toBe(true);
    expect(concurrentPendingOwnsTipYieldReseedStyles({
      styles: {},
      perTargetStyles: {},
    })).toBe(false);
    expect(concurrent.styles).toBeNull();
    expect(perTargetOnly.styles).toBeNull();
  });

  it('reads multi inspector styles from source only except selection commit', () => {
    expect(shouldReadMultiInspectorStylesFromSourceOnly('tip-yield')).toBe(true);
    expect(shouldReadMultiInspectorStylesFromSourceOnly('od-edit-targets')).toBe(true);
    expect(shouldReadMultiInspectorStylesFromSourceOnly('cancel')).toBe(true);
    expect(shouldReadMultiInspectorStylesFromSourceOnly('noop-flush')).toBe(true);
    expect(shouldReadMultiInspectorStylesFromSourceOnly('selection')).toBe(false);
  });

  it('resolves tip-yield identity styles from tip source when snapshot is usable', () => {
    const tip = { ...emptyManualEditStyles(), color: '#111111', fontSize: '' };
    const previous = { ...emptyManualEditStyles(), color: '#ff0000', fontSize: '24px' };
    expect(resolveTipYieldIdentityStyles(tip, previous, true)).toEqual(tip);
    expect(resolveTipYieldIdentityStyles(tip, previous, false)).toEqual(previous);
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

  it('applies multiple style patches on one Document', () => {
    const patches = buildManualEditStylePatchesForTargets(baseSource, ['title', 'body'], {
      color: '#ef4444',
    });
    const result = applyManualEditPatches(baseSource, patches, {
      sanitize: true,
      captureTargetSnapshots: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source).toContain('data-od-id="title"');
    expect(result.source).toContain('data-od-id="body"');
    expect(result.targetSnapshots?.title).toBeTruthy();
    expect(result.targetSnapshots?.body).toBeTruthy();
  });
});
