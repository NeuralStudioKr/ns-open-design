import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const projectViewSource = readFileSync(
  join(__dirname, "../src/components/ProjectView.tsx"),
  "utf8",
);

describe("ProjectView automation submit guard", () => {
  it("lets hidden slide repair automations bypass embed submit-disabled UI state", () => {
    const handleSendStart = projectViewSource.indexOf("const handleSend = useCallback(");
    expect(handleSendStart).toBeGreaterThan(0);
    const handleSendBlock = projectViewSource.slice(handleSendStart, handleSendStart + 2200);

    expect(handleSendBlock).toContain("embedSubmitDisabled");
    expect(handleSendBlock).toContain("meta?.entryFrom !== AUTO_CONTINUE_ENTRY_FROM");
    expect(handleSendBlock).toContain("meta?.entryFrom !== SLIDE_COUNT_TOP_UP_ENTRY_FROM");
    expect(handleSendBlock).toContain("meta?.entryFrom !== SPARSE_CONTENT_TOP_UP_ENTRY_FROM");
    expect(handleSendBlock).toContain("meta?.entryFrom !== THIN_PRIOR_FULL_REWRITE_ENTRY_FROM");
    expect(handleSendBlock).toContain("meta?.entryFrom !== CLONE_SLOT_FILL_REPAIR_ENTRY_FROM");
  });

  it("lets hidden slide repair automations bypass phantom busy state when no local stream is active", () => {
    const bypassStart = projectViewSource.indexOf("const bypassBusyForAutoContinue =");
    expect(bypassStart).toBeGreaterThan(0);
    const bypassBlock = projectViewSource.slice(bypassStart, bypassStart + 650);

    expect(bypassBlock).toContain("meta?.entryFrom === AUTO_CONTINUE_ENTRY_FROM");
    expect(bypassBlock).toContain("meta?.entryFrom === SLIDE_COUNT_TOP_UP_ENTRY_FROM");
    expect(bypassBlock).toContain("meta?.entryFrom === SPARSE_CONTENT_TOP_UP_ENTRY_FROM");
    expect(bypassBlock).toContain("meta?.entryFrom === THIN_PRIOR_FULL_REWRITE_ENTRY_FROM");
    expect(bypassBlock).toContain("meta?.entryFrom === CLONE_SLOT_FILL_REPAIR_ENTRY_FROM");
    expect(bypassBlock).toContain("&& !abortRef.current");
  });

  it("prefers slide-count shortfall over sparse repair and blocks thin APPEND after rewrite (루프505)", () => {
    expect(projectViewSource).toContain("shouldBlockSlideCountAppendOntoThinPrior");
    expect(projectViewSource).toContain("wantsCountTopUp");
    expect(projectViewSource).toContain("requestedMin: requestedSpec?.min");
    expect(projectViewSource).toContain("userBrief: runVisiblePromptRef.current || ''");
    // Count gate is computed before sparse evidence is consulted.
    const countIdx = projectViewSource.indexOf("const wantsCountTopUp = sparseOnly");
    const sparseIdx = projectViewSource.indexOf("findDeckSparseContentEvidence(html)");
    expect(countIdx).toBeGreaterThan(0);
    expect(projectViewSource.indexOf("shouldQueueSlideCountTopUp({")).toBeGreaterThan(countIdx);
    expect(sparseIdx).toBeGreaterThan(countIdx);
    expect(projectViewSource).toMatch(
      /if \(!wantsCountTopUp\) \{[\s\S]*?findDeckSparseContentEvidence\(html\)/,
    );
  });

  it("deterministic landing observes and sparse-repairs without rewrite/APPEND (루프535)", () => {
    expect(projectViewSource).toContain("shouldRunDeterministicSparseCheck");
    expect(projectViewSource).toContain('mode: "sparse-only"');
    expect(projectViewSource).toContain('phase: "deterministic-fill"');
    expect(projectViewSource).toMatch(/!sparseOnly\s*&&\s*shouldQueueThinPriorFullRewrite/);
    expect(projectViewSource).toMatch(/!sparseOnly\s*&&\s*shouldBlockSlideCountAppendOntoThinPrior/);
    expect(projectViewSource).toMatch(/wantsCountTopUp = sparseOnly\s*\n\s*\? false/);
    const landingIdx = projectViewSource.indexOf("루프535 — Deterministic Home/Canvas/Drive persist");
    const rewriteIdx = projectViewSource.indexOf("shouldQueueThinPriorFullRewrite({");
    expect(landingIdx).toBeGreaterThan(0);
    expect(rewriteIdx).toBeGreaterThan(0);
  });
});
