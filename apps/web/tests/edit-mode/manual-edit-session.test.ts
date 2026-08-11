import { describe, expect, it } from 'vitest';
import {
  manualEditPatchBaseSource,
  shouldHoldDiskPreviewDuringManualEdit,
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
