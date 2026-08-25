/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  peekCreateConversationHandoff,
  resetCreateProjectStreamHandoffForTests,
  setPendingTemplateClone,
  takeCreateConversationHandoff,
  waitPendingTemplateClone,
  writeCreateConversationHandoff,
} from "../../src/teamver/createProjectStreamHandoff";

const ROOT = resolve(__dirname, "../..");

function readWebSource(path: string): string {
  return readFileSync(resolve(ROOT, path), "utf8");
}

describe("createProjectStreamHandoff", () => {
  afterEach(() => {
    resetCreateProjectStreamHandoffForTests();
    try {
      window.sessionStorage.clear();
    } catch {
      /* ignore */
    }
  });

  it("stores and consumes create conversation handoff once", () => {
    writeCreateConversationHandoff("p1", "c1");
    expect(takeCreateConversationHandoff("p1")).toBe("c1");
    expect(takeCreateConversationHandoff("p1")).toBeNull();
  });

  it("peek does not clear handoff (StrictMode-safe)", () => {
    writeCreateConversationHandoff("p1", "c1");
    expect(peekCreateConversationHandoff("p1")).toBe("c1");
    expect(peekCreateConversationHandoff("p1")).toBe("c1");
    expect(takeCreateConversationHandoff("p1")).toBe("c1");
  });

  it("waits on pending template clone", async () => {
    let resolve!: (value: { ok: boolean; fileName?: string }) => void;
    const pending = new Promise<{ ok: boolean; fileName?: string }>((r) => {
      resolve = r;
    });
    setPendingTemplateClone("p1", pending);
    const waiter = waitPendingTemplateClone("p1");
    resolve({ ok: true, fileName: "deck.html" });
    await expect(waiter).resolves.toEqual({ ok: true, fileName: "deck.html" });
  });

  it("returns settled clone result after map entry is cleared", async () => {
    setPendingTemplateClone(
      "p1",
      Promise.resolve({ ok: true, fileName: "deck.html" }),
    );
    await waitPendingTemplateClone("p1");
    await expect(waitPendingTemplateClone("p1")).resolves.toEqual({
      ok: true,
      fileName: "deck.html",
    });
  });
});

describe("create→stream source guards", () => {
  it("plugin-share create mirrors Home handoff + route conversationId", () => {
    const app = readWebSource("src/App.tsx");
    const start = app.indexOf("const handleCreatePluginShareProject");
    expect(start).toBeGreaterThan(-1);
    const block = app.slice(start, app.indexOf("const handleImportClaudeDesign", start));
    expect(block).toContain("writeCreateConversationHandoff(project.id, outcome.conversationId)");
    expect(block).toContain(
      "rememberTeamverProjectConversation(project.id, outcome.conversationId.trim())",
    );
    expect(block).toContain("conversationId: outcome.conversationId.trim()");
    expect(block).toContain("od:auto-send-first:");
  });

  it("conversations effect preserves messages during create auto-send", () => {
    const projectView = readWebSource("src/components/ProjectView.tsx");
    expect(projectView).toContain("preserveCreateAutoSendMessages");
    expect(projectView).toContain("MAX_CREATE_AUTO_SEND_RETRIES");
    expect(projectView).toContain("bypassBusyForHomeCreateAutoSend");
    // Success latches before cancelled early-return (StrictMode double stream).
    expect(projectView).toContain(
      "Latch success even if StrictMode cleanup set cancelled",
    );
  });
});
