import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = resolve(import.meta.dirname, "..");

function readSource(relativePath: string): string {
  return readFileSync(resolve(webRoot, relativePath), "utf8");
}

describe("ProjectView message loading", () => {
  it("does not let auxiliary preview/run lookups fail the persisted chat reload", () => {
    const source = readSource("src/components/ProjectView.tsx");
    const start = source.indexOf("const loadMessagesWithRetry = async () =>");
    expect(start).toBeGreaterThan(0);
    const block = source.slice(start, start + 1600);

    expect(source).toContain("const safeFetchPreviewComments = async () =>");
    expect(source).toContain("const safeListActiveChatRuns = async () =>");
    expect(block).toContain("const list = await listMessages(project.id, activeConversationId)");
    expect(block).toContain("safeFetchPreviewComments()");
    expect(block).toContain("safeListActiveChatRuns()");
    expect(block).not.toContain("fetchPreviewComments(project.id, activeConversationId)");
    expect(block).not.toContain("listActiveChatRuns(project.id, activeConversationId)");
  });

  it("keeps daemon reattach probes best-effort so transient run API failures do not kill recovery", () => {
    const source = readSource("src/components/ProjectView.tsx");
    const start = source.indexOf("const attachRecoverableRuns = async () =>");
    expect(start).toBeGreaterThan(0);
    const block = source.slice(start, start + 2400);

    expect(block).toContain("let activeRuns: Awaited<ReturnType<typeof listActiveChatRuns>> = []");
    expect(block).toContain("activeRuns = await listActiveChatRuns(project.id, reattachConversationId)");
    expect(block).toContain("active daemon runs reattach probe skipped");
    expect(block).toContain("listProjectRuns().catch");
    expect(block).toContain("daemon run history reattach probe skipped");
  });

  it("retries the API background stream probe after a transient failure", () => {
    const source = readSource("src/components/ProjectView.tsx");
    const start = source.indexOf("api background recovery stream probe skipped");
    expect(start).toBeGreaterThan(0);
    const block = source.slice(start - 900, start + 1800);

    expect(block).toContain("let retryTimer: number | null = null");
    expect(block).toContain("retryTimer = window.setTimeout");
    expect(block).toContain("setReattachNonce((value) => value + 1)");
    expect(block).toContain("if (retryTimer !== null) window.clearTimeout(retryTimer)");
    expect(block).toContain("reattachNonce");
    expect(source).toContain("BYOK_BACKGROUND_RECOVERY_AUTH_RETRY_MS = 15_000");
    expect(source).toContain("err instanceof ActiveByokProxyAuthTransientError");
    expect(source).toContain("? BYOK_BACKGROUND_RECOVERY_AUTH_RETRY_MS");
  });

  it("recovers an existing edited HTML output when produced-file diff is empty", () => {
    const source = readSource("src/components/ProjectView.tsx");
    const helperStart = source.indexOf("function selectTouchedHtmlOutputFromEvents");
    expect(helperStart).toBeGreaterThan(0);
    const helperBlock = source.slice(helperStart, helperStart + 1400);
    expect(helperBlock).toContain("toolName !== 'write' && toolName !== 'edit'");
    expect(helperBlock).toContain("decideAutoOpenAfterWrite(filePath, filesSnapshot, options)");
    expect(helperBlock).toContain("isHtmlProjectFile(file)");

    const autoOpenStart = source.indexOf("const autoOpenRecoveredHtmlOutput = useCallback");
    expect(autoOpenStart).toBeGreaterThan(0);
    const autoOpenBlock = source.slice(autoOpenStart, autoOpenStart + 1700);
    expect(autoOpenBlock).toContain("selectAutoOpenProducedHtml(produced)");
    expect(autoOpenBlock).toContain("selectTouchedHtmlOutputFromEvents(message.events, filesSnapshot");
    expect(autoOpenBlock).toContain("branding: { slideOnlyMvp }");

    const fallbackUses = source.match(/selectTouchedHtmlOutputFromEvents\(/g) ?? [];
    expect(fallbackUses.length).toBeGreaterThanOrEqual(4);
    expect(source).toContain("selectTouchedHtmlOutputFromEvents(message.events, nextFiles");
    expect(source).toContain("selectTouchedHtmlOutputFromEvents(latestAssistantMsg.events, nextFiles");
  });
});
