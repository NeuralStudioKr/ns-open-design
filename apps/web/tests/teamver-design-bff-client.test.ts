// @vitest-environment jsdom
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

function setLocation(host: string) {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { hostname: host, href: `https://${host}/` },
  });
}

describe("getDesignBffClient refresh wiring", () => {
  beforeEach(() => {
    ctorMock.mockClear();
    vi.resetModules();
    setLocation("stg-design-api.teamver.com");
  });

  it("passes design-api refreshUrl when cross-origin base is set", async () => {
    const { getDesignBffClient } = await import("../src/teamver/designBffClient");
    getDesignBffClient();
    expect(ctorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiBaseUrl: "https://stg-design-api.teamver.com/api/v1",
        refreshUrl: "https://stg-design-api.teamver.com/api/v1/auth/refresh",
        appKey: "design",
        withCredentials: true,
      }),
    );
  });

  it("passes same-origin BFF refreshUrl when design API base is empty", async () => {
    setLocation("stg-design.teamver.com");
    vi.resetModules();
    const { getDesignBffClient } = await import("../src/teamver/designBffClient");
    getDesignBffClient();
    expect(ctorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiBaseUrl: "/teamver-bff",
        refreshUrl: "/teamver-bff/auth/refresh",
      }),
    );
  });
});
