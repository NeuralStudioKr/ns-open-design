import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  decideTemplateCloneSlotFillTerminal,
  outlineLooksLikeHtmlDump,
  parseTemplateCloneDeckOutline,
  prepareTemplateCloneSlotFillAssistantText,
} from '../src/template-clone-fill.js';
import { composeTeamverSlideApiPrompt } from '../src/prompts/system.js';
import {
  appendMiniMaxChatCompletionsPath,
  hasMiniMaxLiveKey,
  resolveMiniMaxLiveConfig,
} from './helpers/minimax-live-env.js';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);

const DAISY_EXAMPLE = path.join(
  REPO_ROOT,
  'plugins/_official/examples/html-ppt-zhangzara-daisy-days/example.html',
);

const CLONE_FILL_USER_PROMPT = [
  'expo에 대해서 설명하는 피피티 만들어줘. 시니어 개발자 레벨.',
  '',
  '[Template clone content fill]',
  'Daemon Clone already seeded a LOOK preview into `deck.html`. This turn emits a JSON outline only — the host slot-fills that seed. Do NOT rewrite deck HTML.',
  'Fill REAL presentation CONTENT for this create — expand the brief into a senior-level Expo architecture deck.',
  'Hard rules (READ — JSON slot-fill):',
  '- Emit ONE JSON outline only (plain or ```json fenced). The host slot-fills the LOOK seed — do NOT regenerate deck HTML.',
  '- Forbidden output: <!doctype, <html, <head, <style, <section class="slide">, Motif <svg>, full example.html rewrite.',
  '- JSON shape: {"title":"...","slides":[{"title":"...","kicker":"...","lead":"...","roleHint":"cover|list|cards","items":[{"title":"...","body":"..."}]}]}',
  '- Cards / list / stat slides MUST use items[] with 2–4 {title, body} slots.',
  '- Slide count THIS TURN: close 6 complete slides (cover + body + close).',
  '- Do not invent empty pillar/column-number cards to pad columns.',
  'Selected template: Html Ppt Zhangzara Daisy Days.',
  'Slide count hint: 6 (default for first template fill; close 6 complete slides this turn.)',
].join('\n');

function extractOpenAiMessageText(data: unknown): string {
  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return '';
  const first = choices[0] as
    | { message?: { content?: unknown }; text?: unknown }
    | undefined;
  if (typeof first?.message?.content === 'string') return first.message.content;
  if (typeof first?.text === 'string') return first.text;
  return '';
}

function stripRedactedThinking(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/redacted_thinking>/gi, '')
    .replace(/[\s\S]*?<\/think>/gi, '')
    .trim();
}

async function callMiniMaxCloneFill(input: {
  systemPrompt: string;
  userPrompt: string;
}): Promise<string> {
  const { apiKey, baseUrl, model } = resolveMiniMaxLiveConfig();
  const url = appendMiniMaxChatCompletionsPath(baseUrl);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_completion_tokens: 12_000,
      thinking: { type: 'disabled' },
      temperature: 1,
      top_p: 0.95,
      stream: false,
      messages: [
        { role: 'system', content: input.systemPrompt },
        { role: 'user', content: input.userPrompt },
      ],
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(
      `MiniMax chat/completions ${response.status}: ${bodyText.slice(0, 400)}`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    throw new Error(`MiniMax response was not JSON: ${bodyText.slice(0, 200)}`);
  }
  const content = stripRedactedThinking(extractOpenAiMessageText(parsed));
  if (!content.trim()) {
    throw new Error('MiniMax returned empty assistant content');
  }
  return content;
}

const live = hasMiniMaxLiveKey();

describe.skipIf(!live)('template-clone-minimax-live.e2e (0901-N02)', () => {
  it(
    'MiniMax clone fill → slot-fill or seed-fallback (never queue-repair / abort)',
    async () => {
      const seedHtml = readFileSync(DAISY_EXAMPLE, 'utf8');
      expect(seedHtml).toContain('Daisy Days');
      expect(seedHtml).toMatch(/<section class="slide\b/);

      const systemPrompt = composeTeamverSlideApiPrompt({
        skillName: 'Html Ppt Zhangzara Daisy Days',
        skillBody: [
          'Visual kit: cream #F5F0E6, Fredoka display, Quicksand body, daisy motif/deco anchors.',
          'Layout roles: cover, welcome, cards, timeline, closing — pick by brief, not demo order.',
        ].join('\n'),
        metadata: { kind: 'deck', skipDiscoveryBrief: true },
        templateCloneContentFill: true,
        locale: 'ko',
      });

      const assistantRaw = await callMiniMaxCloneFill({
        systemPrompt,
        userPrompt: CLONE_FILL_USER_PROMPT,
      });
      const rawFinalText = prepareTemplateCloneSlotFillAssistantText(assistantRaw) || assistantRaw;

      expect(outlineLooksLikeHtmlDump(rawFinalText)).toBe(false);

      const decision = decideTemplateCloneSlotFillTerminal({
        rawFinalText,
        seedHtml,
        repairAlreadyAttempted: false,
        templateId: 'html-ppt-zhangzara-daisy-days',
      });

      expect(decision.kind).not.toBe('queue-repair');
      expect(decision.kind).not.toBe('abort');
      expect(['slot-fill', 'seed-fallback']).toContain(decision.kind);

      if (decision.kind === 'slot-fill') {
        const outline = parseTemplateCloneDeckOutline(rawFinalText);
        expect(outline).not.toBeNull();
        expect(outline!.slides.length).toBeGreaterThanOrEqual(3);
        expect(decision.html).toMatch(/<section class="slide\b/);
        expect(decision.html).toContain('#F5F0E6');
        expect(decision.html).toMatch(/expo/i);
        expect(decision.title.length).toBeGreaterThan(0);
        return;
      }

      expect(decision.html).toContain('#F5F0E6');
      expect(decision.html).toMatch(/<section class="slide\b/);
      expect(decision.title.length).toBeGreaterThan(0);
    },
    180_000,
  );
});
