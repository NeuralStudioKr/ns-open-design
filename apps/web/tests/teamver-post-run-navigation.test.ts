import { afterEach, describe, expect, it } from "vitest";

import {
  armTeamverPublishMenuOnProjectOpen,
  consumeTeamverPublishMenuArm,
  resetTeamverPostRunNavigationForTests,
} from "../src/teamver/teamverPostRunNavigation";

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
