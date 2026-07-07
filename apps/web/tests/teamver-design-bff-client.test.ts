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

describe("getDesignBffClient auth recovery wiring", () => {
  beforeEach(() => {
    ctorMock.mockClear();
    vi.unstubAllGlobals();
    vi.resetModules();
    setLocation("stg-design-api.teamver.com");
  });

  it("uses a Design fetch wrapper so SDK auth recovery cannot post refresh on 401", async () => {
    const { getDesignBffClient } = await import("../src/teamver/designBffClient");
    getDesignBffClient();
    expect(ctorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiBaseUrl: "https://stg-design-api.teamver.com/api/v1",
        refreshUrl: "https://stg-design-api.teamver.com/api/v1/auth/refresh",
        appKey: "design",
        withCredentials: true,
        fetch: expect.any(Function),
      }),
    );

    const config = ctorMock.mock.calls[0]?.[0] as { fetch?: typeof fetch };
    const upstreamFetch = vi.fn<typeof fetch>(async () => new Response("ok"));
    vi.stubGlobal("fetch", upstreamFetch);

    const blocked = await config.fetch?.("https://stg-design-api.teamver.com/api/v1/auth/refresh", {
      method: "POST",
    });
    expect(blocked?.status).toBe(401);
    expect(upstreamFetch).not.toHaveBeenCalled();

    await config.fetch?.("https://stg-design-api.teamver.com/api/v1/projects", {
      method: "GET",
    });
    expect(upstreamFetch).toHaveBeenCalledTimes(1);
  });

  it("keeps same-origin BFF refresh configured only for explicit Design refresh calls", async () => {
    setLocation("stg-design.teamver.com");
    vi.resetModules();
    const { getDesignBffClient } = await import("../src/teamver/designBffClient");
    getDesignBffClient();
    expect(ctorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiBaseUrl: "/teamver-bff",
        refreshUrl: "/teamver-bff/auth/refresh",
        fetch: expect.any(Function),
      }),
    );
  });
});
