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

  it("hides PPTX in embed when flag unset (prd)", () => {
    vi.stubEnv("VITE_TEAMVER_PPTX_EXPORT_ENABLE", "");
    expect(isTeamverPptxExportEnabled({ embed: true })).toBe(false);
  });

  it("shows PPTX in embed when staging enables flag", () => {
    vi.stubEnv("VITE_TEAMVER_PPTX_EXPORT_ENABLE", "true");
    expect(isTeamverPptxExportEnabled({ embed: true })).toBe(true);
  });
});
