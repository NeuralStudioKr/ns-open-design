import { describe, expect, it } from "vitest";

import { teamverEndUserPluginMetaOmit } from "../../src/teamver/branding/pluginDetailDisplay";

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
});
