/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";

import {
  clearEmbedAuthSnapshot,
  EMBED_AUTH_SNAPSHOT_MAX_AGE_MS,
  persistEmbedAuthSnapshot,
  readFreshEmbedAuthSnapshot,
  resetEmbedAuthSnapshotForTests,
} from "../../src/teamver/embedAuthSnapshot";

describe("embedAuthSnapshot", () => {
  afterEach(() => {
    resetEmbedAuthSnapshotForTests();
  });

  it("returns a fresh authenticated snapshot", () => {
    persistEmbedAuthSnapshot({
      session: {
        authenticated: true,
        user: { userId: "u1", email: "a@b.c" },
        defaultWorkspaceId: "ws-1",
        workspaces: [{ id: "ws-1", name: "Alpha" }],
      },
      activeWorkspaceId: "ws-1",
    });
    const snap = readFreshEmbedAuthSnapshot();
    expect(snap?.session.authenticated).toBe(true);
    expect(snap?.activeWorkspaceId).toBe("ws-1");
  });

  it("ignores expired snapshots", () => {
    persistEmbedAuthSnapshot({
      session: { authenticated: true, user: { userId: "u1" } },
      activeWorkspaceId: "ws-1",
    });
    const raw = sessionStorage.getItem("teamver:embed-auth-snapshot-v1");
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    parsed.at = Date.now() - EMBED_AUTH_SNAPSHOT_MAX_AGE_MS - 1;
    sessionStorage.setItem("teamver:embed-auth-snapshot-v1", JSON.stringify(parsed));
    expect(readFreshEmbedAuthSnapshot()).toBeNull();
  });

  it("clears on unauthenticated persist", () => {
    persistEmbedAuthSnapshot({
      session: { authenticated: true, user: { userId: "u1" } },
      activeWorkspaceId: "ws-1",
    });
    persistEmbedAuthSnapshot({
      session: { authenticated: false },
      activeWorkspaceId: null,
    });
    expect(readFreshEmbedAuthSnapshot()).toBeNull();
    clearEmbedAuthSnapshot();
  });
});
