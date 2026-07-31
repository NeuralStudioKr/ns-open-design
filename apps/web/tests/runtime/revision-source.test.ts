import { describe, expect, it } from 'vitest';
import { revisionSourceIcon } from '../../src/runtime/revision-source';

describe('revisionSourceIcon', () => {
  it('maps known revision sources to remix icon names', () => {
    expect(revisionSourceIcon('manual_edit')).toBe('edit-line');
    expect(revisionSourceIcon('inspect')).toBe('contrast-drop-2-line');
    expect(revisionSourceIcon('agent_full_deck')).toBe('sparkling-2-line');
    expect(revisionSourceIcon('restore')).toBe('history-line');
  });
});
