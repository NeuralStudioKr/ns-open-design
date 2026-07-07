// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  resetTeamverEmbedBroadcastForTests,
  type EmbedBroadcastMessage,
} from "../src/teamver/teamverEmbedBroadcast";
import {
  dispatchTeamverWorkspaceChanged,
  resetTeamverWorkspaceRelayForTests,
  subscribeTeamverWorkspaceChanged,
} from "../src/teamver/teamverWorkspaceEvents";
import {
  resetTeamverEmbedSessionRelayForTests,
  setTeamverEmbedSessionAuthenticated,
  subscribeTeamverEmbedSessionChanged,
} from "../src/teamver/teamverEmbedSession";

describe("multi-tab embed broadcast", () => {
  const originalBC = globalThis.BroadcastChannel;

  beforeEach(() => {
    resetTeamverEmbedBroadcastForTests();
    resetTeamverWorkspaceRelayForTests();
    resetTeamverEmbedSessionRelayForTests();
    try {
      localStorage.clear();
    } catch {
      // ignore
    }
  });

  afterEach(() => {
    resetTeamverEmbedBroadcastForTests();
    resetTeamverWorkspaceRelayForTests();
    resetTeamverEmbedSessionRelayForTests();
    globalThis.BroadcastChannel = originalBC;
    vi.restoreAllMocks();
  });

  it("dispatchTeamverWorkspaceChanged fans out via BroadcastChannel", () => {
    const posted: EmbedBroadcastMessage[] = [];
    class FakeChannel {
      addEventListener() {}
      removeEventListener() {}
      postMessage(payload: EmbedBroadcastMessage) {
        posted.push(payload);
      }
      close() {}
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.BroadcastChannel = FakeChannel as any;

    dispatchTeamverWorkspaceChanged("WS-42");

    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({
      kind: "workspace-changed",
      workspaceId: "WS-42",
    });
    expect(posted[0]?.sourceId).toBeTypeOf("string");
  });

  it("relays a peer-tab workspace-changed message into a local CustomEvent", () => {
    let onMessage: ((ev: MessageEvent) => void) | null = null;
    class FakeChannel {
      addEventListener(event: string, cb: (ev: MessageEvent) => void) {
        if (event === "message") onMessage = cb;
      }
      removeEventListener() {}
      postMessage() {}
      close() {}
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.BroadcastChannel = FakeChannel as any;

    const seen: string[] = [];
    subscribeTeamverWorkspaceChanged(({ workspaceId }) => {
      seen.push(workspaceId);
    });

    expect(onMessage).toBeInstanceOf(Function);
    onMessage!(
      new MessageEvent("message", {
        data: {
          kind: "workspace-changed",
          workspaceId: "WS-peer",
          sourceId: "other-tab",
          postedAt: 0,
        },
      }),
    );

    expect(seen).toEqual(["WS-peer"]);
  });

  it("drops own-echoes so a dispatch does not re-fire twice", () => {
    const posted: EmbedBroadcastMessage[] = [];
    let onMessage: ((ev: MessageEvent) => void) | null = null;
    class FakeChannel {
      addEventListener(event: string, cb: (ev: MessageEvent) => void) {
        if (event === "message") onMessage = cb;
      }
      removeEventListener() {}
      postMessage(payload: EmbedBroadcastMessage) {
        posted.push(payload);
      }
      close() {}
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.BroadcastChannel = FakeChannel as any;

    const seen: string[] = [];
    subscribeTeamverWorkspaceChanged(({ workspaceId }) => {
      seen.push(workspaceId);
    });

    dispatchTeamverWorkspaceChanged("WS-me");
    onMessage!(
      new MessageEvent("message", { data: posted[0] as unknown as object }),
    );

    expect(seen).toEqual(["WS-me"]);
  });

  it("falls back to the storage event when BroadcastChannel is missing", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).BroadcastChannel = undefined;

    const seen: string[] = [];
    subscribeTeamverWorkspaceChanged(({ workspaceId }) => {
      seen.push(workspaceId);
    });

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "teamver_design_active_workspace_id",
        newValue: "WS-store",
      }),
    );

    expect(seen).toEqual(["WS-store"]);
  });

  it("session-changed peers propagate login (true) but ignore peer logout (false)", () => {
    let onMessage: ((ev: MessageEvent) => void) | null = null;
    class FakeChannel {
      addEventListener(event: string, cb: (ev: MessageEvent) => void) {
        if (event === "message") onMessage = cb;
      }
      removeEventListener() {}
      postMessage() {}
      close() {}
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.BroadcastChannel = FakeChannel as any;

    const seen: boolean[] = [];
    subscribeTeamverEmbedSessionChanged(({ authenticated }) => {
      seen.push(authenticated);
    });

    // Local login still fires.
    setTeamverEmbedSessionAuthenticated(true);
    expect(seen).toEqual([true]);

    // Peer logout must NOT detach streams in this tab — ignore.
    onMessage!(
      new MessageEvent("message", {
        data: {
          kind: "embed-session-changed",
          authenticated: false,
          sourceId: "other-tab",
          postedAt: 0,
        },
      }),
    );
    expect(seen).toEqual([true]);

    // Peer login still syncs when this tab was logged out locally.
    setTeamverEmbedSessionAuthenticated(false);
    seen.length = 0;
    onMessage!(
      new MessageEvent("message", {
        data: {
          kind: "embed-session-changed",
          authenticated: true,
          sourceId: "other-tab-2",
          postedAt: 1,
        },
      }),
    );
    expect(seen).toEqual([true]);
  });
});
