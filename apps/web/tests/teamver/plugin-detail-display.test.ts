import { describe, expect, it } from "vitest";

import {
  shouldHideTeamverPluginDeveloperChrome,
  teamverEndUserPluginMetaOmit,
  teamverPluginShareTargetUrl,
} from "../../src/teamver/branding/pluginDetailDisplay";

describe("teamverEndUserPluginMetaOmit", () => {
  it("leaves standalone OD inspectors unchanged", () => {
    expect(teamverEndUserPluginMetaOmit({ slideOnlyMvp: false })).toEqual({});
    expect(
      teamverEndUserPluginMetaOmit({ slideOnlyMvp: false }, { description: true }),
    ).toEqual({ description: true });
  });

  it("hides example query and manifest internals in slide-only", () => {
    expect(teamverEndUserPluginMetaOmit({ slideOnlyMvp: true })).toEqual({
      query: true,
      advanced: true,
    });
    expect(
      teamverEndUserPluginMetaOmit({ slideOnlyMvp: true }, { description: true }),
    ).toEqual({
      description: true,
      query: true,
      advanced: true,
    });
  });

  it("hides install/marketplace share chrome only in slide-only", () => {
    expect(shouldHideTeamverPluginDeveloperChrome({ slideOnlyMvp: false })).toBe(false);
    expect(shouldHideTeamverPluginDeveloperChrome({ slideOnlyMvp: true })).toBe(true);
  });

  it("drops open-design.ai plugin URLs when embed hides external share", () => {
    expect(
      teamverPluginShareTargetUrl(
        { hideExternalShareSurfaces: true },
        "https://open-design.ai/marketplace/simple-deck",
      ),
    ).toBeUndefined();
    expect(
      teamverPluginShareTargetUrl(
        { hideExternalShareSurfaces: false },
        "https://open-design.ai/marketplace/simple-deck",
      ),
    ).toBe("https://open-design.ai/marketplace/simple-deck");
    expect(
      teamverPluginShareTargetUrl({ hideExternalShareSurfaces: false }, null),
    ).toBeUndefined();
  });
});
