// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const initMock = vi.fn();
const registerMock = vi.fn();

vi.mock("posthog-js", () => {
  const stub = {
    init: initMock,
    register: registerMock,
    opt_in_capturing: vi.fn(),
    opt_out_capturing: vi.fn(),
    reset: vi.fn(),
    identify: vi.fn(),
  };
  initMock.mockImplementation((_key: string, config: { loaded?: (instance: unknown) => void }) => {
    config.loaded?.(stub);
    return stub;
  });
  return { default: stub };
});

const context = {
  anonymousId: "anon-1",
  sessionId: "sess-1",
  clientType: "web" as const,
  locale: "en",
  appVersion: "1.2.3",
};

function analyticsConfig(enabled: boolean) {
  return {
    enabled,
    env: "staging",
    key: "phc_test",
    host: "https://us.i.posthog.com",
    installationId: "install-1",
  };
}

describe("/api/analytics/config cache", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("shares the boot config fetch between error tracking and PostHog init", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(analyticsConfig(true)), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { bootstrapExceptionTracking, getAnalyticsClient } = await import("../src/analytics/client");
    await Promise.all([
      bootstrapExceptionTracking(context),
      getAnalyticsClient(context),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(initMock).toHaveBeenCalledTimes(1);
  });

  it("caches disabled analytics config so repeated track attempts do not refetch", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(analyticsConfig(false)), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { getAnalyticsClient } = await import("../src/analytics/client");
    await getAnalyticsClient(context);
    await getAnalyticsClient(context);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(initMock).not.toHaveBeenCalled();
  });

  it("lets explicit consent refresh bypass a cached disabled response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(analyticsConfig(false)), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(analyticsConfig(true)), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { getAnalyticsClient } = await import("../src/analytics/client");
    await getAnalyticsClient(context);
    await getAnalyticsClient(context, { forceConfig: true });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(initMock).toHaveBeenCalledTimes(1);
  });
});
