import { describe, expect, it } from 'vitest';

import { resolveEmbedSlideDesignSystemId } from '../src/teamver/embedSlideDesignSystem';

const systems = [
  { id: 'default', title: 'Default', source: 'installed' as const, status: 'published' as const },
  { id: 'acme', title: 'Acme', source: 'user' as const, status: 'published' as const, isEditable: true },
  { id: 'draft-official', title: 'Draft', source: 'installed' as const, status: 'draft' as const },
];

describe('resolveEmbedSlideDesignSystemId', () => {
  it('keeps an explicit project selection', () => {
    expect(
      resolveEmbedSlideDesignSystemId({
        explicitId: 'acme',
        workspaceDefaultId: 'default',
        designSystems: systems,
      }),
    ).toBe('acme');
  });

  it('falls back to workspace default when nothing is selected', () => {
    expect(
      resolveEmbedSlideDesignSystemId({
        explicitId: null,
        workspaceDefaultId: 'acme',
        designSystems: systems,
      }),
    ).toBe('acme');
  });

  it('uses built-in default before other official presets', () => {
    expect(
      resolveEmbedSlideDesignSystemId({
        explicitId: null,
        workspaceDefaultId: null,
        designSystems: systems,
      }),
    ).toBe('default');
  });
});
