import { afterEach, describe, expect, it, vi } from "vitest";

import {
  completeTeamverEmbedInitialUi,
  isTeamverEmbedInitialUiComplete,
  resetTeamverEmbedInitialUiForTests,
  waitForTeamverEmbedInitialUi,
} from "../../src/teamver/teamverEmbedInitialUi";

vi.mock("../../src/teamver/designApiBase", () => ({
  isTeamverEmbedMode: vi.fn(() => true),
}));

describe("teamverEmbedInitialUi", () => {
  afterEach(() => {
    resetTeamverEmbedInitialUiForTests();
  });

  it("blocks waiters until completeTeamverEmbedInitialUi is called", async () => {
    expect(isTeamverEmbedInitialUiComplete()).toBe(false);
    const pending = waitForTeamverEmbedInitialUi();
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    completeTeamverEmbedInitialUi();
    await pending;
    expect(settled).toBe(true);
    expect(isTeamverEmbedInitialUiComplete()).toBe(true);
  });
});
