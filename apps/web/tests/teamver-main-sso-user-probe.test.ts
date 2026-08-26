// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/teamver/designApiBase", () => ({
  isTeamverEmbedMode: vi.fn(() => true),
}));

vi.mock("../src/teamver/mainSsoMismatchRecovery", () => ({
  beginMainSsoMismatchRecovery: vi.fn(async () => undefined),
  wasMainSsoMismatchRecoverAttemptedRecently: vi.fn(() => false),
}));

import {
  checkMainSsoUserMatchesSession,
  hashMainSsoUserId,
  readMainSsoUserIdFromDocumentCookie,
  readUnverifiedJwtPayload,
} from "../src/teamver/teamverMainSsoUserProbe";
import {
  maybeReconcileMainSsoWithDesignSession,
  resetMainSsoUserReconcileForTests,
} from "../src/teamver/teamverMainSsoUserReconcile";
import { beginMainSsoMismatchRecovery } from "../src/teamver/mainSsoMismatchRecovery";
import type { DesignAuthSession } from "../src/teamver/designBffClient";

function fakeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: "none" }));
  const body = btoa(JSON.stringify(payload)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${header}.${body}.sig`;
}

describe("teamverMainSsoUserProbe", () => {
  afterEach(() => {
    document.cookie = "teamver_access_token=; Max-Age=0; path=/";
  });

  it("reads user_id from an unverified JWT payload", () => {
    const token = fakeJwt({ user_id: "user-a" });
    expect(readUnverifiedJwtPayload(token)?.user_id).toBe("user-a");
  });

  it("matches session user id when cookie and BFF agree", async () => {
    document.cookie = `teamver_access_token=${fakeJwt({ user_id: "user-a" })}; path=/`;
    expect(readMainSsoUserIdFromDocumentCookie()).toBe("user-a");

    const session: DesignAuthSession = {
      authenticated: true,
      user: { userId: "user-a" },
    };
    await expect(checkMainSsoUserMatchesSession(session)).resolves.toBe("match");
  });

  it("detects mismatch against main_sso_identity_hash", async () => {
    document.cookie = `teamver_access_token=${fakeJwt({ user_id: "user-b" })}; path=/`;
    const hashA = await hashMainSsoUserId("user-a");
    const session: DesignAuthSession = {
      authenticated: true,
      mainSsoIdentityHash: hashA,
      user: { userId: "user-a" },
    };
    await expect(checkMainSsoUserMatchesSession(session)).resolves.toBe("mismatch");
  });

  it("prefers server mainSsoStatus mismatch without cookie", async () => {
    const session: DesignAuthSession = {
      authenticated: true,
      mainSsoStatus: "mismatch",
      user: { userId: "user-a" },
    };
    await expect(checkMainSsoUserMatchesSession(session)).resolves.toBe("mismatch");
  });

  it("prefers server mainSsoStatus match without cookie", async () => {
    const session: DesignAuthSession = {
      authenticated: true,
      mainSsoStatus: "match",
      user: { userId: "user-a" },
    };
    await expect(checkMainSsoUserMatchesSession(session)).resolves.toBe("match");
  });
});

describe("teamverMainSsoUserReconcile", () => {
  afterEach(() => {
    resetMainSsoUserReconcileForTests();
    document.cookie = "teamver_access_token=; Max-Age=0; path=/";
    vi.mocked(beginMainSsoMismatchRecovery).mockClear();
  });

  it("starts recovery on mismatch", async () => {
    document.cookie = `teamver_access_token=${fakeJwt({ user_id: "user-b" })}; path=/`;
    const session: DesignAuthSession = {
      authenticated: true,
      user: { userId: "user-a" },
    };
    await expect(maybeReconcileMainSsoWithDesignSession(session)).resolves.toBe(true);
    expect(beginMainSsoMismatchRecovery).toHaveBeenCalledTimes(1);
  });

  it("starts recovery on server mainSsoStatus mismatch (no cookie)", async () => {
    const session: DesignAuthSession = {
      authenticated: true,
      mainSsoStatus: "mismatch",
      user: { userId: "user-a" },
    };
    await expect(maybeReconcileMainSsoWithDesignSession(session)).resolves.toBe(true);
    expect(beginMainSsoMismatchRecovery).toHaveBeenCalledTimes(1);
  });

  it("no-ops when users match", async () => {
    document.cookie = `teamver_access_token=${fakeJwt({ user_id: "user-a" })}; path=/`;
    const session: DesignAuthSession = {
      authenticated: true,
      user: { userId: "user-a" },
    };
    await expect(maybeReconcileMainSsoWithDesignSession(session)).resolves.toBe(false);
    expect(beginMainSsoMismatchRecovery).not.toHaveBeenCalled();
  });
});
