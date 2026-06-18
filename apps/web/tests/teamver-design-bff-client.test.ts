import { beforeEach, describe, expect, it, vi } from "vitest";

const ctorMock = vi.fn();

vi.mock("@teamver/app-sdk", () => ({
  TeamverClient: class MockTeamverClient {
    constructor(config: unknown) {
      ctorMock(config);
    }
  },
  createLocalStorageWorkspaceStore: vi.fn(() => ({})),
}));

vi.mock("../src/teamver/designApiBase", () => ({
  isTeamverEmbedMode: vi.fn(() => true),
  resolveTeamverDesignApiBase: vi.fn(() => "https://stg-design-api.teamver.com"),
  resolveTeamverLoginUrl: vi.fn(() => "https://stg.teamver.com/auth/signin"),
  resolveTeamverMainApiBaseUrl: vi.fn(() => "https://stg-api.teamver.com"),
}));

describe("getDesignBffClient refresh wiring", () => {
  beforeEach(() => {
    ctorMock.mockClear();
    vi.resetModules();
  });

  it("passes Main BE refreshUrl to TeamverClient", async () => {
    const { getDesignBffClient } = await import("../src/teamver/designBffClient");
    getDesignBffClient();
    expect(ctorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiBaseUrl: "https://stg-design-api.teamver.com/api/v1",
        refreshUrl: "https://stg-api.teamver.com/api/auth/refresh",
        appKey: "design",
        withCredentials: true,
      }),
    );
  });
});
