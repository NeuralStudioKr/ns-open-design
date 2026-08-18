import { describe, expect, it } from 'vitest';

import { composeSystemPrompt, composeTeamverSlideApiPrompt, SKIP_DISCOVERY_BRIEF_OVERRIDE } from '../src/prompts/system.js';

/**
 * Regression coverage for #313 — Anthropic API mode renders TodoWrite /
 * Read progress as raw text instead of tool UI cards.
 *
 * Root cause: `DISCOVERY_AND_PHILOSOPHY` (pinned at the TOP of the composed
 * prompt with an explicit "these override anything later" header) tells the
 * agent to call `TodoWrite`, `Bash`, `Read`, etc. on turn 3+. In API/BYOK
 * mode none of those tools are wired through to the model, so the agent
 * either narrates `<todo-list>` pseudo-markup or emits `[读取 X]`
 * fake-protocol prose. The old `streamFormat: 'plain'` rule was appended at
 * the BOTTOM of the prompt — lower precedence than the discovery layer —
 * which is why it was load-bearing-by-position-only and didn't actually
 * suppress the pseudo-tool output.
 *
 * Fix: the API-mode override must sit ABOVE the discovery layer and
 * explicitly invalidate any later "call TodoWrite / Read / Bash" rule.
 */

describe('composeSystemPrompt — API mode (#313)', () => {
  describe('daemon mode (no streamFormat)', () => {
    it('keeps the TodoWrite hard rule from the discovery layer (control)', () => {
      const prompt = composeSystemPrompt({});
      expect(prompt).toMatch(/TodoWrite/);
    });

    it('does not instruct agents to ask for a second visual-direction picker', () => {
      const prompt = composeSystemPrompt({});
      expect(prompt).toContain('Do not emit a direction question-form');
      expect(prompt).not.toContain('<question-form id="direction"');
      expect(prompt).not.toContain('Pick a visual direction');
      expect(prompt).toContain('if a design system is active and no new brand/reference source was provided, use it as the visual direction without asking again');
    });

    it('uses stable brand option values for discovery-form branching', () => {
      const prompt = composeSystemPrompt({});
      expect(prompt).toContain('{ "label": "Pick a direction for me", "value": "pick_direction" }');
      expect(prompt).toContain('{ "label": "I have a brand spec — I\'ll share it", "value": "brand_spec" }');
      expect(prompt).toContain('{ "label": "Match a reference site / screenshot — I\'ll attach it", "value": "reference_match" }');
      expect(prompt).toContain('When the answer line includes `[value: ...]`, use that stable value instead of the visible label.');
      expect(prompt).toContain('If you keep the `brand` question, its `id` must stay `"brand"`.');
      expect(prompt).toContain('you may drop the `brand` question as already answered, but you must still treat that provided source as Branch A below');
      expect(prompt).toContain('When skipping the form, do not skip brand-source handling');
      expect(prompt).toContain('If the current message, attachments, prior brief, or URL already contains an actual brand spec / brand guide / reference site / screenshot source, use Branch A.');
      expect(prompt).toContain('### Branch A — user provided a brand/reference source, or `brand` value is `"brand_spec"` / `"reference_match"`');
      expect(prompt).toContain('ask them to paste/upload the brand spec or reference and stop');
      expect(prompt).toContain('Do not guess a brand domain or invent tokens');
      expect(prompt).toContain('An active design system does not suppress Branch A when the user provides a brand/reference source');
      expect(prompt).toContain('### Branch B — no user-provided brand/reference source and no Branch A brand value');
      expect(prompt).toContain('active-design-system cases where the user did not provide a new brand/reference source');
      expect(prompt).toContain('Provided brand/reference source → run brand-spec extraction');
      expect(prompt).toContain('`brand_spec` / `reference_match` without a provided source → ask for the source and stop; do not guess brand tokens.');
    });

    it('does not inject the API-mode preamble', () => {
      const prompt = composeSystemPrompt({});
      expect(prompt).not.toMatch(/API mode — no tools available/i);
    });

    it('carries the mid-conversation clarification guidance for daemon mode too', () => {
      const prompt = composeSystemPrompt({});
      expect(prompt).toContain('Clarifying questions mid-conversation');
    });
  });

  describe('API mode (streamFormat: plain)', () => {
    it('injects the API-mode override section', () => {
      const prompt = composeSystemPrompt({ streamFormat: 'plain' });
      expect(prompt).toMatch(/API mode — no tools available/i);
    });

    it('pins the override at the top so it overrides the discovery layer', () => {
      // The discovery layer (DISCOVERY_AND_PHILOSOPHY) starts with the
      // string `# OD core directives`. The API-mode override must appear
      // BEFORE that header — otherwise the discovery layer's own
      // "these override anything later" preamble wins precedence and
      // re-enables TodoWrite/Read/Write/Edit/Bash mentions later in the
      // prompt.
      const prompt = composeSystemPrompt({ streamFormat: 'plain' });
      const overrideIdx = prompt.search(/API mode — no tools available/i);
      const discoveryIdx = prompt.indexOf('# OD core directives');
      expect(overrideIdx).toBeGreaterThanOrEqual(0);
      expect(discoveryIdx).toBeGreaterThanOrEqual(0);
      expect(overrideIdx).toBeLessThan(discoveryIdx);
    });

    it('names every tool the agent must not pretend to call', () => {
      const prompt = composeSystemPrompt({ streamFormat: 'plain' });
      // Each tool the discovery layer / base prompt assumes is available
      // must be explicitly listed as unavailable so the model knows the
      // later instructions are describing daemon-mode behavior.
      expect(prompt).toMatch(/\bTodoWrite\b/);
      expect(prompt).toMatch(/\bRead\b/);
      expect(prompt).toMatch(/\bWrite\b/);
      expect(prompt).toMatch(/\bEdit\b/);
      expect(prompt).toMatch(/\bBash\b/);
      expect(prompt).toMatch(/\bWebFetch\b/);
    });

    it('forbids the pseudo-tool markup observed in #313 (`<todo-list>` and `[读取 ...]`)', () => {
      const prompt = composeSystemPrompt({ streamFormat: 'plain' });
      expect(prompt).toMatch(/<todo-list>/);
      expect(prompt).toMatch(/\[读取/);
    });

    it('tells the agent to state its plan in prose instead of pretending to call TodoWrite', () => {
      const prompt = composeSystemPrompt({ streamFormat: 'plain' });
      expect(prompt).toMatch(/state.*plan.*prose|describe.*plan.*prose|plan.*as prose/i);
    });

    it('explicitly invalidates later "call TodoWrite" / tool-use instructions', () => {
      const prompt = composeSystemPrompt({ streamFormat: 'plain' });
      // The override must say "ignore later instructions that tell you to
      // call <tool>" — otherwise the discovery layer's RULE 3 "your first
      // tool call is TodoWrite" still applies.
      expect(prompt).toMatch(/override|ignore|do not follow/i);
      expect(prompt).toMatch(/later instructions|rules below|rest of this prompt|elsewhere/i);
    });

    it('still allows <artifact> HTML output', () => {
      const prompt = composeSystemPrompt({ streamFormat: 'plain' });
      expect(prompt).toMatch(/<artifact>/);
    });

    it('requires slide API runs to produce the deck artifact, not just a plan', () => {
      const prompt = composeSystemPrompt({
        streamFormat: 'plain',
        skillMode: 'deck',
        mediaExecution: { mode: 'disabled' },
      });

      expect(prompt).toContain('Teamver embed — slide deck scope only');
      expect(prompt).toContain('turn-1 quick brief');
      expect(prompt).toContain('UI-locale line');
      expect(prompt).toContain('Localize title');
      expect(prompt).toContain('title="빠른 질문"');
      expect(prompt).toContain('"submitLabel": "이대로 만들기"');
      expect(prompt).not.toContain('# OD core directives');
      expect(prompt).not.toContain('Artifact handoff');
      expect(prompt).toContain('For slide deck / presentation / PPT requests in API mode');
      expect(prompt).toContain('the plan is not the deliverable');
      expect(prompt).toContain('include the complete HTML deck artifact in this same response');
      expect(prompt).toContain('Teamver slide-only API deliverable rule');
      expect(prompt).toContain('your same response MUST include exactly one complete `<artifact type="deck" identifier="deck">...</artifact>` block');
      expect(prompt).toContain('optional: one tiny user-visible UI-locale status sentence tailored to the brief');
      expect(prompt).toContain('optional: one tiny brief-specific UI-locale status sentence');
      expect(prompt).toContain('Stream promptly');
      expect(prompt).toContain('Do not wait silently');
      expect(prompt).toContain('Artifact-only is OK for speed/tokens');
      expect(prompt).toContain('Never start a Teamver deck with `<artifact type="text/html"`');
      expect(prompt).not.toContain('Never open `<artifact type="deck">` until the complete deck is ready');
      expect(prompt).toContain('Teamver API — deck framework emission override');
      expect(prompt).toContain('API compact contract');
      expect(prompt).toContain('<artifact type="deck" identifier="deck">');
      // Allow short kit <style>/@import; still forbid empty/long head chrome.
      expect(prompt).toMatch(/never an empty shell or long `<head>` chrome|Do not add `<head>`/);
      expect(prompt).toContain('<body><section class="slide"');
      expect(prompt).not.toContain('Copy the canonical skeleton below as index.html');
      // Ceiling grew again for existing-deck image/surgical-edit rules so
      // "put this image on page N" does not greenfield a 2-slide rewrite.
      expect(prompt.length).toBeLessThan(27_000);
    });

    it('keeps compact deck for skill-seed projects without raw template copy workflow', () => {
      const prompt = composeSystemPrompt({
        streamFormat: 'plain',
        skillMode: 'deck',
        skillName: 'simple-deck',
        skillBody:
          '# simple-deck\n\nCopy assets/template.html and fill SLOT comments.\nSee also references/layouts.md.\n',
        mediaExecution: { mode: 'disabled' },
      });

      expect(prompt).toContain('API compact contract');
      expect(prompt).toContain('Teamver API — deck framework emission override');
      expect(prompt).toContain('Visual style reference');
      expect(prompt).toContain('API-safe skill summary only');
      expect(prompt).not.toContain('Read `assets/template.html`');
      expect(prompt).not.toContain('Teamver API — skill seed override');
    });

    // Regression coverage for the unified ask-user flow: API/BYOK mode must
    // route mid-conversation clarification through the same `<question-form>`
    // Questions-tab surface as daemon mode, not fall back to plain-text
    // markdown option lists. The API-mode allowed-output list must NOT scope
    // `<question-form>` to turn-1 only, and the composer must carry the
    // daemon-mirrored "Clarifying questions mid-conversation" guidance.
    it('permits mid-conversation clarification forms, not just turn-1 discovery', () => {
      const prompt = composeSystemPrompt({ streamFormat: 'plain' });
      expect(prompt).toContain('Clarifying questions mid-conversation');
      expect(prompt).toMatch(/discovery \(turn 1\) and for mid-conversation clarification/);
      // The old turn-1-only allowance must be gone so it can't re-scope the
      // form back to discovery in BYOK/API runs.
      expect(prompt).not.toContain('blocks for discovery on turn 1, exactly');
    });

    it('treats pre-fetched URL context as readable reference material in no-tools API mode', () => {
      const prompt = composeSystemPrompt({ streamFormat: 'plain' });
      expect(prompt).toContain('<web-fetch-context>');
      expect(prompt).toContain('fetched URL text');
      expect(prompt).toContain("don't say URL inaccessible");
    });

    it('honors metadata.skipDiscoveryBrief before the discovery rules', () => {
      const prompt = composeSystemPrompt({
        streamFormat: 'plain',
        metadata: { kind: 'prototype', skipDiscoveryBrief: true },
      });
      const skipIdx = prompt.indexOf(SKIP_DISCOVERY_BRIEF_OVERRIDE);
      const discoveryIdx = prompt.indexOf('# OD core directives');
      expect(skipIdx).toBeGreaterThanOrEqual(0);
      expect(skipIdx).toBeLessThan(discoveryIdx);
      expect(prompt).toMatch(/do NOT emit `?<question-form id="discovery">`?/i);
      expect(prompt).toContain('Do not emit any question form');
      expect(prompt).toContain('choose reasonable defaults for any missing details');
      expect(prompt).toContain('Site-ref:');
      expect(prompt).toContain('URL-only deck asks missing audience/purpose/tone/count/topics');
    });
  });

  describe('BYOK mode (streamFormat: plain + byokToolNames)', () => {
    const byokTools = ['web_fetch', 'generate_image', 'generate_speech', 'generate_video'] as const;

    it('injects BYOK tools override instead of the no-tools preamble', () => {
      const prompt = composeSystemPrompt({ streamFormat: 'plain', byokToolNames: byokTools });
      expect(prompt).toMatch(/API mode — BYOK tools available/i);
      expect(prompt).not.toMatch(/API mode — no tools available/i);
    });

    it('lists wired BYOK tool names including web_fetch', () => {
      const prompt = composeSystemPrompt({ streamFormat: 'plain', byokToolNames: byokTools });
      expect(prompt).toContain('`web_fetch`');
      expect(prompt).toContain('`generate_image`');
      expect(prompt).toMatch(/call `web_fetch` with the absolute URL/i);
      expect(prompt).toMatch(/I can't read URLs/i);
      expect(prompt).toContain('<web-fetch-context>');
      expect(prompt).toContain('fetched URL text');
    });

    it('pins the BYOK override above the discovery layer', () => {
      const prompt = composeSystemPrompt({ streamFormat: 'plain', byokToolNames: byokTools });
      const overrideIdx = prompt.search(/API mode — BYOK tools available/i);
      const discoveryIdx = prompt.indexOf('# OD core directives');
      expect(overrideIdx).toBeGreaterThanOrEqual(0);
      expect(discoveryIdx).toBeGreaterThanOrEqual(0);
      expect(overrideIdx).toBeLessThan(discoveryIdx);
    });

    it('requires BYOK slide runs to produce the deck artifact, not just a plan', () => {
      const prompt = composeSystemPrompt({
        streamFormat: 'plain',
        byokToolNames: byokTools,
        skillMode: 'deck',
        mediaExecution: { mode: 'disabled' },
      });

      // Slide-only runs use the dedicated lean composer (no BYOK tool list —
      // media is disabled and the deliverable is always an HTML deck).
      expect(prompt).toContain('unified streaming rule');
      expect(prompt).toContain('Teamver slide-only API deliverable rule');
      expect(prompt).toContain('your same response MUST include exactly one complete `<artifact type="deck" identifier="deck">...</artifact>` block');
      expect(prompt).not.toContain('API mode — BYOK tools available');
    });
  });

  // Regression coverage for #3257 — example-prompt discovery skip must be
  // honored in API/BYOK mode (which composes prompts through this contracts
  // composer), not only in daemon-backed runs. Without the examplePrompt
  // handling here, the same unmodified gallery prompt skipped discovery in
  // daemon mode but still asked discovery questions in API mode.
  describe('example prompt mode (#3257)', () => {
    it('injects the example-prompt override and skips discovery when metadata.examplePrompt is true', () => {
      const prompt = composeSystemPrompt({
        metadata: { kind: 'prototype', examplePrompt: true },
      });
      expect(prompt).toContain('Example prompt mode — full-quality direct generation');
      expect(prompt).toMatch(/do NOT emit `?<question-form id="discovery">`?/i);
    });

    it('interpolates the curated title and pre-filled brief', () => {
      const prompt = composeSystemPrompt({
        metadata: {
          kind: 'prototype',
          examplePrompt: true,
          examplePromptTitle: 'Neon dashboard',
          examplePromptBrief: { target_audience: 'developers', fidelity: 'high' },
        },
      });
      expect(prompt).toContain('Selected example: "Neon dashboard"');
      expect(prompt).toContain('target audience: developers');
      expect(prompt).toContain('fidelity: high');
    });

    it('pins the example-prompt override above the discovery layer in API mode', () => {
      const prompt = composeSystemPrompt({
        streamFormat: 'plain',
        metadata: { kind: 'prototype', examplePrompt: true },
      });
      const overrideIdx = prompt.indexOf('Example prompt mode — full-quality direct generation');
      const discoveryIdx = prompt.indexOf('# OD core directives');
      expect(overrideIdx).toBeGreaterThanOrEqual(0);
      expect(overrideIdx).toBeLessThan(discoveryIdx);
    });

    it('prefers the example-prompt override over the plain skip-discovery override', () => {
      const prompt = composeSystemPrompt({
        metadata: { kind: 'prototype', examplePrompt: true, skipDiscoveryBrief: true },
      });
      expect(prompt).toContain('Example prompt mode — full-quality direct generation');
      expect(prompt).not.toContain(SKIP_DISCOVERY_BRIEF_OVERRIDE);
    });
  });

  describe('composeTeamverSlideApiPrompt (dedicated slide-only API path)', () => {
    const simpleDeckSkill =
      '# simple-deck\n\nRead assets/template.html and copy SLOT comments.\n'
      + 'Use references/layouts.md for structure.\n';

    it('routes composeSystemPrompt through the dedicated lean composer', () => {
      const prompt = composeSystemPrompt({
        streamFormat: 'plain',
        skillMode: 'deck',
        skillName: 'simple-deck',
        skillBody: simpleDeckSkill,
        mediaExecution: { mode: 'disabled' },
      });
      expect(prompt).toContain('unified streaming rule');
      expect(prompt).not.toContain('# OD core directives');
      expect(prompt).not.toContain('Artifact handoff');
      expect(prompt).not.toContain('Read `assets/template.html`');
      // Budget guard for the lean slide-only API composer. Measured ~25k
      // after existing-deck image embed + comment-edit patch contracts landed;
      // those prevent 8→2 slide collapse / 60–120s full-deck rewrites, so the
      // cost is intentional. Keep a small headroom for copy tweaks.
      expect(prompt.length).toBeLessThan(27_000);
      expect(prompt.length).toBeGreaterThan(18_000);
    });

    it('requires body-first streaming and forbids head-only shells', () => {
      const prompt = composeTeamverSlideApiPrompt({
        skillBody: simpleDeckSkill,
        skillName: 'simple-deck',
        metadata: { kind: 'deck' },
      });
      expect(prompt).toContain('unified streaming rule');
      expect(prompt).toContain('Turn 1');
      expect(prompt).toContain('question-form id="discovery"');
      expect(prompt).toContain('never an empty shell or long `<head>` chrome');
      expect(prompt).toContain('abandon that output');
      expect(prompt).toContain('API compact contract');
      expect(prompt).toContain('optional tiny UI-locale status sentence');
      expect(prompt).toContain('Artifact-only is OK for speed/tokens');
      expect(prompt).toContain('inline layout vocabulary');
      expect(prompt).toContain('split thesis, timeline, quote');
      expect(prompt).toContain('Selected deck template look');
      expect(prompt).toContain('secondary brand context only');
      expect(prompt).toContain('bind quick-brief answers');
      expect(prompt).toContain('Alternate light/dark');
      expect(prompt).not.toContain('assets/template.html');
    });

    it('uses direct deck generation when discovery is intentionally skipped', () => {
      const prompt = composeTeamverSlideApiPrompt({
        skillBody: simpleDeckSkill,
        skillName: 'simple-deck',
        metadata: { kind: 'deck', skipDiscoveryBrief: true },
      });

      // Teamver uses a dedicated skip-discovery block (no Site-ref exception
      // that fights DIRECT_STREAMING's "do NOT emit question-form").
      expect(prompt).toContain('Canvas → Slide / Drive → Slide / automated brief');
      expect(prompt).not.toContain('Site-ref:');
      expect(prompt).not.toContain('URL-only deck asks missing audience/purpose/tone/count/topics');
      expect(prompt).toContain('direct deck generation rule');
      expect(prompt).toContain('inline layout vocabulary');
      expect(prompt).toContain('optional tiny UI-locale status sentence');
      expect(prompt).toContain('Artifact-only is OK for speed/tokens');
      expect(prompt).not.toContain('bind quick-brief answers');
      expect(prompt).toContain('<artifact type="deck" identifier="deck">');
      expect(prompt).toContain('Never `type="text/html"`');
      expect(prompt).toContain('choose reasonable defaults and proceed without asking a discovery form');
      expect(prompt).toContain('use 6-8 slides only if no Plugin inputs / user brief specifies a count');
      expect(prompt).toContain('omit unless requested');
      expect(prompt).toContain('width:1920px;height:1080px');
      expect(prompt).toContain('Stream promptly');
      expect(prompt).not.toContain('until the complete filled deck is ready in one shot');
      expect(prompt).not.toContain('unified streaming rule');
      expect(prompt).not.toContain('Turn 1 (first user message, no prior form answers)');
      expect(prompt).not.toContain('unknown — ask');
      expect(prompt).not.toContain('assets/template.html');
    });

    it('preserves theme-rhythm hints from skill body while stripping copy workflow lines', () => {
      const skillWithRhythm =
        '# simple-deck\n\nRead assets/template.html first.\n'
        + '## Theme rhythm\n'
        + 'Alternate light and dark slides — no 3+ light slides in a row.\n'
        + 'See references/layouts.md for cover and big-stat layouts.\n';

      const prompt = composeTeamverSlideApiPrompt({
        skillBody: skillWithRhythm,
        skillName: 'simple-deck',
        metadata: { kind: 'deck' },
      });

      expect(prompt).toContain('Theme rhythm');
      expect(prompt).toContain('Alternate light and dark slides');
      expect(prompt).toContain('compact inline layout vocabulary');
      expect(prompt).toContain('typography mood');
      expect(prompt).toContain('avoid generic title-plus-bullets');
      expect(prompt).not.toContain('Read assets/template.html');
      expect(prompt).not.toContain('See references/layouts.md for cover');
      expect(prompt).toContain('you cannot Read that file in API mode');
    });

    it('adds a compact selected-template visual signature without pasting the template', () => {
      const prompt = composeTeamverSlideApiPrompt({
        skillBody: simpleDeckSkill,
        skillName: 'simple-deck',
        metadata: { kind: 'deck', skipDiscoveryBrief: true },
        template: {
          id: 'zhangzara-capsule',
          name: 'Html Ppt Zhangzara Capsule',
          description: 'Warm paper editorial deck with capsule labels and centered serif moments.',
          createdAt: 1,
          files: [
            {
              name: 'example.html',
              content:
                '<!doctype html><html><head><style>'
                + ':root{--paper:#F3E7D0;--ink:#17130F;--accent:#FACC15}'
                + 'body{font-family:"Pretendard", sans-serif}.slide{display:grid;grid-template-columns:1fr 1fr;border-radius:18px;letter-spacing:.02em}'
                + '</style></head><body>'
                + '<section class="slide capsule hero"><h1>Do not paste this exact headline</h1></section>'
                + '</body></html>',
            },
          ],
        },
      });

      expect(prompt).toContain('Selected template visual signature — Html Ppt Zhangzara Capsule');
      expect(prompt).toContain('palette cues: #F3E7D0, #17130F, #FACC15');
      expect(prompt).toContain('font cues: "Pretendard", sans-serif');
      expect(prompt).toContain('class/style cues: slide, capsule, hero');
      expect(prompt).toContain('layout cues: display:grid, grid-template-columns, border-radius, letter-spacing');
      expect(prompt).toContain('Must match template palette');
      expect(prompt).toContain('Template beats samples');
      expect(prompt).toContain('Use inline styles');
      expect(prompt).toContain('Do not copy full skeleton');
      expect(prompt.indexOf('Selected template visual signature — Html Ppt Zhangzara Capsule')).toBeLessThan(
        prompt.indexOf('Slide deck — API compact contract'),
      );
      expect(prompt).not.toContain('Do not paste this exact headline');
      // Ceiling grew for content-expansion + existing-deck image/surgical-edit rules + fill.
      expect(prompt.length).toBeLessThan(27_000);
    });

    it('keeps quick brief available when a selected template supplies style but not content brief', () => {
      const prompt = composeTeamverSlideApiPrompt({
        skillBody: simpleDeckSkill,
        skillName: 'simple-deck',
        metadata: { kind: 'deck' },
        template: {
          id: 'zhangzara-capsule',
          name: 'Html Ppt Zhangzara Capsule',
          description: 'Warm paper editorial deck.',
          createdAt: 1,
          files: [
            {
              name: 'example.html',
              content: '<section class="slide capsule"><h1>Template title</h1></section>',
            },
          ],
        },
      });

      expect(prompt).toContain('Selected template visual signature — Html Ppt Zhangzara Capsule');
      expect(prompt).toContain('Style only');
      expect(prompt).toContain('content brief comes from the user message / Plugin inputs / discovery answers');
      // Discovery still comes from Teamver turn-1 / unified rules — not from
      // a conflicting "ask quick brief" line inside the visual signature.
      expect(prompt).toContain('unified streaming rule');
      expect(prompt).toContain('question-form id="discovery"');
      expect(prompt).not.toContain('direct deck generation rule');
    });

    it('extracts mandatory visual cues from the selected design-template skill body', () => {
      const prompt = composeTeamverSlideApiPrompt({
        skillName: 'Html Ppt Hermes Cyber Terminal',
        skillBody:
          '# Html Ppt Hermes Cyber Terminal\n\n'
          + '<style>:root{--bg:#0A0C10;--accent:#7ED3A4}'
          + 'body{font-family:"JetBrains Mono", monospace}'
          + '.slide{display:grid;letter-spacing:.08em;text-transform:uppercase}'
          + '</style><section class="slide terminal scanline"></section>',
        metadata: { kind: 'deck', skipDiscoveryBrief: true },
      });

      expect(prompt).toContain('Selected design template visual signature — Html Ppt Hermes Cyber Terminal');
      expect(prompt).toContain('palette cues: #0A0C10, #7ED3A4');
      expect(prompt).toContain('font cues: "JetBrains Mono", monospace');
      expect(prompt).toContain('class/style cues: slide, terminal, scanline');
      expect(prompt).toContain('layout cues: display:grid, letter-spacing, text-transform');
      expect(prompt).toContain('Must match template palette');
      expect(prompt).toContain('match its visual kit');
      expect(prompt).toContain('must not override the template look');
      expect(prompt).toContain('do not merely describe the template');
      expect(prompt).toContain('Template is the visual contract');
      expect(prompt.indexOf('Selected design template visual signature — Html Ppt Hermes Cyber Terminal')).toBeLessThan(
        prompt.indexOf('Slide deck — API compact contract'),
      );
      expect(prompt.indexOf('Visual style reference — Html Ppt Hermes Cyber Terminal')).toBeLessThan(
        prompt.indexOf('Slide deck — API compact contract'),
      );
      // Ceiling grew for content-expansion + existing-deck image/surgical-edit rules + fill.
      expect(prompt.length).toBeLessThan(27_000);
    });

    it('keeps richer visual template rules while stripping unavailable copy workflows', () => {
      const prompt = composeTeamverSlideApiPrompt({
        skillName: 'Html Ppt Zhangzara Editorial',
        skillBody:
          '# Html Ppt Zhangzara Editorial\n\n'
          + 'Read assets/template.html and copy the skeleton.\n'
          + 'Palette: warm paper background, black ink, coral accent chips.\n'
          + 'Typography: elegant serif hero titles with small mono metadata labels.\n'
          + 'Layout rhythm: editorial magazine spreads, high whitespace, asymmetric grid.\n'
          + 'Density: restrained copy, oversized section numbers, thin rule lines.\n'
          + 'Accent treatment: capsule labels, small corner notes, subtle paper grain.\n'
          + 'Use references/layouts.md for exact slots.\n',
        metadata: { kind: 'deck', skipDiscoveryBrief: true },
      });

      expect(prompt).toContain('Palette: warm paper background');
      expect(prompt).toContain('Typography: elegant serif hero titles');
      expect(prompt).toContain('Layout rhythm: editorial magazine spreads');
      expect(prompt).toContain('Accent treatment: capsule labels');
      expect(prompt).toContain('Template is the visual contract');
      expect(prompt.indexOf('Visual style reference — Html Ppt Zhangzara Editorial')).toBeLessThan(
        prompt.indexOf('Slide deck — API compact contract'),
      );
      expect(prompt).not.toContain('Read assets/template.html and copy the skeleton');
      expect(prompt).not.toContain('Use references/layouts.md for exact slots');
      // Ceiling grew for existing-deck image/surgical-edit rules.
      expect(prompt.length).toBeLessThan(27_000);
    });

    it('appends Motif-AFTER-title READ LAST on template clone fill turns', () => {
      const prompt = composeTeamverSlideApiPrompt({
        skillBody:
          '## Template visual kit (from example.html)\n\n'
          + '### Slide surface\n\n**background**: `#F5F0E6`\n\n'
          + '### Motif sprites\n\n```html\n<svg viewBox="0 0 10 10"></svg>\n```\n',
        skillName: 'Html Ppt Zhangzara Daisy Days',
        metadata: {
          kind: 'deck',
          skipDiscoveryBrief: true,
          selectedDeckTemplateId: 'example-html-ppt-zhangzara-daisy-days',
        },
        templateCloneContentFill: true,
      });
      expect(prompt).toContain('Template clone fill — Motif AFTER title');
      expect(prompt).toMatch(/deco-pill|kit'?s? Motif vocabulary/i);
      expect(prompt).toMatch(/Never invent generic CSS circles/i);
      expect(prompt.indexOf('Template clone fill — Motif AFTER title')).toBeGreaterThan(
        prompt.indexOf('Selected deck template visual — READ LAST'),
      );
      expect(prompt).toMatch(/Motif vocabulary REQUIRED|kit Motif AFTER title/i);
      expect(prompt).toMatch(/Motif sprites \(capped for first content-fill/i);
      expect(prompt).toMatch(/<svg\b/i);
    });

    it('omits comment-edit / existing-deck contracts on greenfield turns', () => {
      const prompt = composeTeamverSlideApiPrompt({
        skillBody: simpleDeckSkill,
        skillName: 'simple-deck',
        metadata: { kind: 'deck', skipDiscoveryBrief: true },
      });
      // Full READ LAST edit contracts are gated off; deliverable override may
      // still mention patch types briefly for existing-deck anti-patterns.
      expect(prompt).not.toContain('comment-edit patch');
      expect(prompt).not.toContain('existing-deck image embed');
      expect(prompt).not.toContain('Teamver slide-only API — comment-edit patch');
      expect(prompt).not.toContain('Teamver slide-only API — existing-deck image embed');
    });

    it('carries the comment-edit element-patch contract when FE gates it on', () => {
      const unified = composeTeamverSlideApiPrompt({
        skillBody: simpleDeckSkill,
        skillName: 'simple-deck',
        metadata: { kind: 'deck' },
        includeCommentEditPatchRule: true,
      });
      const direct = composeTeamverSlideApiPrompt({
        skillBody: simpleDeckSkill,
        skillName: 'simple-deck',
        metadata: { kind: 'deck', skipDiscoveryBrief: true },
        includeCommentEditPatchRule: true,
      });
      for (const prompt of [unified, direct]) {
        expect(prompt).toContain('comment-edit patch');
        expect(prompt).toContain('<artifact type="element-patch"');
        expect(prompt).toContain('target-id');
        expect(prompt).toContain('slide-index');
        expect(prompt).toContain('<artifact type="deck-patch"');
        expect(prompt).toContain('<artifact type="deck">');
      }
    });

    it('emits the FULL wrapped template body under Selected deck template (not the 18-line summary) when metadata pins selectedDeckTemplateId', () => {
      // Regression: the previous compose called summarizeApiModeSkillBody
      // for every skillBody in this dedicated Teamver slide-only API path
      // — that helper strips lines matching copy/paste/read + reprioritizes
      // + truncates to 18 lines. For Canvas → Slide runs the FE has
      // already wrapped the picked template's SKILL.md body (with a
      // `## Visual summary` block sourced from the SKILL.md frontmatter
      // description) as skillBody, and the summarizer routinely dropped
      // the palette / typography / motif spec. Result: the deck came back
      // looking generic even though [selected-deck-template] logs said
      // the body 'loaded'.
      const wrappedSkillBody = [
        '# Teamver selected deck template guard',
        '',
        'Template: Html Ppt Hermes Cyber Terminal',
        '',
        '--- Template specification follows ---',
        '',
        '## Visual summary (from template frontmatter)',
        '',
        '暗终端 honest-review deck — #0a0c10 黑底 + 56px 赛博网格 + CRT 暗角 + 扫描线、`$` 命令行标题、薄荷绿 #7ed3a4 大字、JetBrains Mono、stroke-only 柱状图、blinking 光标。',
        '',
        '# HTML PPT · 암터미널 측평',
        '',
        '## How to author the deck',
        '',
        '1. Read the master skill first.',
        '2. Start from templates/full-decks/hermes-cyber-terminal/ — copy index.html.',
        '3. Bring the shared runtime: copy assets/base.css, assets/runtime.js.',
      ].join('\n');
      const prompt = composeTeamverSlideApiPrompt({
        skillName: 'Html Ppt Hermes Cyber Terminal',
        skillBody: wrappedSkillBody,
        metadata: {
          kind: 'deck',
          skipDiscoveryBrief: true,
          selectedDeckTemplateId: 'example-html-ppt-hermes-cyber-terminal',
          selectedDeckTemplateTitle: 'Html Ppt Hermes Cyber Terminal',
        },
      });

      // The dedicated `## Selected deck template` header replaces the
      // generic `## Visual summary style reference` header when metadata
      // pins a template — this is what tells the model 'this is the
      // primary visual contract, match it exactly'.
      expect(prompt).toContain('## Selected deck template — Html Ppt Hermes Cyber Terminal — MUST MATCH THIS VISUAL SPEC');
      // The visual summary — including the CJK description — must survive
      // verbatim so the model has the concrete palette / typography /
      // motif spec to reproduce.
      expect(prompt).toContain('## Visual summary (from template frontmatter)');
      expect(prompt).toContain('#0a0c10');
      expect(prompt).toContain('#7ed3a4');
      expect(prompt).toContain('JetBrains Mono');
      expect(prompt).toContain('赛博网格');
      // The wrap guard prose survives verbatim (was dropped by the
      // summarizer's 18-line ceiling).
      expect(prompt).toContain('# Teamver selected deck template guard');
      expect(prompt).toContain('--- Template specification follows ---');
      // Old summarized header must NOT appear when a template is pinned —
      // otherwise the model sees two competing visual references.
      expect(prompt).not.toContain('Visual style reference — Html Ppt Hermes Cyber Terminal');
    });

    it('falls back to the summarized `Visual style reference` header when no selectedDeckTemplateId is set (default scenario path)', () => {
      // Default scenario body (simple-deck etc.) still runs through the
      // summarizer — those bodies do contain 'copy assets/template.html'
      // workflow noise that would confuse the API-mode model, so
      // summarization is still the right default.
      const prompt = composeTeamverSlideApiPrompt({
        skillName: 'Simple Deck',
        skillBody: 'Palette: navy #0a1930 with white text. Typography: elegant serif.',
        metadata: { kind: 'deck', skipDiscoveryBrief: true },
      });
      expect(prompt).toContain('Visual style reference — Simple Deck');
      expect(prompt).not.toContain('Selected deck template — Simple Deck');
    });

    it('keeps the FULL template body when Visual summary is present even if selectedDeckTemplateId is missing (metadata race)', () => {
      // Canvas/Drive confirm patches project metadata then sends on the same
      // tick. React `project.metadata` can still lack selectedDeckTemplateId
      // while the FE has already loaded the template body (with the
      // frontmatter visual summary prepended). Summarizing in that window
      // is what made "템플릿 적용 안 됨" survive the metadata-only guard.
      const wrappedSkillBody = [
        '# Teamver selected deck template guard',
        '',
        'Template: Html Ppt Hermes Cyber Terminal',
        '',
        '--- Template specification follows ---',
        '',
        '## Visual summary (from template frontmatter)',
        '',
        '暗终端 honest-review deck — #0a0c10 黑底 + 薄荷绿 #7ed3a4 + JetBrains Mono.',
        '',
        '# HTML PPT · hermes',
      ].join('\n');
      const prompt = composeTeamverSlideApiPrompt({
        skillName: 'Html Ppt Hermes Cyber Terminal',
        skillBody: wrappedSkillBody,
        metadata: { kind: 'deck', skipDiscoveryBrief: true },
      });
      expect(prompt).toContain('## Selected deck template — Html Ppt Hermes Cyber Terminal — MUST MATCH THIS VISUAL SPEC');
      expect(prompt).toContain('## Visual summary (from template frontmatter)');
      expect(prompt).toContain('#0a0c10');
      expect(prompt).toContain('#7ed3a4');
      expect(prompt).not.toContain('Visual style reference — Html Ppt Hermes Cyber Terminal');
    });

    it('forces existing-deck image edits to preserve all slides via deck-patch when gated on', () => {
      const unified = composeTeamverSlideApiPrompt({
        skillBody: simpleDeckSkill,
        skillName: 'simple-deck',
        metadata: { kind: 'deck' },
        includeExistingDeckImageEditRule: true,
      });
      const direct = composeTeamverSlideApiPrompt({
        skillBody: simpleDeckSkill,
        skillName: 'simple-deck',
        metadata: { kind: 'deck', skipDiscoveryBrief: true },
        includeExistingDeckImageEditRule: true,
      });
      for (const prompt of [unified, direct]) {
        expect(prompt).toContain('existing-deck image embed');
        expect(prompt).toContain('Existing-deck edits');
        expect(prompt).toContain('NEVER reduce');
        expect(prompt).toContain('do not turn an 8-slide deck into 2 slides');
        expect(prompt).toContain('greenfield 2-slide wireframe');
        expect(prompt).toContain('[Attached image embed]');
        expect(prompt).toContain('[Existing deck edit]');
      }
    });

    it('requires kit Motif vocabulary AFTER title on Clone content-fill turns', () => {
      const kitBody = [
        '# Teamver selected deck template guard',
        '',
        '## Template visual kit (from example.html) — Daisy',
        '',
        '### Motif sprites (capped for first content-fill — AFTER title/lead only)',
        '',
        '```html',
        '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>',
        '```',
        '',
        '### Palette cues: #F5F0E6',
      ].join('\n');
      const fill = composeTeamverSlideApiPrompt({
        skillName: 'Daisy Days',
        skillBody: kitBody,
        metadata: {
          kind: 'deck',
          skipDiscoveryBrief: true,
          selectedDeckTemplateId: 'example-html-ppt-zhangzara-daisy-days',
        },
        templateCloneContentFill: true,
      });
      const normal = composeTeamverSlideApiPrompt({
        skillName: 'Daisy Days',
        skillBody: kitBody,
        metadata: {
          kind: 'deck',
          skipDiscoveryBrief: true,
          selectedDeckTemplateId: 'example-html-ppt-zhangzara-daisy-days',
        },
      });
      expect(fill).toContain('READ LAST (first content-fill)');
      expect(fill).toMatch(/Motif vocabulary \(required\)|kit Motif vocabulary/i);
      expect(fill).toContain('OD-style CREATE, kit Motif AFTER title');
      expect(fill).toMatch(/Never invent generic CSS circles|FORBIDDEN substitutes/i);
      expect(fill).not.toContain('Copy Motif sprites verbatim');
      expect(normal).not.toContain('Copy Motif sprites verbatim');
      expect(normal).toContain('Motif budget');
      expect(normal).toContain('at most one short SVG snippet after visible title/body copy starts');
    });
  });
});
