/**
 * 루프450–459 — Shared deterministic quality gate for Zhangzara templates.
 *
 * 5 axes checked per template:
 *   1) Motif — template CSS tokens / class names must remain in the cloned deck
 *   2) Leftover — `looksLikeLeftoverTemplateDemoDeck === false` + template-specific
 *      demo phrase / number denylist
 *   3) Canvas — fixed 1920×1080 style is present (width:1920px + min-height 1080)
 *   4) Slide count — `listTemplateCloneSlideShells(cloned).length === expected`
 *      + brief-derived topic (`팀버` / `Teamver`)
 *   5) Layout (루프471) — class-like motif tokens appear as live tags, and the
 *      first shell still has a heading. Pixel screenshots stay out of this gate.
 *
 * The helper delegates deck build to `buildTemplateClonedDeckHtml` with a
 * deterministic outline from `resolveTemplateCloneSlidesForDeterministicFill`
 * — no MiniMax — matching the FE path used by home create when a template
 * is chosen.
 */

import { readFile } from 'node:fs/promises';
import { expect } from 'vitest';

import {
  buildTemplateClonedDeckHtml,
  listTemplateCloneSlideShells,
  looksLikeLeftoverTemplateDemoDeck,
  resolveTemplateCloneSlidesForDeterministicFill,
} from '../../src/template-clone-fill.js';

/** Shared brief used by the gate. Mirrors the on-record Home create brief. */
export const TEAMVER_SERVICE_INTRO_BRIEF =
  'www.teamver.com 사이트 분석해서 서비스 소개 슬라이드 만들어줘. 8~10장';

/**
 * Cross-template demo phrases / numbers that must never survive deterministic
 * fill (regardless of source template). Keep this list conservative — only
 * add strings that unambiguously come from a stock Zhangzara sample deck.
 */
export const CROSS_TEMPLATE_LEFTOVER_DENYLIST: readonly string[] = [
  'Hartfield',
  'Daisy Days',
  'Clarity of Purpose',
  'A Framework for Bold Ideas',
  'The Journey Continues',
  '340%',
  '12.4M',
  'cheerful presentation template',
  'Aurora',
  'Public attendance',
  'Open programme',
  'Filebase',
  'Apex Group',
  'hermes-agent',
  'Field Office Quarterly',
  'field-office.co',
  'Lin Ito',
  'Aurora Institute',
  'Tape Garden',
  'SUPERCATALOG',
  'Ren Kobayashi',
  'Mei Tanaka',
  'We started Long Table',
  'Hana Brennan',
  'Placeholder lede',
  'The Editorial Desk',
  'Image Placeholder',
  'Get Started',
  'View Process',
  'Revenue Growth',
  'Active Users',
  'Retention Rate',
  '12+ Years',
  '500+ Projects',
  'J. Doe',
  'A. Smith',
  'Creative Lead',
  'Tech Director',
];

export type TemplateQualityGateSpec = {
  /** Human-readable identifier used in test names / failure logs. */
  name: string;
  /** Plugin id used by `buildTemplateClonedDeckHtml`. */
  templateId: string;
  /** Path to the fixture, relative to the caller's `import.meta.url`. */
  exampleRelativePath: string;
  /** CSS tokens / class names that must remain in the cloned deck. */
  motifMustInclude: readonly string[];
  /** Extra template-specific demo strings that must not appear. */
  demoMustNotInclude?: readonly string[];
  /** Post-cap expected slide count. See loop430 unique-role cap. */
  expectedSlideCount: number;
  /** Override the shared brief for a single spec (rare). */
  brief?: string;
  /** Override the requested slide count. Defaults to 10. */
  requestedSlideCount?: number;
};

/**
 * Run the deterministic clone pipeline for a template fixture. Returns the
 * cloned deck HTML — callers may run additional assertions after the gate.
 *
 * `spec.exampleRelativePath` resolves against this helper file (not the
 * caller), so specs can share paths regardless of which test file consumes
 * them.
 */
