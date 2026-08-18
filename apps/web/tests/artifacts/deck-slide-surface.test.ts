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

  it('does not flatten Capsule radial-gradient slides with a --bg paper token', () => {
    const html = `<!doctype html><html><head><style>
:root{--bg:#F5F5F0;--fg:#1A1A1A}
</style></head>
<body style="margin:0;background:#F5F5F0;color:#1A1A1A">
<section class="slide" style="width:1920px;height:1080px;background:radial-gradient(ellipse at 20% 80%, rgba(200,217,78,0.18) 0%,transparent 50%), #F5F5F0">
<span class="pill pill-coral">shadcn/ui</span>
</section>
</body></html>`;
    const repaired = repairDeckSlideSurfaceBleed(html);
    expect(repaired).not.toMatch(
      /html,\s*body,\s*\.slide,\s*section\.slide\s*\{[^}]*background:\s*#F5F5F0\s*!important/i,
    );
    expect(repaired).toContain('radial-gradient');
  });

  it('relaxes a persisted bleed that flattened decorative slide washes', () => {
    const html = `<!doctype html><html><body style="background:#F5F5F0;color:#1A1A1A">
<section class="slide" style="width:1920px;height:1080px;background:radial-gradient(ellipse at 80% 20%, rgba(139,180,247,0.15) 0%,transparent 50%), #F5F5F0">
<h1>Title</h1>
</section>
<style data-od-slide-surface-bleed="">html, body, .slide, section.slide { background: #F5F5F0 !important; color: #1A1A1A !important; }</style>
</body></html>`;
    const repaired = repairDeckSlideSurfaceBleed(html);
    expect(repaired).toContain('data-od-slide-surface-bleed');
    expect(repaired).toMatch(/html,\s*body\s*\{[^}]*background:\s*#F5F5F0/i);
    expect(repaired).not.toMatch(/html,\s*body,\s*\.slide,\s*section\.slide/i);
  });

  it('strips leftover Google Fonts css2 debris so :root tokens stay a real rule', () => {
    const html = `<!doctype html><html><body>
<section class="slide" style="width:1920px;height:1080px;background:#F5F0E6">
<style>1,6..96,400..900&family=Space+Grotesk:wght@300;400;500;600;700&display=swap');
:root{--coral:#E85D4E}
.pill{border-radius:9999px}</style>
<h1>Title</h1>
</section>
</body></html>`;
    const repaired = repairDeckSlideSurfaceBleed(html);
    expect(repaired).not.toMatch(/1,6\.\.96/i);
    expect(repaired).not.toContain("display=swap')");
    expect(repaired).toContain(':root{--coral:#E85D4E}');
    expect(repaired).toContain('.pill{border-radius:9999px}');
  });
});
