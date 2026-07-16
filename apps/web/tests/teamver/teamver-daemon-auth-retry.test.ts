/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/teamver/designApiBase", () => ({
  isTeamverEmbedMode: vi.fn(() => true),
  isBootstrapAuthMode: vi.fn(() => true),
}));

const refreshMock = vi.fn(async () => true);
vi.mock("../../src/teamver/designBffClient", () => ({
  refreshDesignAuthCookie: (...args: unknown[]) => refreshMock(...args),
}));

const passiveUnauthorizedMock = vi.fn();
vi.mock("../../src/teamver/teamverEmbedPassiveAuth", () => ({
  handleEmbedPassiveUnauthorized: (...args: unknown[]) => passiveUnauthorizedMock(...args),
}));

vi.mock("../../src/teamver/activeTeamverWorkspace", () => ({
  readActiveTeamverWorkspaceId: vi.fn(async () => null),
}));

vi.mock("../../src/teamver/teamverProjectS3PrefixResolve", () => ({
  resolveTeamverProjectS3PrefixForDaemon: vi.fn(async () => null),
}));

import { fetchTeamverDaemon } from "../../src/teamver/teamverDaemonHeaders";
import { isBootstrapAuthMode, isTeamverEmbedMode } from "../../src/teamver/designApiBase";

const DAEMON_AUTH_RETRY_DELAY_MS = 150;

describe("fetchTeamverDaemon embed auth recovery", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    refreshMock.mockReset();
    refreshMock.mockResolvedValue(true);
    passiveUnauthorizedMock.mockClear();
    vi.mocked(isTeamverEmbedMode).mockReturnValue(true);
    vi.mocked(isBootstrapAuthMode).mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("retries artifact save once after refresh recovers an expired session", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("unauthorized", { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ file: { name: "deck.html" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const resp = await fetchTeamverDaemon("/api/projects/project-1/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "deck.html", content: "<html></html>" }),
    });

    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(resp.status).toBe(200);
    expect(passiveUnauthorizedMock).not.toHaveBeenCalled();
  });

  it("soft-retries once after refresh declines when a sibling may have set cookies", async () => {
    refreshMock.mockResolvedValue(false);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("unauthorized", { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ file: { name: "deck.html" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const pending = fetchTeamverDaemon("/api/projects/project-1/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "deck.html", content: "<html></html>" }),
    });
    await vi.advanceTimersByTimeAsync(DAEMON_AUTH_RETRY_DELAY_MS);
    const resp = await pending;

    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(resp.status).toBe(200);
    expect(passiveUnauthorizedMock).not.toHaveBeenCalled();
  });

  it("delegates to passive auth after refresh and soft retry both fail", async () => {
    refreshMock.mockResolvedValue(false);
    const fetchMock = vi.fn(async () => new Response("unauthorized", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    const pending = fetchTeamverDaemon("/api/projects/project-1/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "deck.html", content: "<html></html>" }),
    });
    await vi.advanceTimersByTimeAsync(DAEMON_AUTH_RETRY_DELAY_MS);
    const resp = await pending;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(resp.status).toBe(401);
    expect(passiveUnauthorizedMock).toHaveBeenCalledWith("daemon");
  });

  it("does not refresh on non-embed mode", async () => {
    vi.mocked(isTeamverEmbedMode).mockReturnValue(false);
    const fetchMock = vi.fn(async () => new Response("unauthorized", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    const resp = await fetchTeamverDaemon("/api/projects/project-1/files", { method: "GET" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(refreshMock).not.toHaveBeenCalled();
    expect(passiveUnauthorizedMock).not.toHaveBeenCalled();
    expect(resp.status).toBe(401);
  });
});
