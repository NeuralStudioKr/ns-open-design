/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/teamver/designApiBase", () => ({
  isTeamverEmbedMode: vi.fn(() => true),
  isBootstrapAuthMode: vi.fn(() => true),
}));

vi.mock("../../src/teamver/teamverEmbedSession", () => ({
  isTeamverEmbedSessionAuthenticated: vi.fn(() => true),
}));

const refreshMock = vi.fn(async () => true);
const probeSessionMock = vi.fn(async () => false);
const ensureSessionMock = vi.fn(async () => false);
const clearDeclineMock = vi.fn();
const declinedMock = vi.fn(() => false);
const hardDeclineMock = vi.fn(() => false);
vi.mock("../../src/teamver/designBffClient", () => ({
  refreshDesignAuthCookie: (...args: unknown[]) => refreshMock(...args),
  probeDesignBffSessionAuthenticated: (...args: unknown[]) => probeSessionMock(...args),
  ensureDesignBffSessionAuthenticated: (...args: unknown[]) => ensureSessionMock(...args),
  clearDesignAuthRefreshDecline: (...args: unknown[]) => clearDeclineMock(...args),
  isDesignAuthRefreshDeclined: (...args: unknown[]) => declinedMock(...args),
  isDesignAuthRefreshDeclineHard: (...args: unknown[]) => hardDeclineMock(...args),
}));

const passiveUnauthorizedMock = vi.fn();
vi.mock("../../src/teamver/teamverEmbedPassiveAuth", () => ({
  handleEmbedPassiveUnauthorized: (...args: unknown[]) => passiveUnauthorizedMock(...args),
}));

const readActiveWorkspaceMock = vi.fn(async () => null);
vi.mock("../../src/teamver/activeTeamverWorkspace", () => ({
  readActiveTeamverWorkspaceId: (...args: unknown[]) => readActiveWorkspaceMock(...args),
}));

vi.mock("../../src/teamver/teamverProjectS3PrefixResolve", () => ({
  resolveTeamverProjectS3PrefixForDaemon: vi.fn(async () => null),
}));

import { fetchTeamverDaemon } from "../../src/teamver/teamverDaemonHeaders";
import { isBootstrapAuthMode, isTeamverEmbedMode } from "../../src/teamver/designApiBase";

const DAEMON_AUTH_RETRY_DELAY_MS = 400;

