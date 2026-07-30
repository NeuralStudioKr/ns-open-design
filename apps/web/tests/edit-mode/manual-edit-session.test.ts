import { describe, expect, it } from 'vitest';
import {
  manualEditPatchBaseSource,
  shouldHoldDiskPreviewDuringManualEdit,
  shouldSkipManualEditHistoryConfirm,
  shouldSuppressHostDeckKeyboardNav,
} from '../../src/edit-mode/manual-edit-session';

describe('manual edit session', () => {
  it('patches against the frozen canvas while edit mode is active', () => {
    expect(manualEditPatchBaseSource({
      manualEditMode: true,
      frozenSource: '<html>frozen</html>',
      liveSource: '<html>live</html>',
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
