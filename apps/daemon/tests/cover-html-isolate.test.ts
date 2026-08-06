import { describe, expect, it } from 'vitest';

import {
  isolateFirstDeckSlideHtml,
  prepareCoverHtmlBatchBody,
} from '../src/cover-html-isolate.js';

describe('cover-html-isolate (0806-N07)', () => {
  it('keeps only the first top-level slide block', () => {
    const html = `<!doctype html><html><body>
<section class="slide active">One</section>
<section class="slide">Two</section>
</body></html>`;
    const isolated = isolateFirstDeckSlideHtml(html);
    expect(isolated).toContain('One');
    expect(isolated).not.toContain('Two');
  });

  it('strips scripts after isolation', () => {
    const html = `<html><body>
<section class="slide">A</section>
<section class="slide">B</section>
<script>alert(1)</script>
</body></html>`;
    const prepared = prepareCoverHtmlBatchBody(html);
    expect(prepared).toContain('A');
    expect(prepared).not.toContain('B');
    expect(prepared).not.toMatch(/<script/i);
  });
});
