import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  TEMPLATE_CLONE_CONTENT_FILL_MARKER,
  TEMPLATE_CLONE_CONTENT_FILL_TURN_MARKER,
  TEMPLATE_CLONE_PROMPT_FILL_MARKER,
  TEMPLATE_CLONE_SLOT_FILL_REPAIR_MARKER,
  buildTemplateCloneContentFillSeed,
  buildTemplateClonePromptFillSeed,
  buildTemplateCloneRichOfficialLookFillSeed,
  buildTemplateCloneFillSeedForCurrentMode,
  isRichOfficialLookTemplateCloneFill,
  templateCloneContentFillHardRules,
  buildTemplateCloneSlotFillRepairPrompt,
  buildWebsiteServiceIntroOutlineInstruction,
  cloneFillJsonRepairAlreadyAttempted,
  compactTemplateCloneFillSourceBrief,
  deriveTemplateCloneTopicLabel,
  extractWebsiteAnalysisAnchorsFromBrief,
  ensureTemplateCloneContentFillContinuePrompt,
  extractTemplateCloneUserFacingRequest,
  getTemplateCloneFillMode,
  getTemplateCloneFillModeResolution,
  resolveEffectiveTemplateCloneFillMode,
  inferTemplateCloneFillHasSource,
  templateCloneBriefRequiresSourceGrounding,
  briefLooksLikeEntityIntroPresentation,
  isGenericTemplateCloneTopicBrief,
  shouldExplainGenericBriefOnLookSeedFallback,
  historyHasTemplateCloneContentFill,
  historyHasTemplateCloneSlotFillRepair,
  isTemplateCloneContentFillPrompt,
  isTemplateClonePromptFillPrompt,
  isTemplateCloneSlotFillRepairPrompt,
  templateCloneAutoContinueFlags,
  templateCloneFillModeFromUserMessage,
  looksLikeInstructionNotSlideCopy,
  normalizeTemplateCloneFillMode,
  normalizeTemplateCloneFillSlideCountHint,
  queueTemplateCloneContentFill,
  queueTemplateClonePromptFill,
  resolveTemplateCloneAutoSendSeed,
  sanitizeCreateAutoSendSeed,
  shouldSkipTemplateCloneSeed,
  shouldUseDeterministicTemplateCloneFill,
  shouldSkipCreateAutoSendForDeterministicClone,
  shouldUseJsonTemplateCloneFill,
  shouldUsePromptTemplateCloneFill,
  shouldQueueAiTemplateCloneFill,
  shouldQueueCloneSlotFillJsonRepair,
  deterministicCloneFilledMetadataFields,
  templateCloneFillSlideCountOverrideNotice,
  withTemplateCloneFillPluginInputs,
  withoutCanonicalDeckAttachments,
} from '../../src/teamver/templateCloneContentFill';
import { cloneResultSuppressesAiFill } from '../../src/teamver/seedTemplateClonedDeck';
import { persistableUserMessageContent } from '../../src/comments';
import { promptWithTemplateCloneContentFillInstruction } from '../../src/components/ProjectView';

beforeEach(() => {
  delete process.env.VITE_TEAMVER_TEMPLATE_CLONE_FILL_MODE;
  delete process.env.VITE_TEAMVER_EMBED;
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('od:template-clone-fill-mode');
    }
  } catch {
    /* ignore */
  }
});

afterEach(() => {
  delete process.env.VITE_TEAMVER_TEMPLATE_CLONE_FILL_MODE;
  delete process.env.VITE_TEAMVER_EMBED;
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('od:template-clone-fill-mode');
    }
  } catch {
    /* ignore */
  }
});

