// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  resolveEmbedBootSessionOptions,
  resolveEmbedFocusSessionOptions,
  shouldResetEmbedRefreshDeclineOnFocus,
} from "../src/teamver/teamverEmbedAuthFlow";
import { TEAMVER_AUTH_RETURN_PENDING_KEY } from "../src/teamver/teamverAuthReturn";

describe("teamverEmbedAuthFlow", () => {
  beforeEach(() => {
    sessionStorage.clear();
    Object.defineProperty(document, "referrer", {
      configurable: true,
      value: "",
      writable: true,
    });
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it("boot opts into auth recovery when sign-in return pending", () => {
    sessionStorage.setItem(TEAMVER_AUTH_RETURN_PENDING_KEY, String(Date.now()));
    expect(resolveEmbedBootSessionOptions()).toEqual({
      force: true,
      resetRefreshState: true,
    });
  });

  it("boot stays routine when not an auth return navigation", () => {
    expect(resolveEmbedBootSessionOptions()).toEqual({
      force: false,
      resetRefreshState: false,
    });
  });

  it("does not reset refresh decline on routine focus", () => {
    expect(
      shouldResetEmbedRefreshDeclineOnFocus({
        cookieHintAppeared: false,
        pageshowPersisted: false,
        authReturnNavigation: false,
      }),
    ).toBe(false);
    expect(
      resolveEmbedFocusSessionOptions({
        cookieHintAppeared: false,
        pageshowPersisted: false,
        authReturnNavigation: false,
      }),
    ).toEqual({ force: true, resetRefreshState: false });
  });

  it("resets refresh decline on auth return and bfcache restore", () => {
    const signals = {
      cookieHintAppeared: false,
      pageshowPersisted: true,
      authReturnNavigation: false,
    };
    expect(shouldResetEmbedRefreshDeclineOnFocus(signals)).toBe(true);
    expect(resolveEmbedFocusSessionOptions(signals)).toEqual({
      force: true,
      resetRefreshState: false,
    });

    const authReturn = {
      cookieHintAppeared: false,
      pageshowPersisted: false,
      authReturnNavigation: true,
    };
    expect(shouldResetEmbedRefreshDeclineOnFocus(authReturn)).toBe(true);
    expect(resolveEmbedFocusSessionOptions(authReturn)).toEqual({
      force: true,
      resetRefreshState: true,
    });
  });
});
