// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { requestProxyAbort } from "../src/providers/proxyAbort";
import * as teamverDaemonHeaders from "../src/teamver/teamverDaemonHeaders";

describe("requestProxyAbort — conversation scoping", () => {
  const daemonFetchMock = vi.fn(async () => new Response("{}"));

  beforeEach(() => {
    daemonFetchMock.mockClear();
    vi.spyOn(teamverDaemonHeaders, "fetchTeamverDaemon").mockImplementation(
      daemonFetchMock as unknown as typeof teamverDaemonHeaders.fetchTeamverDaemon,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("includes conversationId in the abort body when supplied", () => {
    requestProxyAbort("stream-abc", { conversationId: "conv-42" });
    expect(daemonFetchMock).toHaveBeenCalledTimes(1);
    const [, init] = daemonFetchMock.mock.calls[0]!;
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body).toEqual({ streamId: "stream-abc", conversationId: "conv-42" });
  });

  it("omits conversationId when the caller does not supply one", () => {
    requestProxyAbort("stream-abc");
    expect(daemonFetchMock).toHaveBeenCalledTimes(1);
    const [, init] = daemonFetchMock.mock.calls[0]!;
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body).toEqual({ streamId: "stream-abc" });
  });

  it("trims whitespace off conversationId and drops empty strings", () => {
    requestProxyAbort("stream-abc", { conversationId: "  " });
    const [, init] = daemonFetchMock.mock.calls[0]!;
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body).toEqual({ streamId: "stream-abc" });
  });

  it("skips the POST entirely when streamId is falsy", () => {
    requestProxyAbort("");
    expect(daemonFetchMock).not.toHaveBeenCalled();
  });
});
