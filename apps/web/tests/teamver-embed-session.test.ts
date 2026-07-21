// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearTeamverEmbedSessionState,
  isTeamverEmbedSessionAuthenticated,
  setTeamverEmbedSessionAuthenticated,
  TEAMVER_EMBED_SESSION_CHANGED_EVENT,
} from "../src/teamver/teamverEmbedSession";

vi.mock("../src/teamver/designApiBase", () => ({
  isTeamverEmbedMode: () => true,
}));

const clearTeamverEmbedListCaches = vi.fn();
vi.mock("../src/teamver/teamverEmbedListCaches", () => ({
  clearTeamverEmbedListCaches: () => clearTeamverEmbedListCaches(),
}));

const workspaceClear = vi.fn();
vi.mock("../src/teamver/designBffClient", () => ({
  getDesignBffClient: () => ({
    workspaceStore: { clear: workspaceClear },
  }),
  clearTeamverRuntimeConfigAuthBlock: vi.fn(),
  isDesignAuthRefreshDeclined: vi.fn(() => false),
}));

describe("teamverEmbedSession", () => {
  afterEach(() => {
    setTeamverEmbedSessionAuthenticated(false);
    clearTeamverEmbedListCaches.mockClear();
    workspaceClear.mockClear();
    localStorage.clear();
  });

  it("gates project lists until authenticated", () => {
    expect(isTeamverEmbedSessionAuthenticated()).toBe(false);
    setTeamverEmbedSessionAuthenticated(true);
    expect(isTeamverEmbedSessionAuthenticated()).toBe(true);
  });

  it("clears workspace + embed list caches when logging out", async () => {
    setTeamverEmbedSessionAuthenticated(true);
    await clearTeamverEmbedSessionState();
    expect(isTeamverEmbedSessionAuthenticated()).toBe(false);
    expect(clearTeamverEmbedListCaches).toHaveBeenCalled();
    expect(workspaceClear).toHaveBeenCalled();
  });

  it("dispatches session-changed when authenticated flips", () => {
    const events: boolean[] = [];
    const handler = (event: Event) => {
      events.push(
        Boolean((event as CustomEvent<{ authenticated?: boolean }>).detail?.authenticated),
      );
    };
    window.addEventListener(TEAMVER_EMBED_SESSION_CHANGED_EVENT, handler);
    try {
      setTeamverEmbedSessionAuthenticated(true);
      setTeamverEmbedSessionAuthenticated(true);
      setTeamverEmbedSessionAuthenticated(false);
      expect(events).toEqual([true, false]);
    } finally {
      window.removeEventListener(TEAMVER_EMBED_SESSION_CHANGED_EVENT, handler);
    }
  });
});
