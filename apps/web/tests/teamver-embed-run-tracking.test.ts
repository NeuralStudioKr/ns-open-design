import { describe, expect, it } from "vitest";

import { resetEmbedRunTrackingRefs } from "../src/teamver/teamverEmbedRunTracking";

describe("resetEmbedRunTrackingRefs", () => {
  it("clears run ids and signature bookkeeping", () => {
    const refs = {
      activeRunIds: { current: new Set(["r1"]) },
      notifiedBackgroundRunIds: { current: new Set(["r2"]) },
      wasActiveRun: { current: true },
      activeRunSignature: { current: "p1:running:1" },
    };

    resetEmbedRunTrackingRefs(refs);

    expect(refs.activeRunIds.current.size).toBe(0);
    expect(refs.notifiedBackgroundRunIds.current.size).toBe(0);
    expect(refs.wasActiveRun.current).toBe(false);
    expect(refs.activeRunSignature.current).toBe("");
  });
});
