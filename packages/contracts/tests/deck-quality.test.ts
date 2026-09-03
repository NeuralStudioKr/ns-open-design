import { describe, expect, it } from 'vitest';

import {
  SLIDE_DECK_CONTENT_EXPANSION_EXAMPLE,
  SLIDE_DECK_CONTENT_EXPANSION_INSTRUCTION,
} from '../src/prompts/deck-quality.js';
import { composeSystemPrompt } from '../src/prompts/system.js';

describe('slide deck content expansion', () => {
  it('forbids parroting the user brief as slide copy', () => {
    expect(SLIDE_DECK_CONTENT_EXPANSION_INSTRUCTION).toMatch(/brief is a topic, not slide text/i);
    expect(SLIDE_DECK_CONTENT_EXPANSION_INSTRUCTION).toMatch(/시니어 개발자/);
    expect(SLIDE_DECK_CONTENT_EXPANSION_INSTRUCTION).toMatch(/만들어줘/);
    expect(SLIDE_DECK_CONTENT_EXPANSION_EXAMPLE).toMatch(/brief is an instruction/i);
    expect(SLIDE_DECK_CONTENT_EXPANSION_EXAMPLE).toMatch(/failed deliverable/i);
    expect(SLIDE_DECK_CONTENT_EXPANSION_EXAMPLE).not.toMatch(/Expo for Senior Engineers|EAS Build/i);
  });

  it('is injected into Teamver skip-discovery system prompts', () => {
    const prompt = composeSystemPrompt({
      skillMode: 'deck',
      streamFormat: 'plain',
      mediaExecution: { mode: 'disabled' },
      sessionMode: 'design',
      metadata: {
        kind: 'deck',
        skipDiscoveryBrief: true,
      } as any,
    });
    expect(prompt).toContain(SLIDE_DECK_CONTENT_EXPANSION_INSTRUCTION);
    expect(prompt).toContain(SLIDE_DECK_CONTENT_EXPANSION_EXAMPLE);
    expect(prompt).toMatch(/parroting the user brief/);
  });
});
