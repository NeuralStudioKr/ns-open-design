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