export async function runDeterministicTemplateQualityGate(
  spec: TemplateQualityGateSpec,
): Promise<string> {
  const html = await readFile(new URL(spec.exampleRelativePath, import.meta.url), 'utf8');
  const brief = spec.brief ?? TEAMVER_SERVICE_INTRO_BRIEF;
  const requested = spec.requestedSlideCount ?? 10;
  const slides = resolveTemplateCloneSlidesForDeterministicFill({
    userInstruction: brief,
    slideCount: requested,
  });
  const cloned = buildTemplateClonedDeckHtml(html, slides, {
    title: slides[0]?.title || '팀버',
    templateId: spec.templateId,
    maxSlides: requested,
    brief,
  });
  if (!cloned) {
    throw new Error(
      `[루프450] ${spec.name}: buildTemplateClonedDeckHtml returned null for ${spec.templateId}`,
    );
  }
  assertDeterministicTemplateQualityGate(cloned, spec);
  return cloned;
}

/**
 * Class-like motif tokens (not CSS variables or font family names).
 * Used by axis 5 to require a live `class="…"` tag, not just a stylesheet hit.
 */
export function motifClassTokens(spec: TemplateQualityGateSpec): readonly string[] {
  return spec.motifMustInclude.filter((token) => {
    if (token.startsWith('--')) return false;
    if (/^[A-Z][A-Za-z]+$/.test(token)) return false;
    return /^[A-Za-z][A-Za-z0-9-]*$/.test(token);
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Empty CSS deco shells that clone fill may drop; still gated as stylesheet motif. */
const LAYOUT_SKIP_LIVE_TOKENS = new Set([
  'slide-chrome',
  'deco-dots',
  'sunglow',
]);

const COVER_HEADING_RE =
  /<h[1-3]\b[^>]*>[\s\S]*?\S[\s\S]*?<\/h[1-3]>|<(?:div|span)\b[^>]*\bclass\s*=\s*["'][^"']*\b(?:title|display|headline|lockup|hero-title|cover-headline|title-main|main-title|t-display|wordmark|brand)\b[^>]*>[\s\S]*?\S/i;

/**
 * Assert the 4-axis quality gate on an already-built cloned deck.
 * Failures include the template name and axis so a red spec points to the
 * exact scrub / canvas / count / motif regression.
 */
export function assertDeterministicTemplateQualityGate(
  cloned: string,
  spec: TemplateQualityGateSpec,
): void {
  const tag = `[루프450:${spec.name}]`;

  // Axis 1 — motif retained.
  for (const marker of spec.motifMustInclude) {
    expect(cloned, `${tag} motif ${JSON.stringify(marker)} missing`).toContain(marker);
  }

  // Axis 2 — no leftover demo copy.
  expect(
    looksLikeLeftoverTemplateDemoDeck(cloned),
    `${tag} looksLikeLeftoverTemplateDemoDeck === true`,
  ).toBe(false);
  for (const phrase of CROSS_TEMPLATE_LEFTOVER_DENYLIST) {
    expect(cloned, `${tag} leftover phrase ${JSON.stringify(phrase)}`)
      .not.toContain(phrase);
  }
  for (const phrase of spec.demoMustNotInclude ?? []) {
    expect(cloned, `${tag} template demo ${JSON.stringify(phrase)}`)
      .not.toContain(phrase);
  }

  // Axis 3 — fixed 1920×1080 canvas.
  expect(cloned, `${tag} width:1920px missing`).toMatch(/width:\s*1920px/i);
  expect(cloned, `${tag} (min-)height:1080px missing`)
    .toMatch(/(?:min-)?height:\s*1080px/i);

  // Axis 4 — slide count + topic.
  const shells = listTemplateCloneSlideShells(cloned);
  expect(shells.length, `${tag} slide count`).toBe(spec.expectedSlideCount);
  expect(cloned, `${tag} 팀버/Teamver topic`).toMatch(/팀버|Teamver/i);

  // Axis 5 — 루프471 layout: live motif tags + a title host.
  const layoutTag = `[루프471:${spec.name}]`;
  for (const cls of motifClassTokens(spec)) {
    if (LAYOUT_SKIP_LIVE_TOKENS.has(cls)) continue;
    const liveTagRe = new RegExp(
      `<[^>]+\\bclass\\s*=\\s*["'][^"']*\\b${escapeRegExp(cls)}\\b`,
      'i',
    );
    expect(cloned, `${layoutTag} live motif tag .${cls} missing`).toMatch(liveTagRe);
  }
  const titleHost = shells.find((shell) => (
    /\b(?:s-cover|slide-hero|slide-title|cover|s1)\b/i.test(shell.attrs)
  )) ?? shells[0];
  expect(titleHost, `${layoutTag} title host missing`).toBeTruthy();
  expect(
    `${titleHost!.full}\n${cloned}`,
    `${layoutTag} cover heading missing`,
  ).toMatch(COVER_HEADING_RE);
}

/**
 * Canonical spec table used by the contracts gate and (with
 * `expectedSlideCount` only) the daemon smoke.
 * 루프450–467: Capsule … Sakura / Broadside / 8-bit / Scatterbrain
 * 루프469: Long Table / Editorial unique-role
 * 루프470: remaining 10-shell official Zhangzara catalogue kits
 * 루프471: axis 5 live motif tags + cover heading host
 */
export const ZHANGZARA_QUALITY_GATE_SPECS: readonly TemplateQualityGateSpec[] = [
  {
    name: 'Capsule',
    templateId: 'html-ppt-zhangzara-capsule',
    exampleRelativePath:
      '../../../../plugins/_official/examples/html-ppt-zhangzara-capsule/example.html',
    motifMustInclude: ['--coral', '--lime', 'pillar-card'],
    demoMustNotInclude: ['NorthPeak'],
    expectedSlideCount: 10,
  },
  {
    name: 'Daisy Days',
    templateId: 'html-ppt-zhangzara-daisy-days',
    exampleRelativePath:
      '../../../../plugins/_official/examples/html-ppt-zhangzara-daisy-days/example.html',
    motifMustInclude: ['--cream', 'deco-daisy', 'day-card'],
    demoMustNotInclude: ['A cheerful presentation template'],
    expectedSlideCount: 10,
  },
  {
    name: 'Creative Mode',
    templateId: 'html-ppt-zhangzara-creative-mode',
    exampleRelativePath:
      '../../../../plugins/_official/examples/html-ppt-zhangzara-creative-mode/example.html',
    motifMustInclude: ['--cream', 'Archivo', 'poster'],
    demoMustNotInclude: ['FLIP THE'],
    expectedSlideCount: 8,
  },
  {
    name: 'Studio',
    templateId: 'html-ppt-zhangzara-studio',
    exampleRelativePath:
      '../../../../plugins/_official/examples/html-ppt-zhangzara-studio/example.html',
    motifMustInclude: ['--c-accent', 'slide-chrome', 'stat-card'],
    demoMustNotInclude: [],
    expectedSlideCount: 10,
  },
  // 루프456 — expand gate beyond the original 4 to Blue-pro + Block-frame.
  {
    name: 'Blue Professional',
    templateId: 'html-ppt-zhangzara-blue-professional',
    exampleRelativePath:
      '../../../../plugins/_official/examples/html-ppt-zhangzara-blue-professional/example.html',
    motifMustInclude: ['--primary', 'metric-card', 'cover-decoration'],
    demoMustNotInclude: [
      'Sentiment has shifted',
      'Bullish on three-year outlook',
    ],
    expectedSlideCount: 10,
  },
  {
    name: 'Block Frame',
    templateId: 'html-ppt-zhangzara-block-frame',
    exampleRelativePath:
      '../../../../plugins/_official/examples/html-ppt-zhangzara-block-frame/example.html',
    motifMustInclude: ['feature-card', 'deco-dots', '--pink'],
    demoMustNotInclude: [
      'Neobrutalist Presentation Template',
      'Quarterly Growth Metrics',
      'Modular Layouts',
      'Visual System',
      'Image Placeholder',
      'Get Started',
      'By The Numbers',
      'Overview',
    ],
    expectedSlideCount: 10,
  },
  // 루프458 — product / pitch catalog kits.
  {
    name: 'Product Launch',
    templateId: 'html-ppt-product-launch',
    exampleRelativePath:
      '../../../../plugins/_official/examples/html-ppt-product-launch/example.html',
    motifMustInclude: ['tpl-product-launch', 'price-card', 'feature-card'],
    demoMustNotInclude: ['Open-ear spatial', 'Lossless 24-bit'],
    expectedSlideCount: 10,
  },
  {
    name: 'Pitch Deck',
    templateId: 'html-ppt-pitch-deck',
    exampleRelativePath:
      '../../../../plugins/_official/examples/html-ppt-pitch-deck/example.html',
    motifMustInclude: ['tpl-pitch-deck', 'team-card'],
    demoMustNotInclude: [],
    expectedSlideCount: 10,
  },
  // 루프459 — unique-role Biennale / Cobalt Grid.
  {
    name: 'Biennale Yellow',
    templateId: 'html-ppt-zhangzara-biennale-yellow',
    exampleRelativePath:
      '../../../../plugins/_official/examples/html-ppt-zhangzara-biennale-yellow/example.html',
    motifMustInclude: ['--sun', 'sunglow', 's-programme'],
    demoMustNotInclude: [
      'Aurora Programme',
      'Pavilion of Quiet Form',
      'Reading Garden',
    ],
    expectedSlideCount: 8,
  },
  {
    name: 'Cobalt Grid',
    templateId: 'html-ppt-zhangzara-cobalt-grid',
    exampleRelativePath:
      '../../../../plugins/_official/examples/html-ppt-zhangzara-cobalt-grid/example.html',
    motifMustInclude: ['--ink-soft', 'pixel-glitch', 's-index'],
    demoMustNotInclude: [
      'Field Office Editorial',
      'Slow software',
      'Domestic interfaces',
      'Hand-set print',
    ],
    expectedSlideCount: 8,
  },
  // 루프467 — remaining Zhangzara families most exposed to clone-only finish.
  {
    name: 'Broadside',
    templateId: 'html-ppt-zhangzara-broadside',
    exampleRelativePath:
      '../../../../plugins/_official/examples/html-ppt-zhangzara-broadside/example.html',
    motifMustInclude: ['--c-accent', 'broadside', 'slide-foot'],
    demoMustNotInclude: [
      'Broadside Demo',
      'Author Name',
      'A DRAMATIC EDITORIAL DECK',
    ],
    expectedSlideCount: 10,
  },
  {
    name: '8 Bit Orbit',
    templateId: 'html-ppt-zhangzara-8-bit-orbit',
    exampleRelativePath:
      '../../../../plugins/_official/examples/html-ppt-zhangzara-8-bit-orbit/example.html',
    motifMustInclude: ['--neon-cyan', '--neon-yellow', 'pixel'],
    demoMustNotInclude: [
      'PLAYER 1',
      'INSERT COIN',
      'HIGH SCORE',
    ],
    expectedSlideCount: 10,
  },
  {
    name: 'Scatterbrain',
    templateId: 'html-ppt-zhangzara-scatterbrain',
    exampleRelativePath:
      '../../../../plugins/_official/examples/html-ppt-zhangzara-scatterbrain/example.html',
    motifMustInclude: ['post-it', 'bg-cork', '--yellow'],
    demoMustNotInclude: [
      'A post-it inspired template',
      'Key Metrics',
      'Visuals first',
    ],
    expectedSlideCount: 10,
  },
  // 루프467 — unique-role Sakura Chroma.
  {
    name: 'Sakura Chroma',
    templateId: 'html-ppt-zhangzara-sakura-chroma',
    exampleRelativePath:
      '../../../../plugins/_official/examples/html-ppt-zhangzara-sakura-chroma/example.html',
    motifMustInclude: ['--ink', 'petal', 's-catalogue'],
    demoMustNotInclude: [
      'Tape Garden',
      'SUPERCATALOG',
      'CATALOGUE NO. 7',
      'We make small analog',
      'SUPER TAPE',
      'MIX CHAIR',
      'Bloom Pedal',
      'Ren Kobayashi',
      'Mei Tanaka',
      'See you in volume eight',
    ],
    expectedSlideCount: 8,
  },
  // 루프469 — unique-role Long Table / Editorial Tri-Tone.
  {
    name: 'Long Table',
    templateId: 'html-ppt-zhangzara-long-table',
    exampleRelativePath:
      '../../../../plugins/_official/examples/html-ppt-zhangzara-long-table/example.html',
    motifMustInclude: ['--ink', 's-featured', 's-menu'],
    demoMustNotInclude: [
      'We started Long Table',
      'long-table.co',
      'Hana Brennan',
      'Roasted chestnut soup',
      'Not a meal, an evening',
      'Bairro Alto',
    ],
    expectedSlideCount: 8,
  },
  {
    name: 'Editorial Tri-Tone',
    templateId: 'html-ppt-zhangzara-editorial-tri-tone',
    exampleRelativePath:
      '../../../../plugins/_official/examples/html-ppt-zhangzara-editorial-tri-tone/example.html',
    motifMustInclude: ['--burgundy', '--butter', 's-closer'],
    demoMustNotInclude: [
      'Placeholder lede',
      'The Editorial Desk',
      'Lorem ipsum',
    ],
    expectedSlideCount: 8,
  },
  // 루프470 — remaining 10-shell official Zhangzara catalogue kits.
  {
    name: 'Bold Poster',
    templateId: 'html-ppt-zhangzara-bold-poster',
    exampleRelativePath:
      '../../../../plugins/_official/examples/html-ppt-zhangzara-bold-poster/example.html',
    motifMustInclude: ['--red', 'hero-title', 'slide-red'],
    demoMustNotInclude: ['Bold Poster Business Presentation'],
    expectedSlideCount: 10,
  },
  {
    name: 'Cartesian',
    templateId: 'html-ppt-zhangzara-cartesian',
    exampleRelativePath:
      '../../../../plugins/_official/examples/html-ppt-zhangzara-cartesian/example.html',
    motifMustInclude: ['--bg-primary', 'geo-decoration'],
    demoMustNotInclude: [
      'Cartesian Presentation Template',
      'Precision in approach defines the boundary',
    ],
    expectedSlideCount: 10,
  },
  {
    name: 'Coral',
    templateId: 'html-ppt-zhangzara-coral',
    exampleRelativePath:
      '../../../../plugins/_official/examples/html-ppt-zhangzara-coral/example.html',
    motifMustInclude: ['--coral', 'zigzag-layer', 'brand-mark'],
    demoMustNotInclude: ['Presentation Template'],
    expectedSlideCount: 10,
  },
  {
    name: 'Grove',
    templateId: 'html-ppt-zhangzara-grove',
    exampleRelativePath:
      '../../../../plugins/_official/examples/html-ppt-zhangzara-grove/example.html',
    motifMustInclude: ['--c-bg', 'grove-sidebar', 'slide-chrome'],
    demoMustNotInclude: [
      'Grove Presentation',
      'The landscape has shifted',
    ],
    expectedSlideCount: 10,
  },
  {
    name: 'Mat',
    templateId: 'html-ppt-zhangzara-mat',
    exampleRelativePath:
      '../../../../plugins/_official/examples/html-ppt-zhangzara-mat/example.html',
    motifMustInclude: ['--c-bg', 'info-card', 'cover-headline'],
    demoMustNotInclude: [
      'Mat Presentation',
      'Craft Matters',
      'Every surface is a decision',
    ],
    expectedSlideCount: 10,
  },
  {
    name: 'Monochrome',
    templateId: 'html-ppt-zhangzara-monochrome',
    exampleRelativePath:
      '../../../../plugins/_official/examples/html-ppt-zhangzara-monochrome/example.html',
    motifMustInclude: ['--c-bg-cream', 'slide-sidebar'],
    demoMustNotInclude: [
      'User Research Synthesis',
    ],
    expectedSlideCount: 10,
  },
  {
    name: 'Neo Grid Bold',
    templateId: 'html-ppt-zhangzara-neo-grid-bold',
    exampleRelativePath:
      '../../../../plugins/_official/examples/html-ppt-zhangzara-neo-grid-bold/example.html',
    motifMustInclude: ['--accent', 'blockmark', 's-toc'],
    demoMustNotInclude: [
      'The future of data-driven finance',
      'Market penetration doubled',
    ],
    expectedSlideCount: 10,
  },
  {
    name: 'Peoples Platform',
    templateId: 'html-ppt-zhangzara-peoples-platform',
    exampleRelativePath:
      '../../../../plugins/_official/examples/html-ppt-zhangzara-peoples-platform/example.html',
    motifMustInclude: ['--orange-deep', 's-cover', 's-toc'],
    demoMustNotInclude: [
      "WHAT'S INSIDE",
      'THREE PRIORITIES',
    ],
    expectedSlideCount: 10,
  },
  {
    name: 'Pin and Paper',
    templateId: 'html-ppt-zhangzara-pin-and-paper',
    exampleRelativePath:
      '../../../../plugins/_official/examples/html-ppt-zhangzara-pin-and-paper/example.html',
    motifMustInclude: ['pin-1', 'handwritten'],
    demoMustNotInclude: [
      'Kept things',
      'Three rules we\'re keeping',
    ],
    expectedSlideCount: 10,
  },
  {
    name: 'Pink Script',
    templateId: 'html-ppt-zhangzara-pink-script',
    exampleRelativePath:
      '../../../../plugins/_official/examples/html-ppt-zhangzara-pink-script/example.html',
    motifMustInclude: ['--pink-deep', 's-cover', 'title-wrap'],
    demoMustNotInclude: [
      'Pink Script',
      'Twelve weeks of after-hours',
    ],
    expectedSlideCount: 10,
  },
  {
    name: 'Playful',
    templateId: 'html-ppt-zhangzara-playful',
    exampleRelativePath:
      '../../../../plugins/_official/examples/html-ppt-zhangzara-playful/example.html',
    motifMustInclude: ['--accent', 'doodle-blob-1', 'toc-grid'],
    demoMustNotInclude: ['Presentation Template'],
    expectedSlideCount: 10,
  },
  {
    name: 'Raw Grid',
    templateId: 'html-ppt-zhangzara-raw-grid',
    exampleRelativePath:
      '../../../../plugins/_official/examples/html-ppt-zhangzara-raw-grid/example.html',
    motifMustInclude: ['--pink', 's1-headline', 't-display'],
    demoMustNotInclude: [
      'Neobrutalist Presentation Template',
    ],
    expectedSlideCount: 10,
  },
  {
    name: 'Retro Windows',
    templateId: 'html-ppt-zhangzara-retro-windows',
    exampleRelativePath:
      '../../../../plugins/_official/examples/html-ppt-zhangzara-retro-windows/example.html',
    motifMustInclude: ['--bg-gray', 'win-titlebar', 'pixel-font'],
    demoMustNotInclude: [
      'Retro Presentation Template',
      'THANK YOU FOR WATCHING',
    ],
    expectedSlideCount: 10,
  },
  {
    name: 'Retro Zine',
    templateId: 'html-ppt-zhangzara-retro-zine',
    exampleRelativePath:
      '../../../../plugins/_official/examples/html-ppt-zhangzara-retro-zine/example.html',
    motifMustInclude: ['grain-overlay', 'slide-hero', '--green'],
    demoMustNotInclude: ['Retro Zine Business Presentation'],
    expectedSlideCount: 10,
  },
  {
    name: 'Signal',
    templateId: 'html-ppt-zhangzara-signal',
    exampleRelativePath:
      '../../../../plugins/_official/examples/html-ppt-zhangzara-signal/example.html',
    motifMustInclude: ['--c-accent', 'slide--cover', 'slide-chrome'],
    demoMustNotInclude: [
      'Signal Template',
      'A concise statement that frames the main argument',
    ],
    expectedSlideCount: 10,
  },
  {
    name: 'Soft Editorial',
    templateId: 'html-ppt-zhangzara-soft-editorial',
    exampleRelativePath:
      '../../../../plugins/_official/examples/html-ppt-zhangzara-soft-editorial/example.html',
    motifMustInclude: ['--blush', 's-foreword', 's-cover'],
    demoMustNotInclude: [
      'Soft Editorial',
      'What we learned this',
    ],
    expectedSlideCount: 10,
  },
  {
    name: 'Stencil Tablet',
    templateId: 'html-ppt-zhangzara-stencil-tablet',
    exampleRelativePath:
      '../../../../plugins/_official/examples/html-ppt-zhangzara-stencil-tablet/example.html',
    motifMustInclude: ['--sienna', 's-cover', 's-princ'],
    demoMustNotInclude: [
      'Stencil & Tablet',
      'Stencil &amp; Tablet',
      'Bold by design',
    ],
    expectedSlideCount: 10,
  },
  {
    name: 'Vellum',
    templateId: 'html-ppt-zhangzara-vellum',
    exampleRelativePath:
      '../../../../plugins/_official/examples/html-ppt-zhangzara-vellum/example.html',
    motifMustInclude: ['--c-fg', 'pin-annotation', 'slide--cover'],
    demoMustNotInclude: [
      'Vellum Presentation',
      'On Restraint',
      'Most design problems are removed',
    ],
    expectedSlideCount: 10,
  },
];
