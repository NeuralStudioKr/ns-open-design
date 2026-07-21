import { describe, expect, it } from 'vitest';
import {
  AUTO_CONTINUE_ENTRY_FROM,
  AUTO_CONTINUE_INCOMPLETE_OUTPUT_PROMPT,
  AUTO_CONTINUE_MAX_PER_CONVERSATION,
  AUTO_CONTINUE_STATUS_CODE,
  RESUME_CONTINUE_PROMPT,
  buildAutoContinueIncompleteOutputPrompt,
  extractAutoContinueContextFromAssistant,
  isLiveLocalStreamBlockingAutoContinue,
  rollbackAutoContinueCount,
  shouldAutoContinueForIncompleteOutput,
} from '../../src/runtime/resume';

describe('runtime/resume shell/no-HTML recovery constants', () => {
  it('exports a manual resume prompt distinct from the automatic-continue prompt', () => {
    expect(RESUME_CONTINUE_PROMPT).not.toEqual(AUTO_CONTINUE_INCOMPLETE_OUTPUT_PROMPT);
    expect(RESUME_CONTINUE_PROMPT.length).toBeGreaterThan(0);
    expect(AUTO_CONTINUE_INCOMPLETE_OUTPUT_PROMPT.length).toBeGreaterThan(0);
  });

  it('scopes the auto-continue cap to three retries per conversation', () => {
    expect(AUTO_CONTINUE_MAX_PER_CONVERSATION).toBe(3);
    expect(Number.isInteger(AUTO_CONTINUE_MAX_PER_CONVERSATION)).toBe(true);
    expect(AUTO_CONTINUE_MAX_PER_CONVERSATION).toBeGreaterThanOrEqual(1);
  });

  it('uses a distinct analytics entry-from for the automatic continue', () => {
    expect(AUTO_CONTINUE_ENTRY_FROM).toBe('auto_continue_incomplete_output');
    expect(AUTO_CONTINUE_ENTRY_FROM).not.toBe('resume_continue');
  });

  it('exposes a stable status-event code the assistant renderer can match', () => {
    expect(AUTO_CONTINUE_STATUS_CODE).toBe('auto_continue_incomplete_output');
  });

  it('instructs the model to keep prior work when auto-continuing', () => {
    expect(AUTO_CONTINUE_INCOMPLETE_OUTPUT_PROMPT).toMatch(/만들지 못하고|no usable slide deck/i);
    expect(AUTO_CONTINUE_INCOMPLETE_OUTPUT_PROMPT).toMatch(/artifact type="text\/html"/);
    expect(AUTO_CONTINUE_INCOMPLETE_OUTPUT_PROMPT).toMatch(/계획을 다시 설명|no further planning|Do not restart/i);
  });

  it('escalates the prompt on later automatic-continue attempts', () => {
    const first = buildAutoContinueIncompleteOutputPrompt({ attempt: 1 });
    const second = buildAutoContinueIncompleteOutputPrompt({ attempt: 2 });
    expect(first).toContain('앞선 응답이 슬라이드 결과물을');
    expect(second).toContain('FINAL RETRY');
    expect(second).not.toEqual(first);
  });

  it('threads partial HTML and plan outline into the auto-continue prompt', () => {
    const prompt = buildAutoContinueIncompleteOutputPrompt({
      attempt: 1,
      partialHtml: '<!doctype html><html><head>',
      planOutline: '슬라이드 구성:\n01 표지',
    });
    expect(prompt).toContain('```html');
    expect(prompt).toContain('<!doctype html>');
    expect(prompt).toContain('슬라이드 구성');
  });
});

describe('extractAutoContinueContextFromAssistant', () => {
  it('recovers partial artifact HTML and prose outline from assistant text', () => {
    const recovered = extractAutoContinueContextFromAssistant({
      content:
        '슬라이드 구성:\n01 표지\n<artifact type="text/html">\n<!doctype html><html><head>\n',
      events: [],
    });
    expect(recovered.planOutline).toContain('슬라이드 구성');
    expect(recovered.partialHtml).toContain('<!doctype html>');
  });
});

