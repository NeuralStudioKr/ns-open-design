// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  readRememberedTeamverProjectConversation,
  rememberTeamverProjectConversation,
} from "../src/teamver/teamverProjectConversationMemory";

describe("teamverProjectConversationMemory", () => {
  afterEach(() => {
    window.sessionStorage.clear();
  });

  it("remembers and reads the last conversation per project", () => {
    rememberTeamverProjectConversation("proj-a", "conv-1");
    rememberTeamverProjectConversation("proj-b", "conv-2");
    expect(readRememberedTeamverProjectConversation("proj-a")).toBe("conv-1");
    expect(readRememberedTeamverProjectConversation("proj-b")).toBe("conv-2");
    rememberTeamverProjectConversation("proj-a", "conv-3");
    expect(readRememberedTeamverProjectConversation("proj-a")).toBe("conv-3");
  });

  it("returns null for unknown projects", () => {
    expect(readRememberedTeamverProjectConversation("missing")).toBeNull();
  });
});
