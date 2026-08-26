import { describe, expect, it } from "vitest";

import { resolveEmbedFocusSessionOptions } from "../src/teamver/teamverEmbedAuthFlow";

const baseSignals = {
  cookieHintAppeared: false,
  pageshowPersisted: false,
  authReturnNavigation: false,
};

describe("resolveEmbedFocusSessionOptions", () => {
  it("forces session re-fetch when embed is authenticated (Plan A SSO check)", () => {
    expect(
      resolveEmbedFocusSessionOptions(baseSignals, { embedAuthenticated: true }),
    ).toEqual({
      force: true,
      resetRefreshState: false,
      silent: true,
    });
  });

  it("keeps cache-friendly fetch for cold unauthenticated embed", () => {
    expect(
      resolveEmbedFocusSessionOptions(baseSignals, { embedAuthenticated: false }),
    ).toEqual({
      force: false,
      resetRefreshState: false,
      silent: true,
    });
  });

  it("auth-return still resets sticky decline", () => {
    expect(
      resolveEmbedFocusSessionOptions(
        { ...baseSignals, authReturnNavigation: true },
        { embedAuthenticated: false },
      ),
    ).toEqual({
      force: true,
      resetRefreshState: true,
      silent: true,
    });
  });
});
