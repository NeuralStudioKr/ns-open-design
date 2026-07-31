// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  canonicalManualEditStyleValue,
  manualEditStyleValuesEqual,
  normalizeManualEditInspectorColor,
} from '../../src/edit-mode/manual-edit-style-values';

describe('manual-edit-style-values', () => {
  it('normalizes rgb colors to hex for inspector comparison', () => {
    expect(normalizeManualEditInspectorColor('rgb(239, 68, 68)')).toBe('#ef4444');
    expect(manualEditStyleValuesEqual('color', '#ef4444', 'rgb(239, 68, 68)')).toBe(true);
  });

  it('canonicalizes size values case-insensitively', () => {
    expect(canonicalManualEditStyleValue('fontSize', '24PX')).toBe('24px');
    expect(manualEditStyleValuesEqual('fontSize', '24px', '24PX')).toBe(true);
  });
});
