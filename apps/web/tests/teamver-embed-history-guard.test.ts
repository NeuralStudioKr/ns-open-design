// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installTeamverEmbedHistoryBoundary } from "../src/teamver/teamverEmbedHistoryGuard";

vi.mock("../src/teamver/designApiBase", () => ({
  isTeamverEmbedMode: vi.fn(() => true),
}));

describe("installTeamverEmbedHistoryBoundary", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
  });

  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("pushes a same-document boundary entry on install", () => {
    const before = window.history.length;
    const cleanup = installTeamverEmbedHistoryBoundary();
    expect(window.history.length).toBe(before + 1);
    cleanup();
  });

  it("re-pushes home when browser back reaches embed root", async () => {
    installTeamverEmbedHistoryBoundary();
    const before = window.history.length;

    window.history.back();
    await Promise.resolve();
    await Promise.resolve();

    expect(window.location.pathname).toBe("/");
    expect(window.history.length).toBeGreaterThanOrEqual(before);
  });
});
