// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  filterRootTargetsForGroupGeometry,
  pruneNestedManualEditSelectionIds,
} from '../../src/edit-mode/manual-edit-selection-ancestry';
import { nextManualEditSelectionIds } from '../../src/edit-mode/manual-edit-multi-select';

describe('manual-edit-selection-ancestry', () => {
  const isDescendant = (child: string, ancestor: string) => (
    child === 'child' && ancestor === 'parent'
  );

  it('prunes descendants from a selection set', () => {
    expect(pruneNestedManualEditSelectionIds(['parent', 'child', 'sibling'], isDescendant))
      .toEqual(['parent', 'sibling']);
  });

  it('keeps only root targets for group geometry', () => {
    const roots = filterRootTargetsForGroupGeometry(
      [{ id: 'parent' }, { id: 'child' }, { id: 'sibling' }],
      isDescendant,
    );
    expect(roots.map((item) => item.id)).toEqual(['parent', 'sibling']);
  });

  it('replaces ancestor with descendant on additive select', () => {
    expect(nextManualEditSelectionIds(['parent'], 'child', true, 32, isDescendant))
      .toEqual(['child']);
  });

  it('replaces descendant with ancestor on additive select', () => {
    expect(nextManualEditSelectionIds(['child'], 'parent', true, 32, isDescendant))
      .toEqual(['parent']);
  });
});
