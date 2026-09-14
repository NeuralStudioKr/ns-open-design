import { describe, expect, it, vi } from 'vitest';
import { observeTemplateCloneOutlineQuality } from '../../src/teamver/templateCloneOutlineQuality';

describe('observeTemplateCloneOutlineQuality (루프526)', () => {
  it('returns a payload for a model outline and does not throw on empty text', () => {
    const empty = observeTemplateCloneOutlineQuality({
      rawFinalText: '',
      kind: 'abort',
    });
    expect(empty?.source).toBe('none');
    const model = observeTemplateCloneOutlineQuality({
      rawFinalText: JSON.stringify({
        title: '분기 전략',
        slides: [{ title: '분기 전략' }, { title: '핵심', roleHint: 'cards' }],
      }),
      kind: 'slot-fill',
    });
    expect(model?.source).toBe('model');
    expect(model?.outline?.slideCount).toBe(2);
  });

  it('swallows observer exceptions so persist can continue', async () => {
    vi.resetModules();
    vi.doMock('@open-design/contracts', async () => {
      const actual = await vi.importActual<typeof import('@open-design/contracts')>(
        '@open-design/contracts',
      );
      return {
        ...actual,
        buildTemplateCloneOutlineQualityObserve: () => {
          throw new Error('observe boom');
        },
      };
    });
    const { observeTemplateCloneOutlineQuality: observe } = await import(
      '../../src/teamver/templateCloneOutlineQuality'
    );
    expect(observe({
      rawFinalText: '{"title":"x","slides":[{"title":"x"}]}',
      kind: 'slot-fill',
    })).toBeNull();
    vi.doUnmock('@open-design/contracts');
    vi.resetModules();
  });
});
