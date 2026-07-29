import { afterEach, describe, expect, it, vi } from "vitest";

import { isTeamverPptxExportEnabled } from "../src/teamver/pptxExportEnable";

describe("isTeamverPptxExportEnabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("keeps PPTX on for non-embed", () => {
    expect(isTeamverPptxExportEnabled({ embed: false })).toBe(true);
  });

  it("keeps PPTX on for embed regardless of env", () => {
    vi.stubEnv("VITE_TEAMVER_PPTX_EXPORT_ENABLE", "");
    expect(isTeamverPptxExportEnabled({ embed: true })).toBe(true);
    vi.stubEnv("VITE_TEAMVER_PPTX_EXPORT_ENABLE", "true");
    expect(isTeamverPptxExportEnabled({ embed: true })).toBe(true);
    vi.stubEnv("VITE_TEAMVER_PPTX_EXPORT_ENABLE", "false");
    expect(isTeamverPptxExportEnabled({ embed: true })).toBe(true);
  });
});
