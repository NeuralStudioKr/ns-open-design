import { describe, expect, it } from 'vitest';
import {
  AUTO_CONTINUE_ENTRY_FROM,
  AUTO_CONTINUE_INCOMPLETE_OUTPUT_PROMPT,
  AUTO_CONTINUE_MAX_PER_CONVERSATION,
  AUTO_CONTINUE_STATUS_CODE,
  RESUME_CONTINUE_PROMPT,
} from '../../src/runtime/resume';

describe('runtime/resume shell/no-HTML recovery constants', () => {
  it('exports a manual resume prompt distinct from the automatic-continue prompt', () => {
    // The manual "다시 시도" button and the capped automatic continue take
    // different code paths and are labeled with different analytics entry
    // points, so they must not accidentally share a prompt. Reusing the same
    // prompt string in both places would silently merge two different
    // recovery UX flows into one row on the demo dashboard.
    expect(RESUME_CONTINUE_PROMPT).not.toEqual(AUTO_CONTINUE_INCOMPLETE_OUTPUT_PROMPT);
    expect(RESUME_CONTINUE_PROMPT.length).toBeGreaterThan(0);
    expect(AUTO_CONTINUE_INCOMPLETE_OUTPUT_PROMPT.length).toBeGreaterThan(0);
  });

  it('scopes the auto-continue cap to two retries per conversation', () => {
    // The cap is the guardrail against a runaway loop when the model keeps
    // emitting the same shell-then-stop pattern. Two attempts cover the
    // observed "plan then shell" repeat without allowing unbounded token
    // spend — manual retry remains available beyond this cap.
    expect(AUTO_CONTINUE_MAX_PER_CONVERSATION).toBe(2);
    expect(Number.isInteger(AUTO_CONTINUE_MAX_PER_CONVERSATION)).toBe(true);
    expect(AUTO_CONTINUE_MAX_PER_CONVERSATION).toBeGreaterThanOrEqual(1);
  });

  it('uses a distinct analytics entry-from for the automatic continue', () => {
    // `resume_continue` is the manual-button entry point. The automatic
    // path needs its own value so run_created / run_finished can measure
    // how often the automatic recovery fires and whether it actually
    // salvages the deliverable.
    expect(AUTO_CONTINUE_ENTRY_FROM).toBe('auto_continue_incomplete_output');
    expect(AUTO_CONTINUE_ENTRY_FROM).not.toBe('resume_continue');
  });

  it('exposes a stable status-event code the assistant renderer can match', () => {
    // The AssistantMessage renderer switches on this code to decide whether
    // the status label is "retrying automatically…" vs. a plain error, so
    // the constant must not be silently renamed.
    expect(AUTO_CONTINUE_STATUS_CODE).toBe('auto_continue_incomplete_output');
  });

  it('instructs the model to keep prior work when auto-continuing', () => {
    // The prompt has to (a) tell the model the deliverable was missing, (b)
    // tell it not to restart the plan or re-ask the user, and (c) name the
    // `<artifact type="text/html">…</artifact>` shape it must emit. Missing
    // any of these has caused the model to loop on the same "planning
    // then stops" failure mode in prior demos.
    expect(AUTO_CONTINUE_INCOMPLETE_OUTPUT_PROMPT).toMatch(/만들지 못하고|no usable slide deck/i);
    expect(AUTO_CONTINUE_INCOMPLETE_OUTPUT_PROMPT).toMatch(/artifact type="text\/html"/);
    expect(AUTO_CONTINUE_INCOMPLETE_OUTPUT_PROMPT).toMatch(/계획을 다시 설명|no further planning|Do not restart/i);
  });
});
