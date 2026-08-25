/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";

import {
  peekCreateConversationHandoff,
  resetCreateProjectStreamHandoffForTests,
  setPendingTemplateClone,
  takeCreateConversationHandoff,
  waitPendingTemplateClone,
  writeCreateConversationHandoff,
} from "../../src/teamver/createProjectStreamHandoff";

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
