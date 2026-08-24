import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  buildStandaloneDeckHtmlDocument,
  healDeckHtmlForStandaloneExport,
} from '../src/html/deckPdfExport';
import {
  LOOK_NEUTRALIZE_CSS,
  OFFICIAL_DECK_LOOK_STYLE_ATTR,
  OFFICIAL_DECK_MOTIF_HTML_ATTR,
  deckHtmlHasMotifOutsideCanvasHang,
  deckHtmlHasOfficialLookCss,
  ensureOfficialLookStackedCanvasNeutralize,
  extractOfficialDeckLookAssets,
  firstOfficialDeckTemplateId,
  injectStackedCanvasNeutralizeForLetterbox,
  listOfficialLookProofClasses,
  listOfficialMotifSymbolIds,
  lockStackedDeckCanvasForPreview,
  looksLikeOfficialFullscreenPresenterDeck,
  mergeOfficialDeckLookCss,
  needsStackedDesignViewportLock,
  sanitizeMotifOutsideCanvasOffsets,
  stripOfficialLookSlideHostCanvasClips,
} from '../src/html/deck-template-look-css';
import {
  extractTemplateVisualKitFromHtml,
  listLocalStylesheetHrefs,
  resolveSiblingAssetPath,
} from '../src/template-visual-kit';

const CAPSULE_EXAMPLE = `<!doctype html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,400..900&family=Space+Grotesk:wght@400;700&display=swap" rel="stylesheet">
<style>
  :root { --bg:#F5F5F0; --coral:#E85D4E; --font-display:'Bodoni Moda', serif; }
  .slide { opacity:0; position:absolute; inset:0; }
  .slide.active { opacity:1; }
  .pill { border-radius:9999px; border:2px solid #1E1E1E; }
  .pill-coral { background: var(--coral); }
  .pill-lime { background: #C4D94E; }
  .grain-overlay { opacity:0.04; }
  .slide-1 { background: radial-gradient(#fff, var(--bg)); }
</style></head><body></body></html>`;

const COMPACT_FILL = `<!doctype html><html lang="ko"><head><meta charset="utf-8"></head><body>
<style>:root{--bg:#F5F5F0;--coral:#E85D4E}</style>
<div class="slide"><h1>shadcn/ui</h1><p>Copy, Don't Install</p>
<div class="pill pill-coral"></div></div>
<div class="slide"><h2>Radix</h2><p>Architecture</p></div>
</body></html>`;

