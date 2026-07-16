// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/teamver/designApiBase", () => ({
  isTeamverEmbedMode: vi.fn(() => true),
}));

vi.mock("../src/teamver/teamverEmbedSession", () => ({
  isTeamverEmbedSessionAuthenticated: vi.fn(() => true),
}));

import { isTeamverEmbedSessionAuthenticated } from "../src/teamver/teamverEmbedSession";
import { TeamverDaemonUnauthorizedError } from "../src/teamver/teamverDaemonHeaders";
import {
  formatProjectGetErrorForUser,
  formatProjectListErrorForUser,
} from "../src/teamver/projectErrorMessages";
import { loadProjectListSafe } from "../src/teamver/loadProjectList";

describe("project list auth errors", () => {
  beforeEach(() => {
    vi.mocked(isTeamverEmbedSessionAuthenticated).mockReturnValue(true);
  });

  it("formatProjectListErrorForUser prefers transient copy while authenticated", () => {
    expect(formatProjectListErrorForUser(new TeamverDaemonUnauthorizedError())).toContain(
      "연결",
    );
  });

  it("formatProjectGetErrorForUser prefers transient copy while authenticated", () => {
    expect(formatProjectGetErrorForUser(new TeamverDaemonUnauthorizedError())).toContain(
      "연결",
    );
  });

  it("loadProjectListSafe maps daemon unauthorized to a user-facing error", async () => {
    vi.spyOn(
      await import("../src/state/projects"),
      "listProjects",
    ).mockRejectedValue(new TeamverDaemonUnauthorizedError());

    const result = await loadProjectListSafe();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorMessage).toContain("연결");
    }
  });
});
