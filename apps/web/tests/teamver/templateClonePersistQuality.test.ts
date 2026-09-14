import { describe, expect, it, vi } from 'vitest';

import { observeTemplateClonePersistQuality } from '../../src/teamver/templateClonePersistQuality';

describe('observeTemplateClonePersistQuality (루프523)', () => {
  it('returns a payload and does not throw on empty HTML', () => {
    const payload = observeTemplateClonePersistQuality({
      phase: 'json-slot-fill',
      html: '',
      applied: false,
    });
    expect(payload).not.toBeNull();
    expect(payload?.after).toBeNull();
    expect(payload?.applied).toBe(false);
  });

  it('swallows observer exceptions so persist can continue', async () => {
    vi.resetModules();
    vi.doMock('@open-design/contracts', async () => {
      const actual = await vi.importActual<typeof import('@open-design/contracts')>(
        '@open-design/contracts',
      );
      return {
        ...actual,
        buildTemplateClonePersistQualityObserve: () => {
          throw new Error('observe boom');
        },
      };
    });
    const { observeTemplateClonePersistQuality: observe } = await import(
      '../../src/teamver/templateClonePersistQuality'
    );
    expect(observe({
      phase: 'prompt-fill-look-merge',
      html: '<section class="slide"><h1>x</h1></section>',
    })).toBeNull();
    vi.doUnmock('@open-design/contracts');
    vi.resetModules();
  });
});
