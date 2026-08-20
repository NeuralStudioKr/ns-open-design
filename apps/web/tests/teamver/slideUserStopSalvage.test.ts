import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { shouldSalvageSlideUserStop } from "../../src/teamver/slideUserStopSalvage";

const projectViewSource = readFileSync(
  resolve(__dirname, "../../src/components/ProjectView.tsx"),
  "utf8",
);

const salvageBase = {
  slideOnlyMvp: true,
  superseded: false,
  templateCloneContentFill: false,
  slideCountTopUp: false,
  abortControllerAlive: true,
};

describe("shouldSalvageSlideUserStop", () => {
  it("salvages first Stop on a fill turn", () => {
    expect(
      shouldSalvageSlideUserStop({
        ...salvageBase,
        templateCloneContentFill: true,
      }),
    ).toBe(true);
  });

  it("salvages first Stop on a slide-count top-up turn", () => {
    expect(
      shouldSalvageSlideUserStop({
        ...salvageBase,
        slideCountTopUp: true,
      }),
    ).toBe(true);
  });

  it("does not salvage send-now supersede", () => {
    expect(
      shouldSalvageSlideUserStop({
        ...salvageBase,
        templateCloneContentFill: true,
        superseded: true,
      }),
    ).toBe(false);
  });

  it("does not salvage a second Stop after the controller was cleared", () => {
    expect(
      shouldSalvageSlideUserStop({
        ...salvageBase,
        slideCountTopUp: true,
        abortControllerAlive: false,
      }),
    ).toBe(false);
  });

  it("does not salvage ordinary edit turns", () => {
    expect(shouldSalvageSlideUserStop(salvageBase)).toBe(false);
  });

  it("does not salvage outside slide-only MVP", () => {
    expect(
      shouldSalvageSlideUserStop({
        ...salvageBase,
        slideOnlyMvp: false,
        templateCloneContentFill: true,
      }),
    ).toBe(false);
  });
});

describe("ProjectView Stop salvage wiring", () => {
  it("routes fill/top-up Stop through salvage abort, not CANCELED_BY_USER", () => {
    expect(projectViewSource).toContain("shouldSalvageSlideUserStop");
    expect(projectViewSource).toContain("SLIDE_USER_STOP_SALVAGE_STOP_REASON");
    expect(projectViewSource).toContain("handleStop({ superseded: true })");
    expect(projectViewSource).toMatch(
      /if \(salvage\) \{\s*[\s\S]*?return;\s*\}/,
    );
  });
});
