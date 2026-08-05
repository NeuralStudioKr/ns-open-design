import { afterEach, describe, expect, it, vi } from 'vitest';
import { createManualEditRemeasureAwaiter } from '../../src/edit-mode/remeasure-await';
import { emptyManualEditStyles, type ManualEditTarget } from '../../src/edit-mode/types';

afterEach(() => {
  vi.useRealTimers();
});

function measuredTarget(id = 'hero'): ManualEditTarget {
  return {
    id,
    kind: 'text',
    label: 'Hero',
    tagName: 'h1',
    className: '',
    text: 'Hero',
    rect: { x: 60, y: 70, width: 100, height: 50 },
    fields: { text: 'Hero' },
    attributes: { 'data-od-id': id },
    styles: emptyManualEditStyles(),
    isLayoutContainer: false,
    outerHtml: '<h1>Hero</h1>',
    layoutWidth: 200,
    layoutHeight: 100,
  };
}

describe('createManualEditRemeasureAwaiter', () => {
  it('resolves when complete is called with a measured target', async () => {
    const awaiter = createManualEditRemeasureAwaiter();
    const pending = awaiter.waitFor('hero');
    awaiter.complete('hero', measuredTarget());
    await expect(pending).resolves.toEqual(expect.objectContaining({ id: 'hero', rect: { x: 60, y: 70, width: 100, height: 50 } }));
  });

  it('resolves null after timeout when no rect arrives', async () => {
    vi.useFakeTimers();
    const awaiter = createManualEditRemeasureAwaiter();
    const pending = awaiter.waitFor('hero', 120);
    const tick = vi.advanceTimersByTimeAsync(120);
    await expect(Promise.race([pending, tick.then(() => pending)])).resolves.toBeNull();
  });

  it('cancelAll resolves pending waiters with null', async () => {
    const awaiter = createManualEditRemeasureAwaiter();
    const pending = awaiter.waitFor('hero');
    awaiter.cancelAll();
    await expect(pending).resolves.toBeNull();
  });
});
