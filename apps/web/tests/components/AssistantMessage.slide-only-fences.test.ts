import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

describe('slide-only assistant fence display stripping', () => {
  it('strips code fences for display even when slideOnlyMvp is on', () => {
    const assistant = readFileSync(
      join(here, '../../src/components/AssistantMessage.tsx'),
      'utf8',
    );
    // Display paths must not gate fence stripping on !slideOnlyMvp.
    expect(assistant).not.toMatch(
      /stripCodeFences:\s*hideStreamingCodeFences \|\| \(hideAssistantThinkingDetails && !slideOnlyMvp\)/,
    );
    expect(assistant).not.toMatch(
      /hideStreamingCodeFences=\{hideAssistantThinkingDetails && !slideOnlyMvp\}/,
    );
    expect(assistant).toContain(
      'stripCodeFences: hideStreamingCodeFences || hideAssistantThinkingDetails',
    );
  });

  it('keeps ProjectView live buffers from stripping fences in slide-only MVP', () => {
    // Artifact HTML often arrives in ```html fences; stripping in the live
    // buffer would break deck recovery. Display-only stripping is enough.
    const projectView = readFileSync(
      join(here, '../../src/components/ProjectView.tsx'),
      'utf8',
    );
    expect(projectView).toContain(
      'stripCodeFences: hideAssistantThinkingDetails && !slideOnlyMvp',
    );
  });
});
