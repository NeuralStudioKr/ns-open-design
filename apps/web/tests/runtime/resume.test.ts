import { describe, expect, it } from 'vitest';
import {
  AUTO_CONTINUE_ENTRY_FROM,
  AUTO_CONTINUE_INCOMPLETE_OUTPUT_PROMPT,
  AUTO_CONTINUE_MAX_PER_CONVERSATION,
  AUTO_CONTINUE_PROMPT_SENTINEL,
  AUTO_CONTINUE_STATUS_CODE,
  RESUME_CONTINUE_PROMPT,
  buildAutoContinueIncompleteOutputPrompt,
  extractAutoContinueContextFromAssistant,
  isAutoContinueIncompleteOutputPrompt,
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

  it('scopes the auto-continue prompt to this conversation/project only', () => {
    expect(AUTO_CONTINUE_INCOMPLETE_OUTPUT_PROMPT.startsWith(AUTO_CONTINUE_PROMPT_SENTINEL)).toBe(true);
    expect(AUTO_CONTINUE_INCOMPLETE_OUTPUT_PROMPT).toMatch(/이 대화\(현재 프로젝트\)/);
    expect(AUTO_CONTINUE_INCOMPLETE_OUTPUT_PROMPT).toMatch(/다른 프로젝트/);
    expect(AUTO_CONTINUE_INCOMPLETE_OUTPUT_PROMPT).toMatch(/artifact type="deck"/);
    expect(AUTO_CONTINUE_INCOMPLETE_OUTPUT_PROMPT).toMatch(/Never use `type="text\/html"`/);
    expect(AUTO_CONTINUE_INCOMPLETE_OUTPUT_PROMPT).toMatch(/Do not continue any other project/i);
  });

  it('detects auto-continue prompts so the chat UI can hide them', () => {
    expect(isAutoContinueIncompleteOutputPrompt(AUTO_CONTINUE_INCOMPLETE_OUTPUT_PROMPT)).toBe(true);
    expect(
      isAutoContinueIncompleteOutputPrompt(
        '앞선 응답이 슬라이드 결과물을 만들지 못하고 종료되었습니다 (legacy)',
      ),
    ).toBe(true);
    expect(isAutoContinueIncompleteOutputPrompt('새 프로젝트에서 슬라이드 만들어줘')).toBe(false);
  });

  it('escalates the prompt on later automatic-continue attempts', () => {
    const first = buildAutoContinueIncompleteOutputPrompt({ attempt: 1 });
    const second = buildAutoContinueIncompleteOutputPrompt({ attempt: 2 });
    expect(first).toContain(AUTO_CONTINUE_PROMPT_SENTINEL);
    expect(first).toContain('이 대화(현재 프로젝트)의 직전 모델 응답만');
    expect(second.startsWith(AUTO_CONTINUE_PROMPT_SENTINEL)).toBe(true);
    expect(second).toContain('FINAL RETRY');
    expect(second).not.toEqual(first);
    expect(isAutoContinueIncompleteOutputPrompt(second)).toBe(true);
  });

  it('threads partial HTML and plan outline into the auto-continue prompt', () => {
    const prompt = buildAutoContinueIncompleteOutputPrompt({
      attempt: 1,
      partialHtml:
        '<!doctype html><html><head><title>Deck</title></head><body><section class="slide"><h1>Partial</h1><p>Started content that is long enough to continue safely.</p></section>',
      planOutline: '슬라이드 구성:\n01 표지',
    });
    expect(prompt).toContain('```html');
    expect(prompt).toContain('<!doctype html>');
    expect(prompt).toContain('슬라이드 구성');
  });

  it('threads original reference files into the auto-continue prompt', () => {
    const prompt = buildAutoContinueIncompleteOutputPrompt({
      attempt: 1,
      referenceFiles: [
        'refs/drive/course-script.md',
        'refs/drive/course-script.md',
        'refs/uploads/brief.pdf',
      ],
    });
    expect(prompt).toContain('첨부된 참고 파일');
    expect(prompt).toContain('- refs/drive/course-script.md');
    expect(prompt).toContain('- refs/uploads/brief.pdf');
    expect(prompt.match(/refs\/drive\/course-script\.md/g)).toHaveLength(1);
  });

  it('omits head-only partial shells from every automatic-continue attempt', () => {
    const shell = '\n<!doctype html>\n<html lang="ko">\n<head>';
    const first = buildAutoContinueIncompleteOutputPrompt({
      attempt: 1,
      partialHtml: shell,
    });
    const second = buildAutoContinueIncompleteOutputPrompt({
      attempt: 2,
      partialHtml: shell,
    });
    // Tiny / empty shells are never fenced as "continue this HTML".
    expect(first).not.toContain('```html');
    expect(first).toContain('빈 document shell');
    expect(second).not.toContain('```html');
    expect(second).toContain('빈 document shell');
  });

  it('discards closed SLOT-only decks instead of fencing them', () => {
    const slotOnly =
      '<!doctype html><html><head><meta charset="utf-8"></head><body>'
      + '<section class="slide"><!-- SLOT: slide 1 content --></section>'
      + '<section class="slide"><!-- SLOT: slide 2 content --></section>'
      + '</body></html>';
    const prompt = buildAutoContinueIncompleteOutputPrompt({
      attempt: 1,
      partialHtml: slotOnly,
    });
    expect(prompt).not.toContain('```html');
    expect(prompt).toContain('버리세요');
  });

  it('still fences truncated decks that already have real slide copy', () => {
    const truncated =
      '<!doctype html><html><head><title>Deck</title></head><body>'
      + '<section class="slide"><h1>Partial</h1><p>Started content that is long enough to continue safely.</p></section>';
    const prompt = buildAutoContinueIncompleteOutputPrompt({
      attempt: 1,
      partialHtml: truncated,
    });
    expect(prompt).toContain('```html');
    expect(prompt).toContain('<h1>Partial</h1>');
  });

  it('prepends truncation guidance when the prior turn hit max_tokens', () => {
    const prompt = buildAutoContinueIncompleteOutputPrompt({
      attempt: 1,
      truncatedByMaxTokens: true,
    });
    expect(prompt).toMatch(/token limit|max_tokens/i);
  });

  it('escalates immediately when the prior partial HTML was a head-only shell', () => {
    const shell = '<!doctype html>\n<html lang="ko">\n<head>';
    const prompt = buildAutoContinueIncompleteOutputPrompt({
      attempt: 1,
      partialHtml: shell,
    });
    expect(prompt).toContain('FINAL RETRY');
    expect(prompt).not.toContain('```html');
  });

  it('tells the model to discard tiny empty HTML shells instead of continuing them', () => {
    const prompt = buildAutoContinueIncompleteOutputPrompt({
      attempt: 1,
      partialHtml: '<!doctype html><html><head>',
      planOutline: '슬라이드 구성:\n01 표지',
    });
    expect(prompt).toContain('빈 document shell');
    expect(prompt).toContain('버리세요');
    expect(prompt).not.toContain('```html');
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
