import { describe, expect, it } from 'vitest';
import {
  deckHasPerSlideSurfacePaint,
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

  it('promotes paper onto labeled Neutral hosts that omit class=slide (§1.04)', () => {
    const html = `<!doctype html><html><head><style>
:root{--cream:#F5F0E6;--text-dark:#2D2D2D}
html, body { margin:0; background:#ffffff; }
</style></head>
<body>
<section class="s1" data-screen-label="01 Cover"><h1>Cover</h1></section>
</body></html>`;
    const repaired = repairDeckSlideSurfaceBleed(html);
    expect(repaired).toContain('data-od-slide-surface-bleed');
    expect(repaired).toContain('[data-screen-label]');
    expect(repaired).toMatch(/background:\s*#F5F0E6/i);
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

  it('prefers Hermes --hc-bg over shared light :root --bg', () => {
    const html = `<!doctype html><html><head><style>
:root{--bg:#ffffff;--surface:#ffffff;--fg:#111}
.tpl-hermes-cyber-terminal{--hc-bg:#0a0c10;--hc-ink:#e8f0ea;background:var(--hc-bg);color:var(--hc-ink)}
.tpl-hermes-cyber-terminal .slide{background:var(--hc-bg);color:var(--hc-ink)}
</style></head>
<body class="tpl-hermes-cyber-terminal">
<section class="slide" style="width:1920px;height:1080px"><h1>$ cover</h1></section>
</body></html>`;
    expect(inferDeckSlidePaperSurface(html)?.background.toLowerCase()).toBe('#0a0c10');
    expect(deckHasPerSlideSurfacePaint(html)).toBe(true);
    const repaired = repairDeckSlideSurfaceBleed(html);
    expect(repaired).toMatch(/background:\s*#0a0c10/i);
    expect(repaired).not.toMatch(
      /html,\s*body,\s*\.slide,\s*section\.slide\s*\{[^}]*background:\s*#ffffff\s*!important/i,
    );
    // Letterbox only — keep `.tpl-* .slide` identity wash.
    expect(repaired).toMatch(
      /html,\s*body\s*\{[^}]*background:\s*#0a0c10\s*!important/i,
    );
  });

  it('upgrades persisted cream flatten bleed after dark identity look is present', () => {
    const html = `<!doctype html><html><head>
<style data-od-official-look-css>
:root{--bg:#ffffff}
.tpl-hermes-cyber-terminal{--hc-bg:#0a0c10;--hc-ink:#e8f0ea}
.tpl-hermes-cyber-terminal .slide{background:var(--hc-bg);color:var(--hc-ink)}
</style>
<style data-od-slide-surface-bleed>
html, body, .slide, section.slide { background: #F5F0E6 !important; color: #2D2D2D !important; }
</style>
</head>
<body class="tpl-hermes-cyber-terminal">
<section class="slide" style="width:1920px;height:1080px"><h1>Terminal</h1></section>
</body></html>`;
    const repaired = repairDeckSlideSurfaceBleed(html);
    expect(repaired).toMatch(/background:\s*#0a0c10\s*!important/i);
    expect(repaired).not.toMatch(
      /html,\s*body,\s*\.slide,\s*section\.slide\s*\{[^}]*background:\s*#F5F0E6\s*!important/i,
    );
  });

  it('루프392: prefers --dark-void over leftover --cream for letterbox bleed', () => {
    const html = `<!doctype html><html><head>
<style data-od-neobrutal-var-fallback>:root{--cream:#FFDC8B;--paper:var(--cream)}</style>
<style data-od-official-look-css>
:root{--neon-pink:#F0A6CA;--dark-void:#0A0E27;--deep-navy:#0F1B3D;--cream:#FFDC8B}
.slide{background:var(--dark-void);color:var(--neon-pink)}
</style>
</head>
<body>
<section class="slide" style="width:1920px;height:1080px;background:#0A0E27;color:#F0A6CA">
<h1 class="pixel-hero-text">팀버</h1>
</section>
</body></html>`;
    expect(inferDeckSlidePaperSurface(html)?.background.toLowerCase()).toBe('#0a0e27');
    const repaired = repairDeckSlideSurfaceBleed(html);
    expect(repaired).toMatch(/background:\s*#0A0E27\s*!important/i);
    expect(repaired).not.toMatch(/background:\s*#FFDC8B\s*!important/i);
  });

  it('루프398: prefers Capsule --bg soft wash over neo leftover --cream letterbox', () => {
    const html = `<!doctype html><html><head>
<style data-od-neobrutal-var-fallback>:root{--cream:#FFDC8B;--paper:var(--cream);--ink:#2D2D2D}</style>
<style data-od-official-look-css>
:root{--coral:#E85D4E;--bg:#F5F5F0;--fg:#1A1A1A;--cream:#FFDC8B}
.slide{background:var(--bg);color:var(--fg)}
</style>
</head>
<body>
<section class="slide" style="width:1920px;height:1080px;background:#F5F5F0;color:#1A1A1A">
<div class="title-pill">SERVICE INTRO</div>
<h1 class="main-title">팀버 소개</h1>
</section>
</body></html>`;
    expect(inferDeckSlidePaperSurface(html)?.background.toLowerCase()).toBe('#f5f5f0');
    const repaired = repairDeckSlideSurfaceBleed(html);
    expect(repaired).toMatch(/background:\s*#F5F5F0\s*!important/i);
    expect(repaired).not.toMatch(/background:\s*#FFDC8B\s*!important/i);
  });

  it('루프399: Capsule coral + neo cream without --bg does not letterbox yellow', () => {
    const html = `<!doctype html><html><head>
<style data-od-neobrutal-var-fallback>:root{--cream:#FFDC8B;--paper:var(--cream)}</style>
<style data-od-official-look-css>
:root{--coral:#E85D4E;--fg:#1A1A1A;--cream:#FFDC8B}
.slide{background:#F5F5F0;color:var(--fg)}
</style>
</head>
<body>
<section class="slide" style="width:1920px;height:1080px;background:#F5F5F0;color:#1A1A1A">
<h1 class="main-title">팀버</h1>
</section>
</body></html>`;
    expect(inferDeckSlidePaperSurface(html)?.background.toLowerCase()).not.toBe('#ffdc8b');
    const repaired = repairDeckSlideSurfaceBleed(html);
    expect(repaired).not.toMatch(/background:\s*#FFDC8B\s*!important/i);
  });

  it('flattens MiniMax Neutral navy/cream gradients once official look CSS is present', () => {
    const html = `<!doctype html><html><head>
<style data-od-official-look-css>
:root{--bg:#F5F0E6;--fg:#2D2D2D}
.slide{background:var(--bg);color:var(--fg)}
</style>
</head>
<body style="margin:0">
<section class="slide" style="width:1920px;height:1080px;background:linear-gradient(#1e293b 0 38%, #f3efe4 38%);color:#f8fafc">
<h1>커버</h1>
</section>
</body></html>`;
    const repaired = repairDeckSlideSurfaceBleed(html);
    expect(repaired).toMatch(/html,\s*body,\s*\.slide[\s\S]*background:\s*#F5F0E6\s*!important/i);
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

  it('treats catalog slide-role surfaces and ignores chrome hosts', () => {
    expect(isDeckSlideSurfaceSelector('.slide')).toBe(true);
    expect(isDeckSlideSurfaceSelector('section.slide')).toBe(true);
    expect(isDeckSlideSurfaceSelector('.slide-1')).toBe(true);
    expect(isDeckSlideSurfaceSelector('.slide-10.active')).toBe(true);
    expect(isDeckSlideSurfaceSelector('.slide-title')).toBe(true);
    expect(isDeckSlideSurfaceSelector('.slide-weekly')).toBe(true);
    expect(isDeckSlideSurfaceSelector('.slide-red')).toBe(true);
    expect(isDeckSlideSurfaceSelector('.s-cover')).toBe(true);
    expect(isDeckSlideSurfaceSelector('.bg-cork', new Set(['bg-cork']))).toBe(true);
    expect(isDeckSlideSurfaceSelector('.slide-inner')).toBe(false);
    expect(isDeckSlideSurfaceSelector('.slide-header')).toBe(false);
    expect(isDeckSlideSurfaceSelector('.slide-counter')).toBe(false);
    expect(isDeckSlideSurfaceSelector('.slide-number')).toBe(false);
    expect(isDeckSlideSurfaceSelector('.slide-content')).toBe(false);
  });

  it('does not flatten Daisy per-slide role colors with a --cream paper token', () => {
    const html = `<!doctype html><html><head><style>
:root{--cream:#F5F0E6;--turquoise:#3EC8C0;--text-dark:#2D2D2D}
html, body { background: var(--cream); color: var(--text-dark); }
.slide { width:100vw; height:100vh; }
.slide-title { background: var(--cream); }
.slide-weekly { background: var(--turquoise); }
</style></head>
<body>
<section class="slide slide-title"><h1>Cover</h1></section>
<section class="slide slide-weekly"><h2>Week</h2></section>
</body></html>`;
    expect(deckHasPerSlideSurfacePaint(html)).toBe(true);
    const repaired = repairDeckSlideSurfaceBleed(html);
    expect(repaired).toContain('.slide-weekly { background: var(--turquoise); }');
    expect(repaired).not.toMatch(
      /html,\s*body,\s*\.slide,\s*section\.slide\s*\{[^}]*background:\s*#F5F0E6\s*!important/i,
    );
    expect(repairDeckSlideSurfaceBleed(repaired)).toBe(repaired);
  });

  it('does not flatten inline per-slide colors when CSS has only generic .slide', () => {
    const html = `<!doctype html><html><head><style>
:root{--cream:#F5F0E6;--red:#E10600}
.slide { width:100vw; height:100vh; }
</style></head>
<body>
<section class="slide" style="background:#F5F0E6;color:#2D2D2D"><h1>Cover</h1></section>
<section class="slide" style="background:#E10600;color:#F5F0E6"><h2>Statement</h2></section>
</body></html>`;
    expect(deckHasPerSlideSurfacePaint(html)).toBe(true);
    const repaired = repairDeckSlideSurfaceBleed(html);
    expect(repaired).not.toMatch(
      /html,\s*body,\s*\.slide,\s*section\.slide\s*\{[^}]*background:\s*#F5F0E6\s*!important/i,
    );
    expect(repaired).toContain('background:#E10600');
  });

  it('does not flatten Bold Poster .slide-red against --bg paper', () => {
    const html = `<!doctype html><html><head><style>
:root{--bg:#F4EFE6;--red:#E10600;--dark:#111}
html, body { background: var(--bg); }
.slide { position:absolute; inset:0; }
.slide-hero { background: var(--bg); }
.slide-red { background: var(--red); color: var(--bg); }
</style></head>
<body>
<div class="slide slide-hero active"><h1>Hero</h1></div>
<div class="slide slide-red"><p>Statement</p></div>
</body></html>`;
    const repaired = repairDeckSlideSurfaceBleed(html);
    expect(repaired).toContain('.slide-red { background: var(--red); color: var(--bg); }');
    expect(repaired).not.toMatch(
      /html,\s*body,\s*\.slide,\s*section\.slide\s*\{[^}]*!important/i,
    );
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
