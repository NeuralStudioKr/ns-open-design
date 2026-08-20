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

  it('heals truncated Google Fonts remnant before isolating the cover', () => {
    const html = `<html><body>
<style>1,6..96,400..900&family=Space+Grotesk:wght@300;400;500;600;700&display=swap');
:root{--coral:#E85D4E}
.pill{border-radius:9999px}</style>
<section class="slide">CoverPill</section>
<section class="slide">Later</section>
</body></html>`;
    const prepared = prepareCoverHtmlBatchBody(html);
    expect(prepared).toContain('CoverPill');
    expect(prepared).not.toContain('Later');
    expect(prepared).not.toMatch(/1,6\.\.96/i);
    expect(prepared).toContain(':root{--coral:#E85D4E}');
    expect(prepared).toContain('.pill{border-radius:9999px}');
  });

  it('relaxes persisted flatten bleed before isolating the cover', () => {
    const html = `<html><head><style>
.slide-1{background:radial-gradient(circle at 20% 20%, rgba(232,93,78,0.2), transparent 50%), #F5F5F0}
</style></head><body>
<section class="slide slide-1">CoverWash</section>
<section class="slide">Later</section>
<style data-od-slide-surface-bleed="">html, body, .slide, section.slide { background: #F5F5F0 !important; color: #1A1A1A !important; }</style>
</body></html>`;
    const prepared = prepareCoverHtmlBatchBody(html);
    expect(prepared).toContain('CoverWash');
    expect(prepared).not.toContain('Later');
    expect(prepared).toContain('radial-gradient');
    expect(prepared).not.toMatch(
      /html,\s*body,\s*\.slide,\s*section\.slide\s*\{[^}]*background:\s*#F5F5F0\s*!important/i,
    );
    expect(prepared).toMatch(/html,\s*body\s*\{[^}]*background:\s*#F5F5F0/i);
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
