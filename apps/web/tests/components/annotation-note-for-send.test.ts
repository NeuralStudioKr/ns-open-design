import { describe, expect, it } from 'vitest';

import { annotationNoteForSend } from '../../src/components/PreviewDrawOverlay';

describe('annotationNoteForSend', () => {
  it('prefixes slide number when a deck note is sent without a screenshot', () => {
    expect(
      annotationNoteForSend(
        '제목 크게',
        2,
        true,
        (index) => `Slide ${index}`,
      ),
    ).toBe('Slide 3\n제목 크게');
  });

  it('does not duplicate an existing slide prefix', () => {
    expect(
      annotationNoteForSend(
        'Slide 3\n제목 크게',
        2,
        true,
        (index) => `Slide ${index}`,
      ),
    ).toBe('Slide 3\n제목 크게');
  });
});
