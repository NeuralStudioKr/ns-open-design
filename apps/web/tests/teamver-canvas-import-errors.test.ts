import { NetworkError } from "@teamver/app-sdk";
import { describe, expect, it } from "vitest";
import {
  extractCanvasImportErrorCode,
  formatCanvasImportErrorForUser,
  formatTeamverCanvasImportErrorMessage,
} from "../src/teamver/importCanvas";

describe("formatCanvasImportErrorForUser", () => {
  it("maps stable canvas_* codes", () => {
    expect(formatCanvasImportErrorForUser("canvas_export_forbidden")).toContain("권한");
    expect(formatCanvasImportErrorForUser("canvas_import_busy")).toContain("많");
  });

  it("maps bare HTTP status strings from SDK", () => {
    expect(formatCanvasImportErrorForUser("HTTP 403")).toContain("권한");
    expect(formatCanvasImportErrorForUser("HTTP 429")).toContain("많");
  });
});

describe("extractCanvasImportErrorCode / formatTeamverCanvasImportErrorMessage", () => {
  it("prefers nested error.message over HTTP status fallback", () => {
    const err = new NetworkError({
      message: "HTTP 403",
      status: 403,
      responseBody: { error: { code: "forbidden", message: "canvas_export_forbidden" } },
    });
    expect(extractCanvasImportErrorCode(err)).toBe("canvas_export_forbidden");
    expect(formatTeamverCanvasImportErrorMessage(err)).toContain("권한");
  });

  it("maps Drive-shaped session_expired detail body", () => {
    const err = new NetworkError({
      message: "HTTP 401",
      status: 401,
      responseBody: {
        detail: "session_expired",
        login_url: "https://stg.teamver.com/auth/signin",
      },
    });
    expect(extractCanvasImportErrorCode(err)).toBe("session_expired");
    expect(formatTeamverCanvasImportErrorMessage(err)).toContain("로그인");
  });

  it("maps AuthenticationError main_sso_user_mismatch from responseBody", async () => {
    const { AuthenticationError } = await import("@teamver/app-sdk");
    const err = new AuthenticationError({
      message: "HTTP 401",
      status: 401,
      responseBody: {
        detail: "main_sso_user_mismatch",
        code: "main_sso_user_mismatch",
        re_login_scope: "main",
      },
    });
    expect(extractCanvasImportErrorCode(err)).toBe("main_sso_user_mismatch");
    expect(formatTeamverCanvasImportErrorMessage(err)).toContain("연결");
  });

  it("maps session_expired / 401 to re-login copy, not canvas forbidden", () => {
    const err = new NetworkError({
      message: "HTTP 401",
      status: 401,
      responseBody: { error: { code: "unauthorized", message: "session_expired" } },
    });
    expect(extractCanvasImportErrorCode(err)).toBe("session_expired");
    expect(formatTeamverCanvasImportErrorMessage(err)).toContain("로그인");
  });

  it("maps od_daemon_import_failed from 502 body message", () => {
    const err = new NetworkError({
      message: "HTTP 502",
      status: 502,
      responseBody: {
        error: { code: "od_daemon_import_failed", message: "od_daemon_import_failed" },
      },
    });
    expect(extractCanvasImportErrorCode(err)).toBe("od_daemon_import_failed");
    expect(formatTeamverCanvasImportErrorMessage(err)).toContain("Design");
  });

  it("falls back to status when body lacks canvas_* token", () => {
    const err = new NetworkError({
      message: "HTTP 403",
      status: 403,
      responseBody: { error: { code: "forbidden", message: "Forbidden" } },
    });
    expect(extractCanvasImportErrorCode(err)).toBe("canvas_export_forbidden");
  });

  it("maps 429 to canvas_import_busy", () => {
    const err = new NetworkError({ message: "HTTP 429", status: 429 });
    expect(extractCanvasImportErrorCode(err)).toBe("canvas_import_busy");
    expect(formatTeamverCanvasImportErrorMessage(err)).toContain("많");
  });
});