describe('templateCloneContentFill', () => {
  it('1007-N01 슬라이스 C — defaults to official-rich (model-authored full HTML)', () => {
    // 기본값 전환(2026-10-08): 미설정/빈값/미지원 토큰 → official-rich.
    expect(normalizeTemplateCloneFillMode(undefined)).toBe('official-rich');
    expect(normalizeTemplateCloneFillMode('')).toBe('official-rich');
    expect(normalizeTemplateCloneFillMode('nonsense')).toBe('official-rich');
    expect(getTemplateCloneFillMode()).toBe('official-rich');
    expect(shouldSkipTemplateCloneSeed()).toBe(false);
    // 리치는 json slot-fill 이 아니라 prompt-fill 변종 → fill 턴은 큐잉된다.
    expect(shouldUseJsonTemplateCloneFill()).toBe(false);
    expect(shouldQueueAiTemplateCloneFill()).toBe(true);
    expect(shouldUsePromptTemplateCloneFill()).toBe(false);
    expect(shouldUseDeterministicTemplateCloneFill()).toBe(false);

    // Existing env tokens stay on HTML rewrite — remapping them to JSON
    // caused MiniMax AGENT_EXECUTION_FAILED (loop414).
    expect(normalizeTemplateCloneFillMode('prompt')).toBe('prompt');
    expect(normalizeTemplateCloneFillMode('clone')).toBe('prompt');
    expect(normalizeTemplateCloneFillMode('clone-fill')).toBe('prompt');
    expect(normalizeTemplateCloneFillMode('prompt-fill')).toBe('prompt');
    expect(normalizeTemplateCloneFillMode('html')).toBe('prompt');
    expect(normalizeTemplateCloneFillMode('html-fill')).toBe('prompt');
    expect(normalizeTemplateCloneFillMode('legacy-html')).toBe('prompt');

    expect(normalizeTemplateCloneFillMode('slot-fill')).toBe('json');
    expect(normalizeTemplateCloneFillMode('json-fill')).toBe('json');
    expect(normalizeTemplateCloneFillMode('json')).toBe('json');

    process.env.VITE_TEAMVER_TEMPLATE_CLONE_FILL_MODE = 'prompt';
    expect(getTemplateCloneFillMode()).toBe('prompt');
    expect(shouldSkipTemplateCloneSeed()).toBe(false);
    expect(shouldUseJsonTemplateCloneFill()).toBe(false);
    expect(shouldUsePromptTemplateCloneFill()).toBe(true);
    expect(shouldQueueAiTemplateCloneFill()).toBe(true);

    process.env.VITE_TEAMVER_TEMPLATE_CLONE_FILL_MODE = 'prompt-fill';
    expect(getTemplateCloneFillMode()).toBe('prompt');
    expect(shouldUsePromptTemplateCloneFill()).toBe(true);
    expect(shouldUseJsonTemplateCloneFill()).toBe(false);

    process.env.VITE_TEAMVER_TEMPLATE_CLONE_FILL_MODE = 'deterministic';
    expect(getTemplateCloneFillMode()).toBe('deterministic');
    expect(shouldUseDeterministicTemplateCloneFill()).toBe(true);
    expect(shouldUseJsonTemplateCloneFill()).toBe(false);
    expect(shouldQueueAiTemplateCloneFill()).toBe(false);
    expect(normalizeTemplateCloneFillMode('content-fill')).toBe('deterministic');
    expect(normalizeTemplateCloneFillMode('server')).toBe('deterministic');
  });

  it('accepts the loop401 `pure-prompt` rollback mode via env and multiple aliases', () => {
    expect(getTemplateCloneFillMode()).toBe('official-rich');
    expect(shouldSkipTemplateCloneSeed()).toBe(false);
    expect(normalizeTemplateCloneFillMode('pure-prompt')).toBe('pure-prompt');
    expect(normalizeTemplateCloneFillMode('no-seed')).toBe('pure-prompt');
    expect(normalizeTemplateCloneFillMode('skip-seed')).toBe('pure-prompt');
    expect(normalizeTemplateCloneFillMode('no-clone')).toBe('pure-prompt');
    expect(normalizeTemplateCloneFillMode('pre-clone')).toBe('pure-prompt');
    expect(normalizeTemplateCloneFillMode('legacy-prompt')).toBe('pure-prompt');

    process.env.VITE_TEAMVER_TEMPLATE_CLONE_FILL_MODE = 'pure-prompt';
    expect(getTemplateCloneFillMode()).toBe('pure-prompt');
    expect(shouldSkipTemplateCloneSeed()).toBe(true);
    expect(shouldUseJsonTemplateCloneFill()).toBe(false);
    expect(shouldUseDeterministicTemplateCloneFill()).toBe(false);
    // 루프422/463 — picked template LOOK-seeds, then MiniMax prompt-fill (not server-only).
    expect(shouldSkipTemplateCloneSeed(true)).toBe(false);
    expect(shouldUseDeterministicTemplateCloneFill(true)).toBe(false);
    expect(shouldQueueAiTemplateCloneFill(true)).toBe(true);

    expect(normalizeTemplateCloneFillMode('  Pure-Prompt  ')).toBe('pure-prompt');
    expect(normalizeTemplateCloneFillMode('NO-CLONE')).toBe('pure-prompt');
  });

  it('loop420/535 — Teamver embed ignores leftover localStorage fill mode', () => {
    const store = new Map<string, string>();
    store.set('od:template-clone-fill-mode', 'pure-prompt');
    const prev = globalThis.window;
    (globalThis as { window?: unknown }).window = {
      location: { hostname: 'localhost' },
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
      },
    };
    try {
      process.env.VITE_TEAMVER_EMBED = '1';
      // 임베드는 leftover localStorage(pure-prompt)를 무시하고 기본값으로 떨어진다.
      // 1007-N01 슬라이스 C 이후 기본값 = official-rich.
      expect(getTemplateCloneFillMode()).toBe('official-rich');
      expect(shouldSkipTemplateCloneSeed()).toBe(false);
      expect(shouldUseDeterministicTemplateCloneFill()).toBe(false);
      expect(shouldUseJsonTemplateCloneFill()).toBe(false);
      expect(shouldQueueAiTemplateCloneFill()).toBe(true);

      process.env.VITE_TEAMVER_EMBED = '0';
      expect(getTemplateCloneFillMode()).toBe('pure-prompt');
      expect(shouldSkipTemplateCloneSeed()).toBe(true);
    } finally {
      if (prev) (globalThis as { window?: unknown }).window = prev;
      else delete (globalThis as { window?: unknown }).window;
    }
  });

  it('loop414 — an explicit `=prompt` env stays on HTML rewrite, not JSON slot-fill', () => {
    process.env.VITE_TEAMVER_TEMPLATE_CLONE_FILL_MODE = 'prompt';
    expect(getTemplateCloneFillMode()).toBe('prompt');
    expect(shouldSkipTemplateCloneSeed()).toBe(false);
    expect(shouldUseJsonTemplateCloneFill()).toBe(false);
    expect(shouldUsePromptTemplateCloneFill()).toBe(true);
    expect(shouldUseDeterministicTemplateCloneFill()).toBe(false);
    expect(shouldQueueAiTemplateCloneFill()).toBe(true);
  });

  it('loop422/463 — picked template never skips LOOK seed; AI fill still queues', () => {
    process.env.VITE_TEAMVER_TEMPLATE_CLONE_FILL_MODE = 'pure-prompt';
    expect(shouldSkipTemplateCloneSeed(false)).toBe(true);
    expect(shouldSkipTemplateCloneSeed(true)).toBe(false);
    expect(shouldUseDeterministicTemplateCloneFill(true)).toBe(false);
    expect(shouldQueueAiTemplateCloneFill(true)).toBe(true);
    process.env.VITE_TEAMVER_TEMPLATE_CLONE_FILL_MODE = 'prompt';

    expect(shouldSkipTemplateCloneSeed(true)).toBe(false);
    expect(shouldUseDeterministicTemplateCloneFill(true)).toBe(false);
    expect(shouldQueueAiTemplateCloneFill(true)).toBe(true);
  });

  it('loop410/413/414 — App still gates clone seed with shouldSkipTemplateCloneSeed (kit id retained)', () => {
    // The gate must remain so no-template pure-prompt can skip LOOK seed
    // while a picked template still threads selectedDeckTemplateId + clone.
    const app = readFileSync(
      new URL('../../src/App.tsx', import.meta.url),
      'utf8',
    );
    expect(app).toContain('shouldSkipTemplateCloneSeed(hasExplicit');
    expect((app.match(/shouldSkipTemplateCloneSeed\(/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(app).toContain('selectedDeckTemplateId');
    expect(app).toContain('fillTemplateClonedDeckDeterministically');
    expect(app).toContain('usedDeterministicCloneFill');
    expect(app).toContain('sanitizeCreateAutoSendSeed');
    expect(app).toMatch(/루프422|shouldSkipTemplateCloneSeed/);
    const stagingEnv = readFileSync(
      new URL('../../../../deploy/teamver/.env.staging.example', import.meta.url),
      'utf8',
    );
    // 1007-N01 슬라이스 C — staging 기본값을 official-rich 로 정직하게 전환.
    // (게이트 숨김이 아니라 의도된 기본값 변경 반영. json/env 롤백은 유지.)
    expect(stagingEnv).toMatch(/^VITE_TEAMVER_TEMPLATE_CLONE_FILL_MODE=official-rich$/m);
    expect(stagingEnv).not.toMatch(/VITE_TEAMVER_TEMPLATE_CLONE_FILL_MODE=pure-prompt/);
    const composer = readFileSync(
      new URL('../../src/components/ChatComposer.tsx', import.meta.url),
      'utf8',
    );
    expect(composer).toContain('seeded.contentFilled === true');
    expect(composer).toContain('buildTemplateCloneContentFillSeed');
    const projectView = readFileSync(
      new URL('../../src/components/ProjectView.tsx', import.meta.url),
      'utf8',
    );
    expect(projectView).toContain('shouldSkipCreateAutoSendForDeterministicClone');
    expect(projectView).toContain('isTemplateCloneHostFillQueued');
    expect(projectView).toContain('queueTemplateClonePromptFill');
    expect(app).toContain('cloneResultSuppressesAiFill');
    expect(app).toContain('queueTemplateCloneContentFill');
    expect(app).toContain('deterministicCloneFilledMetadataFields');
    expect(composer).toContain('deterministicCloneFilledMetadataFields');
    expect(projectView).toContain('shouldExplainGenericBriefOnLookSeedFallback');
    expect(projectView).toContain('observeTemplateCloneLookSeedFallback');
    expect(projectView).toContain("source: 'persist'");
    expect(projectView).toContain('shouldRunDeterministicSparseCheck');
    expect(projectView).toContain('mode: "sparse-only"');
    expect(projectView).toContain('phase: "deterministic-fill"');
    expect(projectView).toMatch(/!sparseOnly\s*&&\s*shouldQueueThinPriorFullRewrite/);
    expect(projectView).toMatch(/wantsCountTopUp = sparseOnly\s*\n\s*\? false/);
    const daemonRoutes = readFileSync(
      new URL('../../../daemon/src/project-routes.ts', import.meta.url),
      'utf8',
    );
    expect(daemonRoutes).toContain('templateCloneSparseCheckPending: true');
  });

  it('loop535 — deterministic filled metadata asks for one sparse/observe pass', () => {
    expect(deterministicCloneFilledMetadataFields()).toEqual({
      templateCloneContentFilled: true,
      templateCloneContentFillPending: false,
      templateCloneFillMode: 'deterministic',
      templateCloneSparseCheckPending: true,
    });
  });

  it('loop421 — recovered LOOK/filled decks suppress MiniMax overwrite', () => {
    expect(cloneResultSuppressesAiFill({
      ok: true,
      fileName: 'deck.html',
      slideCount: 10,
      templateId: 'html-ppt-zhangzara-capsule',
      contentFilled: true,
    })).toBe(true);
    expect(cloneResultSuppressesAiFill({
      ok: true,
      fileName: 'deck.html',
      slideCount: 1,
      templateId: 'html-ppt-zhangzara-capsule',
      recoveredExisting: true,
      preservedFilled: true,
      contentFilled: true,
    })).toBe(true);
    expect(cloneResultSuppressesAiFill({
      ok: true,
      fileName: 'deck.html',
      slideCount: 1,
      templateId: 'html-ppt-zhangzara-capsule',
      recoveredExisting: true,
    })).toBe(false);
    expect(cloneResultSuppressesAiFill({
      ok: true,
      fileName: 'deck.html',
      slideCount: 1,
      templateId: 'html-ppt-zhangzara-capsule',
      recoveredExisting: true,
      needsAiContentFill: true,
    })).toBe(false);
    expect(cloneResultSuppressesAiFill({
      ok: true,
      fileName: 'deck.html',
      slideCount: 1,
      templateId: 'html-ppt-zhangzara-capsule',
    })).toBe(false);
    expect(cloneResultSuppressesAiFill({
      ok: false,
      reason: 'fetch_failed',
      message: 'timeout',
    })).toBe(false);

    const recoverSource = readFileSync(
      new URL('../../src/teamver/seedTemplateClonedDeck.ts', import.meta.url),
      'utf8',
    );
    expect(recoverSource).toContain('templateCloneContentFilled === true');
    expect(recoverSource).toContain('resolveTemplateCloneLookSeedHtml');
    expect(recoverSource).toContain('pickPromptFillLookSeedHtml');
    expect(recoverSource).toContain('contentFilled: true');
    expect(recoverSource).not.toMatch(
      /if \(json\?\.metadata\?\.templateCloneContentFilled === true\) return null/,
    );
  });

  it('loop421 — filled decks and leftover MiniMax fill seeds skip Home auto-send', () => {
    process.env.VITE_TEAMVER_TEMPLATE_CLONE_FILL_MODE = 'deterministic';
    expect(shouldUseDeterministicTemplateCloneFill()).toBe(true);
    expect(
      shouldSkipCreateAutoSendForDeterministicClone({
        metadata: { kind: 'deck' },
        seed: 'www.teamver.com 사이트 분석해서 서비스 소개 슬라이드 만들어줘.',
        fillQueued: false,
      }),
    ).toBe(false);
    expect(
      shouldSkipCreateAutoSendForDeterministicClone({
        metadata: { templateCloneContentFilled: true },
        seed: 'www.teamver.com 사이트 분석해서 서비스 소개 슬라이드 만들어줘.',
        fillQueued: false,
      }),
    ).toBe(true);
    expect(
      shouldSkipCreateAutoSendForDeterministicClone({
        metadata: { kind: 'deck' },
        seed: `${TEMPLATE_CLONE_CONTENT_FILL_MARKER}\nJSON only`,
        fillQueued: true,
      }),
    ).toBe(true);
    expect(
      shouldSkipCreateAutoSendForDeterministicClone({
        metadata: { templateCloneContentFillPending: true },
        seed: `${TEMPLATE_CLONE_CONTENT_FILL_MARKER}\nJSON only`,
        fillQueued: true,
      }),
    ).toBe(false);
  });

  it('does not treat Canvas boilerplate as the visible request', () => {
    const visible = extractTemplateCloneUserFacingRequest({
      pendingPrompt: [
        '첨부한 자료를 바탕으로 슬라이드 덱을 만들어줘.',
        '',
        '[User instruction]',
        'expo에 대해서 설명하는 피피티 만들어줘. 시니어 개발자 레벨.',
      ].join('\n'),
    });
    expect(visible).toMatch(/expo/i);
    expect(visible).not.toMatch(/첨부한 자료를 바탕으로/);
  });

  it('build seed keeps visible topic and fill marker for the model', () => {
    const seed = buildTemplateCloneContentFillSeed({
      userInstruction: 'expo에 대해서 설명하는 피피티 만들어줘. 시니어 개발자 레벨.',
      templateTitle: 'Html Ppt Zhangzara Daisy Days',
      sourceBrief: 'Canvas title: Expo\nVisible headings: Intro / API / Next',
    });
    expect(seed).toContain('[Template clone content fill]');
    expect(seed).toMatch(/expo/i);
    expect(seed).toContain('Selected template: Html Ppt Zhangzara Daisy Days');
    expect(seed).toMatch(/attached source materials/i);
    expect(seed).toMatch(/Quality bar: each non-divider slide/i);
    expect(seed).toMatch(/headline, takeaway/i);
    expect(seed).toMatch(/JSON slot-fill|JSON outline only/i);
    expect(seed).toMatch(/do NOT regenerate deck HTML|Forbidden output/i);
    expect(seed).toContain('Never emit `<artifact type="deck-patch">` — this is a JSON slot-fill turn (no artifact).');
    expect(templateCloneContentFillHardRules().some((line) => (
      line.includes('Never emit `<artifact type="deck-patch">`')
    ))).toBe(true);
    expect(seed).toMatch(/roleHint/i);
    expect(seed).toMatch(/Layout variety is mandatory/i);
    expect(seed).toMatch(/at least 3 distinct body `roleHint` values/i);
    expect(seed).toMatch(/Copy density must fill the chosen layout/i);
    expect(seed).toMatch(/Brand spelling: keep Latin product\/brand spellings/i);
    expect(seed).toMatch(/25–60 Korean-character/i);
    expect(seed).toMatch(/items\[\] with 3–4 \{title, body\}/);
    expect(seed).not.toMatch(/items\[\] with 2–4 \{title, body\}/);
    expect(seed).toMatch(/Slide count THIS TURN/i);
    expect(seed).toMatch(/default 6-slide outline/i);
    expect(seed).toMatch(/empty pillar\/column-number|Card count = content count/i);
    expect(seed).toMatch(/Begin with `\{`/);
    expect(seed).toMatch(/no status sentence/i);
    expect(seed).not.toMatch(/Strict body-first contract/i);
    expect(seed).not.toMatch(/emit a full.*rewrites visible text/i);
    expect(seed).not.toMatch(/Prefer `<artifact type="deck-patch" identifier="deck">`/);
    expect(seed).toContain('Cover topic (use as the title — not the instruction): expo');
    expect(seed).toMatch(/brief is a topic, not slide text/i);
    expect(seed).toMatch(/The visible request above is a BRIEF\/TOPIC/);
    expect(seed).not.toMatch(/Worked example — brief/i);
    expect(seed).not.toMatch(/Expo for Senior Engineers/);
    expect(seed).toMatch(/Do NOT paste the request onto the cover/);
    expect(looksLikeInstructionNotSlideCopy('첨부한 자료를 바탕으로 슬라이드 덱을 만들어줘.')).toBe(true);
    expect(deriveTemplateCloneTopicLabel(
      'expo에 대해서 설명하는 피피티 만들어줘. 시니어 개발자 레벨.',
    )).toBe('expo');
  });

  it('builds prompt-fill rollback seed without JSON slot-fill markers', () => {
    const seed = buildTemplateClonePromptFillSeed({
      userInstruction: 'expo에 대해서 설명하는 피피티 만들어줘. 시니어 개발자 레벨.',
      templateTitle: 'Html Ppt Zhangzara Daisy Days',
      sourceBrief: 'Canvas title: Expo\nVisible headings: Intro / API / Next',
      slideCountHint: '5-6',
    });

    expect(seed).toContain(TEMPLATE_CLONE_PROMPT_FILL_MARKER);
    expect(isTemplateClonePromptFillPrompt(seed)).toBe(true);
    expect(seed).toMatch(/complete final deck artifact/i);
    expect(seed).toMatch(/Do not emit JSON outline/i);
    expect(seed).toContain('Never emit `<artifact type="deck-patch">` on this create turn');
    expect(seed).toMatch(/Layout variety is REQUIRED/i);
    expect(seed).toMatch(/Copy density mirrors the template preview/i);
    expect(seed).toMatch(/1920x1080/);
    expect(seed).toContain('Selected template: Html Ppt Zhangzara Daisy Days');
    expect(seed).toContain('Cover topic (use as the title, not the instruction): expo');
    expect(seed).toMatch(/www\.example\.com 사이/);
    expect(seed).not.toMatch(/팀버 소개|www\.teamver\.com 사이/);
    expect(seed).not.toMatch(/Quality bar:\s*Quality bar:/);
    expect(seed).not.toMatch(/Worked example — brief/i);
    expect(seed).not.toMatch(/Expo for Senior Engineers/);
    expect(seed).not.toMatch(/Content expansion contract/i);
    expect(seed).not.toContain(TEMPLATE_CLONE_CONTENT_FILL_MARKER);
    expect(seed).not.toContain(TEMPLATE_CLONE_CONTENT_FILL_TURN_MARKER);
    expect(seed).not.toContain(TEMPLATE_CLONE_SLOT_FILL_REPAIR_MARKER);
    expect(isTemplateCloneContentFillPrompt(seed)).toBe(false);
  });

  it('keeps a teamver.com prompt-fill seed free of Expo worked-example leakage', () => {
    const seed = buildTemplateClonePromptFillSeed({
      userInstruction: 'www.teamver.com 사이트 분석해서 서비스 소개 슬라이드 만들어줘.',
      templateTitle: 'Html Ppt Zhangzara 블록 프레임',
      slideCountHint: '8-10',
    });
    expect(seed).toContain('www.teamver.com');
    expect(seed).toContain('[Template clone prompt fill]');
    expect(seed).toContain('Selected template: Html Ppt Zhangzara 블록 프레임');
    expect(seed).toMatch(/\.nb-card/);
    expect(seed).toMatch(/title AND body text INSIDE/i);
    expect(seed).toContain('User requested slide count: 8-10.');
    expect(seed).toContain('Emit 8-10 complete slides in THIS artifact');
    expect(seed).toContain('hard cap 10');
    expect(seed).toContain('exceeding it is a failed overshoot');
    expect(seed).toContain('A 6-slide artifact is incomplete for this request');
    expect(seed).toContain('Never claim 9 slides while emitting only a cover');
    expect(seed).toContain('Do not invent quantitative KPIs');
    expect(seed).toContain('complete card (number + label');
    expect(seed).toContain('Do not emit IB magazine chrome');
    expect(seed).toContain('never a raw URL or truncated host crumb');
    expect(seed).toContain('real service-introduction deck');
    expect(seed).toContain('Website/product analysis outline (REQUIRED');
    expect(seed).toContain('Problem/context');
    expect(seed).toContain('Product promise');
    expect(seed).toContain('Core workflow');
    expect(seed).toContain('Key features');
    expect(seed).toContain('FORBIDDEN shallow-only decks');
    expect(seed).toContain('[Source brief]');
    expect(seed).toContain('close badges, section labels, header pills');
    expect(seed).toContain('Never nest the whole slide grid inside');
    expect(seed).not.toMatch(/Worked example — brief/i);
    expect(seed).not.toMatch(/Expo for Senior Engineers|expo-modules-core|EAS Build|EXPO_PUBLIC_/i);
    expect(seed).not.toMatch(/Content expansion contract/i);
    expect(seed).not.toMatch(/Quality bar:\s*Quality bar:/);
    expect(persistableUserMessageContent(seed)).toBe(
      'www.teamver.com 사이트 분석해서 서비스 소개 슬라이드 만들어줘.',
    );
  });

  it('루프546 / 1007-N01 — prompt-fill keeps slide count and wires short unique-slot', () => {
    const seed = buildTemplateClonePromptFillSeed({
      userInstruction: '글을 매력적으로 쓰는 팁 정리해줘',
      templateTitle: 'Html Ppt Zhangzara 8-Bit Orbit',
      slideCountHint: '6-8',
    });
    // Penalty framing stays out. Unique-slot is the one-sentence fill line,
    // sitting next to the keep-count instruction.
    expect(seed).toMatch(/Each slot takes a distinct angle/);
    expect(seed).toMatch(/do not repeat the slide title as its body/i);
    expect(seed).toMatch(/do not stamp the same lead across slots/i);
    expect(seed).toMatch(/Each slide kicker is a distinct 2–4 word label/);
    expect(seed).toMatch(/example OVERVIEW/);
    expect(seed).toMatch(/Topic-lock \(brief-tethered content\)/);
    expect(seed).toContain('개념 / 구조 / 영향');
    expect(seed).toMatch(/3-4 concrete cards\/bullets\/paragraphs/);
    expect(seed).not.toMatch(/2-4 concrete cards\/bullets\/paragraphs/);
    expect(seed).toMatch(/♪ ♫ 🎵 ♩ ◈ ◐ ✦ ✧/);
    expect(seed).not.toMatch(/failed deliverable/i);
    expect(seed).not.toMatch(/majority of body slides share the same body sentence/i);
    expect(seed).toMatch(/Deliver the same number of `<section class="slide">` slides as the seed/);
    expect(seed).toMatch(/do not merge or drop slides/);
    const keepAt = seed.indexOf('Deliver the same number of');
    const uniqueAt = seed.indexOf('Each slot takes a distinct angle');
    expect(uniqueAt).toBeGreaterThan(keepAt);
    expect(uniqueAt - keepAt).toBeLessThan(400);
    // KPI ban stays the existing prompt-fill line, not a second topic-lock sentence.
    expect(seed.match(/Do not invent quantitative KPIs/g)).toHaveLength(1);
    expect(seed).toContain('headcount, NPS');
    expect(seed).not.toContain('prices ($XB, ₩억, %)');
    expect(seed).toMatch(/Do not emit JSON outline/i);
    // 기존 pin 유지 — CONTENT_EXPANSION은 prompt-fill seed에 노출되지 않음.
    expect(seed).not.toMatch(/Content expansion contract/i);
  });

  it('루프546 / 1007-N01 — JSON slot-fill wires unique-slot and full topic-lock', () => {
    const rules = templateCloneContentFillHardRules();
    const joined = rules.join('\n');
    expect(joined).toMatch(/Each slot takes a distinct angle/);
    expect(joined).toMatch(/do not repeat the slide title as its body/i);
    expect(joined).toMatch(/do not stamp the same lead across slots/i);
    expect(joined).toMatch(/Each slide kicker is a distinct 2–4 word label/);
    expect(joined).toMatch(/Topic-lock \(brief-tethered content\)/);
    expect(joined).toContain('개념 / 구조 / 영향');
    expect(joined).toContain('Do not invent quantitative KPIs, prices ($XB, ₩억, %)');
    expect(joined.match(/Do not invent quantitative KPIs/g)).toHaveLength(1);
    expect(joined).toMatch(/items\[\] with 3–4 \{title, body\}/);
    expect(joined).not.toMatch(/items\[\] with 2–4 \{title, body\}/);
    expect(joined).toMatch(/♪ ♫ 🎵 ♩ ◈ ◐ ✦ ✧/);
    expect(joined).toMatch(/Return one slides\[\] entry for every slide layout in the seed/);
    expect(joined).toMatch(/do not merge or drop entries/);
    const keepAt = joined.indexOf('Return one slides[] entry');
    const uniqueAt = joined.indexOf('Each slot takes a distinct angle');
    expect(uniqueAt).toBeGreaterThan(keepAt);
    expect(uniqueAt - keepAt).toBeLessThan(500);
    // JSON slot-fill은 원래대로 CONTENT_EXPANSION도 유지.
    expect(joined).toMatch(/Content expansion contract/i);
    // unique/topic penalty framing 제거. `Content expansion contract` still
    // contains its long-standing "Failed deliverables" section for JSON mode.
    expect(joined).not.toMatch(/majority of body slides share the same body sentence/i);
  });

  it('1007-N01 — EXACTLY N stays next to the short quality lines', () => {
    const seed = buildTemplateClonePromptFillSeed({
      userInstruction: '글을 매력적으로 쓰는 팁 정리해줘',
      seedShellCount: 10,
    });
    expect(seed).toContain('Seed contains 10 slides. Return EXACTLY 10 <section class="slide"> elements.');
    const headerAt = seed.indexOf('Seed contains 10 slides');
    const uniqueAt = seed.indexOf('Each slot takes a distinct angle');
    expect(uniqueAt).toBeGreaterThan(headerAt);
    expect(uniqueAt - headerAt).toBeLessThan(220);
    expect(seed.match(/Return EXACTLY 10/g)).toHaveLength(1);

    const rules = templateCloneContentFillHardRules({ seedShellCount: 10 }).join('\n');
    expect(rules).toContain('Return EXACTLY 10');
    const ruleCount = rules.indexOf('Return EXACTLY 10');
    const ruleUnique = rules.indexOf('Each slot takes a distinct angle');
    expect(ruleUnique).toBeGreaterThan(ruleCount);
    expect(ruleUnique - ruleCount).toBeLessThan(220);
  });

  it('루프546 — HTML prompt-fill과 JSON slot-fill에 각 출력 형식의 장수 계약을 emit', () => {
    // penalty framing과 상충 표현이 한 상수 안에 공존하지 않도록 v1.4.15 회귀
    // 원복 슬라이스에서 분리됨.
    const seed = buildTemplateClonePromptFillSeed({
      userInstruction: '글을 매력적으로 쓰는 팁 정리해줘',
      templateTitle: 'Html Ppt Zhangzara Block Frame',
      slideCountHint: '10',
    });
    expect(seed).toMatch(/Deliver the same number of `<section class="slide">` slides as the seed/);
    expect(seed).toMatch(/do not merge or drop slides/);

    const rules = templateCloneContentFillHardRules().join('\n');
    expect(rules).toMatch(/Return one slides\[\] entry for every slide layout in the seed/);
    expect(rules).toMatch(/do not merge or drop entries/);
    expect(rules).not.toMatch(/Deliver the same number of `<section class="slide">` slides as the seed/);
  });

  it('binds website-analysis outline anchors from headings/preview in the brief', () => {
    const brief = [
      'User instruction:',
      'www.teamver.com 사이트 분석해서 서비스 소개 슬라이드 만들어줘.',
      'Visible headings: Workspace / Canvas / Drive sync / 권한',
      'Source preview:',
      '- AI로 슬라이드와 문서를 한 워크스페이스에서',
      '- Canvas와 Drive를 연결해 초안부터 공유까지',
    ].join('\n');
    const anchors = extractWebsiteAnalysisAnchorsFromBrief(brief);
    expect(anchors.urls.some((url) => /teamver\.com/i.test(url))).toBe(true);
    expect(anchors.headings).toEqual(
      expect.arrayContaining(['Workspace', 'Canvas', 'Drive sync', '권한']),
    );
    expect(anchors.previewLines[0]).toMatch(/워크스페이스/);

    const outline = buildWebsiteServiceIntroOutlineInstruction(brief);
    expect(outline).toContain('Website/product analysis outline (REQUIRED');
    expect(outline).toContain('headings=Workspace / Canvas / Drive sync / 권한');
    expect(outline).toMatch(/preview=.*워크스페이스/);
    expect(outline).toContain('FORBIDDEN shallow-only decks');

    const seed = buildTemplateClonePromptFillSeed({
      userInstruction: 'www.teamver.com 사이트 분석해서 서비스 소개 슬라이드 만들어줘.',
      sourceBrief: brief,
      templateTitle: 'Html Ppt Zhangzara 블록 프레임',
      slideCountHint: '8-10',
    });
    expect(seed).toContain('Source anchors (bind these');
    expect(seed).toContain('Workspace / Canvas / Drive sync / 권한');
    expect(seed).toContain('Do not invent quantitative KPIs');

    const jsonSeed = buildTemplateCloneContentFillSeed({
      userInstruction: 'www.teamver.com 사이트 분석해서 서비스 소개 슬라이드 만들어줘.',
      sourceBrief: brief,
      slideCountHint: '8-10',
    });
    expect(jsonSeed).toContain('Website/product analysis outline (REQUIRED');
    expect(jsonSeed).toContain('Key features');
  });

  it('does not inject website outline for a plain topic brief', () => {
    expect(buildWebsiteServiceIntroOutlineInstruction(
      'expo에 대해서 설명하는 피피티 만들어줘. 시니어 개발자 레벨.',
    )).toBeNull();
    const seed = buildTemplateClonePromptFillSeed({
      userInstruction: 'expo에 대해서 설명하는 피피티 만들어줘. 시니어 개발자 레벨.',
      templateTitle: 'Html Ppt Zhangzara Daisy Days',
      slideCountHint: '5-6',
    });
    expect(seed).not.toContain('Website/product analysis outline (REQUIRED');
    expect(compactTemplateCloneFillSourceBrief(
      'www.teamver.com 사이트 분석해서 서비스 소개 슬라이드 만들어줘.',
    )).toContain('www.teamver.com');
  });

  it('recovers prompt-fill lineage from runContext after persist stores the brief only', () => {
    const brief = 'www.teamver.com 사이트 분석해서 서비스 소개 슬라이드 만들어줘.';
    expect(templateCloneFillModeFromUserMessage({ content: brief })).toBeNull();
    expect(templateCloneFillModeFromUserMessage({
      content: brief,
      runContext: { templateCloneFill: 'prompt' },
    })).toBe('prompt');
    expect(templateCloneAutoContinueFlags({
      content: brief,
      runContext: { templateCloneFill: 'prompt' },
    })).toEqual({ jsonFill: false, promptFill: true, hostFill: true });
    expect(templateCloneAutoContinueFlags({
      content: brief,
      runContext: { templateCloneFill: 'json' },
    })).toEqual({ jsonFill: true, promptFill: false, hostFill: true });
  });

  it('adds a default 6-slide hint when no explicit count is provided', () => {
    const seed = buildTemplateCloneContentFillSeed({
      userInstruction: 'monorepo에 대해서 설명하는 피피티 만들어줘. 시니어 개발자 레벨.',
      templateTitle: 'Html Ppt Zhangzara Daisy Days',
    });
    expect(seed).toContain(
      'Slide count hint: 6 (default for first template fill; close 6 complete slides this turn.)',
    );
    expect(seed).toMatch(/honor an explicit user count of 1–20/i);
    expect(seed).toContain('If unspecified, close 6 this turn');
    expect(seed).toContain('above 20');
    expect(seed).not.toMatch(/honor an explicit user count of 1–6/i);
    expect(seed).not.toMatch(/persist rejects 1–2/i);
    expect(seed).toMatch(/JSON outline only|JSON slot-fill/i);
    expect(seed).toMatch(/host slot-fills|do NOT regenerate deck HTML/i);
  });

  it('derives explicit slide counts from the visible user request when no UI hint is present', () => {
    const oneSlide = buildTemplateCloneContentFillSeed({
      userInstruction: '캡슐 템플릿으로 정확히 1장짜리 요약 슬라이드 만들어줘.',
      templateTitle: 'Html Ppt Zhangzara Capsule',
    });
    expect(oneSlide).toContain('User requested slide count: 1.');
    expect(oneSlide).toContain('Slide count hint: 1.');
    expect(oneSlide).not.toContain('default for first template fill');

    const twoSlides = buildTemplateCloneContentFillSeed({
      userInstruction: '개발자 포트폴리오 예시로 2장짜리 ppt 만들어줘.',
      templateTitle: 'Html Ppt Zhangzara Creative Mode',
    });
    expect(twoSlides).toContain('User requested slide count: 2.');
    expect(twoSlides).toContain('Slide count hint: 2.');
  });

  it('honors an explicit 8-slide request this turn instead of cutting at 6', () => {
    const seed = buildTemplateCloneContentFillSeed({
      userInstruction: 'Expo 아키텍처를 설명하는 8장 발표자료 만들어줘.',
      templateTitle: 'Html Ppt Zhangzara Daisy Days',
    });
    expect(seed).toContain('User requested slide count: 8.');
    expect(seed).toContain('Slide count hint: 8.');
    expect(seed).not.toContain('stability cap for first template fill');
  });

  it('honors explicit requests through 20 slides in one JSON turn', () => {
    const ten = buildTemplateCloneContentFillSeed({
      userInstruction: '온보딩 슬라이드 10장 만들어줘.',
      templateTitle: 'Html Ppt Zhangzara Pink Script',
    });
    expect(ten).toContain('User requested slide count: 10.');
    expect(ten).toContain('Slide count hint: 10.');
    expect(ten).not.toContain('stability cap for first template fill');

    const twelve = buildTemplateCloneContentFillSeed({
      userInstruction: '아키텍처 리뷰 12장 만들어줘.',
      templateTitle: 'Html Ppt Zhangzara Daisy Days',
    });
    expect(twelve).toContain('User requested slide count: 12.');
    expect(twelve).toContain('Slide count hint: 12.');
    expect(twelve).not.toContain('stability cap for first template fill');

    const twenty = buildTemplateCloneContentFillSeed({
      userInstruction: '제품 전략 발표자료를 정확히 20장 만들어줘.',
      templateTitle: 'Html Ppt Zhangzara Daisy Days',
    });
    expect(twenty).toContain('User requested slide count: 20.');
    expect(twenty).toContain('Slide count hint: 20.');
    expect(twenty).toContain('20 → 20');
    expect(twenty).not.toContain('stability cap for first template fill');
  });

  it('records a typed 5-page brief instead of the auto 6-8 quick-length range', () => {
    const seed = buildTemplateCloneContentFillSeed({
      userInstruction: '온보딩 슬라이드 5페이지 만들어줘.',
      templateTitle: 'Html Ppt Zhangzara Pink Script',
      slideCountHint: '6-8',
    });
    expect(seed).toContain('User requested slide count: 5.');
    expect(seed).not.toContain('User requested slide count: 6-8.');
    expect(seed).toContain('Slide count hint: 5.');
  });

  it('fallback fill copy does not claim 첨부한 자료 or 요청한 내용 when topic is missing', () => {
    const visible = extractTemplateCloneUserFacingRequest({
      pendingPrompt: '첨부한 자료를 바탕으로 슬라이드 덱을 만들어줘.',
    });
    expect(visible).toBe('슬라이드 내용을 채워줘.');
    expect(visible).not.toMatch(/첨부한 자료|요청한 내용/);

    const seed = buildTemplateCloneContentFillSeed({
      userInstruction: '',
      sourceBrief: null,
      hasSourceMaterial: false,
    });
    expect(seed).toMatch(/user prompt may be empty/i);
    expect(seed).not.toMatch(/any attached source materials/);
    expect(seed.startsWith('슬라이드 내용을 채워줘.')).toBe(true);
  });

  // 루프529 — soft defer MiniMax when Home brief has no usable topic.
  it('isGenericTemplateCloneTopicBrief detects empty / boilerplate / title-only briefs', () => {
    expect(isGenericTemplateCloneTopicBrief('')).toBe(true);
    expect(isGenericTemplateCloneTopicBrief('슬라이드')).toBe(true);
    expect(isGenericTemplateCloneTopicBrief('만들어줘')).toBe(true);
    expect(isGenericTemplateCloneTopicBrief('첨부한 자료를 바탕으로 슬라이드 덱을 만들어줘.')).toBe(true);
    expect(
      isGenericTemplateCloneTopicBrief(
        'www.teamver.com 사이트 분석해서 서비스 소개 슬라이드 만들어줘.',
      ),
    ).toBe(false);
    expect(
      isGenericTemplateCloneTopicBrief('expo에 대해서 설명하는 피피티 만들어줘.'),
    ).toBe(false);
    expect(isGenericTemplateCloneTopicBrief('슬라이드 만들어줘')).toBe(true);
    expect(isGenericTemplateCloneTopicBrief('슬라이드를 만들어줘')).toBe(true);
    // Short, but the product/topic is still there — not an empty shell.
    expect(isGenericTemplateCloneTopicBrief('Teamver 소개 슬라이드 만들어줘')).toBe(false);
    expect(isGenericTemplateCloneTopicBrief('신제품 런칭 슬라이드를 만들어줘.')).toBe(false);
    // Canvas/Drive with source material never defer.
    expect(
      isGenericTemplateCloneTopicBrief('', { hasSourceMaterial: true }),
    ).toBe(false);
  });

  it('loop536 — LOOK seed generic-brief copy only when no topic and no source', () => {
    expect(shouldExplainGenericBriefOnLookSeedFallback({
      brief: '슬라이드 만들어줘',
    })).toBe(true);
    expect(shouldExplainGenericBriefOnLookSeedFallback({
      brief: 'Teamver 소개 슬라이드 만들어줘',
    })).toBe(false);
    expect(shouldExplainGenericBriefOnLookSeedFallback({
      brief: 'www.teamver.com 사이트 분석해서 서비스 소개 슬라이드 만들어줘.',
    })).toBe(false);
    expect(shouldExplainGenericBriefOnLookSeedFallback({
      brief: '만들어줘',
      userContent: 'Fill REAL presentation CONTENT for this request and any attached source materials (Canvas/Drive/files).',
    })).toBe(false);
    expect(shouldExplainGenericBriefOnLookSeedFallback({
      brief: '만들어줘',
      attachments: [{ path: 'canvas.png' }],
    })).toBe(false);
  });

  it('extracts topic from full run prompt with [User instruction] block', () => {
    const visible = extractTemplateCloneUserFacingRequest({
      pendingPrompt: [
        '요청한 내용으로 슬라이드 덱을 만들어줘.',
        '',
        '[Deliverable instruction]',
        'Build a new presentation deck...',
        '',
        '[User instruction]',
        'expo에 대해서 설명하는 피피티 만들어줘.',
      ].join('\n'),
    });
    expect(visible).toMatch(/expo/i);
    expect(visible).not.toMatch(/요청한 내용|첨부한 자료/);
  });

  it('promptWithTemplateCloneContentFillInstruction is create tone, not existing-deck rewrite', () => {
    const seed = buildTemplateCloneContentFillSeed({
      userInstruction: 'expo에 대해서 설명하는 피피티 만들어줘.',
      hasSourceMaterial: false,
    });
    expect(isTemplateCloneContentFillPrompt(seed)).toBe(true);
    const prompted = promptWithTemplateCloneContentFillInstruction(seed, {
      slideOnlyMvp: true,
    });
    expect(prompted).toContain(TEMPLATE_CLONE_CONTENT_FILL_MARKER);
    expect(prompted).toMatch(/Begin with `\{`/);
    expect(prompted).toMatch(/no status sentence/i);
    expect(prompted).toMatch(/JSON outline only|JSON slot-fill/i);
    expect(prompted).not.toContain('[Existing deck edit]');
    expect(prompted).not.toMatch(/rewrites visible text/i);
    expect(prompted).not.toMatch(/use edit tone only/i);
  });

  it('strips Home create run-dump scaffolding from the fill source brief', () => {
    const runDump = [
      '첨부한 자료를 바탕으로 슬라이드 덱을 만들어줘.',
      '',
      '[Deliverable instruction]',
      'Create a complete closed deck. Bind the Template visual kit.',
      '',
      '[Selected slide template]',
      'The user picked "Html Ppt Zhangzara Daisy Days".',
      '',
      '[Quick settings]',
      'Audience: 시니어 개발자.',
      'Length: 8-10.',
      '',
      '[User instruction]',
      'expo에 대해서 설명하는 피피티 만들어줘. 시니어 개발자 레벨.',
      '',
      '[Selected slide template priority]',
      'READ LAST. Neutral is a failed deliverable.',
    ].join('\n');
    const compact = compactTemplateCloneFillSourceBrief(runDump);
    expect(compact).toMatch(/expo/i);
    expect(compact).toContain('Quick settings:');
    expect(compact).not.toContain('[Deliverable instruction]');
    expect(compact).not.toContain('READ LAST');

    const seed = buildTemplateCloneContentFillSeed({
      pendingPrompt: runDump,
      sourceBrief: runDump,
      templateTitle: 'Html Ppt Zhangzara Daisy Days',
      slideCountHint: '8-10',
    });
    expect(seed).toContain(TEMPLATE_CLONE_CONTENT_FILL_MARKER);
    expect(seed).toContain('Slide count hint: 8-10 (close this turn)');
    expect(seed).not.toContain('stability cap for first template fill');
    expect(seed).toContain('시니어 개발자');
    expect(seed).not.toContain('[Deliverable instruction]');
    expect(seed).not.toContain('[Selected slide template priority]');
  });

  it('treats the 5-6 short preset as a this-turn close, not a later-append cap', () => {
    expect(normalizeTemplateCloneFillSlideCountHint('5-6')).toBe(
      '5-6 (close at least 5 this turn)',
    );
    expect(normalizeTemplateCloneFillSlideCountHint('5~6')).toBe(
      '5-6 (close at least 5 this turn)',
    );
    const seed = buildTemplateCloneContentFillSeed({
      userInstruction: '온보딩 슬라이드 만들어줘.',
      templateTitle: 'Html Ppt Zhangzara Pink Script',
      slideCountHint: '5-6',
    });
    expect(seed).toContain('User requested slide count: 5-6.');
    expect(seed).toContain('Slide count hint: 5-6 (close at least 5 this turn).');
    expect(seed).not.toContain('stability cap for first template fill');
    expect(seed).toMatch(/close ≥5 this turn|Never close after a single cover or after 3 slides when the target is 5\+/);
    const notice = templateCloneFillSlideCountOverrideNotice('5-6');
    expect(notice).toContain('5-6 (close at least 5 this turn)');
    expect(notice).toContain('Close at least 5 slides this turn');
    expect(notice).not.toContain('A later turn may append remaining slides');
  });

  it('honors explicit 1–20 this turn and keeps the 6-8 auto preset at 6', () => {
    expect(normalizeTemplateCloneFillSlideCountHint('6-8')).toBe(
      '6 (stability cap for first template fill)',
    );
    expect(normalizeTemplateCloneFillSlideCountHint('8-10')).toBe(
      '8-10 (close this turn)',
    );
    expect(normalizeTemplateCloneFillSlideCountHint('8~10')).toBe(
      '8-10 (close this turn)',
    );
    expect(normalizeTemplateCloneFillSlideCountHint('12-15')).toBe(
      '12-15 (close this turn)',
    );
    expect(normalizeTemplateCloneFillSlideCountHint('4')).toBe('4');
    expect(normalizeTemplateCloneFillSlideCountHint('3')).toBe('3');
    expect(normalizeTemplateCloneFillSlideCountHint('5')).toBe('5');
    expect(normalizeTemplateCloneFillSlideCountHint('8')).toBe('8');
    expect(normalizeTemplateCloneFillSlideCountHint('10')).toBe('10');
    expect(normalizeTemplateCloneFillSlideCountHint('정확히 10')).toBe('10');
    expect(normalizeTemplateCloneFillSlideCountHint('정확히 1')).toBe('1');
    expect(normalizeTemplateCloneFillSlideCountHint('정확히 12')).toBe('12');
  });

  it('caps Plugin-input slideCount for fill turns and emits an override notice', () => {
    expect(
      withTemplateCloneFillPluginInputs({ slideCount: '12-15', topic: 'expo' }, '12-15'),
    ).toMatchObject({
      topic: 'expo',
      slideCount: '12-15 (close this turn)',
    });
    expect(templateCloneFillSlideCountOverrideNotice('8-10')).toContain(
      '8-10 (close this turn)',
    );
    expect(templateCloneFillSlideCountOverrideNotice('8-10')).toContain(
      'Do not leave remaining slides for a later turn',
    );
    expect(templateCloneFillSlideCountOverrideNotice('8-10')).toContain('hard cap');
    expect(templateCloneFillSlideCountOverrideNotice('8-10')).toContain('hard cap at 10');
    expect(templateCloneFillSlideCountOverrideNotice('8-10')).not.toContain(
      'A later turn may append remaining slides',
    );
    expect(templateCloneFillSlideCountOverrideNotice('12-15')).toContain(
      '12-15 (close this turn)',
    );
    expect(templateCloneFillSlideCountOverrideNotice('12-15')).toContain(
      'hard cap at 15',
    );
    expect(templateCloneFillSlideCountOverrideNotice('12-15')).not.toContain(
      'A later turn may append remaining slides',
    );
    expect(templateCloneFillSlideCountOverrideNotice('5')).not.toContain(
      'A later turn may append remaining slides',
    );
  });

  it('keeps Drive source labels when compacting a mixed create dump', () => {
    const compact = compactTemplateCloneFillSourceBrief([
      'Drive source file: expo-notes.pdf',
      'Drive source MIME: application/pdf',
      '',
      '[Deliverable instruction]',
      'Create a complete closed deck.',
      '',
      '[User instruction]',
      'expo에 대해서 설명하는 피피티 만들어줘. 시니어 개발자 레벨.',
    ].join('\n'));
    expect(compact).toContain('Drive source file: expo-notes.pdf');
    expect(compact).toMatch(/expo/i);
    expect(compact).not.toContain('[Deliverable instruction]');
  });

  it('prefers the queued fill seed over a stale create-time pendingPrompt', () => {
    const fillSeed = buildTemplateCloneContentFillSeed({
      userInstruction: 'expo에 대해서 설명하는 피피티 만들어줘. 시니어 개발자 레벨.',
      templateTitle: 'Html Ppt Zhangzara Daisy Days',
    });
    const staleCreatePrompt = [
      '첨부한 자료를 바탕으로 슬라이드 덱을 만들어줘.',
      '',
      '[Deliverable instruction]',
      'Create a complete closed deck.',
      '',
      '[User instruction]',
      'expo에 대해서 설명하는 피피티 만들어줘. 시니어 개발자 레벨.',
    ].join('\n');
    const seed = resolveTemplateCloneAutoSendSeed({
      queuedFillSeed: fillSeed,
      pendingPrompt: staleCreatePrompt,
      fillQueued: true,
    });
    expect(seed).toBe(fillSeed);
    expect(seed).toContain(TEMPLATE_CLONE_CONTENT_FILL_MARKER);
    expect(seed).not.toContain('[Deliverable instruction]');
  });

  it('rebuilds a fill seed when fill is queued but only the raw create prompt remains', () => {
    const seed = resolveTemplateCloneAutoSendSeed({
      queuedFillSeed: '',
      pendingPrompt: [
        '첨부한 자료를 바탕으로 슬라이드 덱을 만들어줘.',
        '',
        '[User instruction]',
        'expo에 대해서 설명하는 피피티 만들어줘. 시니어 개발자 레벨.',
      ].join('\n'),
      fillQueued: true,
    });
    expect(seed).toContain(TEMPLATE_CLONE_CONTENT_FILL_MARKER);
    expect(seed).toMatch(/expo/i);
    expect(seed).not.toMatch(/^첨부한 자료를 바탕으로/m);
  });

  it('loop420 — auto-send strips the canvas deliverable dump down to the user brief', () => {
    const dump = [
      'www.teamver.com 사이트 분석해서 서비스 소개 슬라이드 만들어줘. 8~10장',
      '',
      '[Deliverable instruction]',
      'Create a complete closed deck with motif fidelity...',
      '',
      '[Quick settings]',
      'Length: 8-10',
      '',
      '[Selected slide template]',
      'Capsule',
    ].join('\n');
    expect(sanitizeCreateAutoSendSeed(dump)).toMatch(/teamver\.com/);
    expect(sanitizeCreateAutoSendSeed(dump)).not.toContain('[Deliverable instruction]');
    const seed = resolveTemplateCloneAutoSendSeed({
      queuedFillSeed: '',
      pendingPrompt: dump,
      fillQueued: false,
    });
    expect(seed).toMatch(/teamver\.com/);
    expect(seed).not.toContain('[Deliverable instruction]');
    expect(seed).not.toContain('[Quick settings]');
  });

  it('historyHasTemplateCloneContentFill only checks the latest user turn', () => {
    expect(
      historyHasTemplateCloneContentFill([
        { role: 'user', content: `expo\n\n${TEMPLATE_CLONE_CONTENT_FILL_MARKER}` },
        { role: 'assistant', content: '<artifact type="deck"><head>' },
      ]),
    ).toBe(true);
    // Later normal edit must NOT inherit ancient fill markers.
    expect(
      historyHasTemplateCloneContentFill([
        { role: 'user', content: `expo\n\n${TEMPLATE_CLONE_CONTENT_FILL_MARKER}` },
        { role: 'assistant', content: 'done' },
        { role: 'user', content: '제목만 바꿔줘' },
      ]),
    ).toBe(false);
    expect(
      historyHasTemplateCloneContentFill([
        {
          role: 'user',
          content: 'www.teamver.com 사이트 분석해서 서비스 소개 슬라이드 만들어줘.',
          runContext: { templateCloneFill: 'json' },
        },
      ]),
    ).toBe(true);
    expect(
      historyHasTemplateCloneContentFill([
        {
          role: 'user',
          content: 'www.teamver.com 사이트 분석해서 서비스 소개 슬라이드 만들어줘.',
          runContext: { templateCloneFill: 'prompt' },
        },
      ]),
    ).toBe(false);
  });

  it('does not re-append expansion hard rules when the fill seed is already present', () => {
    const seed = buildTemplateCloneContentFillSeed({
      userInstruction: 'expo에 대해서 설명하는 피피티 만들어줘. 시니어 개발자 레벨.',
    });
    const once = (seed.match(/brief is a topic, not slide text/gi) ?? []).length;
    expect(once).toBe(1);
    const stamped = promptWithTemplateCloneContentFillInstruction(seed, { slideOnlyMvp: true });
    expect((stamped.match(/brief is a topic, not slide text/gi) ?? []).length).toBe(1);
    expect(stamped).toBe(seed);
  });

  it('ensureTemplateCloneContentFillContinuePrompt restamps create contract without Existing deck edit', () => {
    const continued = ensureTemplateCloneContentFillContinuePrompt(
      '이전 응답이 끊겼습니다. JSON outline으로 이어서 완성하세요.',
    );
    expect(continued).toContain(TEMPLATE_CLONE_CONTENT_FILL_MARKER);
    expect(continued).toContain(TEMPLATE_CLONE_CONTENT_FILL_TURN_MARKER);
    expect(continued).toMatch(/Begin with `\{`/);
    expect(continued).toMatch(/no status sentence/i);
    expect(continued).toMatch(/ABANDON any HTML deck dump|JSON outline only/i);
    expect(continued).not.toContain('[Existing deck edit]');
    expect(continued).toMatch(/이전 응답이 끊겼습니다/);
    // Idempotent when already stamped.
    expect(ensureTemplateCloneContentFillContinuePrompt(continued)).toBe(continued);
  });

  it('builds a one-shot JSON repair prompt (0901-N02 B5)', () => {
    const repair = buildTemplateCloneSlotFillRepairPrompt();
    expect(repair).toContain(TEMPLATE_CLONE_SLOT_FILL_REPAIR_MARKER);
    expect(repair).toContain(TEMPLATE_CLONE_CONTENT_FILL_MARKER);
    expect(isTemplateCloneSlotFillRepairPrompt(repair)).toBe(true);
    expect(isTemplateCloneContentFillPrompt(repair)).toBe(true);
    expect(repair).toMatch(/Emit ONE JSON outline only/i);
    expect(repair).toMatch(/FORBIDDEN:.*section class="slide"/i);
    // 루프522 — JSON slot-fill repair turns must not open an artifact wrapper.
    // MiniMax sometimes tries to \"patch\" the LOOK seed with an empty
    // deck-patch instead of returning the JSON outline → `incomplete_output`.
    expect(repair).toMatch(
      /Never emit `<artifact type="deck-patch">` or `<artifact type="element-patch">`/,
    );
    expect(historyHasTemplateCloneSlotFillRepair([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: '<section class="slide">' },
    ])).toBe(false);
    expect(historyHasTemplateCloneSlotFillRepair([
      { role: 'user', content: repair },
    ])).toBe(true);
  });

  it('asks only for missing slides when a truncated outline was partially recovered', () => {
    const repair = buildTemplateCloneSlotFillRepairPrompt({
      userBrief: 'Teamver 서비스 소개',
      recoveredSlideCount: 7,
      recoveredSlideTitles: ['표지', '문제', '솔루션'],
      targetSlideCount: 10,
    });
    expect(repair).toContain('recovered 7 complete AI-authored slides');
    expect(repair).toContain('ONLY the 3 missing slides');
    expect(repair).toContain('표지 | 문제 | 솔루션');
    expect(repair).toContain('do not repeat');
  });

  it('cloneFillJsonRepairAlreadyAttempted includes in-flight repair user turn (루프369)', () => {
    const repair = buildTemplateCloneSlotFillRepairPrompt({ userBrief: 'expo 설명' });
    expect(repair).toContain('expo');
    expect(cloneFillJsonRepairAlreadyAttempted([], repair)).toBe(true);
    expect(shouldQueueCloneSlotFillJsonRepair([], repair)).toBe(false);
    expect(shouldQueueCloneSlotFillJsonRepair([], 'fill prompt')).toBe(true);
  });

  it('drops cloned deck.html from fill-queue attachments', () => {
    expect(withoutCanonicalDeckAttachments([
      { path: 'deck.html', name: 'deck.html', kind: 'file' },
      { path: 'deck-2.html', name: 'deck-2.html', kind: 'file' },
      { path: 'refs/drive/notes.pdf', name: 'notes.pdf', kind: 'file' },
    ])).toEqual([
      { path: 'refs/drive/notes.pdf', name: 'notes.pdf', kind: 'file' },
    ]);

    const store = new Map<string, string>();
    const prev = globalThis.window;
    (globalThis as { window?: unknown }).window = {
      sessionStorage: {
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
        getItem: (key: string) => store.get(key) ?? null,
      },
    };
    try {
      queueTemplateCloneContentFill({
        projectId: 'proj-fill',
        seed: buildTemplateCloneContentFillSeed({
          userInstruction: 'expo에 대해서 설명하는 피피티 만들어줘.',
        }),
        attachments: [
          { path: 'deck.html', name: 'deck.html', kind: 'file' },
          { path: 'refs/drive/notes.pdf', name: 'notes.pdf', kind: 'file' },
        ],
      });
      expect(store.get('od:auto-send-attachments:proj-fill')).toContain('notes.pdf');
      expect(store.get('od:auto-send-attachments:proj-fill')).not.toContain('deck.html');
      // App/create owns od:auto-send-first — fill queue must not bypass Drive suppress.
      expect(store.get('od:auto-send-first:proj-fill')).toBeUndefined();
    } finally {
      if (prev) (globalThis as { window?: unknown }).window = prev;
      else delete (globalThis as { window?: unknown }).window;
    }
  });

  it('queues prompt-fill rollback seed without arming JSON slot-fill recovery', () => {
    const store = new Map<string, string>();
    const prev = globalThis.window;
    (globalThis as { window?: unknown }).window = {
      sessionStorage: {
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
        getItem: (key: string) => store.get(key) ?? null,
      },
    };
    try {
      const seed = buildTemplateClonePromptFillSeed({
        userInstruction: 'expo 발표자료 만들어줘.',
      });
      store.set('od:template-clone-content-fill:proj-prompt', '1');
      queueTemplateClonePromptFill({
        projectId: 'proj-prompt',
        seed,
        attachments: [
          { path: 'deck.html', name: 'deck.html', kind: 'file' },
          { path: 'refs/drive/notes.pdf', name: 'notes.pdf', kind: 'file' },
        ],
      });
      expect(store.get('od:auto-send-seed:proj-prompt')).toBe(seed);
      expect(store.get('od:template-clone-content-fill:proj-prompt')).toBeUndefined();
      expect(store.get('od:auto-send-attachments:proj-prompt')).toContain('notes.pdf');
      expect(store.get('od:auto-send-attachments:proj-prompt')).not.toContain('deck.html');
      expect(isTemplateCloneContentFillPrompt(store.get('od:auto-send-seed:proj-prompt'))).toBe(false);
    } finally {
      if (prev) (globalThis as { window?: unknown }).window = prev;
      else delete (globalThis as { window?: unknown }).window;
    }
  });
});

/**
 * 1007-N01 슬라이스 B — official-look 리치 모드(opt-in, 기본 OFF). json 경로
 * 산출물이 1비트도 바뀌지 않음을 함께 검증한다.
 */
describe('template clone — official-look rich fill mode (slice B, opt-in)', () => {
  const RICH_OPTS = {
    userInstruction: '리액트 훅 교육 자료 8페이지',
    sourceBrief: 'React hooks: useState, useEffect, custom hooks, rules of hooks.',
    templateTitle: 'Broadside',
    seedShellCount: 8,
  } as const;

  it('1007-N01 슬라이스 C — 기본값 official-rich; json 롤백은 env/localStorage 한 줄', () => {
    // 기본(미설정) → official-rich (슬라이스 C 기본값 전환).
    expect(getTemplateCloneFillMode()).toBe('official-rich');
    expect(isRichOfficialLookTemplateCloneFill()).toBe(true);

    // 별칭들이 official-rich 로 접힌다 (기존 prompt/html 별칭은 영향 없음).
    expect(normalizeTemplateCloneFillMode('official-rich')).toBe('official-rich');
    expect(normalizeTemplateCloneFillMode('rich')).toBe('official-rich');
    expect(normalizeTemplateCloneFillMode('official-look')).toBe('official-rich');
    expect(normalizeTemplateCloneFillMode('html-rich')).toBe('official-rich');
    expect(normalizeTemplateCloneFillMode('b')).toBe('official-rich');
    // 기존 값은 그대로 (json 전용 분기/별칭 로직 불변).
    expect(normalizeTemplateCloneFillMode('prompt')).toBe('prompt');
    expect(normalizeTemplateCloneFillMode('html')).toBe('prompt');
    expect(normalizeTemplateCloneFillMode('json')).toBe('json');
    expect(normalizeTemplateCloneFillMode('slot-fill')).toBe('json');

    // 즉시 롤백 ①: env override 로 json 복귀 (코드 변경 없이 한 줄).
    process.env.VITE_TEAMVER_TEMPLATE_CLONE_FILL_MODE = 'json';
    expect(getTemplateCloneFillMode()).toBe('json');
    expect(isRichOfficialLookTemplateCloneFill()).toBe(false);
    expect(shouldUseJsonTemplateCloneFill()).toBe(true);

    // explicit official-rich env 는 리치를 켜고 json 경로를 끈다 (fill 턴 큐잉).
    process.env.VITE_TEAMVER_TEMPLATE_CLONE_FILL_MODE = 'official-rich';
    expect(getTemplateCloneFillMode()).toBe('official-rich');
    expect(isRichOfficialLookTemplateCloneFill()).toBe(true);
    expect(shouldUseJsonTemplateCloneFill()).toBe(false);
    expect(shouldUsePromptTemplateCloneFill()).toBe(false);
    expect(shouldQueueAiTemplateCloneFill()).toBe(true);

    // 스위치 제거 → 기본값(official-rich)으로 복귀.
    delete process.env.VITE_TEAMVER_TEMPLATE_CLONE_FILL_MODE;
    expect(getTemplateCloneFillMode()).toBe('official-rich');
    expect(isRichOfficialLookTemplateCloneFill()).toBe(true);
  });

  it('1007-N01 슬라이스 C — localStorage json override (비임베드) 즉시 롤백', () => {
    const store = new Map<string, string>();
    store.set('od:template-clone-fill-mode', 'json');
    const prev = globalThis.window;
    (globalThis as { window?: unknown }).window = {
      location: { hostname: 'localhost' },
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => { store.set(key, value); },
        removeItem: (key: string) => { store.delete(key); },
      },
    };
    try {
      // 비임베드 로컬: localStorage override 가 기본값(official-rich)을 json 으로 되돌린다.
      process.env.VITE_TEAMVER_EMBED = '0';
      expect(getTemplateCloneFillMode()).toBe('json');
      expect(isRichOfficialLookTemplateCloneFill()).toBe(false);
      expect(shouldUseJsonTemplateCloneFill()).toBe(true);

      // override 제거 → 기본값(official-rich) 복귀.
      store.delete('od:template-clone-fill-mode');
      expect(getTemplateCloneFillMode()).toBe('official-rich');
      expect(isRichOfficialLookTemplateCloneFill()).toBe(true);
    } finally {
      if (prev) (globalThis as { window?: unknown }).window = prev;
      else delete (globalThis as { window?: unknown }).window;
    }
  });

  it('rich seed = prompt-fill contract + density block, keeps EXACTLY N / topic-lock / KPI-ban', () => {
    const rich = buildTemplateCloneRichOfficialLookFillSeed(RICH_OPTS);
    // prompt-fill(HTML artifact) 계약을 그대로 탄다 — JSON outline 마커가 아니다.
    expect(rich).toContain(TEMPLATE_CLONE_PROMPT_FILL_MARKER);
    expect(rich).not.toContain(TEMPLATE_CLONE_CONTENT_FILL_MARKER);
    // density 계약이 덧붙었다.
    expect(rich).toContain('[Official-look rich mode]');
    expect(rich).toContain('2-3 sentence lead/body');
    // slide-count 가드(EXACTLY N) 유지.
    expect(rich).toMatch(/EXACTLY (?:the requested number of slides|8)/);
    // 날조 수치 금지(KPI-ban) 유지.
    expect(rich).toMatch(/Do not invent quantitative KPIs/i);
    // [Source brief] 는 density 블록보다 뒤에 와야 한다.
    const briefIdx = rich.indexOf('[Source brief]');
    const densityIdx = rich.indexOf('[Official-look rich mode]');
    expect(briefIdx).toBeGreaterThan(densityIdx);
  });

  it('1007-N01 슬라이스 C 결함1·2 — 리치 밀도 계약이 빈약 슬라이드/깨진 step 코드를 금지', () => {
    const rich = buildTemplateCloneRichOfficialLookFillSeed(RICH_OPTS);
    // 결함1 — 콘텐츠 슬라이드 타이틀 단독 금지(섹션 간지만 예외).
    expect(rich).toMatch(/Never leave a content slide as a title alone/i);
    expect(rich).toMatch(/MUST have body elements under the heading/i);
    expect(rich).toMatch(/section-divider slide may be title-only/i);
    // 결함2 — 코드/설정은 하나의 <pre><code> 블록, step/card 는 설명문.
    expect(rich).toMatch(/<pre><code>/);
    expect(rich).toMatch(/do not split it across step\/card boxes/i);
    expect(rich).toMatch(/never a bare raw code line/i);
    // slide-count 가드(EXACTLY N)는 밀도 라인 뒤에 그대로 유지.
    expect(rich).toMatch(/EXACTLY the requested number of slides/);
  });

  it('toggling modes does NOT change the json seed builder output (0 regression)', () => {
    const jsonSeedBefore = buildTemplateCloneContentFillSeed(RICH_OPTS);

    // explicit json 모드 → json slot-fill 시드.
    process.env.VITE_TEAMVER_TEMPLATE_CLONE_FILL_MODE = 'json';
    const fromModeJson = buildTemplateCloneFillSeedForCurrentMode(RICH_OPTS);
    expect(fromModeJson.jsonFill).toBe(true);
    expect(fromModeJson.seed).toBe(jsonSeedBefore);

    process.env.VITE_TEAMVER_TEMPLATE_CLONE_FILL_MODE = 'official-rich';
    const fromModeRich = buildTemplateCloneFillSeedForCurrentMode(RICH_OPTS);
    expect(fromModeRich.jsonFill).toBe(false);
    expect(fromModeRich.seed).toBe(buildTemplateCloneRichOfficialLookFillSeed(RICH_OPTS));

    // 리치 모드를 켠 뒤에도 json 빌더 산출물은 1비트도 동일.
    expect(buildTemplateCloneContentFillSeed(RICH_OPTS)).toBe(jsonSeedBefore);
  });
});

describe('1007-N01 결함1 — 소스 그라운딩 게이팅(A) + 날조 금지(D)', () => {
  // 회사명/주제만 있고 URL·첨부가 없는 브리프(날조가 발생하던 케이스).
  const NO_SOURCE_OPTS = {
    userInstruction: '삼성전자 소개 발표자료 만들어줘',
    sourceBrief: 'User instruction:\n삼성전자 소개 발표자료 만들어줘',
    templateTitle: 'Broadside',
    seedShellCount: 6,
  } as const;
  // 브리프에 실제 공개 URL(example/localhost 제외) → web-fetch 그라운딩 대상.
  const URL_SOURCE_OPTS = {
    userInstruction: 'https://acme-corp.io 소개 발표자료 만들어줘',
    sourceBrief: 'User instruction:\nhttps://acme-corp.io 소개 발표자료 만들어줘',
    templateTitle: 'Broadside',
    seedShellCount: 6,
  } as const;

  it('resolveEffectiveTemplateCloneFillMode — 기본값 리치는 소스 없으면 json, 명시 override 는 존중', () => {
    // 기본값(비명시) 리치 + 소스 없음 → json 강등.
    expect(resolveEffectiveTemplateCloneFillMode({ mode: 'official-rich', explicit: false, hasSource: false })).toBe('json');
    // 기본값 리치 + 소스 있음 → 리치 유지.
    expect(resolveEffectiveTemplateCloneFillMode({ mode: 'official-rich', explicit: false, hasSource: true })).toBe('official-rich');
    // 명시 override 리치 + 소스 없음 → 리치 유지(사용자가 직접 강제).
    expect(resolveEffectiveTemplateCloneFillMode({ mode: 'official-rich', explicit: true, hasSource: false })).toBe('official-rich');
    // 소스 플래그 미상(undefined) → 강등하지 않음(backward-compat).
    expect(resolveEffectiveTemplateCloneFillMode({ mode: 'official-rich', explicit: false })).toBe('official-rich');
    // 비리치 모드는 소스 유무와 무관하게 불변.
    expect(resolveEffectiveTemplateCloneFillMode({ mode: 'json', explicit: false, hasSource: false })).toBe('json');
    expect(resolveEffectiveTemplateCloneFillMode({ mode: 'prompt', explicit: false, hasSource: false })).toBe('prompt');
    expect(resolveEffectiveTemplateCloneFillMode({ mode: 'pure-prompt', explicit: false, hasSource: false })).toBe('pure-prompt');
    expect(resolveEffectiveTemplateCloneFillMode({ mode: 'deterministic', explicit: false, hasSource: false })).toBe('deterministic');
  });

  it('inferTemplateCloneFillHasSource — URL/첨부 유무로 소스 추론', () => {
    expect(inferTemplateCloneFillHasSource(NO_SOURCE_OPTS)).toBe(false);
    expect(inferTemplateCloneFillHasSource(URL_SOURCE_OPTS)).toBe(true);
    expect(inferTemplateCloneFillHasSource({ ...NO_SOURCE_OPTS, hasSourceMaterial: true })).toBe(true);
    expect(inferTemplateCloneFillHasSource({})).toBe(false);
  });

  it('getTemplateCloneFillModeResolution — 기본값은 비명시, env/localStorage 는 명시', () => {
    expect(getTemplateCloneFillModeResolution()).toEqual({ mode: 'official-rich', explicit: false });
    process.env.VITE_TEAMVER_TEMPLATE_CLONE_FILL_MODE = 'official-rich';
    expect(getTemplateCloneFillModeResolution()).toEqual({ mode: 'official-rich', explicit: true });
  });

  it('기본값(리치) + 소스 없음 → json 으로 강등되어 json slot-fill 시드를 낸다', () => {
    const result = buildTemplateCloneFillSeedForCurrentMode(NO_SOURCE_OPTS);
    expect(result.jsonFill).toBe(true);
    // json slot-fill 마커, 리치/prompt-fill 마커 아님.
    expect(result.seed).toContain(TEMPLATE_CLONE_CONTENT_FILL_MARKER);
    expect(result.seed).not.toContain('[Official-look rich mode]');
    // 강등 시드는 json 빌더 산출물과 1비트 동일(비리치 경로 불변).
    expect(result.seed).toBe(buildTemplateCloneContentFillSeed(NO_SOURCE_OPTS));
  });

  it('기본값(리치) + 브리프 URL → 리치 유지(강등 안 함)', () => {
    const result = buildTemplateCloneFillSeedForCurrentMode(URL_SOURCE_OPTS);
    expect(result.jsonFill).toBe(false);
    expect(result.seed).toContain('[Official-look rich mode]');
    expect(result.seed).toBe(buildTemplateCloneRichOfficialLookFillSeed(URL_SOURCE_OPTS));
  });

  it('기본값(리치) + hasSourceMaterial:true → 리치 유지', () => {
    const result = buildTemplateCloneFillSeedForCurrentMode({ ...NO_SOURCE_OPTS, hasSourceMaterial: true });
    expect(result.jsonFill).toBe(false);
    expect(result.seed).toContain('[Official-look rich mode]');
  });

  it('명시 hasSource 플래그가 추론보다 우선한다', () => {
    // URL 있어도 hasSource:false 를 명시하면 강등.
    expect(buildTemplateCloneFillSeedForCurrentMode({ ...URL_SOURCE_OPTS, hasSource: false }).jsonFill).toBe(true);
    // URL 없어도 hasSource:true 를 명시하면 리치 유지.
    expect(buildTemplateCloneFillSeedForCurrentMode({ ...NO_SOURCE_OPTS, hasSource: true }).jsonFill).toBe(false);
  });

  it('env 로 official-rich 를 명시 강제하면 소스가 없어도 리치 유지', () => {
    process.env.VITE_TEAMVER_TEMPLATE_CLONE_FILL_MODE = 'official-rich';
    const result = buildTemplateCloneFillSeedForCurrentMode(NO_SOURCE_OPTS);
    expect(result.jsonFill).toBe(false);
    expect(result.seed).toContain('[Official-look rich mode]');
  });

  it('localStorage 로 official-rich 를 명시 강제하면(비임베드) 소스 없어도 리치 유지', () => {
    const store = new Map<string, string>();
    store.set('od:template-clone-fill-mode', 'official-rich');
    const prev = globalThis.window;
    (globalThis as { window?: unknown }).window = {
      location: { hostname: 'localhost' },
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => { store.set(key, value); },
        removeItem: (key: string) => { store.delete(key); },
      },
    };
    try {
      process.env.VITE_TEAMVER_EMBED = '0';
      expect(getTemplateCloneFillModeResolution()).toEqual({ mode: 'official-rich', explicit: true });
      const result = buildTemplateCloneFillSeedForCurrentMode(NO_SOURCE_OPTS);
      expect(result.jsonFill).toBe(false);
      expect(result.seed).toContain('[Official-look rich mode]');
    } finally {
      if (prev) (globalThis as { window?: unknown }).window = prev;
      else delete (globalThis as { window?: unknown }).window;
    }
  });

  it('결함1 D — 리치 밀도 계약에 날조 금지 제약(요금·연락처·버전·제품명·수치) 포함', () => {
    const rich = buildTemplateCloneRichOfficialLookFillSeed(URL_SOURCE_OPTS);
    expect(rich).toMatch(/Never fabricate concrete facts/i);
    expect(rich).toMatch(/no invented pricing, contact details/i);
    expect(rich).toMatch(/version numbers/i);
    expect(rich).toMatch(/describe it qualitatively/i);
  });
});

