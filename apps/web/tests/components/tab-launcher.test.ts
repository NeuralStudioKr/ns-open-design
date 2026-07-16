import { describe, expect, it, vi } from 'vitest';

import { buildLauncherActions } from '../../src/components/workspace/tab-launcher';

describe('buildLauncherActions', () => {
  it('hides New Browser and New Terminal entrypoints by default', () => {
    const actions = buildLauncherActions({
      projectId: 'p1',
      openTab: vi.fn(),
      createBrowser: vi.fn(),
      createTerminal: vi.fn(async () => 'term-1'),
    });

    expect(actions.map((action) => action.id)).toEqual([]);
  });
});
