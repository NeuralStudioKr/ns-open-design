// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { saveMessage } from "../src/state/projects";
import * as teamverDaemonHeaders from "../src/teamver/teamverDaemonHeaders";
import type { ChatMessage } from "../src/types";

type FetchCall = { url: string; init?: RequestInit };

describe("saveMessage keepalive size guard", () => {
  const fetchTeamverDaemonSpy = vi.fn(
    async (_url: string, _init?: RequestInit) => new Response("{}", { status: 200 }),
  );
  const consoleWarnSpy = vi.fn();
  const calls: FetchCall[] = [];

  beforeEach(() => {
    calls.length = 0;
    fetchTeamverDaemonSpy.mockClear();
    consoleWarnSpy.mockClear();
    fetchTeamverDaemonSpy.mockImplementation(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response("{}", { status: 200 });
    });
    vi.spyOn(teamverDaemonHeaders, "fetchTeamverDaemon").mockImplementation(
      fetchTeamverDaemonSpy as unknown as typeof teamverDaemonHeaders.fetchTeamverDaemon,
    );
    vi.spyOn(console, "warn").mockImplementation(consoleWarnSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
    return {
      id: "msg-1",
      role: "assistant",
      content: "hi",
      createdAt: 1,
      ...overrides,
    } as ChatMessage;
  }

  it("sends the full payload for normal (non-keepalive) saves regardless of size", async () => {
    const bigContent = "x".repeat(200_000);
    await saveMessage("proj-1", "conv-1", makeMessage({ content: bigContent }));
    expect(fetchTeamverDaemonSpy).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(calls[0]!.init!.body));
    expect(body.content).toBe(bigContent);
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it("drops heavy optional fields on keepalive when payload exceeds the browser cap", async () => {
    // Small content but huge events array — forces the trim path.
    const heavyEvents = Array.from({ length: 4000 }, (_, i) => ({
      type: "tool_input" as const,
      seq: i,
      payload: "y".repeat(64),
    }));
    await saveMessage(
      "proj-1",
      "conv-1",
      makeMessage({
        content: "small",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        events: heavyEvents as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        producedFiles: [] as any,
      }),
      { keepalive: true },
    );
    expect(fetchTeamverDaemonSpy).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(calls[0]!.init!.body));
    expect(body.content).toBe("small");
    expect(body.events).toBeUndefined();
    expect(body.producedFiles).toBeUndefined();
    // Warn observability record must fire with the byte sizes.
    expect(consoleWarnSpy).toHaveBeenCalled();
    const [, meta] = consoleWarnSpy.mock.calls[0]!;
    expect(meta).toEqual(
      expect.objectContaining({
        projectId: "proj-1",
        conversationId: "conv-1",
        messageId: "msg-1",
        withinCap: true,
      }),
    );
  });

  it("skips the keepalive PUT entirely when even the essentials projection is over the cap", async () => {
    // Content field itself is >56KiB — cannot recover.
    const hugeContent = "z".repeat(80_000);
    await saveMessage(
      "proj-1",
      "conv-1",
      makeMessage({ content: hugeContent }),
      { keepalive: true },
    );
    expect(fetchTeamverDaemonSpy).not.toHaveBeenCalled();
    // Two warns: one for trim attempt, one for the skip.
    expect(consoleWarnSpy).toHaveBeenCalledTimes(2);
    expect(consoleWarnSpy.mock.calls[1]?.[0]).toContain(
      "essentials-only projection still over cap",
    );
  });

  it("logs a warn when the keepalive PUT resolves non-ok", async () => {
    fetchTeamverDaemonSpy.mockImplementation(
      async () => new Response("boom", { status: 500 }),
    );
    await saveMessage(
      "proj-1",
      "conv-1",
      makeMessage(),
      { keepalive: true },
    );
    expect(fetchTeamverDaemonSpy).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "[teamver] chat-save: keepalive PUT non-ok",
      expect.objectContaining({
        projectId: "proj-1",
        conversationId: "conv-1",
        messageId: "msg-1",
        status: 500,
      }),
    );
  });
});
