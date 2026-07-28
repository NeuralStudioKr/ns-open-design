// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import {
  dispatchTeamverBackgroundRunInactive,
  subscribeTeamverBackgroundRunInactive,
} from "../src/teamver/teamverBackgroundChatEvents";

describe("teamver background run inactive event", () => {
  it("notifies subscribers when user stops a run", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeTeamverBackgroundRunInactive(listener);
    dispatchTeamverBackgroundRunInactive({ projectId: "  PRJ-1  " });
    expect(listener).toHaveBeenCalledWith({ projectId: "PRJ-1" });
    unsubscribe();
  });
});
