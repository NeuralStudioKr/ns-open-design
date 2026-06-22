import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/teamver/designApiBase", () => ({
  isTeamverEmbedMode: vi.fn(() => true),
}));

describe("teamverEmbedBoot", () => {
  afterEach(() => {
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
    expect(released).toBe(true);
  });
});