describe('1007-N01 슬라이스 E — v1.4.16 품질 회귀: 일반 지식 주제는 리치 유지', () => {
  const prevEnv = process.env.VITE_TEAMVER_TEMPLATE_CLONE_FILL_MODE;
  afterEach(() => {
    if (prevEnv === undefined) delete process.env.VITE_TEAMVER_TEMPLATE_CLONE_FILL_MODE;
    else process.env.VITE_TEAMVER_TEMPLATE_CLONE_FILL_MODE = prevEnv;
  });

  const GENERAL_KNOWLEDGE_OPTS = {
    userInstruction: '글을 매력적으로 쓰는 팁 슬라이드 만들어줘',
    sourceBrief: 'User instruction:\n글을 매력적으로 쓰는 팁 슬라이드 만들어줘',
    templateTitle: 'Broadside',
    seedShellCount: 6,
  } as const;
  const ENTITY_INTRO_OPTS = {
    userInstruction: '삼성전자 소개 발표자료 만들어줘',
    sourceBrief: 'User instruction:\n삼성전자 소개 발표자료 만들어줘',
    templateTitle: 'Broadside',
    seedShellCount: 6,
  } as const;

  it('briefLooksLikeEntityIntroPresentation — 엔티티 소개/IR/pitch 만 매칭', () => {
    expect(briefLooksLikeEntityIntroPresentation('삼성전자 소개 발표자료 만들어줘')).toBe(true);
    expect(briefLooksLikeEntityIntroPresentation('우리 회사 소개 슬라이드')).toBe(true);
    expect(briefLooksLikeEntityIntroPresentation('제품 소개 자료')).toBe(true);
    expect(briefLooksLikeEntityIntroPresentation('IR 피치덱')).toBe(true);
    // 일반 지식/교육/팁/방법 주제는 매칭하지 않는다.
    expect(briefLooksLikeEntityIntroPresentation('글을 매력적으로 쓰는 팁')).toBe(false);
    expect(briefLooksLikeEntityIntroPresentation('영어 회화 공부법')).toBe(false);
    expect(briefLooksLikeEntityIntroPresentation('React 기초 정리')).toBe(false);
  });

  it('templateCloneBriefRequiresSourceGrounding — 날조 위험 브리프만 true', () => {
    // 일반 지식 주제 → 리치 유지(grounding 불필요).
    expect(templateCloneBriefRequiresSourceGrounding(GENERAL_KNOWLEDGE_OPTS)).toBe(false);
    // 엔티티 소개 → grounding 필요(강등).
    expect(templateCloneBriefRequiresSourceGrounding(ENTITY_INTRO_OPTS)).toBe(true);
    // 빈/제네릭 브리프 → grounding 필요(리치가 가짜 주제 지어내는 것 방지).
    expect(templateCloneBriefRequiresSourceGrounding({ userInstruction: '슬라이드 만들어줘' })).toBe(true);
    // Canvas/Drive 소스 → grounding 불필요(리치 유지).
    expect(templateCloneBriefRequiresSourceGrounding({ userInstruction: '', hasSourceMaterial: true })).toBe(false);
  });

  it('resolveEffectiveTemplateCloneFillMode — requiresGrounding:false 면 소스 없어도 리치 유지', () => {
    expect(resolveEffectiveTemplateCloneFillMode({
      mode: 'official-rich', explicit: false, hasSource: false, requiresGrounding: false,
    })).toBe('official-rich');
    // requiresGrounding:true/undefined 는 기존대로 강등.
    expect(resolveEffectiveTemplateCloneFillMode({
      mode: 'official-rich', explicit: false, hasSource: false, requiresGrounding: true,
    })).toBe('json');
    expect(resolveEffectiveTemplateCloneFillMode({
      mode: 'official-rich', explicit: false, hasSource: false,
    })).toBe('json');
  });

  it('기본값(리치) + 소스 없음 + 일반 지식 주제 → 리치 유지(v1.4.16 밀도 회복)', () => {
    const result = buildTemplateCloneFillSeedForCurrentMode(GENERAL_KNOWLEDGE_OPTS);
    expect(result.jsonFill).toBe(false);
    expect(result.seed).toContain('[Official-look rich mode]');
  });

  it('기본값(리치) + 소스 없음 + 엔티티 소개 → json 강등(날조 방지 유지)', () => {
    const result = buildTemplateCloneFillSeedForCurrentMode(ENTITY_INTRO_OPTS);
    expect(result.jsonFill).toBe(true);
    expect(result.seed).toContain(TEMPLATE_CLONE_CONTENT_FILL_MARKER);
    // 강등 시드는 json 빌더 산출물과 1비트 동일(비리치 경로 불변).
    expect(result.seed).toBe(buildTemplateCloneContentFillSeed(ENTITY_INTRO_OPTS));
  });
});

