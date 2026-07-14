// @vitest-environment jsdom
import { NetworkError } from "@teamver/app-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirectMock, resolveReturnMock } = vi.hoisted(() => ({
  redirectMock: vi.fn(),
  resolveReturnMock: vi.fn((pathname: string, search = "") => `${pathname}${search}`),
}));

vi.mock("../src/teamver/designAuthFlow", () => ({
  redirectToTeamverLoginPreservingRoute: redirectMock,
}));

vi.mock("../src/teamver/teamverEmbedAuthNavigation", () => ({
  resolveEmbedAuthReturnPath: resolveReturnMock,
}));

import {
  isTeamverBffUnauthorizedError,
  redirectToTeamverLoginFromEmbed,
} from "../src/teamver/teamverBffAuthError";

describe("isTeamverBffUnauthorizedError", () => {
  it("matches SDK NetworkError with status 401", () => {
    expect(
      isTeamverBffUnauthorizedError(new NetworkError({ status: 401, message: "unauth" })),
    ).toBe(true);
  });

  it("ignores other NetworkError statuses so we don't route 500/403/429 through re-login", () => {
    expect(
      isTeamverBffUnauthorizedError(new NetworkError({ status: 500, message: "boom" })),
    ).toBe(false);
    expect(
      isTeamverBffUnauthorizedError(new NetworkError({ status: 403, message: "forbidden" })),
    ).toBe(false);
    expect(
      isTeamverBffUnauthorizedError(new NetworkError({ status: 0, message: "network" })),
    ).toBe(false);
  });

  it("matches the plain-Error shape thrown by driveApi.ts on 401", () => {
    // `getTeamverDriveJson` (`teamver-bff/drive/api/…`) does not use the SDK
    // client, so its 401 arrives as `Error("teamver_drive_fetch_failed:401")`.
    expect(
      isTeamverBffUnauthorizedError(new Error("teamver_drive_fetch_failed:401")),
    ).toBe(true);
    expect(
      isTeamverBffUnauthorizedError(new Error("teamver_drive_fetch_failed: 401")),
    ).toBe(true);
  });

  it("matches Invalid token messages from Main BE pass-through", () => {
    expect(isTeamverBffUnauthorizedError(new Error("Invalid token"))).toBe(true);
    expect(isTeamverBffUnauthorizedError(new Error('{"detail":"Invalid token"}'))).toBe(true);
  });

  it("does not match unrelated drive 4xx/5xx codes", () => {
    expect(
      isTeamverBffUnauthorizedError(new Error("teamver_drive_fetch_failed:403")),
    ).toBe(false);
    expect(
      isTeamverBffUnauthorizedError(new Error("teamver_drive_fetch_failed:500")),
    ).toBe(false);
    expect(isTeamverBffUnauthorizedError(new Error("outputs_fetch_failed"))).toBe(false);
  });

  it("does not match non-error values", () => {
    expect(isTeamverBffUnauthorizedError(null)).toBe(false);
    expect(isTeamverBffUnauthorizedError(undefined)).toBe(false);
    expect(isTeamverBffUnauthorizedError("401")).toBe(false);
    expect(isTeamverBffUnauthorizedError({ status: 401 })).toBe(false);
  });
});

describe("redirectToTeamverLoginFromEmbed", () => {
  beforeEach(() => {
    redirectMock.mockReset();
    resolveReturnMock.mockClear();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        pathname: "/projects/PRJ-1/conversations/CVR-1/files/deck.html",
        search: "?ts=1",
      },
    });
  });

  it("delegates to redirectToTeamverLoginPreservingRoute with the current embed route as returnTo", () => {
    redirectToTeamverLoginFromEmbed();
    expect(resolveReturnMock).toHaveBeenCalledWith(
      "/projects/PRJ-1/conversations/CVR-1/files/deck.html",
      "?ts=1",
    );
    expect(redirectMock).toHaveBeenCalledWith({
      returnTo: "/projects/PRJ-1/conversations/CVR-1/files/deck.html?ts=1",
    });
  });
});
