// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  DURABLE_RESTORE_WINDOW_MS,
  clearUnrequestedWorkspaceMove,
  markUnrequestedWorkspaceMove,
  resetDurableRestoreWindowForTests,
  shouldRestoreDurableOverActive,
} from "../../src/teamver/durableRestoreWindow";

describe("durableRestoreWindow", () => {
  beforeEach(() => {
    resetDurableRestoreWindowForTests();
  });

  it("restores only for a matching fresh stamp", () => {
    markUnrequestedWorkspaceMove({
      userId: "u1",
      from: "WS-B",
      to: "WS-A",
      at: 1_000,
    });
    expect(
      shouldRestoreDurableOverActive({
        userId: "u1",
        durableId: "WS-B",
        activeId: "WS-A",
        now: 1_000 + DURABLE_RESTORE_WINDOW_MS,
      }),
    ).toBe(true);
  });

  it("rejects expired, mismatched, or missing stamps", () => {
    expect(
      shouldRestoreDurableOverActive({
        userId: "u1",
        durableId: "WS-B",
        activeId: "WS-A",
        now: 5_000,
      }),
    ).toBe(false);

    markUnrequestedWorkspaceMove({
      userId: "u1",
      from: "WS-B",
      to: "WS-A",
      at: 1_000,
    });
    expect(
      shouldRestoreDurableOverActive({
        userId: "u1",
        durableId: "WS-B",
        activeId: "WS-A",
        now: 1_000 + DURABLE_RESTORE_WINDOW_MS + 1,
      }),
    ).toBe(false);
    expect(
      shouldRestoreDurableOverActive({
        userId: "u1",
        durableId: "WS-other",
        activeId: "WS-A",
        now: 1_500,
      }),
    ).toBe(false);
  });

  it("clear drops the stamp for the same user", () => {
    markUnrequestedWorkspaceMove({
      userId: "u1",
      from: "WS-B",
      to: "WS-A",
    });
    clearUnrequestedWorkspaceMove("u1");
    expect(
      shouldRestoreDurableOverActive({
        userId: "u1",
        durableId: "WS-B",
        activeId: "WS-A",
      }),
    ).toBe(false);
  });
});
