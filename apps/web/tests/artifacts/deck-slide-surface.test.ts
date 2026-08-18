import { describe, expect, it } from 'vitest';
import {
  inferDeckSlidePaperSurface,
  isDeckSlideSurfaceSelector,
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

  it('does not flatten non-Capsule decorative washes (Sakura/Hermes-style)', () => {
    const html = `<!doctype html><html><head><style>
:root{--bg:#FFF5F7;--fg:#2D2D2D}
.petal{position:absolute;width:80px;height:80px}
.hc-scanline{opacity:0.35}
</style></head>
<body style="margin:0;background:#FFF5F7;color:#2D2D2D">
<section class="slide" style="width:1920px;height:1080px;background:linear-gradient(135deg, rgba(255,182,193,0.25), transparent 55%), #FFF5F7">
<div class="petal"></div>
<div class="hc-scanline"></div>
</section>
</body></html>`;
    const repaired = repairDeckSlideSurfaceBleed(html);
    expect(repaired).not.toMatch(
      /html,\s*body,\s*\.slide,\s*section\.slide\s*\{[^}]*background:\s*#FFF5F7\s*!important/i,
    );
    expect(repaired).toContain('linear-gradient');
    expect(repaired).toContain('.petal{position:absolute');
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

  it('does not flatten Capsule .slide-1 Motif washes with a --bg paper token', () => {
    const html = `<!doctype html><html><head><style>
:root{--bg:#F5F5F0;--fg:#1A1A1A}
html, body { background: var(--bg); color: var(--fg); }
.slide { position:absolute; inset:0; opacity:0; }
.slide-1 {
  background:
    radial-gradient(ellipse at 20% 80%, rgba(200,217,78,0.15) 0%, transparent 50%),
    var(--bg);
}
.slide-inner { background:#fff; }
</style></head>
<body>
<section class="slide slide-1 active"><div class="slide-inner"><span class="pill">shadcn/ui</span></div></section>
</body></html>`;
    const repaired = repairDeckSlideSurfaceBleed(html);
    expect(repaired).toContain('radial-gradient');
    expect(repaired).not.toMatch(
      /html,\s*body,\s*\.slide,\s*section\.slide\s*\{[^}]*background:\s*#F5F5F0\s*!important/i,
    );
    if (repaired.includes('data-od-slide-surface-bleed')) {
      expect(repaired).toMatch(/html,\s*body\s*\{[^}]*background:\s*#F5F5F0/i);
    }
  });

  it('treats numbered .slide-N as surfaces and ignores .slide-inner chrome', () => {
    expect(isDeckSlideSurfaceSelector('.slide')).toBe(true);
    expect(isDeckSlideSurfaceSelector('section.slide')).toBe(true);
    expect(isDeckSlideSurfaceSelector('.slide-1')).toBe(true);
    expect(isDeckSlideSurfaceSelector('.slide-10.active')).toBe(true);
    expect(isDeckSlideSurfaceSelector('.slide-inner')).toBe(false);
    expect(isDeckSlideSurfaceSelector('.slide-header')).toBe(false);
    expect(isDeckSlideSurfaceSelector('.slide-counter')).toBe(false);
  });

  it('does not treat slide-inner chrome as the deck slide surface', () => {
    const html = `<!doctype html><html><head><style>
:root{--bg:#F5F5F0}
.slide-1{background:radial-gradient(circle at 20% 20%, rgba(232,93,78,0.2), transparent 50%), #F5F5F0}
</style></head>
<body>
<section class="slide slide-1">
<div class="slide-inner" style="width:1800px;height:1000px;background:#ffffff">
<span class="pill">label</span>
</div>
</section>
</body></html>`;
    const repaired = repairDeckSlideSurfaceBleed(html);
    expect(repaired).not.toMatch(
      /html,\s*body,\s*\.slide,\s*section\.slide\s*\{[^}]*background:\s*#F5F5F0\s*!important/i,
    );
    expect(repaired).toContain('radial-gradient');
  });

  it('strips leftover Google Fonts css2 debris so Motif rules stay parseable (any template)', () => {
    const html = `<!doctype html><html><body>
<section class="slide" style="width:1920px;height:1080px;background:#F5F0E6">
<style>1,6..96,400..900&family=Space+Grotesk:wght@300;400;500;600;700&display=swap');
:root{--coral:#E85D4E}
.pill{border-radius:9999px}
.petal{position:absolute}
.pin-1{width:40px}
.hc-scanline{opacity:0.4}</style>
<h1>Title</h1>
</section>
</body></html>`;
    const repaired = repairDeckSlideSurfaceBleed(html);
    expect(repaired).not.toMatch(/1,6\.\.96/i);
    expect(repaired).not.toContain("display=swap')");
    expect(repaired).toContain(':root{--coral:#E85D4E}');
    expect(repaired).toContain('.pill{border-radius:9999px}');
    expect(repaired).toContain('.petal{position:absolute}');
    expect(repaired).toContain('.pin-1{width:40px}');
    expect(repaired).toContain('.hc-scanline{opacity:0.4}');
  });
});
