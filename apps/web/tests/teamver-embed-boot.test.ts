import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/teamver/designApiBase", () => ({
  isTeamverEmbedMode: vi.fn(() => true),
}));

describe("teamverEmbedBoot", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  it("blocks waiters until completeTeamverEmbedBoot is called", async () => {
    const mod = await import("../src/teamver/teamverEmbedBoot");
    mod.resetTeamverEmbedBootForTests();

    let released = false;
    void mod.waitForTeamverEmbedBoot().then(() => {
      released = true;
    });

    await Promise.resolve();
    expect(released).toBe(false);

    mod.completeTeamverEmbedBoot();
    await mod.waitForTeamverEmbedBoot();
    await Promise.resolve();
    expect(released).toBe(true);
  });

  it("releases waiters after the safety fallback when boot completion is missed", async () => {
    vi.useFakeTimers();
    const mod = await import("../src/teamver/teamverEmbedBoot");
    mod.resetTeamverEmbedBootForTests();

    let released = false;
    void mod.waitForTeamverEmbedBoot().then(() => {
      released = true;
    });

    await Promise.resolve();
    expect(released).toBe(false);

    await vi.advanceTimersByTimeAsync(mod.TEAMVER_EMBED_BOOT_FALLBACK_MS);
    await Promise.resolve();
    expect(released).toBe(true);
  });
});
