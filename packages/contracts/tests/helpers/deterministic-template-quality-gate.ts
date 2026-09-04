/**
 * 루프450 — Shared deterministic quality gate for Zhangzara templates.
 *
 * 4 axes checked per template:
 *   1) Motif — template CSS tokens / class names must remain in the cloned deck
 *   2) Leftover — `looksLikeLeftoverTemplateDemoDeck === false` + template-specific
 *      demo phrase / number denylist
 *   3) Canvas — fixed 1920×1080 style is present (width:1920px + min-height 1080)
 *   4) Slide count — `listTemplateCloneSlideShells(cloned).length === expected`
 *      + brief-derived topic (`팀버` / `Teamver`)
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
  const shellCount = listTemplateCloneSlideShells(cloned).length;
  expect(shellCount, `${tag} slide count`).toBe(spec.expectedSlideCount);
  expect(cloned, `${tag} 팀버/Teamver topic`).toMatch(/팀버|Teamver/i);
}

/**
 * Canonical 4-template spec table used by the contracts gate and (with
 * `expectedSlideCount` only) the daemon smoke.
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
    motifMustInclude: ['--cream', 'Archivo'],
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
];