const TEMPLATE_RESULT_FIXTURES: Array<{
  folder: string;
  html: string;
  motif: RegExp;
  label: string;
}> = [
  {
    folder: 'html-ppt-zhangzara-studio',
    label: 'Studio agency yellow/black chrome',
    motif: /(?:#f5d200|--c-bg-light|font-family:[^;}]*Barlow|letter-spacing:\s*0\.1em)/i,
    html: `<!doctype html><html lang="ko"><body style="margin:0">
<section class="slide dark" data-screen-label="01 Cover" style="width:1920px;height:1080px;box-sizing:border-box;position:relative;padding:96px 104px;background:#1c1c1c;color:#f5d200">
  <p class="studio-kicker" style="letter-spacing:.18em;font-weight:700">SENIOR ENGINEERING TRACK</p>
  <h1 style="font-size:132px;line-height:.92;margin:180px 0 36px">Cloud Native<br/>Engineering</h1>
  <p style="font-size:34px;max-width:1120px">컨테이너·마이크로서비스·플랫폼 운영을 실전 관점에서 해부한다.</p>
</section>
<section class="slide light" data-screen-label="02 Map" style="width:1920px;height:1080px;box-sizing:border-box;position:relative;padding:88px 104px;background:#f5d200;color:#1c1c1c">
  <h2 style="font-size:84px">운영 구조 지도</h2>
  <p style="font-size:32px">클러스터, 배포 파이프라인, 관측 가능성을 하나의 그림으로 정리한다.</p>
</section>
<section class="slide dark" data-screen-label="03 Close" style="width:1920px;height:1080px;box-sizing:border-box;position:relative;padding:96px 104px;background:#1c1c1c;color:#f5d200">
  <h2 style="font-size:92px">Trade-off checklist</h2>
  <p style="font-size:32px">복잡도를 늘리기 전에 자동화, 장애 격리, 소유권을 먼저 확인한다.</p>
</section>
</body></html>`,
  },
  {
    folder: 'html-ppt-zhangzara-daisy-days',
    label: 'Daisy Days four-corner flower identity',
    motif: /deco-daisy[\s\S]{0,240}<svg\b[\s\S]{80,}?#fcdf6c/i,
    html: `<!doctype html><html lang="ko"><body style="margin:0;background:#F5F0E6">
<section class="slide" data-screen-label="01 Cover" style="width:1920px;height:1080px;box-sizing:border-box;position:relative;background:#F5F0E6;color:#2D2D2D;padding:72px 88px">
  <h1>Expo Deep Dive</h1><p>Managed Workflow · EAS · Expo Router를 시니어 관점에서 빠르게 정리합니다.</p>
</section>
<section class="slide" data-screen-label="02 Workflow" style="width:1920px;height:1080px;box-sizing:border-box;position:relative;background:#F5F0E6;color:#2D2D2D;padding:72px 88px">
  <h2>워크플로우 선택 기준</h2><ul><li>네이티브 확장 필요성</li><li>릴리즈 주기</li><li>팀의 운영 역량</li></ul>
</section>
<section class="slide" data-screen-label="03 OTA" style="width:1920px;height:1080px;box-sizing:border-box;position:relative;background:#F5F0E6;color:#2D2D2D;padding:72px 88px">
  <h2>OTA 운영 안전장치</h2><p>채널, 런타임 버전, 롤백 기준을 먼저 설계합니다.</p>
</section>
</body></html>`,
  },
  {
    folder: 'html-ppt-zhangzara-capsule',
    label: 'Capsule oblong pill identity',
    motif: /<(?:div|span)[^>]*\bdeco-pill\b/i,
    html: `<!doctype html><html lang="ko"><body style="margin:0;background:#F5F5F0">
<section class="slide" data-screen-label="01 Cover" style="width:1920px;height:1080px;box-sizing:border-box;position:relative;background:#F5F5F0;color:#1A1A1A;padding:92px 108px">
  <h1>Monorepo for Senior Engineers</h1><p>하나의 저장소로 거대한 코드베이스를 정돈하는 아키텍처 전략</p>
  <div class="pill pill-coral" style="width:240px;height:64px">Nx</div>
</section>
<section class="slide" data-screen-label="02 Boundaries" style="width:1920px;height:1080px;box-sizing:border-box;position:relative;background:#F5F5F0;color:#1A1A1A;padding:92px 108px">
  <h2>경계가 먼저입니다</h2><p>패키지 그래프, ownership, affected build가 확장성의 핵심입니다.</p>
</section>
<section class="slide" data-screen-label="03 Rollout" style="width:1920px;height:1080px;box-sizing:border-box;position:relative;background:#F5F5F0;color:#1A1A1A;padding:92px 108px">
  <h2>점진적 이전 로드맵</h2><p>CI 캐시와 릴리즈 단위를 먼저 고정하고 팀별 이전을 진행합니다.</p>
</section>
</body></html>`,
  },
];

/** Compact fill that copied generic kit layout chrome — must not skip Motif CSS. */
const GENERIC_LAYOUT_COMPACT = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<style>
:root{--bg:#FAFAFA;--text:#111}
.slide{background:var(--bg)}
.slide-1{background:var(--bg)}
.slide-title{font-size:48px}
.slide-hero{display:flex}
.slide-inner{padding:24px}
.slide-weekly{display:grid}
</style></head><body>
<div class="slide slide-1"><h1>Topic</h1></div>
</body></html>`;

const EXAMPLES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../plugins/_official/examples',
);

function loadOfficialLookSource(examplePath: string): string {
  const html = readFileSync(examplePath, 'utf8');
  const previewRel = examplePath.slice(EXAMPLES_DIR.length + 1).replace(/\\/g, '/');
  const sheets: string[] = [];
  for (const href of listLocalStylesheetHrefs(html).slice(0, 3)) {
    const assetPath = resolveSiblingAssetPath(previewRel, href);
    if (!assetPath) continue;
    try {
      const css = readFileSync(join(EXAMPLES_DIR, assetPath), 'utf8');
      if (css.trim()) sheets.push(css);
    } catch {
      /* missing sibling is a catalog gap the merge must still survive */
    }
  }
  if (sheets.length === 0) return html;
  return `${html}\n<style data-od-kit-supplemental>\n${sheets.join('\n')}\n</style>`;
}

function listOfficialDeckExamplePaths(): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(EXAMPLES_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const folder = join(EXAMPLES_DIR, entry.name);
    let manifest: string;
    try {
      manifest = readFileSync(join(folder, 'open-design.json'), 'utf8');
    } catch {
      continue;
    }
    if (!/"mode"\s*:\s*"deck"/i.test(manifest)) continue;
    const examplePath = join(folder, 'example.html');
    let html: string;
    try {
      html = readFileSync(examplePath, 'utf8');
    } catch {
      continue;
    }
    if (/<iframe\b/i.test(html) && !/<style\b[^>]*>[\s\S]*:root/i.test(html)) continue;
    out.push(examplePath);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

function countSlideSections(html: string): number {
  return (html.match(/<section\b[^>]*\bclass\s*=\s*["'][^"']*\bslide\b/gi) ?? []).length;
}

describe('official deck look CSS merge', () => {
  it('extracts Capsule font links and Motif rules from example.html', () => {
    const assets = extractOfficialDeckLookAssets(CAPSULE_EXAMPLE);
    expect(assets).toBeTruthy();
    expect(assets!.fontLinks.join('')).toContain('fonts.googleapis.com/css2');
    expect(assets!.css).toContain('.pill-coral');
    expect(assets!.css).toContain('--coral:#E85D4E');
  });

  it('promotes @import webfonts to stylesheet links', () => {
    const html = `<html><head><style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400&display=swap');
:root { --bg:#111; --accent:#0f0; }
.hc-scan { opacity:0.2; }
</style></head><body></body></html>`;
    const assets = extractOfficialDeckLookAssets(html)!;
    expect(assets.fontLinks.join('')).toContain('fonts.googleapis.com/css2?family=Inter');
  });

  it('treats compact fill tokens + class names as missing look CSS', () => {
    const assets = extractOfficialDeckLookAssets(CAPSULE_EXAMPLE)!;
    expect(deckHtmlHasOfficialLookCss(COMPACT_FILL, assets)).toBe(false);
  });

  it('does not treat generic .slide-N / .slide-title chrome as official look CSS', () => {
    const assets = extractOfficialDeckLookAssets(CAPSULE_EXAMPLE)!;
    expect(listOfficialLookProofClasses(assets.css)).toContain('pill-coral');
    expect(listOfficialLookProofClasses(assets.css)).not.toContain('slide-1');
    expect(deckHtmlHasOfficialLookCss(GENERIC_LAYOUT_COMPACT, assets)).toBe(false);
  });

  it('does not treat a kit Motif snippet as the full official stylesheet', () => {
    const official = loadOfficialLookSource(join(EXAMPLES_DIR, 'html-ppt-zhangzara-capsule/example.html'));
    const assets = extractOfficialDeckLookAssets(official)!;
    const kitSnippet = `<!doctype html><html><head><style>
.pill { border-radius:9999px; border:2px solid #1E1E1E; }
.pill-coral { background: var(--coral); }
</style></head><body><div class="slide"><div class="pill pill-coral"></div></div></body></html>`;
    expect(deckHtmlHasOfficialLookCss(kitSnippet, assets)).toBe(false);
    const merged = mergeOfficialDeckLookCss(kitSnippet, assets);
    expect(merged).toContain(OFFICIAL_DECK_LOOK_STYLE_ATTR);
    expect(merged).toContain('.grain-overlay');
  });

  it('injects Capsule Motif CSS and fonts into a compact fill deck', () => {
    const assets = extractOfficialDeckLookAssets(CAPSULE_EXAMPLE)!;
    const merged = mergeOfficialDeckLookCss(COMPACT_FILL, assets);
    expect(merged).toContain(OFFICIAL_DECK_LOOK_STYLE_ATTR);
    expect(merged).toContain('.pill-coral { background: var(--coral); }');
    expect(merged).toContain('fonts.googleapis.com/css2');
    expect(merged).toContain('opacity: 1 !important');
    expect(merged).toContain('position: relative !important');
    expect(merged).toContain('width: 1920px !important');
    expect(merged).toContain('shadcn/ui');
  });

  it('strips official presenter max-width media queries so scaled 16:9 preview does not reflow', () => {
    const official = loadOfficialLookSource(join(EXAMPLES_DIR, 'html-ppt-zhangzara-capsule/example.html'));
    const assets = extractOfficialDeckLookAssets(official)!;
    expect(assets.css).toMatch(/@media\s*\(\s*max-width:\s*900px\s*\)/);
    const merged = mergeOfficialDeckLookCss(COMPACT_FILL, assets);
    const look = merged.match(/<style[^>]*data-od-official-look-css[^>]*>([\s\S]*?)<\/style>/i)?.[1] ?? '';
    expect(look).toContain('.pill-coral');
    expect(look).not.toMatch(/@media\s*\(\s*max-width/i);
    expect(look).toMatch(/flex-direction:\s*unset/);
    expect(merged).toContain('shadcn/ui');
  });

  it('heals a v18 official look sheet that still has max-width collapse rules', async () => {
    const { ensureOfficialLookStackedCanvasNeutralize } = await import('../src/html/deck-template-look-css.js');
    const stale = `<!doctype html><html><head>
<style data-od-official-look-css>
.slide { position:absolute; display:flex; flex-direction:column; }
.cards-grid { grid-template-columns:repeat(3,1fr); }
@media (max-width: 900px) {
  .slide { padding: 2rem; }
  .cards-grid { grid-template-columns: 1fr; }
  .timeline { flex-direction: column; }
}
/* stacked preview/export: Motif paint + fixed 1920×1080 canvas (not presentation absolute 100%) */
html, body { overflow: visible !important; height: auto !important; }
.slide { opacity: 1 !important; position: relative !important; width: 1920px !important; height: 1080px !important; flex-direction: unset; }
</style></head><body><section class="slide">cards</section></body></html>`;
    const healed = ensureOfficialLookStackedCanvasNeutralize(stale);
    const look = healed.match(/<style[^>]*data-od-official-look-css[^>]*>([\s\S]*?)<\/style>/i)?.[1] ?? '';
    expect(look).toContain('.cards-grid { grid-template-columns:repeat(3,1fr); }');
    expect(look).not.toMatch(/@media\s*\(\s*max-width/i);
    expect(look).toMatch(/flex-direction:\s*unset/);
    expect(healed).toContain('cards');
  });

  it('upgrades legacy opacity-only neutralize so absolute 100% slides stop clipping', async () => {
    const {
      ensureOfficialLookStackedCanvasNeutralize,
      lockDeckDesignViewportMeta,
      OFFICIAL_LOOK_STACKED_NEUTRALIZE_MARKER,
    } = await import('../src/html/deck-template-look-css.js');
    const legacy = `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style data-od-official-look-css>
.slide { position:absolute; inset:0; width:100%; height:100%; opacity:0; }
/* stacked preview/export: keep Motif paint, do not hide non-active slides */
html, body { overflow: visible !important; height: auto !important; }
.slide, .slide.active, .slide.is-active {
  opacity: 1 !important;
  pointer-events: auto !important;
}
</style></head><body><section class="slide slide-1"><div class="deco-pill"></div></section></body></html>`;
    const upgraded = lockDeckDesignViewportMeta(ensureOfficialLookStackedCanvasNeutralize(legacy));
    expect(upgraded).toContain(OFFICIAL_LOOK_STACKED_NEUTRALIZE_MARKER);
    expect(upgraded).toContain('position: relative !important');
    expect(upgraded).toContain('width: 1920px !important');
    expect(upgraded).toMatch(/flex-direction:\s*unset/);
    expect(upgraded).toContain('content="width=1920, initial-scale=1, maximum-scale=1"');
    expect(upgraded).not.toContain('width=device-width');
  });

  it('does not skip upgrade when only a poisoned neutralize marker comment exists', async () => {
    const {
      ensureOfficialLookStackedCanvasNeutralize,
      hasOfficialLookStackedCanvasNeutralizeProof,
      OFFICIAL_LOOK_STACKED_NEUTRALIZE_MARKER,
    } = await import('../src/html/deck-template-look-css.js');
    const poisoned = `<!doctype html><html><head>
<style data-od-official-look-css>
.presentation > .slide { position:absolute; width:100%; height:100%; opacity:0; }
/* ${OFFICIAL_LOOK_STACKED_NEUTRALIZE_MARKER} — truncated, missing relative/1920 rules */
</style></head><body><section class="slide"><div class="pill"></div></section></body></html>`;
    expect(hasOfficialLookStackedCanvasNeutralizeProof(poisoned)).toBe(false);
    const upgraded = ensureOfficialLookStackedCanvasNeutralize(poisoned);
    expect(hasOfficialLookStackedCanvasNeutralizeProof(upgraded)).toBe(true);
    expect(upgraded).toContain('position: relative !important');
    expect(upgraded).toContain('width: 1920px !important');
    expect(upgraded).toMatch(/flex-direction:\s*unset/);
    expect(upgraded).toContain('.presentation > .slide');
  });

  it('locks design viewport when merging official look CSS for persist', () => {
    const assets = extractOfficialDeckLookAssets(CAPSULE_EXAMPLE)!;
    const withDevice = `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1" />
</head><body><div class="slide"><h1>Topic</h1></div></body></html>`;
    const merged = mergeOfficialDeckLookCss(withDevice, assets);
    expect(merged).toContain('content="width=1920, initial-scale=1, maximum-scale=1"');
    expect(merged).not.toContain('width=device-width');
    expect(merged).toContain('position: relative !important');
  });

  it('is idempotent when Motif rules or the look marker already exist', () => {
    const assets = extractOfficialDeckLookAssets(CAPSULE_EXAMPLE)!;
    const once = mergeOfficialDeckLookCss(COMPACT_FILL, assets);
    const twice = mergeOfficialDeckLookCss(once, assets);
    expect(twice).toBe(once);
    expect(deckHtmlHasOfficialLookCss(once, assets)).toBe(true);
  });

  it('applies official Capsule example Motif CSS to a compact fill snapshot', () => {
    const official = loadOfficialLookSource(join(EXAMPLES_DIR, 'html-ppt-zhangzara-capsule/example.html'));
    const assets = extractOfficialDeckLookAssets(official)!;
    expect(assets.css).toContain('.pill-coral');
    const merged = mergeOfficialDeckLookCss(COMPACT_FILL, assets);
    expect(merged).toContain('.pill-coral');
    expect(merged).toContain('--coral');
    expect(merged).toContain('fonts.googleapis.com');
    expect(merged).toContain('shadcn/ui');
  });

  it('keeps official Capsule example.html presenter Motif after standalone export heal', () => {
    const official = readFileSync(join(EXAMPLES_DIR, 'html-ppt-zhangzara-capsule/example.html'), 'utf8');
    const healed = healDeckHtmlForStandaloneExport(official);
    expect(looksLikeOfficialFullscreenPresenterDeck(healed)).toBe(true);
    // Export always pins design viewport for Motif vw/% + letterbox fit.
    expect(healed).toContain('content="width=1920, initial-scale=1, maximum-scale=1"');
    // Presenter CSS must not get stacked-canvas neutralize (opacity stack stays authored).
    expect(healed).not.toContain('data-od-stacked-canvas-neutralize');
    expect(healed).not.toMatch(/flex-direction:\s*unset\s*;/);
    expect(healed).toContain('CAPSULE');
  });

  it('preview lock keeps Capsule on device-width (unlike standalone export heal)', () => {
    const official = readFileSync(join(EXAMPLES_DIR, 'html-ppt-zhangzara-capsule/example.html'), 'utf8');
    const preview = lockStackedDeckCanvasForPreview(official);
    expect(preview).not.toContain('content="width=1920, initial-scale=1, maximum-scale=1"');
    expect(preview).not.toContain('data-od-stacked-canvas-neutralize');
    expect(preview).toContain('CAPSULE');
  });

  it('keeps Capsule Motif CSS after standalone export heal + document wrap', () => {
    const official = loadOfficialLookSource(join(EXAMPLES_DIR, 'html-ppt-zhangzara-capsule/example.html'));
    const assets = extractOfficialDeckLookAssets(official)!;
    const healed = healDeckHtmlForStandaloneExport(COMPACT_FILL);
    const merged = mergeOfficialDeckLookCss(healed, assets);
    const standalone = buildStandaloneDeckHtmlDocument(merged);
    expect(standalone).toContain('.pill-coral');
    expect(standalone).toContain('fonts.googleapis.com');
    expect(standalone).toContain('--coral');
    expect(standalone).toContain('shadcn/ui');
  });

  it('merges official look CSS for every mode:deck example.html into generic compact fill', () => {
    const examples = listOfficialDeckExamplePaths();
    expect(examples.length).toBeGreaterThan(40);
    const failures: string[] = [];

    for (const examplePath of examples) {
      const folder = examplePath.slice(EXAMPLES_DIR.length + 1).split('/')[0] ?? examplePath;
      const official = loadOfficialLookSource(examplePath);
      const assets = extractOfficialDeckLookAssets(official);
      if (!assets?.css || assets.css.length < 80) {
        failures.push(`${folder}: no extractable look CSS`);
        continue;
      }
      if (deckHtmlHasOfficialLookCss(GENERIC_LAYOUT_COMPACT, assets)) {
        failures.push(`${folder}: generic slide chrome falsely counted as look CSS`);
        continue;
      }
      const merged = mergeOfficialDeckLookCss(GENERIC_LAYOUT_COMPACT, assets);
      if (!merged.includes(OFFICIAL_DECK_LOOK_STYLE_ATTR)) {
        failures.push(`${folder}: missing official look style marker`);
      }
      if (!merged.includes('Topic')) {
        failures.push(`${folder}: compact fill content dropped`);
      }
      const proof = listOfficialLookProofClasses(assets.css);
      const expected = proof[0];
      if (expected && !new RegExp(`\\.${expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(merged)) {
        failures.push(`${folder}: missing proof class .${expected}`);
      }
      const hasOfficialFont =
        /fonts\.googleapis\.com|fonts\.gstatic\.com|db\.onlinewebfonts\.com/i.test(official);
      if (hasOfficialFont && !/fonts\.googleapis\.com|fonts\.gstatic\.com|db\.onlinewebfonts\.com/i.test(merged)) {
        failures.push(`${folder}: official webfonts not carried into merge`);
      }
      const standalone = buildStandaloneDeckHtmlDocument(
        mergeOfficialDeckLookCss(healDeckHtmlForStandaloneExport(GENERIC_LAYOUT_COMPACT), assets),
      );
      if (expected && !new RegExp(`\\.${expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(standalone)) {
        failures.push(`${folder}: standalone wrap dropped .${expected}`);
      }
      const lookCss = merged.match(/<style[^>]*data-od-official-look-css[^>]*>([\s\S]*?)<\/style>/i)?.[1] ?? '';
      if (/@media\s*\(\s*max-width/i.test(lookCss)) {
        failures.push(`${folder}: official look kept max-width media that reflows 16:9 preview`);
      }
      const symbolIds = listOfficialMotifSymbolIds(assets.motifHtml.join('\n'));
      for (const symbolId of symbolIds) {
        if (!new RegExp(`<symbol\\b[^>]*\\bid="${symbolId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'i').test(merged)) {
          failures.push(`${folder}: missing Motif symbol #${symbolId}`);
        }
      }
      if (assets.motifHtml.some((block) => /\bgrain-overlay\b/i.test(block)) && !/\bgrain-overlay\b/i.test(merged)) {
        failures.push(`${folder}: missing grain-overlay Motif host`);
      }
      if (assets.motifHtml.some((block) => /\bcrt-overlay\b/i.test(block)) && !/\bcrt-overlay\b/i.test(merged)) {
        failures.push(`${folder}: missing crt-overlay Motif host`);
      }
      if (
        assets.motifHtml.some((block) => /deco-daisy[\s\S]*?<svg\b|#fcdf6c/i.test(block))
        && !/deco-daisy[\s\S]{0,240}<svg\b[\s\S]{80,}?#fcdf6c/i.test(merged)
      ) {
        failures.push(`${folder}: missing Daisy Motif flower SVG (not just CSS / deco class)`);
      }
      if (
        assets.motifHtml.some((block) => /<(?:div|span)[^>]*\bdeco-pill\b/i.test(block))
        && !/<(?:div|span)[^>]*\bdeco-pill\b/i.test(merged)
      ) {
        failures.push(`${folder}: missing Capsule Motif deco-pill seed`);
      }
      if (
        assets.motifHtml.some((block) => /\bpetals?\b/i.test(block) && !/<svg\b/i.test(block))
        && !/<(?:div|span)[^>]*\bpetals?\b/i.test(merged)
      ) {
        failures.push(`${folder}: missing Sakura Motif petals seed`);
      }
      if (
        assets.motifHtml.some((block) => /\bhc-scanlines\b/i.test(block))
        && !/<(?:div|span)[^>]*\bhc-scanlines\b/i.test(merged)
      ) {
        failures.push(`${folder}: missing Hermes Motif hc-scanlines seed`);
      }
      if (
        assets.motifHtml.some((block) => /<(?:div|span)[^>]*\bxp-blob\b/i.test(block))
        && !/<(?:div|span)[^>]*\bxp-blob\b/i.test(merged)
      ) {
        failures.push(`${folder}: missing Pastel Motif xp-blob seed`);
      }
      const painted = assets.motifHtml.find((block) => (
        /<(?:div|span|svg)\b/i.test(block)
        && /data-od-official-motif-html/i.test(block)
        && !/grain-overlay|crt-overlay/i.test(block)
        && !/<symbol\b/i.test(block)
      ));
      if (painted) {
        const classAttr = /\bclass\s*=\s*(?:"([^"]+)"|'([^']+)')/i.exec(painted)?.[1]
          ?? /\bclass\s*=\s*(?:"([^"]+)"|'([^']+)')/i.exec(painted)?.[2]
          ?? '';
        const primary = classAttr.split(/\s+/).find((token) => (
          /^(?:deco-[a-z0-9_-]+|deco-pill|[cf]-pill|petals?|blob|pin-\d|doodle|post-it|gd-orb|gd-ambient|xp-blob)$/i.test(token)
        ));
        if (
          primary
          && !new RegExp(`<(?:div|span|svg)\\b[^>]*\\b${primary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(merged)
        ) {
          failures.push(`${folder}: extracted Motif instance .${primary} not painted onto compact fill`);
        }
      }
    }

    expect(failures, failures.join('\n')).toEqual([]);
  }, 60_000);

  it('keeps representative generated deck snapshots on fixed canvas with official Motif paint', () => {
    const failures: string[] = [];
    for (const fixture of TEMPLATE_RESULT_FIXTURES) {
      const official = loadOfficialLookSource(join(EXAMPLES_DIR, fixture.folder, 'example.html'));
      const assets = extractOfficialDeckLookAssets(official);
      if (!assets) {
        failures.push(`${fixture.folder}: no official assets extracted`);
        continue;
      }
      const beforeCount = countSlideSections(fixture.html);
      const merged = mergeOfficialDeckLookCss(fixture.html, assets);
      const afterCount = countSlideSections(merged);
      const standalone = buildStandaloneDeckHtmlDocument(healDeckHtmlForStandaloneExport(merged));
      const standaloneCount = countSlideSections(standalone);
      const lookCss = [...merged.matchAll(/<style\b[^>]*data-od-official-look-css[^>]*>([\s\S]*?)<\/style>/gi)]
        .map((m) => m[1] ?? '')
        .join('\n');

      if (beforeCount < 3) failures.push(`${fixture.folder}: fixture has only ${beforeCount} slide(s)`);
      if (afterCount !== beforeCount) {
        failures.push(`${fixture.folder}: merge changed slide count ${beforeCount} -> ${afterCount}`);
      }
      if (standaloneCount !== beforeCount) {
        failures.push(`${fixture.folder}: standalone changed slide count ${beforeCount} -> ${standaloneCount}`);
      }
      if (!merged.includes(OFFICIAL_DECK_LOOK_STYLE_ATTR)) {
        failures.push(`${fixture.folder}: missing official look style marker`);
      }
      if (!fixture.motif.test(merged)) {
        failures.push(`${fixture.folder}: missing representative Motif / look paint (${fixture.label})`);
      }
      if (!/width:\s*1920px\s*!important/i.test(lookCss)) {
        failures.push(`${fixture.folder}: missing stacked 1920px neutralize`);
      }
      if (!/height:\s*1080px\s*!important/i.test(lookCss)) {
        failures.push(`${fixture.folder}: missing stacked 1080px neutralize`);
      }
      if (!/position:\s*relative\s*!important/i.test(lookCss)) {
        failures.push(`${fixture.folder}: missing relative slide neutralize`);
      }
      if (!/opacity:\s*1\s*!important/i.test(lookCss)) {
        failures.push(`${fixture.folder}: missing opacity neutralize`);
      }
      if (!/content="width=1920, initial-scale=1, maximum-scale=1"/i.test(standalone)) {
        failures.push(`${fixture.folder}: standalone export missing fixed design viewport`);
      }
      for (const requiredText of ['Cover', '03']) {
        if (!merged.includes(requiredText)) {
          failures.push(`${fixture.folder}: content marker ${requiredText} dropped`);
        }
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('injects Pin #pin symbols into compact fill that only has <use href="#pin">', () => {
    const official = loadOfficialLookSource(join(EXAMPLES_DIR, 'html-ppt-zhangzara-pin-and-paper/example.html'));
    const assets = extractOfficialDeckLookAssets(official)!;
    expect(listOfficialMotifSymbolIds(assets.motifHtml.join('\n'))).toEqual(
      expect.arrayContaining(['pin', 'pin-open', 'arr', 'mark']),
    );
    const pinFill = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<style>:root{--paper:#F4EFE4}</style></head><body>
<div class="slide s-cover"><h1>Kept things</h1>
<svg class="pin-1" viewBox="0 0 360 110"><use href="#pin"/></svg>
</div></body></html>`;
    expect(pinFill).not.toContain('<symbol id="pin"');
    const merged = mergeOfficialDeckLookCss(pinFill, assets);
    expect(merged).toContain(`<symbol id="pin"`);
    expect(merged).toContain(`<symbol id="pin-open"`);
    expect(merged).toContain(OFFICIAL_DECK_MOTIF_HTML_ATTR);
    expect(merged).toContain('<use href="#pin"/>');
    expect(merged).toContain('Kept things');
    const twice = mergeOfficialDeckLookCss(merged, assets);
    expect(twice).toBe(merged);
  });

  it('still injects Motif HTML when look CSS is already present', () => {
    const official = loadOfficialLookSource(join(EXAMPLES_DIR, 'html-ppt-zhangzara-pin-and-paper/example.html'));
    const assets = extractOfficialDeckLookAssets(official)!;
    const cssOnly = mergeOfficialDeckLookCss(
      `<!doctype html><html><head><meta charset="utf-8"></head><body>
<div class="slide"><h1>Topic</h1><svg><use href="#pin"/></svg></div></body></html>`,
      { ...assets, motifHtml: [] },
    );
    expect(cssOnly).toContain(OFFICIAL_DECK_LOOK_STYLE_ATTR);
    expect(cssOnly).not.toContain('<symbol id="pin"');
    const withMotif = mergeOfficialDeckLookCss(cssOnly, assets);
    expect(withMotif).toContain('<symbol id="pin"');
    expect(deckHtmlHasOfficialLookCss(cssOnly, assets)).toBe(true);
  });

  const LINUX_SPARSE_COVER = `<!doctype html><html lang="ko"><body>
<section class="slide" style="background:#F5F0E6;width:1920px;height:1080px;position:relative">
  <h1>Linux Internals for Senior Engineers</h1>
  <p>커널 아키텍처 · 스케줄러 · 메모리</p>
  <span style="border:3px solid #111;background:#7ECDC0">Kernel 6.x</span>
  <svg width="12" height="12"><circle cx="6" cy="6" r="5" fill="none" stroke="#7ECDC0"/></svg>
</section>
<section class="slide" style="width:1920px;height:1080px;position:relative">
  <h2>Scheduler</h2>
</section>
</body></html>`;

  it('injects catalog Motif paint nodes — not Daisy-only wrappers or CSS selectors', () => {
    const cases: Array<[string, RegExp]> = [
      ['html-ppt-zhangzara-capsule', /<(?:div|span)[^>]*\bdeco-pill\b/i],
      ['html-ppt-zhangzara-sakura-chroma', /<(?:div|span)[^>]*\bpetal\b/i],
      ['html-ppt-zhangzara-pin-and-paper', /<(?:svg|div)[^>]*\bpin-1\b|<use href="#pin"/i],
      ['html-ppt-zhangzara-playful', /<(?:div|span|svg)[^>]*\bdoodle-/i],
      ['html-ppt-graphify-dark-graph', /<(?:div|span)[^>]*\bgd-orb\b/i],
      ['html-ppt-xhs-pastel-card', /<(?:div|span)[^>]*\bxp-blob\b/i],
      ['html-ppt-zhangzara-block-frame', /<(?:div|span)[^>]*\bdeco-dots\b/i],
      ['html-ppt-zhangzara-block-frame', /<(?:div|span)[^>]*\bdeco-green-circle\b/i],
      ['html-ppt-zhangzara-scatterbrain', /<(?:div|span)[^>]*\bpost-it\b/i],
      ['html-ppt-hermes-cyber-terminal', /<(?:div|span)[^>]*\bhc-scanlines\b/i],
      ['html-ppt-zhangzara-cobalt-grid', /<(?:div|span)[^>]*\bpixel-glitch\b/i],
      ['html-ppt-zhangzara-retro-windows', /<(?:div|span)[^>]*\bwin-titlebar\b/i],
      ['html-ppt-pitch-deck', /<(?:div|span)[^>]*\bcover-blob\b/i],
      ['html-ppt-testing-safety-alert', /<(?:div|span)[^>]*\bts-stripe\b/i],
      ['html-ppt-zhangzara-coral', /<(?:div|span|svg)[^>]*\bzigzag-deco\b/i],
      ['html-ppt-zhangzara-cartesian', /<(?:div|span)[^>]*\bgeo-decoration\b/i],
      ['html-ppt-zhangzara-blue-professional', /<(?:div|span)[^>]*\bcover-decoration\b/i],
      ['html-ppt-zhangzara-biennale-yellow', /<(?:div|span)[^>]*\bsunglow\b/i],
    ];
    for (const [folder, paint] of cases) {
      const official = loadOfficialLookSource(join(EXAMPLES_DIR, folder, 'example.html'));
      const assets = extractOfficialDeckLookAssets(official)!;
      expect(LINUX_SPARSE_COVER, folder).not.toMatch(paint);
      const merged = mergeOfficialDeckLookCss(LINUX_SPARSE_COVER, assets);
      expect(merged, folder).toMatch(paint);
      expect(merged, folder).toContain('Linux Internals for Senior Engineers');
      const twice = mergeOfficialDeckLookCss(merged, assets);
      expect(twice, folder).toBe(merged);
    }
  });

  it('applies Pink Script dark stage + fonts onto a cream compact fill', () => {
    const official = loadOfficialLookSource(join(EXAMPLES_DIR, 'html-ppt-zhangzara-pink-script/example.html'));
    const assets = extractOfficialDeckLookAssets(official)!;
    expect(assets.css).toMatch(/deck-stage\s*>\s*section\.slide/i);
    expect(assets.fontLinks.join('\n')).toMatch(/Instrument\+Serif|Instrument Serif/i);
    const creamFill = `<!doctype html><html lang="ko"><head><meta charset="utf-8"></head><body>
<style>:root{--bg:#F5F0E6}.slide{background:#F5F0E6;color:#2D2D2D;font-family:Quicksand,sans-serif}</style>
<section class="slide"><h1>After Hours</h1></section>
<section class="slide"><h2>The Index</h2></section>
</body></html>`;
    const merged = mergeOfficialDeckLookCss(creamFill, assets);
    expect(merged).toContain(OFFICIAL_DECK_LOOK_STYLE_ATTR);
    expect(merged).toMatch(/fonts\.googleapis\.com/i);
    expect(merged).toMatch(/Instrument/i);
    const lookCss = [...merged.matchAll(/<style\b[^>]*data-od-official-look-css[^>]*>([\s\S]*?)<\/style>/gi)]
      .map((m) => m[1] ?? '')
      .join('\n');
    expect(lookCss).toMatch(/(?:^|[,\s{])(?:section)?\.slide\s*\{[^}]*background\s*:/i);
    expect(lookCss).toMatch(/#0[Aa]0709|radial-gradient/i);
    expect(lookCss).not.toMatch(/deck-stage\s*>\s*section\.slide/i);
    expect(lookCss).toMatch(/od-compact-type-lock/);
    expect(lookCss).toMatch(/Instrument Serif/i);
    expect(lookCss).toMatch(/html,\s*body,\s*section\.slide,\s*\.slide\s*\{[^}]*font-family:[^}]*Inter/i);
    const officialIdx = merged.lastIndexOf(OFFICIAL_DECK_LOOK_STYLE_ATTR);
    const creamRuleIdx = merged.lastIndexOf('.slide{background:#F5F0E6');
    expect(officialIdx).toBeGreaterThan(creamRuleIdx);
    const twice = mergeOfficialDeckLookCss(merged, assets);
    expect(twice).toBe(merged);
  });

  it('stamps official Daisy cover corners, not a single tiny bottom-right flower', () => {
    const official = loadOfficialLookSource(join(EXAMPLES_DIR, 'html-ppt-zhangzara-daisy-days/example.html'));
    const assets = extractOfficialDeckLookAssets(official)!;
    const sixSlides = `<!doctype html><html lang="ko"><body>
<section class="slide"><h1>Cover</h1></section>
<section class="slide"><h2>Body A</h2></section>
<section class="slide"><h2>Body B</h2></section>
<section class="slide"><h2>Closing</h2></section>
</body></html>`;
    const merged = mergeOfficialDeckLookCss(sixSlides, assets);
    const cover = merged.match(/<section\b[^>]*\bclass\s*=\s*"[^"]*\bslide\b[^"]*"[\s\S]*?<\/section>/i)?.[0] ?? '';
    expect(cover).toMatch(/deco-daisy-tl/i);
    expect(cover).toMatch(/deco-daisy-tr/i);
    expect(cover).toMatch(/deco-daisy-bl/i);
    expect(cover).toMatch(/deco-daisy-br|deco-daisy\b/i);
    expect(cover).toMatch(/slide-title/);
    expect(cover).toMatch(/width:\s*12%/i);
    expect(cover).not.toMatch(/width:\s*22%/i);
    expect((cover.match(/deco-daisy/gi) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(merged).toMatch(/flex-direction:\s*column/);
    expect(merged).toMatch(/justify-content:\s*center/);
    // Compact cover titles must stack above Motif corners.
    expect(merged).toMatch(/\.slide\s*>\s*:is\(h1[\s\S]*z-index:\s*2\s*!important/i);
    expect(cover).toMatch(/padding:\s*56px\s+72px/i);
    const twice = mergeOfficialDeckLookCss(merged, assets);
    expect(twice).toBe(merged);
  });

  it('does not treat a tiny invented Daisy icon as official Motif paint', () => {
    const official = loadOfficialLookSource(join(EXAMPLES_DIR, 'html-ppt-zhangzara-daisy-days/example.html'));
    const assets = extractOfficialDeckLookAssets(official)!;
    const tiny = `<!doctype html><html lang="ko"><body>
<section class="slide" style="background:#F5F0E6;width:1920px;height:1080px">
  <h1>Linux Internals &amp; Production Mastery</h1>
  <div class="deco deco-daisy" style="position:absolute;bottom:16px;right:16px;width:40px;height:40px">
    <svg viewBox="0 0 150 150"><style>.cls-1{fill:#fcdf6c}</style>
      <path d="M10 20"/><path d="M30 40"/><path d="M50 60"/><circle class="cls-1" cx="75" cy="75" r="10"/>
    </svg>
  </div>
</section>
<section class="slide"><h2>Body</h2></section>
</body></html>`;
    const merged = mergeOfficialDeckLookCss(tiny, assets);
    const cover = merged.match(/<section\b[^>]*\bclass\s*=\s*"[^"]*\bslide\b[^"]*"[\s\S]*?<\/section>/i)?.[0] ?? '';
    expect(cover).toMatch(/deco-daisy-tl/i);
    expect(cover).toMatch(/slide-title/);
    expect(cover).toMatch(/width:\s*12%/i);
    expect(cover).not.toMatch(/width:\s*40px/i);
    expect(cover).toContain('Linux Internals');
  });

  it('keeps long compact titles readable above Motif corners (z-index + safe padding)', () => {
    const official = loadOfficialLookSource(join(EXAMPLES_DIR, 'html-ppt-zhangzara-daisy-days/example.html'));
    const assets = extractOfficialDeckLookAssets(official)!;
    const sparse = `<!doctype html><html lang="ko"><body>
<section class="slide" style="background:#F5F0E6;width:1920px;height:1080px">
  <h1>Linux Internals &amp; Production Mastery for Senior Engineers</h1>
  <p>Kernel, cgroups, observability, and trade-offs.</p>
</section>
<section class="slide"><h2>Body</h2></section>
</body></html>`;
    const merged = mergeOfficialDeckLookCss(sparse, assets);
    const cover = merged.match(/<section\b[^>]*\bclass\s*=\s*"[^"]*\bslide\b[^"]*"[\s\S]*?<\/section>/i)?.[0] ?? '';
    expect(cover).toMatch(/deco-daisy-tl/i);
    expect(cover).toMatch(/padding:\s*56px\s+72px/i);
    expect(cover).toMatch(/width:\s*12%/i);
    expect(cover).not.toMatch(/width:\s*22%/i);
    expect(merged).toMatch(/z-index:\s*2\s*!important/);
    // Motif stays under content.
    expect(cover).toMatch(/deco-daisy[\s\S]*z-index:\s*1/i);
    expect(cover).toContain('Linux Internals');
    // Corner Motifs stay inside the 1920×1080 canvas (no negative hang).
    expect(cover).not.toMatch(/deco-daisy[^>]*(?:top|left|right|bottom)\s*:\s*-\d/i);
  });

  it('restamps pre-v34 overscale Daisy (22%) and upgrades content stacking', () => {
    const official = loadOfficialLookSource(join(EXAMPLES_DIR, 'html-ppt-zhangzara-daisy-days/example.html'));
    const assets = extractOfficialDeckLookAssets(official)!;
    const daisySvg = assets.motifHtml.find((block) => /deco-daisy[\s\S]*?<svg\b/i.test(block));
    const svg = /<svg\b[\s\S]*?<\/svg>/i.exec(daisySvg ?? '')?.[0] ?? '<svg viewBox="0 0 10 10"><circle fill="#fcdf6c" cx="5" cy="5" r="4"/><path d="M1 2"/><path d="M3 4"/></svg>';
    const legacy = `<!doctype html><html lang="ko"><head>
<style data-od-official-look-css>
/* stacked preview/export: 1920×1080 canvas (not presentation absolute 100%) */
.slide { position:relative !important; width:1920px !important; height:1080px !important; display:flex; flex-direction:column; }
.slide:has(.split-left) { flex-direction:unset; }
</style>
</head><body>
<section class="slide slide-title" style="background:#F5F0E6;width:1920px;height:1080px">
  <div data-od-official-motif-html class="deco deco-daisy-tl" style="position:absolute;top:-4%;left:-3%;width:22%;height:39%;z-index:1">${svg}</div>
  <div data-od-official-motif-html class="deco deco-daisy-br" style="position:absolute;bottom:-2%;right:-3%;width:20%;height:36%;z-index:1">${svg}</div>
  <h1>Legacy Overscale</h1>
</section>
<section class="slide"><h2>Body</h2></section>
</body></html>`;
    const merged = mergeOfficialDeckLookCss(legacy, assets);
    const cover = merged.match(/<section\b[^>]*\bclass\s*=\s*"[^"]*\bslide\b[^"]*"[\s\S]*?<\/section>/i)?.[0] ?? '';
    expect(cover).not.toMatch(/width:\s*22%/i);
    expect(cover).toMatch(/width:\s*12%/i);
    expect(cover).toMatch(/deco-daisy-tl/i);
    expect(merged).toMatch(/z-index:\s*2\s*!important/);
    expect(cover).toContain('Legacy Overscale');
    expect(cover).not.toMatch(/deco-daisy[^>]*(?:top|left|right|bottom)\s*:\s*-\d/i);
  });

  it('restamps official-scale Daisy Motifs that hang outside the canvas', () => {
    const official = loadOfficialLookSource(join(EXAMPLES_DIR, 'html-ppt-zhangzara-daisy-days/example.html'));
    const assets = extractOfficialDeckLookAssets(official)!;
    const daisySvg = assets.motifHtml.find((block) => /deco-daisy[\s\S]*?<svg\b/i.test(block));
    const svg = /<svg\b[\s\S]*?<\/svg>/i.exec(daisySvg ?? '')?.[0]
      ?? '<svg viewBox="0 0 10 10"><circle fill="#fcdf6c" cx="5" cy="5" r="4"/><path d="M1 2"/><path d="M3 4"/></svg>';
    const hanging = `<!doctype html><html lang="ko"><head>
<style data-od-official-look-css>
/* stacked preview/export: Motif paint + fixed 1920 */
.slide { position:relative !important; width:1920px !important; height:1080px !important; }
.slide > :is(h1, h2, h3, p) { position:relative !important; z-index:2 !important; }
</style>
</head><body>
<section class="slide slide-title" style="background:#F5F0E6;width:1920px;height:1080px;padding:56px 72px">
  <div data-od-official-motif-html class="deco deco-daisy-tl" style="position:absolute;top:-3%;left:-2%;width:12%;height:20%;z-index:1">${svg}</div>
  <div data-od-official-motif-html class="deco deco-daisy-br" style="position:absolute;bottom:-1%;right:-2%;width:11%;height:19%;z-index:1">${svg}</div>
  <h1>도메인 체계 설계</h1>
</section>
</body></html>`;
    const merged = mergeOfficialDeckLookCss(hanging, assets);
    const cover = merged.match(/<section\b[^>]*\bclass\s*=\s*"[^"]*\bslide\b[^"]*"[\s\S]*?<\/section>/i)?.[0] ?? '';
    expect(cover).toMatch(/deco-daisy-tl/i);
    expect(cover).toMatch(/width:\s*12%/i);
    expect(cover).not.toMatch(/deco-daisy[^>]*(?:top|left|right|bottom)\s*:\s*-\d/i);
    expect(cover).toMatch(/deco-daisy-tl[^>]*top:\s*0/i);
    expect(cover).toContain('도메인 체계 설계');
  });

  it('remmerges a hanging body-pack sibling even when one daisy is already good', () => {
    const official = loadOfficialLookSource(join(EXAMPLES_DIR, 'html-ppt-zhangzara-daisy-days/example.html'));
    const assets = extractOfficialDeckLookAssets(official)!;
    const daisySvg = assets.motifHtml.find((block) => /deco-daisy[\s\S]*?<svg\b/i.test(block));
    const svg = /<svg\b[\s\S]*?<\/svg>/i.exec(daisySvg ?? '')?.[0]
      ?? '<svg viewBox="0 0 10 10"><circle fill="#fcdf6c" cx="5" cy="5" r="4"/><path d="M1 2"/><path d="M3 4"/></svg>';
    // Middle slide = body role (index 1 of 3) so Motif pack is tl+br, not cover.
    const mixed = `<!doctype html><html lang="ko"><head>
<style data-od-official-look-css>
.slide { position:relative !important; width:1920px !important; height:1080px !important; }
.slide > :is(h1, h2, h3, p) { position:relative !important; z-index:2 !important; }
</style>
</head><body>
<section class="slide" style="background:#F5F0E6;width:1920px;height:1080px;padding:56px 72px">
  <h1>Cover</h1>
</section>
<section class="slide" style="background:#F5F0E6;width:1920px;height:1080px;padding:56px 72px">
  <div data-od-official-motif-html class="deco deco-daisy-tl" style="position:absolute;top:0;left:0;width:12%;height:20%;z-index:1">${svg}</div>
  <div data-od-official-motif-html class="deco deco-daisy-br" style="position:absolute;bottom:-4%;right:-3%;width:11%;height:19%;z-index:1">${svg}</div>
  <h2>Body pack</h2>
</section>
<section class="slide"><h2>Next</h2></section>
</body></html>`;
    const merged = mergeOfficialDeckLookCss(mixed, assets);
    const body = merged.match(
      /<section\b[^>]*\bclass\s*=\s*"[^"]*\bslide\b[^"]*"[^>]*>[\s\S]*?Body pack[\s\S]*?<\/section>/i,
    )?.[0] ?? '';
    // Isolate the body slide — previous slides may also contain daisy Motifs.
    expect(body).toMatch(/<h2>Body pack<\/h2>/i);
    expect(body).toMatch(/deco-daisy-tl/i);
    expect(body).toMatch(/deco-daisy-br/i);
    expect(body).not.toMatch(/deco-daisy[^>]*(?:top|left|right|bottom)\s*:\s*-\d/i);
  });

  it('sanitizes official Daisy hang CSS (top:-30px) during look merge', () => {
    const official = loadOfficialLookSource(join(EXAMPLES_DIR, 'html-ppt-zhangzara-daisy-days/example.html'));
    const assets = extractOfficialDeckLookAssets(official)!;
    const sparse = `<!doctype html><html lang="ko"><body>
<section class="slide" style="background:#F5F0E6;width:1920px;height:1080px">
  <h1>Hang CSS</h1>
</section>
</body></html>`;
    const merged = mergeOfficialDeckLookCss(sparse, assets);
    expect(merged).toMatch(/data-od-official-look-css/i);
    // Official example hangs must not survive into stacked look CSS.
    expect(merged).not.toMatch(/deco-daisy[^\{]*\{[^}]*(?:top|left|right|bottom)\s*:\s*-\d/i);
    expect(merged).toMatch(/deco-daisy-tl/i);
  });

  it('strips Motif hang offsets from already-current look CSS sheets', () => {
    const official = loadOfficialLookSource(join(EXAMPLES_DIR, 'html-ppt-zhangzara-daisy-days/example.html'));
    const assets = extractOfficialDeckLookAssets(official)!;
    // Full neutralize proof present, but look body still carries official hangs
    // (pre-§0.72 persisted decks). Early-return must still sanitize.
    const currentWithHang = `<!doctype html><html lang="ko"><head>
<style data-od-official-look-css>
/* stacked preview/export: Motif paint + fixed 1920 */
.presentation, .deck, [id="od-stacked-deck-stage"] { display:flex !important; flex-direction:column !important; }
.presentation > .slide, .deck > .slide { flex-direction:unset !important; }
.slide { position:relative !important; width:1920px !important; height:1080px !important; }
.slide > :is(h1, h2, h3, p) { position:relative !important; z-index:2 !important; }
.slide-title .deco-daisy-tl{top:-30px;left:-30px;width:220px;height:220px}
.slide-title .deco-daisy-br{bottom:10px;right:-30px;width:210px;height:210px}
</style>
</head><body>
<section class="slide slide-title" style="background:#F5F0E6;width:1920px;height:1080px">
  <h1>Current+Hang</h1>
</section>
</body></html>`;
    const merged = mergeOfficialDeckLookCss(currentWithHang, assets);
    expect(merged).not.toMatch(/deco-daisy[^\{]*\{[^}]*(?:top|left|right|bottom)\s*:\s*-\d/i);
    expect(merged).toMatch(/deco-daisy-tl\{[^}]*top:\s*0/i);
  });

  it('strips slide-host overflow:hidden and 100vh from official look CSS (§0.89)', () => {
    const raw = `
.slide{position:relative;width:100vw;height:100vh;overflow:hidden;background:#fff}
.tpl-demo .slide{overflow:hidden;height:100vh}
.slide .panel{overflow:hidden;height:40vh}
.presentation{overflow:hidden;height:100vh}
.deco-orb{top:-10%;left:5vw;width:20vw;height:20vh}
`;
    const out = stripOfficialLookSlideHostCanvasClips(raw);
    expect(out).not.toMatch(/\.slide\{[^}]*overflow\s*:\s*hidden/i);
    expect(out).not.toMatch(/\.slide\{[^}]*height\s*:\s*100vh/i);
    expect(out).not.toMatch(/\.tpl-demo \.slide\{[^}]*overflow\s*:\s*hidden/i);
    expect(out).not.toMatch(/\.presentation\{[^}]*overflow\s*:\s*hidden/i);
    // Nested panel clip + Motif geometry stay for Motif sanitize / author intent.
    expect(out).toMatch(/\.slide \.panel\{[^}]*overflow\s*:\s*hidden/i);
    expect(out).toMatch(/\.slide \.panel\{[^}]*height\s*:\s*40vh/i);
    expect(out).toMatch(/deco-orb\{[^}]*top:\s*-10%/i);

    const daisy = loadOfficialLookSource(join(EXAMPLES_DIR, 'html-ppt-zhangzara-daisy-days/example.html'));
    const assets = extractOfficialDeckLookAssets(daisy)!;
    const sparse = `<!doctype html><html lang="ko"><body>
<section class="slide" style="width:1920px;height:1080px"><h1>Clip strip</h1></section>
</body></html>`;
    const merged = mergeOfficialDeckLookCss(sparse, assets);
    const look =
      merged.match(/<style[^>]*data-od-official-look-css[^>]*>([\s\S]*?)<\/style>/i)?.[1] ?? '';
    const body = look.replace(/\n?\/\*\s*stacked preview\/export:[\s\S]*$/i, '');
    expect(body).not.toMatch(/(?:^|,)\s*\.slide\s*\{[^}]*overflow\s*:\s*(?:hidden|clip)/im);
    expect(body).not.toMatch(/(?:^|,)\s*\.slide\s*\{[^}]*height\s*:\s*100vh/im);
  });

  it('sanitizes Graphify/XHS Motif hang CSS (gd-orb / xp-blob)', () => {
    const hang = `
.tpl-graphify-dark-graph .gd-orb-1{width:520px;height:520px;top:-12%;left:-6%}
.tpl-xhs-pastel-card .xp-blob.b1{width:420px;height:420px;top:-8%;right:-6%}
.slide-title .deco-daisy-tl{top:-30px;left:-30px;width:220px;height:220px}
`;
    const out = sanitizeMotifOutsideCanvasOffsets(hang);
    expect(out).not.toMatch(/(?:top|left|right|bottom)\s*:\s*-\d/);
    expect(out).toMatch(/gd-orb-1\{[^}]*top:\s*0/);
    expect(out).toMatch(/xp-blob\.b1\{[^}]*top:\s*0/);
    expect(out).toMatch(/deco-daisy-tl\{[^}]*top:\s*0/);
  });

  it('sanitizes Motif hangs across Pin / Sakura / Block-frame / Scatterbrain families (§0.80)', () => {
    const hang = `
.pin::before{top:-12px;left:50%}
.tape::after{top:-15px;left:50%}
.s-cover .ribbon{left:-20%;width:160%}
.ribbon-stack .rib{left:-20%;width:140%}
.slide-1 .deco-pink-rect{top:-30px;right:80px;width:100px;height:100px}
.slide-1 .deco-yellow-bar{bottom:-18px;left:80px;width:140px}
.post-it-yellow{top:-40px;right:-60px}
.cover-blob{right:-140px;top:-140px;width:560px;height:560px}
.deco-pill{width:20vw;height:8vh;top:-4%}
.title-accent-1{top:-40px;right:-60px}
.hero-shot{right:-60px;top:10%}
.slide.dark::before{content:'';position:absolute;bottom:-10%;right:-5%;width:40%;height:40%}
.deco-orb{left:-10vw;top:12vh;width:20vw;height:20vh}
`;
    const out = sanitizeMotifOutsideCanvasOffsets(hang);
    expect(out).not.toMatch(/(?:top|left|right|bottom)\s*:\s*-\d/);
    expect(out).not.toMatch(/(?:top|left|right|bottom)\s*:\s*0(?:vw|vh)\b/);
    expect(out).toMatch(/\.pin::before\{[^}]*top:\s*0/);
    expect(out).toMatch(/\.tape::after\{[^}]*top:\s*0/);
    expect(out).toMatch(/\.ribbon\{[^}]*left:\s*0/);
    expect(out).toMatch(/\.rib\{[^}]*left:\s*0/);
    expect(out).toMatch(/deco-pink-rect\{[^}]*top:\s*0/);
    expect(out).toMatch(/deco-yellow-bar\{[^}]*bottom:\s*0/);
    expect(out).toMatch(/cover-blob\{[^}]*right:\s*0/);
    expect(out).toMatch(/title-accent-1\{[^}]*top:\s*0/);
    expect(out).toMatch(/hero-shot\{[^}]*right:\s*0/);
    expect(out).toMatch(/::before\{[^}]*bottom:\s*0/);
    expect(out).toMatch(/deco-pill\{[^}]*width:\s*20%/);
    expect(out).toMatch(/deco-pill\{[^}]*height:\s*8%/);
    expect(out).toMatch(/deco-orb\{[^}]*left:\s*0/);
    expect(out).toMatch(/deco-orb\{[^}]*top:\s*12%/);
    expect(out).not.toMatch(/deco-pill\{[^}]*(?:vw|vh)\b/);
  });

  it('LOOK_NEUTRALIZE keeps bare pin / ribbon / win Motif hosts below content (§0.80)', () => {
    expect(LOOK_NEUTRALIZE_CSS).toMatch(/:not\(\.pin\)/);
    expect(LOOK_NEUTRALIZE_CSS).toMatch(/:not\(\[class\^="pin-"\]\)/);
    expect(LOOK_NEUTRALIZE_CSS).not.toMatch(/:not\(\[class\*="pin"\]\)/);
    expect(LOOK_NEUTRALIZE_CSS).toMatch(/:not\(\.ribbon\)/);
    expect(LOOK_NEUTRALIZE_CSS).toMatch(/:not\(\[class\^="win-"\]\)/);
    expect(LOOK_NEUTRALIZE_CSS).toMatch(/:not\(\[class\*="pixel-"\]\)/);
    expect(LOOK_NEUTRALIZE_CSS).toMatch(/section\[data-screen-label\]/);
    expect(LOOK_NEUTRALIZE_CSS).not.toMatch(/\[data-slide\],\s*\[data-screen-label\]/);
    // Do not force display:flex on slide hosts — Cobalt/Neo-grid need display:grid (§0.83).
    // Deck shells (#deck) DO force flex-column to kill Studio horizontal strips (§0.90).
    expect(LOOK_NEUTRALIZE_CSS).toMatch(/#deck\b[^\{]*\{[^}]*flex-direction:\s*column\s*!important/i);
    expect(LOOK_NEUTRALIZE_CSS).not.toMatch(
      /\.slide[^{]*\{[^}]*overflow:\s*visible\s*!important;\s*display:\s*flex/i,
    );
  });

  it('sanitizes Scatterbrain title-accent hangs during official look merge (§0.83)', () => {
    const official = loadOfficialLookSource(join(EXAMPLES_DIR, 'html-ppt-zhangzara-scatterbrain/example.html'));
    const assets = extractOfficialDeckLookAssets(official)!;
    const sparse = `<!doctype html><html lang="ko"><body>
<section class="slide" style="background:#F6E7D8;width:1920px;height:1080px"><h1>Scatter</h1></section>
<section class="slide"><h2>Body</h2></section>
</body></html>`;
    const merged = mergeOfficialDeckLookCss(sparse, assets);
    expect(merged).not.toMatch(/title-accent[^\{]*\{[^}]*(?:top|left|right|bottom)\s*:\s*-\d/i);
  });

  it('injects Block-frame signature Motif paint (pink-rect / yellow-bar) (§0.84)', () => {
    const official = loadOfficialLookSource(join(EXAMPLES_DIR, 'html-ppt-zhangzara-block-frame/example.html'));
    const assets = extractOfficialDeckLookAssets(official)!;
    expect(assets.motifHtml.some((b) => /\bdeco-pink-rect\b/i.test(b))).toBe(true);
    expect(assets.motifHtml.some((b) => /\bdeco-yellow-bar\b/i.test(b))).toBe(true);
    const sparse = `<!doctype html><html lang="ko"><body>
<section class="slide" style="background:#F5F0E6;width:1920px;height:1080px"><h1>Block</h1></section>
<section class="slide"><h2>Body</h2></section>
</body></html>`;
    const merged = mergeOfficialDeckLookCss(sparse, assets);
    expect(merged).toMatch(/<(?:div|span)[^>]*\bdeco-pink-rect\b/i);
    expect(merged).toMatch(/<(?:div|span)[^>]*\bdeco-yellow-bar\b/i);
  });

  it('does not restamp Graphify orb geometry onto Daisy TL recipes (§0.80)', () => {
    const official = loadOfficialLookSource(join(EXAMPLES_DIR, 'html-ppt-graphify-dark-graph/example.html'));
    const assets = extractOfficialDeckLookAssets(official)!;
    const sparse = `<!doctype html><html lang="ko"><body>
<section class="slide" style="background:#0a0c10;width:1920px;height:1080px"><h1>Graph</h1></section>
<section class="slide"><h2>Body</h2></section>
</body></html>`;
    const merged = mergeOfficialDeckLookCss(sparse, assets);
    const orb = merged.match(/<(?:div|span)\b[^>]*\bgd-orb\b[^>]*>/i)?.[0] ?? '';
    expect(orb).toBeTruthy();
    // Preserve official orb scale — not a 12%/18% Daisy corner disc.
    expect(orb).not.toMatch(/width:\s*12%/i);
    expect(orb).not.toMatch(/height:\s*18%/i);
    expect(orb).not.toMatch(/(?:top|left|right|bottom)\s*:\s*-\d/i);
  });

  it('remmerges look sheets whose hang gate previously missed Block-frame deco (§0.80)', () => {
    const official = loadOfficialLookSource(join(EXAMPLES_DIR, 'html-ppt-zhangzara-block-frame/example.html'));
    const assets = extractOfficialDeckLookAssets(official)!;
    const stale = `<!doctype html><html lang="ko"><head>
<style data-od-official-look-css>
/* stacked preview/export: Motif paint + fixed 1920 */
.presentation, .deck, [id="od-stacked-deck-stage"] { display:flex !important; flex-direction:column !important; }
.presentation > .slide, .deck > .slide { flex-direction:unset !important; }
.slide { position:relative !important; width:1920px !important; height:1080px !important; }
.slide > :is(h1, h2, h3, p) { position:relative !important; z-index:2 !important; }
.slide-1 .deco-pink-rect{top:-30px;right:80px;width:100px;height:100px}
</style>
</head><body>
<section class="slide slide-1" style="width:1920px;height:1080px"><h1>Block</h1></section>
</body></html>`;
    const merged = mergeOfficialDeckLookCss(stale, assets);
    expect(merged).not.toMatch(/deco-pink-rect\{[^}]*top:\s*-\d/i);
  });

  it('injects Motif-safe gutter on split slides with padding:0', () => {
    const official = loadOfficialLookSource(join(EXAMPLES_DIR, 'html-ppt-zhangzara-daisy-days/example.html'));
    const assets = extractOfficialDeckLookAssets(official)!;
    const split = `<!doctype html><html lang="ko"><body>
<section class="slide" style="padding:0;width:1920px;height:1080px">
  <div class="split-left"><h2>Left</h2></div>
  <div class="split-right"><p>Right copy</p></div>
</section>
<section class="slide"><h2>Body</h2></section>
</body></html>`;
    const merged = mergeOfficialDeckLookCss(split, assets);
    const cover = merged.match(/<section\b[^>]*\bclass\s*=\s*"[^"]*\bslide\b[^"]*"[\s\S]*?<\/section>/i)?.[0] ?? '';
    expect(cover).toMatch(/padding:\s*40px\s+56px/i);
    expect(cover).not.toMatch(/padding:\s*0(?:px|em|rem|%)?(?:;|"|\s)/i);
  });

  it('does not raise Capsule Motif pills above compact title stacking', () => {
    const official = loadOfficialLookSource(join(EXAMPLES_DIR, 'html-ppt-zhangzara-capsule/example.html'));
    const assets = extractOfficialDeckLookAssets(official)!;
    const sparse = `<!doctype html><html lang="ko"><body>
<section class="slide" style="background:#FFF8F0;width:1920px;height:1080px"><h1>Capsule Cover</h1></section>
<section class="slide"><h2>Body</h2></section>
</body></html>`;
    const merged = mergeOfficialDeckLookCss(sparse, assets);
    const cover = merged.match(/<section\b[^>]*\bclass\s*=\s*"[^"]*\bslide\b[^"]*"[\s\S]*?<\/section>/i)?.[0] ?? '';
    const pillStyles = [...cover.matchAll(/<(?:div|span)\b[^>]*\bdeco-pill\b[^>]*style="([^"]*)"/gi)]
      .map((m) => m[1] ?? '');
    expect(pillStyles.length).toBeGreaterThan(0);
    for (const style of pillStyles) {
      expect(style).not.toMatch(/z-index:\s*2/i);
      if (/z-index\s*:/i.test(style)) expect(style).toMatch(/z-index:\s*1/i);
    }
    expect(merged).toMatch(/z-index:\s*2\s*!important/);
  });

  it('keeps official-scale 120px Daisy paint and rejects only tiny invented icons', () => {
    const official = loadOfficialLookSource(join(EXAMPLES_DIR, 'html-ppt-zhangzara-daisy-days/example.html'));
    const assets = extractOfficialDeckLookAssets(official)!;
    const daisySvg = assets.motifHtml.find((block) => /deco-daisy[\s\S]*?<svg\b/i.test(block));
    expect(daisySvg).toBeTruthy();
    const svg = /<svg\b[\s\S]*?<\/svg>/i.exec(daisySvg!)?.[0] ?? '';
    const timelineScale = `<!doctype html><html lang="ko"><body>
<section class="slide slide-title" style="background:#F5F0E6;width:1920px;height:1080px;position:relative">
  <div class="deco deco-daisy" style="position:absolute;bottom:5%;right:5%;width:120px;height:120px">${svg}</div>
  <h1>Timeline</h1>
</section>
<section class="slide"><h2>Body</h2></section>
</body></html>`;
    const merged = mergeOfficialDeckLookCss(timelineScale, assets);
    const cover = merged.match(/<section\b[^>]*\bclass\s*=\s*"[^"]*\bslide\b[^"]*"[\s\S]*?<\/section>/i)?.[0] ?? '';
    expect(cover).toMatch(/width:\s*120px/i);
    expect(cover).toContain('Timeline');
  });

  it('does not override Capsule deco-pill oblong geometry with a 140px Motif default', () => {
    const official = loadOfficialLookSource(join(EXAMPLES_DIR, 'html-ppt-zhangzara-capsule/example.html'));
    const assets = extractOfficialDeckLookAssets(official)!;
    const pillOpen = assets.motifHtml
      .flatMap((block) => block.match(/<(?:div|span)\b[^>]*\bdeco-pill\b[^>]*>/gi) ?? [])
      .find((open) => /width\s*:\s*\d+px/i.test(open));
    expect(pillOpen).toBeTruthy();
    const style = /style="([^"]*)"/i.exec(pillOpen!)?.[1] ?? '';
    expect(style).toMatch(/width\s*:\s*\d+px/i);
    expect(style).not.toMatch(/width\s*:\s*140px/i);
    expect(style).not.toMatch(/[a-z0-9.%)]position:/i);
  });

  it('pins width=1920 viewport on no-head compact decks', () => {
    const official = loadOfficialLookSource(join(EXAMPLES_DIR, 'html-ppt-zhangzara-daisy-days/example.html'));
    const assets = extractOfficialDeckLookAssets(official)!;
    const noHead = `<!doctype html><html lang="ko"><body>
<section class="slide" style="width:1920px;height:1080px;background:#F5F0E6"><h1>Cover</h1></section>
<section class="slide" style="width:1920px;height:1080px"><h2>Body</h2></section>
</body></html>`;
    const merged = mergeOfficialDeckLookCss(noHead, assets);
    expect(merged).toMatch(/<head>[\s\S]*name="viewport"[\s\S]*width=1920/i);
    expect(merged).toContain('Cover');
  });

  it('merges Motif onto slides beyond the old 12-slide cap', () => {
    const official = loadOfficialLookSource(join(EXAMPLES_DIR, 'html-ppt-zhangzara-daisy-days/example.html'));
    const assets = extractOfficialDeckLookAssets(official)!;
    const slides = Array.from({ length: 15 }, (_, i) =>
      i === 0
        ? '<section class="slide"><h1>Cover</h1></section>'
        : `<section class="slide"><h2>Slide ${i + 1}</h2></section>`,
    ).join('\n');
    const deck = `<!doctype html><html lang="ko"><body>${slides}</body></html>`;
    const merged = mergeOfficialDeckLookCss(deck, assets);
    expect(merged).toContain('Slide 15');
    const last = [...merged.matchAll(/<section\b[^>]*\bclass\s*=\s*"[^"]*\bslide\b[^"]*"[\s\S]*?<\/section>/gi)]
      .map((m) => m[0])
      .find((block) => /Slide 15/.test(block)) ?? '';
    expect(last).toMatch(/deco-daisy/i);
  });

  it('does not stamp the Capsule cover pill pack onto every slide', () => {
    const official = loadOfficialLookSource(join(EXAMPLES_DIR, 'html-ppt-zhangzara-capsule', 'example.html'));
    const assets = extractOfficialDeckLookAssets(official)!;
    const sixSlides = `<!doctype html><html lang="ko"><body>
<section class="slide"><h1>Cover</h1></section>
<section class="slide"><h2>Body A</h2></section>
<section class="slide"><h2>Body B</h2></section>
<section class="slide"><h2>Body C</h2></section>
<section class="slide"><h2>Body D</h2></section>
<section class="slide"><h2>Closing</h2></section>
</body></html>`;
    const merged = mergeOfficialDeckLookCss(sixSlides, assets);
    const decoPills = merged.match(/<div[^>]*\bdeco-pills\b(?!-)/gi) ?? [];
    const floating = merged.match(/<div[^>]*\bfloating-pills\b/gi) ?? [];
    const closing = merged.match(/<div[^>]*\bdeco-pills-closing\b/gi) ?? [];
    expect(decoPills.length, 'cover deco-pills only').toBe(1);
    expect(floating.length, 'body floating-pills').toBeGreaterThanOrEqual(3);
    expect(closing.length, 'closing cluster').toBe(1);
    expect(merged).toContain('Cover');
    expect(merged).toContain('Body A');
    expect(merged).toContain('Closing');
    const twice = mergeOfficialDeckLookCss(merged, assets);
    expect(twice).toBe(merged);

    const stamped = sixSlides.replace(
      /<section class="slide">/g,
      '<section class="slide"><div data-od-official-motif-html class="deco-pills"><div class="deco-pill pill-coral" style="width:80px;height:36px"></div></div>',
    );
    const healed = mergeOfficialDeckLookCss(stamped, assets);
    expect((healed.match(/<div[^>]*\bdeco-pills\b(?!-)/gi) ?? []).length).toBe(1);
    expect((healed.match(/<div[^>]*\bfloating-pills\b/gi) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('loops every mode:deck example and paints official body Motif onto sparse fill', () => {
    const families: Array<{ id: string; official: RegExp; merged: RegExp }> = [
      { id: 'daisy-flower', official: /deco-daisy[\s\S]{0,240}<svg\b[\s\S]{80,}?#fcdf6c/i, merged: /deco-daisy[\s\S]{0,240}<svg\b[\s\S]{80,}?#fcdf6c/i },
      { id: 'deco-pill', official: /<(?:div|span)[^>]*\bdeco-pill\b/i, merged: /<(?:div|span)[^>]*\bdeco-pill\b/i },
      { id: 'petal', official: /<(?:div|span)[^>]*\bpetal\b/i, merged: /<(?:div|span)[^>]*\b(?:petals|petal)\b/i },
      { id: 'pin-use', official: /<use[^>]+href=["']#pin/i, merged: /<symbol[^>]+id=["']pin["']|<(?:svg|div)[^>]*\bpin-1\b/i },
      { id: 'doodle', official: /<(?:div|span|svg)[^>]*\bdoodle-/i, merged: /<(?:div|span|svg)[^>]*\bdoodle-/i },
      { id: 'gd-orb', official: /<(?:div|span)[^>]*\bgd-orb\b/i, merged: /<(?:div|span)[^>]*\bgd-orb\b/i },
      { id: 'xp-blob', official: /<(?:div|span)[^>]*\bxp-blob\b/i, merged: /<(?:div|span)[^>]*\bxp-blob\b/i },
      { id: 'deco-dots', official: /<(?:div|span)[^>]*\bdeco-dots\b/i, merged: /<(?:div|span)[^>]*\bdeco-dots\b/i },
      { id: 'deco-green-circle', official: /<(?:div|span)[^>]*\bdeco-green-circle\b/i, merged: /<(?:div|span)[^>]*\bdeco-green-circle\b/i },
      { id: 'post-it', official: /<(?:div|span)[^>]*\bpost-it\b/i, merged: /<(?:div|span)[^>]*\bpost-it\b/i },
      { id: 'hc-scanlines', official: /<(?:div|span)[^>]*\bhc-scanlines\b/i, merged: /<(?:div|span)[^>]*\bhc-scanlines\b/i },
      { id: 'pixel-glitch', official: /<(?:div|span)[^>]*\bpixel-glitch\b/i, merged: /<(?:div|span)[^>]*\bpixel-glitch\b/i },
      { id: 'win-titlebar', official: /<(?:div|span)[^>]*\bwin-titlebar\b/i, merged: /<(?:div|span)[^>]*\bwin-titlebar\b/i },
      { id: 'cover-blob', official: /<(?:div|span)[^>]*\bcover-blob\b/i, merged: /<(?:div|span)[^>]*\bcover-blob\b/i },
      { id: 'ts-stripe', official: /<(?:div|span)[^>]*\bts-stripe\b/i, merged: /<(?:div|span)[^>]*\bts-stripe\b/i },
      { id: 'zigzag-deco', official: /<(?:div|span|svg)[^>]*\bzigzag-deco\b/i, merged: /<(?:div|span|svg)[^>]*\bzigzag-deco\b/i },
      { id: 'geo-decoration', official: /<(?:div|span)[^>]*\bgeo-decoration\b/i, merged: /<(?:div|span)[^>]*\bgeo-decoration\b/i },
      { id: 'cover-decoration', official: /<(?:div|span)[^>]*\bcover-decoration\b/i, merged: /<(?:div|span)[^>]*\bcover-decoration\b/i },
      { id: 'sunglow', official: /<(?:div|span)[^>]*\bsunglow\b/i, merged: /<(?:div|span)[^>]*\bsunglow\b/i },
    ];
    const failures: string[] = [];
    const examples = listOfficialDeckExamplePaths();
    expect(examples.length).toBeGreaterThan(40);
    for (const examplePath of examples) {
      const folder = examplePath.slice(EXAMPLES_DIR.length + 1).split('/')[0] ?? examplePath;
      const official = loadOfficialLookSource(examplePath);
      const body = official
        .replace(/<style\b[\s\S]*?<\/style>/gi, '')
        .replace(/<script\b[\s\S]*?<\/script>/gi, '');
      const assets = extractOfficialDeckLookAssets(official);
      if (!assets?.css || assets.css.length < 80) {
        failures.push(`${folder}: no extractable look CSS`);
        continue;
      }
      const merged = mergeOfficialDeckLookCss(LINUX_SPARSE_COVER, assets);
      if (!merged.includes(OFFICIAL_DECK_LOOK_STYLE_ATTR)) {
        failures.push(`${folder}: missing official look style marker`);
      }
      if (!merged.includes('Linux Internals for Senior Engineers')) {
        failures.push(`${folder}: compact fill title dropped`);
      }
      for (const family of families) {
        if (!family.official.test(body) && !(family.id === 'daisy-flower' && family.official.test(official))) {
          continue;
        }
        if (!family.merged.test(merged)) {
          failures.push(`${folder}: official body has ${family.id} but sparse merge does not`);
        }
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
  }, 60_000);

  it('does not treat deco-pills-closing or an empty deco-pills shell as Capsule paint', () => {
    const official = loadOfficialLookSource(join(EXAMPLES_DIR, 'html-ppt-zhangzara-capsule', 'example.html'));
    const assets = extractOfficialDeckLookAssets(official)!;
    const closingOnly = LINUX_SPARSE_COVER.replace(
      '</section>',
      '<div class="deco-pills-closing"></div></section>',
    );
    const emptyCluster = LINUX_SPARSE_COVER.replace(
      '</section>',
      '<div class="deco-pills"></div></section>',
    );
    for (const dest of [closingOnly, emptyCluster]) {
      expect(dest).not.toMatch(/<(?:div|span)[^>]*\bdeco-pill\b/i);
      const merged = mergeOfficialDeckLookCss(dest, assets);
      expect(merged).toMatch(/<(?:div|span)[^>]*\bdeco-pill\b/i);
      expect(merged).toContain('Linux Internals for Senior Engineers');
    }
  });

  it('does not treat an empty deco-pill shell as Capsule Motif paint', () => {
    const official = loadOfficialLookSource(join(EXAMPLES_DIR, 'html-ppt-zhangzara-capsule', 'example.html'));
    const assets = extractOfficialDeckLookAssets(official)!;
    const emptyPill = LINUX_SPARSE_COVER.replace(
      '</section>',
      '<div class="deco-pill"></div></section>',
    );
    const merged = mergeOfficialDeckLookCss(emptyPill, assets);
    const cover = merged.match(/<section class="slide"[\s\S]*?<\/section>/i)?.[0] ?? '';
    expect(cover).toMatch(/deco-pill[^>]*(?:style\s*=\s*["'][^"']*width\s*:)/i);
    expect(merged).toContain('Linux Internals for Senior Engineers');
  });

  it('does not treat a butter-colored chart SVG as Daisy Motif identity', () => {
    const official = loadOfficialLookSource(join(EXAMPLES_DIR, 'html-ppt-zhangzara-daisy-days/example.html'));
    const assets = extractOfficialDeckLookAssets(official)!;
    const chartCover = `<!doctype html><html lang="ko"><body>
<section class="slide" style="background:#F5F0E6;width:1920px;height:1080px;position:relative">
  <h1>Linux Internals for Senior Engineers</h1>
  <svg viewBox="0 0 120 40" width="120" height="40">
    <path d="M0 20 H120" stroke="#fcdf6c" fill="none"/>
    <rect x="10" y="8" width="12" height="24" fill="#fcdf6c"/>
  </svg>
</section>
<section class="slide" style="width:1920px;height:1080px;position:relative"><h2>Body</h2></section>
</body></html>`;
    const merged = mergeOfficialDeckLookCss(chartCover, assets);
    const cover = merged.match(/<section class="slide"[\s\S]*?<\/section>/i)?.[0] ?? '';
    expect(cover).toMatch(/deco-daisy[\s\S]{0,240}<svg\b[\s\S]{80,}?#fcdf6c/i);
  });

  it('does not skip official look CSS when the attr only appears in a comment', () => {
    const official = loadOfficialLookSource(join(EXAMPLES_DIR, 'html-ppt-zhangzara-capsule/example.html'));
    const assets = extractOfficialDeckLookAssets(official)!;
    const poisoned = `<!doctype html><html><head><!-- data-od-official-look-css --></head><body>
<section class="slide"><h1>Topic</h1></section></body></html>`;
    expect(deckHtmlHasOfficialLookCss(poisoned, assets)).toBe(false);
    const merged = mergeOfficialDeckLookCss(poisoned, assets);
    expect(merged).toMatch(/<style[^>]*\bdata-od-official-look-css\b/i);
    expect(merged).toContain('Topic');
  });

  it('fills empty Daisy star shells with star SVG, not butter flower SVG', () => {
    const official = loadOfficialLookSource(join(EXAMPLES_DIR, 'html-ppt-zhangzara-daisy-days/example.html'));
    const assets = extractOfficialDeckLookAssets(official)!;
    const shells = `<!doctype html><html lang="ko"><body>
<section class="slide" style="position:relative;background:#F5F0E6">
  <div class="deco deco-star-1"></div>
  <h1>Topic</h1>
</section>
</body></html>`;
    const merged = mergeOfficialDeckLookCss(shells, assets);
    expect(merged).toMatch(/deco-star-1[\s\S]{0,120}<svg\b/i);
    expect(merged).not.toMatch(/deco-star-1[\s\S]{0,400}#fcdf6c/i);
  });

  it('does not extract content chrome pills/labels as Motif seeds', () => {
    for (const folder of [
      'html-ppt-pitch-deck',
      'html-ppt-course-module',
      'html-ppt-zhangzara-long-table',
      'html-ppt-zhangzara-8-bit-orbit',
      'html-ppt-zhangzara-capsule',
    ]) {
      const official = loadOfficialLookSource(join(EXAMPLES_DIR, folder, 'example.html'));
      const assets = extractOfficialDeckLookAssets(official)!;
      expect(
        assets.motifHtml.every(
          (block) => !/\bpill-(?:accent|academic|divider)\b|\bpixel-label\b|\bstat-bar\b|\bquote-container\b|\bpixel-face\b/i.test(block),
        ),
        folder,
      ).toBe(true);
    }
  });

  it('still injects Daisy flower SVG when the fill already has tiny decorative <svg> dots', () => {
    const official = loadOfficialLookSource(join(EXAMPLES_DIR, 'html-ppt-zhangzara-daisy-days/example.html'));
    const assets = extractOfficialDeckLookAssets(official)!;
    expect(assets.css).not.toMatch(/\.cls-1\s*\{[^}]*#fcdf6c/i);
    expect(assets.motifHtml.some((block) => /deco-daisy[\s\S]*?<svg\b/i.test(block))).toBe(true);

    const linuxCover = `<!doctype html><html lang="ko"><body>
<section class="slide" style="background:#F5F0E6;width:1920px;height:1080px;position:relative">
  <h1>Linux Internals for Senior Engineers</h1>
  <p>커널 아키텍처 · 스케줄러 · 메모리 서브시스템 · 시스템콜 경계 · 성능 튜닝까지 — 실무 딥다이브</p>
  <span style="border:3px solid #111;border-radius:14px;background:#7ECDC0;box-shadow:4px 4px 0 #111">Kernel 6.x</span>
  <span style="border:3px solid #111;border-radius:14px;background:#FDE366;box-shadow:4px 4px 0 #111">시니어 개발자 대상</span>
  <span style="border:3px solid #111;border-radius:14px;background:#F7C8D4;box-shadow:4px 4px 0 #111">Professional</span>
  <div style="position:absolute;bottom:24px;right:24px;display:flex;gap:8px">
    <svg width="12" height="12"><circle cx="6" cy="6" r="5" fill="none" stroke="#7ECDC0"/></svg>
    <svg width="12" height="12"><circle cx="6" cy="6" r="5" fill="none" stroke="#FDE366"/></svg>
    <svg width="12" height="12"><circle cx="6" cy="6" r="5" fill="none" stroke="#F7C8D4"/></svg>
  </div>
</section>
<section class="slide" style="background:#F5F0E6;width:1920px;height:1080px;position:relative">
  <h2>Scheduler</h2>
  <p>CFS · runqueue · latency</p>
</section>
<section class="slide" style="background:#7ECDC0;width:1920px;height:1080px;position:relative">
  <h2>Memory</h2>
</section>
</body></html>`;

    const merged = mergeOfficialDeckLookCss(linuxCover, assets);
    expect(merged).toMatch(/deco-daisy[\s\S]{0,240}<svg\b[\s\S]{80,}?#fcdf6c/i);
    expect(merged).toMatch(/deco-star[\s\S]{0,400}<svg\b/i);
    expect(merged).toContain('Linux Internals for Senior Engineers');
    expect(merged).toContain('Kernel 6.x');
    expect((merged.match(/deco-daisy[\s\S]{0,240}<svg\b/gi) ?? []).length).toBeGreaterThanOrEqual(2);
    const twice = mergeOfficialDeckLookCss(merged, assets);
    expect(twice).toBe(merged);
  });

  it('injects Daisy Motif SVG instances into sparse compact fills (CSS alone cannot paint flowers)', () => {
    const official = loadOfficialLookSource(join(EXAMPLES_DIR, 'html-ppt-zhangzara-daisy-days/example.html'));
    const assets = extractOfficialDeckLookAssets(official)!;
    expect(assets.motifHtml.some((block) => /deco-daisy[\s\S]*?<svg\b|#fcdf6c/i.test(block))).toBe(true);

    const sparseFill = `<!doctype html><html lang="ko"><body>
<section class="slide" style="background:#F5F0E6;width:1920px;height:1080px;position:relative">
  <h1>Linux Internals for Senior Engineers</h1>
  <p>커널 아키텍처 · 스케줄러 · 메모리</p>
  <span style="border-radius:9999px;background:#A8D5C5">Kernel 6.x</span>
  <div style="position:absolute;bottom:24px;right:24px;display:flex;gap:8px">
    <i style="width:10px;height:10px;border-radius:50%;background:#A8D5C5"></i>
    <i style="width:10px;height:10px;border-radius:50%;background:#FDE366"></i>
    <i style="width:10px;height:10px;border-radius:50%;background:#FBB0C7"></i>
  </div>
</section>
<section class="slide" style="background:#F5F0E6;width:1920px;height:1080px;position:relative">
  <h2>Scheduler</h2>
  <p>CFS · runqueue · latency</p>
</section>
</body></html>`;
    expect(sparseFill).not.toMatch(/#fcdf6c/i);

    const merged = mergeOfficialDeckLookCss(sparseFill, assets);
    expect(merged).toMatch(/#fcdf6c/i);
    expect(merged).toMatch(/deco-daisy/i);
    expect(merged).toContain(OFFICIAL_DECK_MOTIF_HTML_ATTR);
    expect(merged).toContain('Linux Internals for Senior Engineers');
    expect(merged).toContain('Scheduler');
    // Cover + one body slide should carry Motif.
    expect((merged.match(/#fcdf6c/gi) ?? []).length).toBeGreaterThanOrEqual(2);

    const twice = mergeOfficialDeckLookCss(merged, assets);
    expect(twice).toBe(merged);
  });

  it('fills empty Daisy deco shells with Motif SVG on merge', () => {
    const official = loadOfficialLookSource(join(EXAMPLES_DIR, 'html-ppt-zhangzara-daisy-days/example.html'));
    const assets = extractOfficialDeckLookAssets(official)!;
    const emptyShells = `<!doctype html><html lang="ko"><body>
<section class="slide" style="position:relative;background:#F5F0E6">
  <div class="deco deco-daisy-tl"></div>
  <div class="deco deco-daisy-br"></div>
  <h1>Topic</h1>
</section>
</body></html>`;
    const merged = mergeOfficialDeckLookCss(emptyShells, assets);
    expect(merged).toMatch(/deco-daisy-tl[\s\S]*?<svg\b[\s\S]*?#fcdf6c/i);
    expect(merged).toMatch(/deco-daisy-br[\s\S]*?<svg\b/i);
  });

  it('injects Capsule deco-pill Motif seed into sparse compact fills', () => {
    const official = loadOfficialLookSource(join(EXAMPLES_DIR, 'html-ppt-zhangzara-capsule/example.html'));
    const assets = extractOfficialDeckLookAssets(official)!;
    expect(assets.motifHtml.some((block) => /\bdeco-pill\b/i.test(block))).toBe(true);
    expect(assets.motifHtml.some((block) => /\bdeco-pill\b[\s\S]*?style=/i.test(block) || /style=[\s\S]*?deco-pill/i.test(block))).toBe(true);

    const sparseFill = `<!doctype html><html lang="ko"><body>
<section class="slide" style="background:#F5F5F0;width:1920px;height:1080px;position:relative">
  <h1>shadcn/ui</h1>
  <p>Copy, Don't Install</p>
</section>
<section class="slide" style="background:#F5F5F0;width:1920px;height:1080px;position:relative">
  <h2>Radix</h2>
</section>
</body></html>`;
    expect(sparseFill).not.toMatch(/\bdeco-pill\b/i);
    const merged = mergeOfficialDeckLookCss(sparseFill, assets);
    expect(merged).toMatch(/\bdeco-pill\b/i);
    expect(merged).toContain(OFFICIAL_DECK_MOTIF_HTML_ATTR);
    expect(merged).toContain('shadcn/ui');
    expect((merged.match(/\bdeco-pill\b/gi) ?? []).length).toBeGreaterThanOrEqual(2);
    const twice = mergeOfficialDeckLookCss(merged, assets);
    expect(twice).toBe(merged);
  });

  it('injects Sakura petals Motif seed and s-cover on sparse fills', () => {
    const official = loadOfficialLookSource(join(EXAMPLES_DIR, 'html-ppt-zhangzara-sakura-chroma/example.html'));
    const assets = extractOfficialDeckLookAssets(official)!;
    expect(assets.motifHtml.some((block) => /\bpetals\b/i.test(block))).toBe(true);

    const sparseFill = `<!doctype html><html lang="ko"><body>
<section class="slide" style="background:#FAF7F2;width:1920px;height:1080px;position:relative">
  <h1>Tape Garden</h1>
  <p>Catalogue No. 7</p>
</section>
<section class="slide" style="background:#FAF7F2;width:1920px;height:1080px;position:relative">
  <h2>Palette</h2>
</section>
</body></html>`;
    expect(sparseFill).not.toMatch(/\bpetals\b/i);
    expect(sparseFill).not.toMatch(/\bs-cover\b/i);
    const merged = mergeOfficialDeckLookCss(sparseFill, assets);
    expect(merged).toMatch(/\bpetals\b/i);
    expect(merged).toMatch(/\bs-cover\b/i);
    expect(merged).toContain(OFFICIAL_DECK_MOTIF_HTML_ATTR);
    expect(merged).toContain('Tape Garden');
    const twice = mergeOfficialDeckLookCss(merged, assets);
    expect(twice).toBe(merged);
  });

  it('injects Hermes hc-scanlines Motif seed and identity host class', () => {
    const official = loadOfficialLookSource(join(EXAMPLES_DIR, 'html-ppt-hermes-cyber-terminal/example.html'));
    const assets = extractOfficialDeckLookAssets(official)!;
    expect(assets.motifHtml.some((block) => /\bhc-scanlines\b/i.test(block))).toBe(true);
    expect(assets.identityHostClass).toMatch(/tpl-hermes-cyber-terminal/i);

    const sparseFill = `<!doctype html><html lang="ko"><body>
<section class="slide" style="background:#0b0f0c;width:1920px;height:1080px;position:relative">
  <h1>Terminal</h1>
  <p>Cyber ops</p>
</section>
<section class="slide" style="background:#0b0f0c;width:1920px;height:1080px;position:relative">
  <h2>Grid</h2>
</section>
</body></html>`;
    expect(sparseFill).not.toMatch(/\bhc-scanlines\b/i);
    expect(sparseFill).not.toMatch(/tpl-hermes-cyber-terminal/i);
    const merged = mergeOfficialDeckLookCss(sparseFill, assets);
    expect(merged).toMatch(/\bhc-scanlines\b/i);
    expect(merged).toMatch(/tpl-hermes-cyber-terminal/i);
    expect(merged).toContain(OFFICIAL_DECK_MOTIF_HTML_ATTR);
    expect(merged).toContain('Terminal');
    const twice = mergeOfficialDeckLookCss(merged, assets);
    expect(twice).toBe(merged);
  });

  it('injects Capsule grain-overlay host from official example.html', () => {
    const official = loadOfficialLookSource(join(EXAMPLES_DIR, 'html-ppt-zhangzara-capsule/example.html'));
    const assets = extractOfficialDeckLookAssets(official)!;
    expect(assets.motifHtml.join('')).toContain('grain-overlay');
    const merged = mergeOfficialDeckLookCss(COMPACT_FILL, assets);
    expect(merged).toMatch(/<div[^>]*grain-overlay/);
    expect(merged).toContain('shadcn/ui');
  });

  it('neutralizes official presenter layout so compact 16:9 split slides keep their row flex', () => {
    const official = loadOfficialLookSource(join(EXAMPLES_DIR, 'html-ppt-zhangzara-capsule/example.html'));
    const assets = extractOfficialDeckLookAssets(official)!;
    expect(assets.css).toMatch(/flex-direction\s*:\s*column/);
    expect(assets.css).toMatch(/position\s*:\s*absolute/);

    const splitFill = `<!doctype html><html lang="ko"><head><meta charset="utf-8"></head><body>
<section class="slide" style="display:flex;gap:0;padding:0;width:1920px;height:1080px">
  <div class="split-left"><h2>마이그레이션 전략</h2></div>
  <div class="split-right" style="width:620px;flex-shrink:0">마이그레이션 단계</div>
</section>
</body></html>`;
    const merged = mergeOfficialDeckLookCss(splitFill, assets);
    expect(merged).toContain(OFFICIAL_DECK_LOOK_STYLE_ATTR);
    expect(merged).toContain('stacked preview/export: Motif paint + fixed 1920');
    expect(merged).toMatch(/flex-direction:\s*column/);
    expect(merged).toMatch(/justify-content:\s*center/);
    expect(merged).toMatch(/flex-direction:\s*unset/);
    expect(merged).toMatch(/position:\s*relative\s*!important/);
    expect(merged).toMatch(/inset:\s*auto\s*!important/);
    expect(merged).toMatch(/width:\s*1920px\s*!important/);
    expect(merged).toMatch(/height:\s*1080px\s*!important/);
    expect(merged).toContain('.pill-coral');
    expect(merged).toContain('마이그레이션 전략');
    expect(merged).not.toMatch(/flex-direction:\s*unset\s*!important/);

    const twice = mergeOfficialDeckLookCss(merged, assets);
    expect(twice).toBe(merged);
  });

  it('refreshes stale opacity-only neutralize on an already-merged official look sheet', () => {
    const stale = `<!doctype html><html><head>
<style data-od-official-look-css>
.slide { position:absolute; inset:0; width:100%; height:100%; display:flex; flex-direction:column; opacity:0; }
.pill-coral { background:#E85D4E; }
/* stacked preview/export: keep Motif paint, do not hide non-active slides */
html, body { overflow: visible !important; height: auto !important; }
.slide, .slide.active, .slide.is-active {
  opacity: 1 !important;
  pointer-events: auto !important;
}
</style></head><body>
<section class="slide" style="display:flex;padding:0">split</section>
</body></html>`;
    const refreshed = mergeOfficialDeckLookCss(stale, {
      css: '.slide{opacity:0}.pill-coral{background:#E85D4E}',
      fontLinks: [],
      motifHtml: [],
    });
    expect(refreshed).toContain('stacked preview/export: Motif paint + fixed 1920');
    expect(refreshed).toMatch(/flex-direction:\s*unset/);
    expect(refreshed).toContain('.pill-coral { background:#E85D4E; }');
    expect(refreshed).toContain('split');
  });

  it('treats catalog hide-toggle templates as presenters even when slide-counter precedes slides', () => {
    const folders = [
      'html-ppt-zhangzara-playful',
      'html-ppt-zhangzara-cartesian',
      'html-ppt-zhangzara-block-frame',
      'html-ppt-zhangzara-cobalt-grid',
      'html-ppt-zhangzara-retro-zine',
      'html-ppt-zhangzara-coral',
      'html-ppt-zhangzara-capsule',
    ];
    for (const folder of folders) {
      const html = readFileSync(join(EXAMPLES_DIR, folder, 'example.html'), 'utf8');
      expect(looksLikeOfficialFullscreenPresenterDeck(html), folder).toBe(true);
      expect(needsStackedDesignViewportLock(html), folder).toBe(false);
    }
  });

  it('treats Zhangzara <deck-stage> catalogs as presenters, not stacked fills', () => {
    const official = readFileSync(join(EXAMPLES_DIR, 'html-ppt-zhangzara-pink-script/example.html'), 'utf8');
    expect(official).toMatch(/<deck-stage\b/i);
    expect(looksLikeOfficialFullscreenPresenterDeck(official)).toBe(true);
    const out = lockStackedDeckCanvasForPreview(official);
    expect(out).not.toContain('data-od-stacked-canvas-neutralize');
    expect(out).not.toMatch(/content="width=1920/);
  });

  it('treats Studio/Grove/Signal #deck horizontal strips as catalog presenters (§0.92)', () => {
    const family = [
      'html-ppt-zhangzara-studio',
      'html-ppt-zhangzara-grove',
      'html-ppt-zhangzara-signal',
      'html-ppt-zhangzara-mat',
      'html-ppt-zhangzara-broadside',
      'html-ppt-zhangzara-vellum',
      'html-ppt-zhangzara-monochrome',
      'html-ppt-zhangzara-raw-grid',
    ];
    const failures: string[] = [];
    for (const folder of family) {
      const official = readFileSync(join(EXAMPLES_DIR, folder, 'example.html'), 'utf8');
      if (!looksLikeOfficialFullscreenPresenterDeck(official)) {
        failures.push(`${folder}: not detected as fullscreen presenter`);
      }
      if (needsStackedDesignViewportLock(official)) {
        failures.push(`${folder}: catalog wrongly needs 1920 lock`);
      }
      const locked = lockStackedDeckCanvasForPreview(official);
      if (/content="width=1920/.test(locked)) {
        failures.push(`${folder}: catalog gained width=1920 meta`);
      }
      // Compact letterbox half-path injects neutralize even though lockStacked
      // strips it for presenters (§0.93).
      const letterboxed = injectStackedCanvasNeutralizeForLetterbox(locked);
      if (!/data-od-stacked-canvas-neutralize/.test(letterboxed)) {
        failures.push(`${folder}: letterbox neutralize missing`);
      }
      if (!/#deck\b[^\{]*\{[^}]*flex-direction:\s*column\s*!important/i.test(letterboxed)) {
        failures.push(`${folder}: letterbox neutralize missing #deck column`);
      }
      const assets = extractOfficialDeckLookAssets(official);
      if (!assets?.css) {
        failures.push(`${folder}: no look CSS`);
        continue;
      }
      const sparse = `<!doctype html><html lang="ko"><body>
<section class="slide" style="width:1920px;height:1080px"><h1>Studio Fill</h1></section>
<section class="slide" style="width:1920px;height:1080px"><h2>Two</h2></section>
</body></html>`;
      const merged = mergeOfficialDeckLookCss(sparse, assets);
      const look =
        merged.match(/<style[^>]*data-od-official-look-css[^>]*>([\s\S]*?)<\/style>/i)?.[1] ?? '';
      if (!/#deck\b[^\{]*\{[^}]*flex-direction:\s*column\s*!important/i.test(look)) {
        failures.push(`${folder}: merge neutralize missing #deck column stack`);
      }
      const body = look.replace(/\n?\/\*\s*stacked preview\/export:[\s\S]*$/i, '');
      if (/flex\s*:\s*[^;]*100vw/i.test(body) && /(?:^|,)\s*\.slide\s*\{[^}]*flex\s*:/im.test(body)) {
        failures.push(`${folder}: .slide flex 100vw survived prepare`);
      }
      // Design tokens should leave the iframe viewport (12vw → canvas px).
      if (/--sz-[a-z0-9-]+\s*:\s*[^;]*\bvw\b/i.test(body)) {
        failures.push(`${folder}: type-scale vw token survived canvas px rewrite`);
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('does not lock official Capsule example.html to a stacked 1920 canvas', () => {
    const official = readFileSync(join(EXAMPLES_DIR, 'html-ppt-zhangzara-capsule/example.html'), 'utf8');
    expect(looksLikeOfficialFullscreenPresenterDeck(official)).toBe(true);
    const healed = ensureOfficialLookStackedCanvasNeutralize(official);
    expect(healed).not.toContain('data-od-stacked-canvas-neutralize');
    expect(healed).not.toContain('stacked preview/export: Motif paint + fixed 1920');
    expect(healed).toContain('position: absolute');
    expect(healed).toContain('width: 100%');
    expect(healed).toContain('CAPSULE');
  });

  it('opt-in locks viewport for fills — catalog presenters stay device-width', () => {
    const examples = listOfficialDeckExamplePaths();
    expect(examples.length).toBeGreaterThan(40);
    const presenterLocked: string[] = [];
    const neutralizedCatalog: string[] = [];
    let presenterHits = 0;
    for (const examplePath of examples) {
      const folder = examplePath.slice(EXAMPLES_DIR.length + 1).split('/')[0] ?? examplePath;
      const html = readFileSync(examplePath, 'utf8');
      const isPresenter = looksLikeOfficialFullscreenPresenterDeck(html);
      if (isPresenter) presenterHits += 1;
      const out = lockStackedDeckCanvasForPreview(html);
      if (isPresenter) {
        if (needsStackedDesignViewportLock(html)) presenterLocked.push(`${folder}:needsLock`);
        if (/content="width=1920/.test(out)) presenterLocked.push(`${folder}:meta1920`);
      }
      // Catalog examples must not gain stacked neutralize unless they already
      // carry official look CSS (fills only).
      if (
        !html.includes('data-od-official-look-css')
        && /data-od-stacked-canvas-neutralize/.test(out)
      ) {
        neutralizedCatalog.push(folder);
      }
    }
    expect(presenterHits).toBeGreaterThan(25);
    expect(presenterLocked).toEqual([]);
    expect(neutralizedCatalog).toEqual([]);
  });

  it('still locks compact fills that carry official look CSS to the 1920 canvas', () => {
    const compact = `<!doctype html><html><head>
<style data-od-official-look-css>
.slide{position:absolute;inset:0;width:100%;height:100%}
${LOOK_NEUTRALIZE_CSS}
</style></head><body>
<section class="slide">A</section><section class="slide">B</section>
</body></html>`;
    const out = lockStackedDeckCanvasForPreview(compact);
    expect(out).toContain('content="width=1920, initial-scale=1, maximum-scale=1"');
    expect(out).toContain('position: relative !important');
  });

  it('does not treat body-first Motif absolute fills as catalog presenters', () => {
    // Filled compact decks often copy Capsule absolute Motif geometry into a
    // plain <style> without data-od-official-look-css. Those must stay on the
    // 1920 letterbox path — otherwise content lays out at device-width and
    // looks top-left / differently centered per slide.
    const motifFill = `<!doctype html><html><head><style>
.slide{position:absolute;inset:0;width:100%;height:100%;display:flex;flex-direction:column}
.pill{border-radius:9999px}
</style></head><body>
<section class="slide"><div class="pill">TOOLING</div><h1>Compare</h1></section>
<section class="slide"><h1>Roadmap</h1></section>
</body></html>`;
    expect(looksLikeOfficialFullscreenPresenterDeck(motifFill)).toBe(false);
    expect(needsStackedDesignViewportLock(motifFill)).toBe(true);
    const locked = lockStackedDeckCanvasForPreview(motifFill);
    expect(locked).toContain('content="width=1920, initial-scale=1, maximum-scale=1"');
  });

  it('strips a wrongly injected 1920 neutralize from an official presenter', () => {
    const poisoned = `<!doctype html><html><head>
<meta name="viewport" content="width=1920, initial-scale=1, maximum-scale=1" />
<style>
  .slide { position:absolute; inset:0; width:100%; height:100%; }
</style>
<style data-od-stacked-canvas-neutralize>${LOOK_NEUTRALIZE_CSS}</style>
</head><body>
<div class="presentation"><div class="slide slide-1 active">Cover</div></div>
<div class="nav-dots"><div class="nav-dot active"></div></div>
</body></html>`;
    expect(looksLikeOfficialFullscreenPresenterDeck(poisoned)).toBe(true);
    const healed = ensureOfficialLookStackedCanvasNeutralize(poisoned);
    expect(healed).not.toContain('data-od-stacked-canvas-neutralize');
    expect(healed).not.toContain('width: 1920px !important');
    expect(healed).toContain('width=device-width');
    expect(healed).toContain('Cover');
  });

  it('still locks persist-stripped compact fills that already have the stacked host', () => {
    const compact = `<!doctype html><html><head>
<style>.slide { position:absolute; inset:0; width:100%; height:100%; }</style>
</head><body>
<div id="od-stacked-deck-stage">
<section class="slide">Topic</section>
</div>
</body></html>`;
    const healed = ensureOfficialLookStackedCanvasNeutralize(compact);
    expect(healed).toContain('data-od-stacked-canvas-neutralize');
    expect(healed).toContain('width: 1920px !important');
    expect(healed).toContain('Topic');
  });

  it('resolves official deck template ids from metadata or skillIds', () => {
    expect(firstOfficialDeckTemplateId(
      null,
      '',
      ['other-skill', 'html-ppt-zhangzara-pin-and-paper'],
    )).toBe('html-ppt-zhangzara-pin-and-paper');
    expect(firstOfficialDeckTemplateId(
      'example-html-ppt-zhangzara-capsule',
      ['html-ppt-zhangzara-pin-and-paper'],
    )).toBe('example-html-ppt-zhangzara-capsule');
    expect(firstOfficialDeckTemplateId(['research-brief', 'web-fetch'])).toBeNull();
  });

  it('survivor scan: every mode:deck merge clears Motif hang, slide-host clip, and keeps 16:9 letterbox lock', () => {
    const sparse = `<!doctype html><html lang="ko"><head><meta charset="utf-8"></head><body>
<section class="slide" style="background:#F5F0E6;width:1920px;height:1080px">
  <h1>Linux Internals for Senior Engineers</h1>
  <p>Topic overview</p>
</section>
<section class="slide" style="width:1920px;height:1080px"><h2>Kernel</h2></section>
</body></html>`;
    const isSlideHostSelector = (part: string): boolean => {
      const cleaned = part
        .trim()
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/::?[a-z0-9_-]+(?:\([^)]*\))?/gi, '')
        .trim();
      if (!cleaned) return false;
      if (/^(?:\.slides-container|\.slides|\.presentation|\.deck|\.deck-shell|\.deck-stage|\.stage|#deck|#deck-track|#deck-stage)(?:\.[\w-]+)*$/i.test(cleaned)) {
        return true;
      }
      const last = cleaned.split(/\s+/).pop() ?? '';
      return /^(?:[a-z][\w-]*|\*)?(?:\.slide|\.deck-slide|\.ppt-slide|\.slide-deck)(?:\.[\w-]+)*$/i.test(last)
        || /^section\.slide(?:\.[\w-]+)*$/i.test(last);
    };
    const examples = listOfficialDeckExamplePaths();
    expect(examples.length).toBeGreaterThan(40);
    const failures: string[] = [];
    let officialHangHits = 0;
    for (const examplePath of examples) {
      const folder = examplePath.slice(EXAMPLES_DIR.length + 1).split('/')[0] ?? examplePath;
      const official = loadOfficialLookSource(examplePath);
      const assets = extractOfficialDeckLookAssets(official);
      if (!assets?.css || assets.css.length < 80) {
        failures.push(`${folder}: no extractable look CSS`);
        continue;
      }
      if (deckHtmlHasMotifOutsideCanvasHang(official)) officialHangHits += 1;
      const merged = mergeOfficialDeckLookCss(sparse, assets);
      if (!merged.includes(OFFICIAL_DECK_LOOK_STYLE_ATTR)) {
        failures.push(`${folder}: missing official look style marker`);
      }
      if (deckHtmlHasMotifOutsideCanvasHang(merged)) {
        failures.push(`${folder}: Motif hang survives merge`);
      }
      const remmerged = mergeOfficialDeckLookCss(merged, assets);
      if (deckHtmlHasMotifOutsideCanvasHang(remmerged)) {
        failures.push(`${folder}: Motif hang survives remmerge`);
      }
      if (!needsStackedDesignViewportLock(merged)) {
        failures.push(`${folder}: merged fill does not need 1920 viewport lock`);
      }
      if (looksLikeOfficialFullscreenPresenterDeck(merged)) {
        failures.push(`${folder}: sparse merge wrongly classified as catalog presenter`);
      }
      const locked = lockStackedDeckCanvasForPreview(merged);
      if (!/content="width=1920/.test(locked)) {
        failures.push(`${folder}: letterbox lock missing width=1920 meta`);
      }
      const lookCss =
        merged.match(/<style[^>]*data-od-official-look-css[^>]*>([\s\S]*?)<\/style>/i)?.[1] ?? '';
      const lookBody = lookCss.replace(/\n?\/\*\s*stacked preview\/export:[\s\S]*$/i, '');
      if (sanitizeMotifOutsideCanvasOffsets(lookBody) !== lookBody) {
        failures.push(`${folder}: look CSS still has Motif hang after prepare`);
      }
      if (stripOfficialLookSlideHostCanvasClips(lookBody) !== lookBody) {
        failures.push(`${folder}: look CSS still has slide-host overflow/100vh after prepare`);
      }
      for (const rule of lookBody.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
        const parts = String(rule[1] ?? '')
          .split(',')
          .map((part) => part.trim())
          .filter(Boolean);
        if (!parts.length || !parts.every(isSlideHostSelector)) continue;
        const body = rule[2] ?? '';
        if (/overflow(?:-x|-y)?\s*:\s*(?:hidden|clip)/i.test(body)) {
          failures.push(`${folder}: slide-host overflow clip remains (${parts[0]})`);
          break;
        }
        if (/(?:^|[;-])\s*(?:min-|max-)?(?:width|height)\s*:\s*[^;]*\b100\s*v(?:w|h)\b/i.test(body)) {
          failures.push(`${folder}: slide-host 100vh/vw remains (${parts[0]})`);
          break;
        }
      }
      const kit = extractTemplateVisualKitFromHtml(official, { title: folder });
      if (kit) {
        const fence = [...kit.matchAll(/### (?:Decorations|Layout) CSS[\s\S]*?```css\n([\s\S]*?)```/gi)]
          .map((m) => m[1] ?? '')
          .join('\n');
        if (/\.slide\b[^{]*\{[^}]*overflow\s*:\s*(?:hidden|clip)/i.test(fence)) {
          failures.push(`${folder}: kit still emits .slide{overflow:hidden|clip}`);
        }
      }
    }
    // Catalog presenters intentionally hang Motifs for fullscreen; merge must clear them.
    expect(officialHangHits).toBeGreaterThan(10);
    expect(failures, failures.join('\n')).toEqual([]);
  }, 90_000);
});
