// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/teamver/designApiBase", () => ({
  isTeamverEmbedMode: vi.fn(() => true),
}));

vi.mock("../src/teamver/teamverEmbedSession", () => ({
  isTeamverEmbedSessionAuthenticated: vi.fn(() => true),
}));

import { isTeamverEmbedSessionAuthenticated } from "../src/teamver/teamverEmbedSession";
import {
  formatTeamverDriveBrowseReloginMessage,
  formatTeamverDrivePanelReloginMessage,
} from "../src/teamver/teamverDriveAuthCopy";

describe("teamverDriveAuthCopy", () => {
  beforeEach(() => {
    vi.mocked(isTeamverEmbedSessionAuthenticated).mockReturnValue(true);
  });

  it("uses transient copy for browse relogin banner while session memory is authenticated", () => {
    expect(formatTeamverDriveBrowseReloginMessage()).toContain("연결");
  });

  it("uses transient copy for publish panel relogin hint while authenticated", () => {
    expect(formatTeamverDrivePanelReloginMessage()).toContain("연결");
  });

  it("uses explicit account mismatch copy for browse and publish surfaces", () => {
    expect(formatTeamverDriveBrowseReloginMessage({ userMismatch: true })).toContain("계정이 달라");
    expect(formatTeamverDrivePanelReloginMessage({ userMismatch: true })).toContain("계정이 달라");
  });
});
