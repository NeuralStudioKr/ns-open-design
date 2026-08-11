import { describe, expect, it } from 'vitest';
import {
  AUTO_CONTINUE_ENTRY_FROM,
  AUTO_CONTINUE_INCOMPLETE_OUTPUT_PROMPT,
  AUTO_CONTINUE_MAX_PER_CONVERSATION,
  AUTO_CONTINUE_MAX_SCOPED_COMMENT_EDIT,
  AUTO_CONTINUE_MAX_SCOPED_VISUAL_MARK_EDIT,
  AUTO_CONTINUE_PROMPT_SENTINEL,
  AUTO_CONTINUE_STATUS_CODE,
  RESUME_CONTINUE_PROMPT,
  buildAutoContinueIncompleteOutputPrompt,
  buildAutoContinueScopedCommentEditPrompt,
  excerptPartialHtmlForAutoContinue,
  extractAutoContinueContextFromAssistant,
  isAutoContinueIncompleteOutputPrompt,
  isLiveLocalStreamBlockingAutoContinue,
  resolveAutoContinueMaxAttempts,
  resolveAutoContinuePrompt,
  rollbackAutoContinueCount,
  shouldAutoContinueForIncompleteOutput,
} from '../../src/runtime/resume';

describe('runtime/resume shell/no-HTML recovery constants', () => {
  it('exports a manual resume prompt distinct from the automatic-continue prompt', () => {
    expect(RESUME_CONTINUE_PROMPT).not.toEqual(AUTO_CONTINUE_INCOMPLETE_OUTPUT_PROMPT);
    expect(RESUME_CONTINUE_PROMPT.length).toBeGreaterThan(0);
    expect(AUTO_CONTINUE_INCOMPLETE_OUTPUT_PROMPT.length).toBeGreaterThan(0);
  });

  it('scopes the auto-continue cap to five retries per conversation', () => {
    // Bumped from three to five: Canvas → Slide launches on Teamver embed
    // consistently landed on `incomplete_output` after the model produced a
    // truncated deck the first pass and the retry budget ran out before
    // salvage / stream-close could converge.
    expect(AUTO_CONTINUE_MAX_PER_CONVERSATION).toBe(5);
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
    expect(AUTO_CONTINUE_INCOMPLETE_OUTPUT_PROMPT).toMatch(/Plugin inputs/);
    expect(AUTO_CONTINUE_INCOMPLETE_OUTPUT_PROMPT).toMatch(/quick-brief/);
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

  it('uses a scoped comment-edit prompt instead of full-deck rewrite when attachments exist', () => {
    const scoped = resolveAutoContinuePrompt({
      commentAttachmentCount: 1,
      incompleteOutput: { attempt: 2 },
      scopedCommentEditFailureReason: 'empty element-patch body',
      scopedCommentContext:
        '<attached-preview-comments>\nslideIndex: 2\nelementId: od-title-1\ncurrentText: 모두의 기술\n</attached-preview-comments>',
      scopedUserInstruction: "'모두의 기술'을 빨간색으로 바꿔줘",
      concretePatchTemplate:
        '<artifact type="element-patch" identifier="deck">\n'
        + '  <patch target-id="od-title-1" slide-index="2" kind="set-text">(요청한 새 텍스트)</patch>\n'
        + '</artifact>',
    });
    expect(scoped.startsWith(AUTO_CONTINUE_PROMPT_SENTINEL)).toBe(true);
    expect(scoped).toContain('element-patch');
    expect(scoped).toContain('set-text');
    expect(scoped).toContain('empty element-patch body');
    expect(scoped).toContain('slideIndex: 2');
    expect(scoped).toContain('od-title-1');
    expect(scoped).toContain('모두의 기술');
    expect(scoped).toContain("'모두의 기술'을 빨간색으로 바꿔줘");
    expect(scoped).toContain('target-id="od-title-1"');
    expect(scoped).toContain('FINAL RETRY');
    expect(scoped).toContain('그대로 복사');
    expect(scoped).toContain('<artifact type="element-patch" identifier="deck">');
    expect(scoped).toContain('전체 덱을 새로 쓰거나');
    expect(scoped).not.toContain('출력 형식은 반드시 하나의 `<artifact type="deck"');
    expect(isAutoContinueIncompleteOutputPrompt(scoped)).toBe(true);
  });

  it('uses deck-patch guidance for visual-mark-only scoped retries', () => {
    const visual = resolveAutoContinuePrompt({
      commentAttachmentCount: 1,
      visualMarkOnly: true,
      incompleteOutput: { attempt: 2 },
      scopedCommentEditFailureReason:
        'no <section class="slide"> blocks in deck-patch body',
      scopedUserInstruction: '여기에 이렇게 하트 도형 넣어줘',
      concretePatchTemplate:
        '<artifact type="deck-patch" identifier="deck">\n'
        + '  <section class="slide" data-slide-index="1"></section>\n'
        + '</artifact>',
    });
    expect(visual).toContain('deck-patch');
    expect(visual).toContain('시각 마크');
    expect(visual).not.toContain('element-patch');
    expect(visual).toContain('하트');
    expect(visual).toContain('no <section class="slide"> blocks in deck-patch body');
  });

  it('uses element-patch guidance for box/edit visual annotation retries', () => {
    const edit = resolveAutoContinuePrompt({
      commentAttachmentCount: 1,
      visualMarkOnly: false,
      visualAnnotationEdit: true,
      incompleteOutput: { attempt: 2 },
      scopedCommentEditFailureReason: 'No matching targets found to merge.',
      scopedUserInstruction: '슬라이드 2 이 글씨들 더 크게',
    });
    expect(edit).toContain('element-patch');
    expect(edit).toContain('박스/메모 시각 주석');
    expect(edit).toContain('od-visual-mark-target');
    expect(edit).not.toContain('하트·도형은 inline SVG');
    expect(edit).toContain('슬라이드 2 이 글씨들 더 크게');
  });

  it('keeps the generic full-deck auto-continue prompt when no comment attachments exist', () => {
    const generic = resolveAutoContinuePrompt({
      commentAttachmentCount: 0,
      incompleteOutput: { attempt: 1 },
    });
    expect(generic).toContain('artifact type="deck"');
    expect(generic).not.toContain('set-text');
  });

  it('escalates scoped comment-edit retries on later attempts', () => {
    const second = buildAutoContinueScopedCommentEditPrompt({ attempt: 2 });
    expect(second).toContain('FINAL RETRY');
    expect(second).toContain('element-patch');
  });

  it('threads partial HTML and plan outline into the auto-continue prompt', () => {
    const prompt = buildAutoContinueIncompleteOutputPrompt({
      attempt: 1,
      partialHtml:
        '<!doctype html><html><head><title>Deck</title></head><body><section class="slide"><h1>Partial</h1><p>Started content that is long enough to continue safely.</p></section>',
      planOutline: '슬라이드 구성:\n01 표지',
    });
    expect(prompt).toContain('```html');
    // Fence prefers <body>/slides over a CSS-heavy doctype head prefix.
    expect(prompt).toContain('<h1>Partial</h1>');
    expect(prompt).toContain('슬라이드 구성');
  });

  it('excerpts body/slides instead of a CSS-heavy head prefix for auto-continue', () => {
    const css = '<style>' + '.x{color:red}'.repeat(400) + '</style>';
    const html =
      `<!doctype html><html><head><meta charset="utf-8"/>${css}</head><body>`
      + '<section class="slide"><h1>Cover</h1><p>Body copy that must survive the excerpt.</p></section>';
    const excerpt = excerptPartialHtmlForAutoContinue(html);
    expect(excerpt).toContain('<body');
    expect(excerpt).toContain('Body copy that must survive');
    expect(excerpt).not.toContain('.x{color:red}'.repeat(50));
  });

  it('forces body-first guidance for large head-only truncations', () => {
    const headOnly =
      '<!doctype html><html><head><meta charset="utf-8"/><title>Deck</title><style>'
      + '.slide{padding:40px}'.repeat(120)
      + '</style></head>';
    const prompt = buildAutoContinueIncompleteOutputPrompt({
      attempt: 1,
      truncatedByMaxTokens: true,
      partialHtml: headOnly,
    });
    expect(prompt).toContain('BODY-FIRST');
    expect(prompt).toContain('Do NOT regenerate');
    expect(prompt).not.toContain('```html');
  });

  it('treats selected-template css shells as a restart with slide content first', () => {
    const shell =
      '<!doctype html><html><head><meta charset="utf-8"/><title>Daisy Days</title><style>'
      + '.deco-daisy{position:absolute;background:#F5F0E6;border:3px solid #222}'.repeat(80)
      + '</style>';
    const prompt = buildAutoContinueIncompleteOutputPrompt({
      attempt: 1,
      partialHtml: shell,
      planOutline: '슬라이드 구성:\n01 표지\n02 핵심 요약',
    });
    expect(prompt).toContain('FINAL RETRY');
    expect(prompt).toContain('빈 document shell');
    expect(prompt).toContain('위 shell을 복사하지 말고');
    expect(prompt).toContain('새 complete HTML deck artifact');
    expect(prompt).not.toContain('```html');
    expect(prompt).not.toContain('.deco-daisy{position:absolute');
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

  it('includes an explicit slide-count hint when provided', () => {
    const prompt = buildAutoContinueIncompleteOutputPrompt({
      attempt: 1,
      slideCountHint: '정확히 12장의 슬라이드를 출력하세요.',
    });
    expect(prompt).toContain('[이 대화의 슬라이드 분량 — 반드시 준수:]');
    expect(prompt).toContain('정확히 12장');
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
    expect(first).toContain('Plugin inputs');
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

  it('reminds the model when a deck file already exists on disk', () => {
    const prompt = buildAutoContinueIncompleteOutputPrompt({
      attempt: 1,
      existingDeckPath: 'deck.html',
    });
    expect(prompt).toContain('deck.html');
    expect(prompt).toContain('완성된 덱이 없다');
    expect(prompt).toContain('deck-patch');
    expect(prompt).toContain('전체 덱을 2~3장으로 새로 만들지 말고');
    expect(prompt).toContain('슬라이드 장수를 줄이는 것은 금지입니다');
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

  it('fires for skipped-duplicate scoped comment edits when disk unchanged', () => {
    expect(
      shouldAutoContinueForIncompleteOutput({
        ...base,
        scopedCommentAttachmentCount: 1,
        terminalPersistResultKind: 'skipped-duplicate',
      }),
    ).toBe(true);
  });

  it('does NOT fire for validation rejected artifacts without incompleteness signals', () => {
    expect(
      shouldAutoContinueForIncompleteOutput({
        ...base,
        terminalPersistResultKind: 'rejected',
      }),
    ).toBe(false);
  });

  it('fires for rejected / skipped-discovery-turn when incomplete or missing-slide signals are set', () => {
    expect(
      shouldAutoContinueForIncompleteOutput({
        ...base,
        terminalPersistResultKind: 'rejected',
        hadIncompleteParsedArtifact: true,
      }),
    ).toBe(true);
    expect(
      shouldAutoContinueForIncompleteOutput({
        ...base,
        terminalPersistResultKind: 'skipped-discovery-turn',
        shouldFailMissingSlideHtml: true,
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

  it('fires for recoverable scoped scope-rejected failures', () => {
    expect(
      shouldAutoContinueForIncompleteOutput({
        ...base,
        scopedCommentAttachmentCount: 1,
        terminalPersistResultKind: 'scope-rejected',
        terminalPersistResultCode: 'deck_patch_merge_failed',
        terminalPersistResultReason: 'No matching targets found to merge.',
        shouldRouteScopedCommentEditToAutoContinue: () => true,
      }),
    ).toBe(true);
  });

  it('does NOT fire for non-recoverable scoped scope-rejected failures', () => {
    expect(
      shouldAutoContinueForIncompleteOutput({
        ...base,
        scopedCommentAttachmentCount: 1,
        terminalPersistResultKind: 'scope-rejected',
        terminalPersistResultCode: 'comment_scope_missing_slide',
        terminalPersistResultReason: 'comment attachments did not include a valid slide index',
        shouldRouteScopedCommentEditToAutoContinue: () => false,
      }),
    ).toBe(false);
  });

  it('does NOT fire when a comment-scoped edit is rejected without recoverable routing', () => {
    expect(
      shouldAutoContinueForIncompleteOutput({
        ...base,
        terminalPersistResultKind: 'scope-rejected',
        hadIncompleteParsedArtifact: true,
        shouldFailMissingSlideHtml: true,
      }),
    ).toBe(false);
  });

  it('still fires content-incomplete continues when the run is not visible', () => {
    // Leaving the tab mid-finalize must not strand skipped-incomplete as a
    // hard incomplete_output with zero automatic recovery.
    expect(
      shouldAutoContinueForIncompleteOutput({
        ...base,
        runIsVisible: false,
        terminalPersistResultKind: 'skipped-incomplete',
      }),
    ).toBe(true);
    expect(
      shouldAutoContinueForIncompleteOutput({
        ...base,
        runIsVisible: false,
        terminalPersistResultKind: 'save-failed',
        hadIncompleteParsedArtifact: true,
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

  it('caps scoped preview-comment edits at the scoped comment-edit budget', () => {
    expect(
      shouldAutoContinueForIncompleteOutput({
        ...base,
        autoContinueCount: AUTO_CONTINUE_MAX_SCOPED_COMMENT_EDIT,
        scopedCommentAttachmentCount: 1,
        terminalPersistResultKind: 'skipped-incomplete',
      }),
    ).toBe(false);
    expect(
      shouldAutoContinueForIncompleteOutput({
        ...base,
        autoContinueCount: AUTO_CONTINUE_MAX_SCOPED_COMMENT_EDIT - 1,
        scopedCommentAttachmentCount: 1,
        terminalPersistResultKind: 'skipped-incomplete',
      }),
    ).toBe(true);
  });

  it('resolveAutoContinueMaxAttempts returns scoped cap for comment edits', () => {
    expect(resolveAutoContinueMaxAttempts({ scopedCommentAttachmentCount: 0 })).toBe(
      AUTO_CONTINUE_MAX_PER_CONVERSATION,
    );
    expect(resolveAutoContinueMaxAttempts({ scopedCommentAttachmentCount: 2 })).toBe(
      AUTO_CONTINUE_MAX_SCOPED_COMMENT_EDIT,
    );
    expect(
      resolveAutoContinueMaxAttempts({
        scopedCommentAttachmentCount: 1,
        visualMarkOnly: true,
      }),
    ).toBe(AUTO_CONTINUE_MAX_SCOPED_VISUAL_MARK_EDIT);
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
