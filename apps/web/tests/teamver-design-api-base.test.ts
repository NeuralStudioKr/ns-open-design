// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function setLocation(host: string) {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { hostname: host, href: `https://${host}/` },
  });
}

describe("resolveTeamverDesignApiBase", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("VITE_TEAMVER_EMBED", "1");
    delete process.env.VITE_TEAMVER_DESIGN_API_URL;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses same-origin BFF on stg-design host", async () => {
    setLocation("stg-design.teamver.com");
    const { resolveTeamverDesignApiBase } = await import("../src/teamver/designApiBase");
    expect(resolveTeamverDesignApiBase()).toBe("");
  });

  it("uses same-origin BFF on production design host", async () => {
    setLocation("design.teamver.com");
    const { resolveTeamverDesignApiBase } = await import("../src/teamver/designApiBase");
    expect(resolveTeamverDesignApiBase()).toBe("");
  });

  it("keeps cross-origin API host when already on design-api subdomain", async () => {
    setLocation("stg-design-api.teamver.com");
    const { resolveTeamverDesignApiBase } = await import("../src/teamver/designApiBase");
    expect(resolveTeamverDesignApiBase()).toBe("https://stg-design-api.teamver.com");
  });
});

describe("resolveDesignBffRefreshUrl", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.VITE_TEAMVER_DESIGN_API_URL;
  });

  it("uses same-origin refresh on stg-design host", async () => {
    setLocation("stg-design.teamver.com");
    const { resolveDesignBffRefreshUrl } = await import("../src/teamver/designApiBase");
    expect(resolveDesignBffRefreshUrl()).toBe("/teamver-bff/auth/refresh");
  });
});

describe("redirectToTeamverLogin cooldown", () => {
  beforeEach(() => {
    vi.resetModules();
    sessionStorage.clear();
  });

  it("dedupes rapid login redirects", async () => {
    const replace = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { replace, hostname: "stg-design.teamver.com", href: "https://stg-design.teamver.com/" },
    });
    const { redirectToTeamverLogin } = await import("../src/teamver/designApiBase");
    redirectToTeamverLogin();
    redirectToTeamverLogin();
    expect(replace).toHaveBeenCalledTimes(1);
  });
});
