// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import {
  BFF_REFRESH_LEADER_TIMING,
  resetBffRefreshLeaderForTests,
} from "../src/teamver/teamverBffRefreshLeader";

describe("teamverBffRefreshLeader timing", () => {
  afterEach(() => {
    resetBffRefreshLeaderForTests();
  });

  it("keeps LEADER_WAIT strictly below LOCK_TTL", () => {
    expect(BFF_REFRESH_LEADER_TIMING.leaderWaitMs).toBeLessThan(
      BFF_REFRESH_LEADER_TIMING.lockTtlMs,
    );
  });
});
