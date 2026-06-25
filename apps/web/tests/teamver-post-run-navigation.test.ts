import { afterEach, describe, expect, it, vi } from "vitest";

import {
  armTeamverPublishMenuOnProjectOpen,
  consumeTeamverPublishMenuArm,
  maybeArmTeamverPublishMenuAfterRunSuccess,
  resetTeamverPostRunNavigationForTests,
} from "../src/teamver/teamverPostRunNavigation";

vi.mock("../src/teamver/designApiBase", () => ({
  isTeamverEmbedMode: vi.fn(() => false),
}));

import { isTeamverEmbedMode } from "../src/teamver/designApiBase";

describe("teamverPostRunNavigation (loop 398)", () => {
  afterEach(() => {
    resetTeamverPostRunNavigationForTests();
  });

  it("arms publish menu open once for matching project preview deep-link", () => {
    armTeamverPublishMenuOnProjectOpen("p1", "output/deck.html");
    expect(consumeTeamverPublishMenuArm("p1", "output/deck.html")).toBe(true);
    expect(consumeTeamverPublishMenuArm("p1", "output/deck.html")).toBe(false);
  });

  it("ignores consume when project or file does not match", () => {
    armTeamverPublishMenuOnProjectOpen("p1", "deck.html");
    expect(consumeTeamverPublishMenuArm("p2", "deck.html")).toBe(false);
    expect(consumeTeamverPublishMenuArm("p1", "other.html")).toBe(false);
    expect(consumeTeamverPublishMenuArm("p1", "deck.html")).toBe(true);
  });

  it("skips arm when ids are blank", () => {
    armTeamverPublishMenuOnProjectOpen(" ", "deck.html");
    expect(consumeTeamverPublishMenuArm("p1", "deck.html")).toBe(false);
  });
});

describe("maybeArmTeamverPublishMenuAfterRunSuccess (loop 402)", () => {
  afterEach(() => {
    resetTeamverPostRunNavigationForTests();
    vi.mocked(isTeamverEmbedMode).mockReturnValue(false);
  });

  it("arms only in embed mode with a non-empty html file name", () => {
    maybeArmTeamverPublishMenuAfterRunSuccess("p1", "deck.html");
    expect(consumeTeamverPublishMenuArm("p1", "deck.html")).toBe(false);

    vi.mocked(isTeamverEmbedMode).mockReturnValue(true);
    maybeArmTeamverPublishMenuAfterRunSuccess("p1", "output/deck.html");
    expect(consumeTeamverPublishMenuArm("p1", "output/deck.html")).toBe(true);
  });

  it("ignores blank html file names", () => {
    vi.mocked(isTeamverEmbedMode).mockReturnValue(true);
    maybeArmTeamverPublishMenuAfterRunSuccess("p1", "  ");
    expect(consumeTeamverPublishMenuArm("p1", "deck.html")).toBe(false);
  });
});