describe("fetchTeamverDaemon embed auth recovery", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    refreshMock.mockReset();
    refreshMock.mockResolvedValue(true);
    probeSessionMock.mockReset();
    probeSessionMock.mockResolvedValue(false);
    ensureSessionMock.mockReset();
    ensureSessionMock.mockResolvedValue(false);
    clearDeclineMock.mockClear();
    declinedMock.mockReset();
    declinedMock.mockReturnValue(false);
    hardDeclineMock.mockReset();
    hardDeclineMock.mockReturnValue(false);
    passiveUnauthorizedMock.mockClear();
    readActiveWorkspaceMock.mockClear();
    readActiveWorkspaceMock.mockResolvedValue(null);
    vi.mocked(isTeamverEmbedMode).mockReturnValue(true);
    vi.mocked(isBootstrapAuthMode).mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("skips soft-sticky refresh ladder when skipEmbedAuthRecovery is set", async () => {
    vi.useRealTimers();
    const fetchMock = vi.fn().mockResolvedValue(new Response("unauthorized", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    const resp = await fetchTeamverDaemon("/api/proxy/active?projectId=p1", {
      teamverProjectId: "p1",
      skipEmbedAuthRecovery: true,
    });

    expect(resp.status).toBe(401);
    expect(refreshMock).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(passiveUnauthorizedMock).toHaveBeenCalled();
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
    expect(clearDeclineMock).toHaveBeenCalled();
    expect(passiveUnauthorizedMock).not.toHaveBeenCalled();
  });

  it("can recover daemon auth without active workspace preflight for best-effort endpoints", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("unauthorized", { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const resp = await fetchTeamverDaemon("/api/memory/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      teamverProjectId: "project-1",
      skipTeamverWorkspaceHeaders: true,
      body: JSON.stringify({ userMessage: "hello" }),
    });

    expect(resp.status).toBe(200);
    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(readActiveWorkspaceMock).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
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
    expect(clearDeclineMock).toHaveBeenCalled();
    expect(passiveUnauthorizedMock).not.toHaveBeenCalled();
  });

  it("delegates to passive auth after refresh and soft retry both fail", async () => {
    refreshMock.mockResolvedValue(false);
    probeSessionMock.mockResolvedValue(false);
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
    expect(probeSessionMock).toHaveBeenCalled();
    expect(passiveUnauthorizedMock).toHaveBeenCalledWith("daemon");
  });

  it("does not clear sticky decline on probe-alive alone when daemon fetch stays 401", async () => {
    refreshMock.mockResolvedValue(false);
    probeSessionMock.mockResolvedValue(true);
    const fetchMock = vi.fn(async () => new Response("unauthorized", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    const pending = fetchTeamverDaemon("/api/projects/project-1/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "deck.html", content: "<html></html>" }),
    });
    await vi.advanceTimersByTimeAsync(DAEMON_AUTH_RETRY_DELAY_MS);
    const resp = await pending;

    expect(resp.status).toBe(401);
    // Probe-alive without a successful daemon retry must not unlock soft sticky.
    expect(clearDeclineMock).not.toHaveBeenCalled();
    expect(passiveUnauthorizedMock).toHaveBeenCalledWith("daemon");
  });

  it("runs soft-sticky survival refresh instead of skipping daemon recovery", async () => {
    declinedMock.mockReturnValue(true);
    hardDeclineMock.mockReturnValue(false);
    refreshMock.mockResolvedValue(false);
    const fetchMock = vi.fn(async () => new Response("unauthorized", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    const resp = await fetchTeamverDaemon("/api/projects/project-1/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "deck.html", content: "<html></html>" }),
    });

    expect(resp.status).toBe(401);
    // Soft sticky mutations still attempt cooldown-gated survival refresh
    // (allowSoftForcePost) so conversation save / artifact write can revive.
    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(refreshMock).toHaveBeenCalledWith({ allowSoftForcePost: true });
    expect(probeSessionMock).not.toHaveBeenCalled();
    expect(ensureSessionMock).not.toHaveBeenCalled();
    expect(passiveUnauthorizedMock).toHaveBeenCalledWith("daemon");
  });

  it("skips soft-sticky recovery on GET/HEAD polls", async () => {
    declinedMock.mockReturnValue(true);
    hardDeclineMock.mockReturnValue(false);
    const fetchMock = vi.fn(async () => new Response("unauthorized", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    const resp = await fetchTeamverDaemon("/api/projects/project-1/files?name=deck.html", {
      method: "GET",
    });

    expect(resp.status).toBe(401);
    expect(refreshMock).not.toHaveBeenCalled();
    expect(probeSessionMock).not.toHaveBeenCalled();
    expect(ensureSessionMock).not.toHaveBeenCalled();
    expect(passiveUnauthorizedMock).toHaveBeenCalledWith("daemon");
  });

  it("skips recovery ladder when hard sticky already declined", async () => {
    declinedMock.mockReturnValue(true);
    hardDeclineMock.mockReturnValue(true);
    refreshMock.mockResolvedValue(false);
    const fetchMock = vi.fn(async () => new Response("unauthorized", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    const resp = await fetchTeamverDaemon("/api/projects/project-1/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "deck.html", content: "<html></html>" }),
    });

    expect(resp.status).toBe(401);
    expect(refreshMock).not.toHaveBeenCalled();
    expect(probeSessionMock).not.toHaveBeenCalled();
    expect(ensureSessionMock).not.toHaveBeenCalled();
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
