import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/teamver/teamverViteEnv", () => ({
  readTeamverViteEnv: vi.fn(() => undefined),
  isTeamverViteDev: vi.fn(() => false),
}));

import { isTeamverSourceHtmlCopyEnabled } from "../../src/teamver/sourceHtmlCopyEnable";
import { isTeamverViteDev, readTeamverViteEnv } from "../../src/teamver/teamverViteEnv";

describe("isTeamverSourceHtmlCopyEnabled", () => {
  afterEach(() => {
    vi.mocked(readTeamverViteEnv).mockReturnValue(undefined);
    vi.mocked(isTeamverViteDev).mockReturnValue(false);
  });

  it("honors explicit env enable/disable", () => {
    vi.mocked(readTeamverViteEnv).mockImplementation((key) =>
      key === "VITE_TEAMVER_SOURCE_HTML_COPY_ENABLE" ? "1" : undefined,
    );
    expect(isTeamverSourceHtmlCopyEnabled()).toBe(true);

    vi.mocked(readTeamverViteEnv).mockImplementation((key) =>
      key === "VITE_TEAMVER_SOURCE_HTML_COPY_ENABLE" ? "0" : undefined,
    );
    expect(isTeamverSourceHtmlCopyEnabled()).toBe(false);
  });

  it("defaults on for Vite/local development", () => {
    vi.mocked(isTeamverViteDev).mockReturnValue(true);
    expect(isTeamverSourceHtmlCopyEnabled()).toBe(true);
  });

  it("defaults on for staging design host via site URL", () => {
    vi.mocked(readTeamverViteEnv).mockImplementation((key) =>
      key === "VITE_TEAMVER_SITE_URL" ? "https://stg-design.teamver.com" : undefined,
    );
    expect(isTeamverSourceHtmlCopyEnabled()).toBe(true);
  });

  it("defaults off for production site URL", () => {
    vi.mocked(readTeamverViteEnv).mockImplementation((key) =>
      key === "VITE_TEAMVER_SITE_URL" ? "https://design.teamver.com" : undefined,
    );
    expect(isTeamverSourceHtmlCopyEnabled()).toBe(false);
  });
});
