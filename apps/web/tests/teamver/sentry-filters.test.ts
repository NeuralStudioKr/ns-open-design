import { describe, expect, it } from "vitest";

import { resolveSentryEnvironment } from "../../src/teamver/sentry/environment";
import {
  SENTRY_IGNORE_ERRORS,
  shouldDropSentryEvent,
} from "../../src/teamver/sentry/eventFilters";

describe("teamver sentry environment", () => {
  it("prefers explicit NEXT_PUBLIC_SENTRY_ENVIRONMENT", () => {
    const prev = process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT;
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT = "staging";
    try {
      expect(resolveSentryEnvironment()).toBe("staging");
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT;
      else process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT = prev;
    }
  });

  it("infers staging from VITE_TEAMVER_SITE_URL", () => {
    const prevEnv = process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT;
    const prevSite = process.env.VITE_TEAMVER_SITE_URL;
    delete process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT;
    process.env.VITE_TEAMVER_SITE_URL = "https://stg-design.teamver.com";
    try {
      expect(resolveSentryEnvironment()).toBe("staging");
    } finally {
      if (prevEnv === undefined) delete process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT;
      else process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT = prevEnv;
      if (prevSite === undefined) delete process.env.VITE_TEAMVER_SITE_URL;
      else process.env.VITE_TEAMVER_SITE_URL = prevSite;
    }
  });
});

describe("teamver sentry event filters", () => {
  it("drops unauthorized / network noise", () => {
    expect(shouldDropSentryEvent({ message: "Unauthorized" })).toBe(true);
    expect(shouldDropSentryEvent({ message: "Failed to fetch" })).toBe(true);
    expect(shouldDropSentryEvent({ message: "ZeroDivisionError" })).toBe(false);
  });

  it("drops 401/403/429 via tags", () => {
    expect(
      shouldDropSentryEvent({ message: "oops", tags: { "http.status_code": 401 } }),
    ).toBe(true);
  });

  it("exports ignoreErrors list", () => {
    expect(SENTRY_IGNORE_ERRORS.length).toBeGreaterThan(5);
  });
});
