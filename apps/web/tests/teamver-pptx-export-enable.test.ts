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

  it("shows PPTX in embed when flag unset (prd default on)", () => {
    vi.stubEnv("VITE_TEAMVER_PPTX_EXPORT_ENABLE", "");
    expect(isTeamverPptxExportEnabled({ embed: true })).toBe(true);
  });

  it("shows PPTX in embed when explicitly enabled", () => {
    vi.stubEnv("VITE_TEAMVER_PPTX_EXPORT_ENABLE", "true");
    expect(isTeamverPptxExportEnabled({ embed: true })).toBe(true);
  });

  it("hides PPTX in embed when explicitly disabled", () => {
    vi.stubEnv("VITE_TEAMVER_PPTX_EXPORT_ENABLE", "false");
    expect(isTeamverPptxExportEnabled({ embed: true })).toBe(false);
  });
});
