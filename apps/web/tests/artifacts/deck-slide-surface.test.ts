import { describe, expect, it } from 'vitest';
import {
  inferDeckSlidePaperSurface,
  repairDeckSlideSurfaceBleed,
} from '../../src/artifacts/deck-slide-surface';

describe('deck-slide-surface', () => {
  it('promotes cream from slide onto white body (letterbox bands)', () => {
    const html = `<!doctype html><html><body style="margin:0">
<section class="slide" style="width:1920px;height:1080px;background:#F5F0E6;color:#2D2D2D">
<h1>Expo</h1>
</section>
</body></html>`;
    const repaired = repairDeckSlideSurfaceBleed(html);
    expect(repaired).toContain('data-od-slide-surface-bleed');
    expect(repaired).toMatch(/background:\s*#F5F0E6/i);
    expect(repaired).toContain('html, body, .slide, section.slide');
    // Idempotent.
    expect(repairDeckSlideSurfaceBleed(repaired)).toBe(repaired);
  });

  it('promotes cream from inner paper panel onto white slide', () => {
    const html = `<!doctype html><html><body>
<section class="slide" style="width:1920px;height:1080px;background:#ffffff">
<div style="width:1800px;height:1000px;background:#F5F0E6;color:#2D2D2D">
<h1>Expo Deep Dive</h1>
</div>
</section>
</body></html>`;
    const paper = inferDeckSlidePaperSurface(html);
    expect(paper?.background.toLowerCase()).toBe('#f5f0e6');
    const repaired = repairDeckSlideSurfaceBleed(html);
    expect(repaired).toContain('data-od-slide-surface-bleed');
    expect(repaired).toMatch(/background:\s*#F5F0E6/i);
  });

  it('uses --cream token when slide backgrounds are missing', () => {
    const html = `<!doctype html><html><head><style>:root{--cream:#F5F0E6;--text-dark:#2D2D2D}</style></head>
<body><section class="slide" style="width:1920px;height:1080px"><h1>Title</h1></section></body></html>`;
    const paper = inferDeckSlidePaperSurface(html);
    expect(paper).toEqual({ background: '#F5F0E6', color: '#2D2D2D' });
    expect(repairDeckSlideSurfaceBleed(html)).toContain('#F5F0E6');
  });

  it('does not rewrite when html/body/slide already share non-white paper', () => {
    const html = `<!doctype html><html><head><style>
html, body, .slide { background:#F5F0E6; color:#2D2D2D; }
</style></head>
<body style="background:#F5F0E6;color:#2D2D2D">
<section class="slide" style="width:1920px;height:1080px;background:#F5F0E6;color:#2D2D2D"><h1>OK</h1></section>
</body></html>`;
    expect(repairDeckSlideSurfaceBleed(html)).toBe(html);
  });
});