describe('shouldAutoContinueForIncompleteOutput', () => {
  const base = {
    runIsVisible: true,
    autoContinueCount: 0,
    terminalPersistResultKind: null as null,
    hadIncompleteParsedArtifact: false,
    shouldFailMissingSlideHtml: false,
  };

  it('fires for skipped-incomplete shells', () => {
    expect(
      shouldAutoContinueForIncompleteOutput({
        ...base,
        terminalPersistResultKind: 'skipped-incomplete',
      }),
    ).toBe(true);
  });

  it('fires for validation rejected artifacts', () => {
    expect(
      shouldAutoContinueForIncompleteOutput({
        ...base,
        terminalPersistResultKind: 'rejected',
      }),
    ).toBe(true);
  });

  it('fires when no persist ran but slide-missing / incomplete signals are set', () => {
    expect(
      shouldAutoContinueForIncompleteOutput({
        ...base,
        hadIncompleteParsedArtifact: true,
      }),
    ).toBe(true);
    expect(
      shouldAutoContinueForIncompleteOutput({
        ...base,
        shouldFailMissingSlideHtml: true,
      }),
    ).toBe(true);
  });

  it('does NOT fire for infra save-failed (content was fine)', () => {
    expect(
      shouldAutoContinueForIncompleteOutput({
        ...base,
        terminalPersistResultKind: 'save-failed',
        hadIncompleteParsedArtifact: true,
        shouldFailMissingSlideHtml: true,
      }),
    ).toBe(false);
  });

  it('does NOT fire when the run is not visible', () => {
    expect(
      shouldAutoContinueForIncompleteOutput({
        ...base,
        runIsVisible: false,
        terminalPersistResultKind: 'skipped-incomplete',
      }),
    ).toBe(false);
  });

  it('respects the per-conversation cap', () => {
    expect(
      shouldAutoContinueForIncompleteOutput({
        ...base,
        autoContinueCount: AUTO_CONTINUE_MAX_PER_CONVERSATION,
        terminalPersistResultKind: 'skipped-incomplete',
      }),
    ).toBe(false);
    expect(
      shouldAutoContinueForIncompleteOutput({
        ...base,
        autoContinueCount: AUTO_CONTINUE_MAX_PER_CONVERSATION - 1,
        terminalPersistResultKind: 'skipped-incomplete',
      }),
    ).toBe(true);
  });

  it('does NOT fire when nothing indicates content incompleteness', () => {
    expect(shouldAutoContinueForIncompleteOutput(base)).toBe(false);
  });
});

describe('isLiveLocalStreamBlockingAutoContinue', () => {
  it('blocks when a local AbortController is active', () => {
    expect(
      isLiveLocalStreamBlockingAutoContinue({
        abortController: new AbortController(),
        streamingConversationId: 'c1',
        targetConversationId: 'c1',
      }),
    ).toBe(true);
  });

  it('does NOT block same-conversation phantom streaming without abort', () => {
    expect(
      isLiveLocalStreamBlockingAutoContinue({
        abortController: null,
        streamingConversationId: 'c1',
        targetConversationId: 'c1',
      }),
    ).toBe(false);
  });

  it('blocks when a different conversation is streaming', () => {
    expect(
      isLiveLocalStreamBlockingAutoContinue({
        abortController: null,
        streamingConversationId: 'other',
        targetConversationId: 'c1',
      }),
    ).toBe(true);
  });

  it('does NOT block when nothing is streaming', () => {
    expect(
      isLiveLocalStreamBlockingAutoContinue({
        abortController: null,
        streamingConversationId: null,
        targetConversationId: 'c1',
      }),
    ).toBe(false);
  });
});

describe('rollbackAutoContinueCount', () => {
  it('decrements a consumed slot and floors at zero', () => {
    const counts = new Map<string, number>([['c1', 2]]);
    expect(rollbackAutoContinueCount(counts, 'c1')).toBe(1);
    expect(counts.get('c1')).toBe(1);
    expect(rollbackAutoContinueCount(counts, 'c1')).toBe(0);
    expect(rollbackAutoContinueCount(counts, 'c1')).toBe(0);
  });

  it('handles a missing key as a single consumed slot', () => {
    const counts = new Map<string, number>();
    expect(rollbackAutoContinueCount(counts, 'missing')).toBe(0);
    expect(counts.get('missing')).toBe(0);
  });
});
