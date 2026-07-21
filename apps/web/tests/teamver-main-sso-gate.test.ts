import { AuthenticationError, NetworkError } from "@teamver/app-sdk";
import { describe, expect, it } from "vitest";
import {
  extractMainSsoGateCodeFromBody,
  extractMainSsoGateCodeFromError,
  isMainSsoGateError,
  isMainSsoUserMismatchError,
} from "../src/teamver/teamverMainSsoGate";

describe("teamverMainSsoGate", () => {
  it("reads Drive-shaped detail/code bodies", () => {
    expect(
      extractMainSsoGateCodeFromBody({
        detail: "main_sso_user_mismatch",
        code: "main_sso_user_mismatch",
        re_login_scope: "main",
      }),
    ).toBe("main_sso_user_mismatch");
    expect(
      extractMainSsoGateCodeFromBody({
        detail: "main_sso_required",
        code: "main_sso_required",
      }),
    ).toBe("main_sso_required");
  });

  it("reads nested DesignDomainError error.message", () => {
    expect(
      extractMainSsoGateCodeFromBody({
        error: { code: "unauthorized", message: "main_sso_user_mismatch" },
      }),
    ).toBe("main_sso_user_mismatch");
  });

  it("reads SDK responseBody even when message is HTTP 401", () => {
    const err = new AuthenticationError({
      status: 401,
      message: "HTTP 401",
      responseBody: {
        detail: "main_sso_user_mismatch",
        code: "main_sso_user_mismatch",
      },
    });
    expect(extractMainSsoGateCodeFromError(err)).toBe("main_sso_user_mismatch");
    expect(isMainSsoUserMismatchError(err)).toBe(true);
    expect(isMainSsoGateError(err)).toBe(true);
  });

  it("reads plain Drive fetch error messages", () => {
    expect(
      extractMainSsoGateCodeFromError(new Error("teamver_drive_main_sso_user_mismatch")),
    ).toBe("main_sso_user_mismatch");
    expect(
      extractMainSsoGateCodeFromError(new NetworkError({ status: 401, message: "main_sso_required" })),
    ).toBe("main_sso_required");
  });
});
