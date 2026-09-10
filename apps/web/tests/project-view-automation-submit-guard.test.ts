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
});
