import { describe, expect, it } from 'vitest';
import {
  beginManualEditPersistEpoch,
  captureManualEditSessionEntrySource,
  commitManualEditSessionEntrySource,
  manualEditPatchBaseSource,
  planManualEditSessionCancel,
  shouldHoldDiskPreviewDuringManualEdit,
  shouldPersistManualEditSessionWrite,
  shouldSkipManualEditHistoryConfirm,
  shouldSuppressHostDeckKeyboardNav,
} from '../../src/edit-mode/manual-edit-session';

describe('manual edit session', () => {
  it('patches against the latest saved session buffer while edit mode is active', () => {
    expect(manualEditPatchBaseSource({
      manualEditMode: true,
      frozenSource: '<html>frozen</html>',
      liveSource: '<html>live-saved</html>',
    })).toBe('<html>live-saved</html>');
  });

  it('falls back to freeze when the session buffer is not ready yet', () => {
    expect(manualEditPatchBaseSource({
      manualEditMode: true,
      frozenSource: '<html>frozen</html>',
      liveSource: null,
    })).toBe('<html>frozen</html>');
  });

  it('falls back to live source outside edit mode', () => {
    expect(manualEditPatchBaseSource({
      manualEditMode: false,
      frozenSource: '<html>frozen</html>',
      liveSource: '<html>live</html>',
    })).toBe('<html>live</html>');
  });

  it('skips disk history confirm while editing', () => {
    expect(shouldSkipManualEditHistoryConfirm(true)).toBe(true);
    expect(shouldSkipManualEditHistoryConfirm(false)).toBe(false);
  });

  it('does not skip history confirm in edit mode when tip is warmer than save base', () => {
    const tip = '<html>tip</html>';
    const base = '<html>save-base</html>';
    expect(shouldSkipManualEditHistoryConfirm(true, {
      expectedSource: base,
      tipContent: tip,
      authoredSource: base,
    })).toBe(false);
    expect(shouldSkipManualEditHistoryConfirm(true, {
      expectedSource: tip,
      tipContent: tip,
      authoredSource: tip,
    })).toBe(true);
    expect(shouldSkipManualEditHistoryConfirm(true, {
      expectedSource: base,
      tipContent: tip,
      authoredSource: tip,
    })).toBe(false);
  });

  it('skips history confirm when warm tip cache is behind the session cursor', () => {
    const saved = '<html>saved</html>';
    const stale = '<html>stale</html>';
    expect(shouldSkipManualEditHistoryConfirm(true, {
      expectedSource: saved,
      tipContent: stale,
      authoredSource: saved,
      tipRevisionSequence: 4,
      activeRevisionSequence: 5,
    })).toBe(true);
  });

  it('holds disk preview refresh while the freeze is active', () => {
    expect(shouldHoldDiskPreviewDuringManualEdit(true, '<html/>')).toBe(true);
    expect(shouldHoldDiskPreviewDuringManualEdit(true, null)).toBe(false);
    expect(shouldHoldDiskPreviewDuringManualEdit(false, '<html/>')).toBe(false);
  });

  it('suppresses host deck nav during manual edit or inline text editing', () => {
    expect(shouldSuppressHostDeckKeyboardNav({ manualEditMode: true, inlineTextEditing: false })).toBe(true);
    expect(shouldSuppressHostDeckKeyboardNav({ manualEditMode: false, inlineTextEditing: true })).toBe(true);
    expect(shouldSuppressHostDeckKeyboardNav({ manualEditMode: false, inlineTextEditing: false })).toBe(false);
  });
});

describe('manual edit session cancel snapshot', () => {
  it('captures HTML once at entry and ignores later dirty live source', () => {
    const original = '<h1>Original title</h1><p>Keep me</p>';
    expect(captureManualEditSessionEntrySource(null, original)).toBe(original);
    expect(captureManualEditSessionEntrySource(original, '<h1>Typed</h1><p>Keep me</p>')).toBe(original);
  });

  it('commits Confirm/Save as the next Cancel baseline', () => {
    expect(commitManualEditSessionEntrySource('<h1>Saved</h1>')).toBe('<h1>Saved</h1>');
  });

  it('drops blur-then-cancel writes that started before the cancel epoch', () => {
    const started = 3;
    const cancelled = beginManualEditPersistEpoch(started);
    expect(shouldPersistManualEditSessionWrite({
      startedEpoch: started,
      currentEpoch: cancelled,
    })).toBe(false);
    expect(shouldPersistManualEditSessionWrite({
      startedEpoch: cancelled,
      currentEpoch: cancelled,
    })).toBe(true);
  });

  it('restores every in-session element, not only the last editor', () => {
    const sessionSource = '<h1>Original title</h1><p>Keep me</p>';
    const liveSource = '<h1>Changed title</h1><p>Changed body</p>';
    expect(planManualEditSessionCancel({ sessionSource, liveSource })).toEqual({
      restoreSource: sessionSource,
      writeSnapshotToDisk: true,
      remountPreview: true,
    });
  });

  it('remounts the iframe after a skipped persist so Cancel does not write dirty HTML', () => {
    const sessionSource = '<p>Keep me</p>';
    expect(planManualEditSessionCancel({
      sessionSource,
      liveSource: sessionSource,
    })).toEqual({
      restoreSource: sessionSource,
      writeSnapshotToDisk: false,
      remountPreview: true,
    });
  });

  it('writes the entry snapshot back when empty persist deleted the node text', () => {
    const sessionSource = '<p data-od-id="chip">Keep me</p>';
    expect(planManualEditSessionCancel({
      sessionSource,
      liveSource: '<p data-od-id="chip"></p>',
    })).toEqual({
      restoreSource: sessionSource,
      writeSnapshotToDisk: true,
      remountPreview: true,
    });
  });

  it('is a no-op when edit mode never captured a snapshot', () => {
    expect(planManualEditSessionCancel({
      sessionSource: null,
      liveSource: '<p>Draft</p>',
    })).toEqual({
      restoreSource: null,
      writeSnapshotToDisk: false,
      remountPreview: false,
    });
  });
});
