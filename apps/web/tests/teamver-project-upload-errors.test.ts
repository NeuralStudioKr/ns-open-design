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
  formatProjectUploadFailureDetail,
  resolveProjectUploadBatchErrorMessage,
  throwIfProjectCommentUploadIncomplete,
} from "../src/teamver/projectUploadErrors";

describe("projectUploadErrors", () => {
  beforeEach(() => {
    vi.mocked(isTeamverEmbedSessionAuthenticated).mockReturnValue(true);
  });

  it("maps upload 401 detail to transient embed copy", () => {
    expect(
      formatProjectUploadFailureDetail("upload failed (401)"),
    ).toContain("연결");
  });

  it("resolveProjectUploadBatchErrorMessage surfaces auth copy in slide-only mode", () => {
    expect(
      resolveProjectUploadBatchErrorMessage({
        uploadedCount: 0,
        failedCount: 2,
        error: "upload failed (401)",
        slideOnlyMvp: true,
      }),
    ).toContain("연결");
  });

  it("throwIfProjectCommentUploadIncomplete throws auth-aware message", () => {
    expect(() =>
      throwIfProjectCommentUploadIncomplete(
        { uploaded: [], failed: [{ name: "a.png", error: "upload failed (401)" }], error: "upload failed (401)" },
        1,
      ),
    ).toThrow(/연결|로그인/);
  });
});
