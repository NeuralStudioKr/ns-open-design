import { describe, expect, it, vi } from "vitest";

import { createS3CredentialProvider } from "../src/storage/s3-credential-provider.js";

describe("createS3CredentialProvider", () => {
  it("returns static env credentials without IMDS refresh", async () => {
    const provider = createS3CredentialProvider({
      env: {
        OD_S3_ACCESS_KEY_ID: "AKTEST",
        OD_S3_SECRET_ACCESS_KEY: "secret",
      },
    });
    expect(provider.usesImds).toBe(false);
    await expect(provider.getCredentials()).resolves.toEqual({
      accessKeyId: "AKTEST",
      secretAccessKey: "secret",
    });
  });

  it("reuses cached IMDS credentials outside the refresh margin", async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/token") && init?.method === "PUT") {
        return new Response("token", { status: 200 });
      }
      if (url.endsWith("/iam/security-credentials/")) {
        return new Response("teamver-design-prod-app", { status: 200 });
      }
      if (url.includes("teamver-design-prod-app")) {
        return new Response(
          JSON.stringify({
            Code: "Success",
            AccessKeyId: "ASIA_CACHED",
            SecretAccessKey: "secret",
            Token: "session",
            Expiration: new Date(Date.now() + 2 * 3_600_000).toISOString(),
          }),
          { status: 200 },
        );
      }
      return new Response("not found", { status: 404 });
    });

    const provider = createS3CredentialProvider({ env: {}, fetchFn });
    const first = await provider.getCredentials();
    const callsAfterFirst = fetchFn.mock.calls.length;
    const second = await provider.getCredentials();
    expect(second.accessKeyId).toBe("ASIA_CACHED");
    expect(first.accessKeyId).toBe("ASIA_CACHED");
    expect(fetchFn.mock.calls.length).toBe(callsAfterFirst);
  });

  it("invalidate forces the next getCredentials to re-fetch IMDS", async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/token") && init?.method === "PUT") {
        return new Response("token", { status: 200 });
      }
      if (url.endsWith("/iam/security-credentials/")) {
        return new Response("teamver-design-prod-app", { status: 200 });
      }
      if (url.includes("teamver-design-prod-app")) {
        return new Response(
          JSON.stringify({
            Code: "Success",
            AccessKeyId: "ASIA_TEST",
            SecretAccessKey: "secret",
            Token: "session",
            Expiration: new Date(Date.now() + 3_600_000).toISOString(),
          }),
          { status: 200 },
        );
      }
      return new Response("not found", { status: 404 });
    });

    const provider = createS3CredentialProvider({ env: {}, fetchFn });
    await provider.getCredentials();
    const before = fetchFn.mock.calls.length;
    provider.invalidate();
    await provider.getCredentials();
    expect(fetchFn.mock.calls.length).toBeGreaterThan(before);
  });
});
