// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { isManualEditKeyboardTextTarget } from '../../src/edit-mode/manual-edit-keyboard';

describe('manual edit keyboard text target', () => {
  it('treats plaintext-only editing hosts as text targets even without isContentEditable', () => {
    const host = document.createElement('main');
    host.setAttribute('contenteditable', 'plaintext-only');
    host.setAttribute('data-od-editing', 'true');
    document.body.append(host);
    // Some engines leave isContentEditable false for plaintext-only; the
    // attribute / data-od-editing markers must still win.
    Object.defineProperty(host, 'isContentEditable', { configurable: true, value: false });
    expect(isManualEditKeyboardTextTarget(host)).toBe(true);
    host.remove();
  });

  it('treats nested caret targets inside an editing host as text targets', () => {
    const host = document.createElement('main');
    host.setAttribute('data-od-editing', 'true');
    const child = document.createElement('span');
    host.append(child);
    document.body.append(host);
    expect(isManualEditKeyboardTextTarget(child)).toBe(true);
    host.remove();
  });

  it('does not treat ordinary preview nodes as text targets', () => {
    const node = document.createElement('main');
    document.body.append(node);
    expect(isManualEditKeyboardTextTarget(node)).toBe(false);
    node.remove();
  });
});