describe('1007-N01 슬라이스 F — 글쓰기 팁은 official-rich, 합성 스켈레톤 시드 없음', () => {
  const prevEnv = process.env.VITE_TEAMVER_TEMPLATE_CLONE_FILL_MODE;
  afterEach(() => {
    if (prevEnv === undefined) delete process.env.VITE_TEAMVER_TEMPLATE_CLONE_FILL_MODE;
    else process.env.VITE_TEAMVER_TEMPLATE_CLONE_FILL_MODE = prevEnv;
  });

  it('글을 매력적으로 쓰는 팁 → official-rich 시드, 합성 보일러플레이트 없음', () => {
    const result = buildTemplateCloneFillSeedForCurrentMode({
      userInstruction: '글을 매력적으로 쓰는 팁 슬라이드 만들어줘',
      sourceBrief: 'User instruction:\n글을 매력적으로 쓰는 팁 슬라이드 만들어줘',
      templateTitle: 'Broadside',
      seedShellCount: 6,
    });
    expect(result.jsonFill).toBe(false);
    expect(result.seed).toContain('[Official-look rich mode]');
    expect(result.seed).not.toContain('지금 다뤄야 하는가');
    expect(result.seed).not.toContain('자주 쓰이는 용어와 원리');
    expect(result.seed).not.toContain('전체 지도를 먼저 그리고');
    expect(result.seed).not.toContain('에 대한 2');
  });

  it('명시 json override 는 그대로 json (1비트 불변)', () => {
    process.env.VITE_TEAMVER_TEMPLATE_CLONE_FILL_MODE = 'json';
    const result = buildTemplateCloneFillSeedForCurrentMode({
      userInstruction: '글을 매력적으로 쓰는 팁 슬라이드 만들어줘',
      sourceBrief: 'User instruction:\n글을 매력적으로 쓰는 팁 슬라이드 만들어줘',
    });
    expect(result.jsonFill).toBe(true);
    expect(result.seed).toContain(TEMPLATE_CLONE_CONTENT_FILL_MARKER);
  });
});
