import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = resolve(import.meta.dirname, "..");

function readSource(relativePath: string): string {
  return readFileSync(resolve(webRoot, relativePath), "utf8");
}

describe("Teamver embed API polling cadence", () => {
  it("throttles focus auth probes instead of force-refreshing every visibility event", () => {
    const source = readSource("src/teamver/useTeamverEmbed.ts");
    const bffSource = readSource("src/teamver/designBffClient.ts");

    expect(source).toContain("FOCUS_SESSION_REFRESH_MIN_INTERVAL_MS = 5 * 60_000");
    expect(source).toContain("lastFocusSessionRefreshAtRef");
    expect(source).toContain("shouldResetEmbedRefreshDeclineOnFocus(focusSignals)");
    expect(source).toContain("bypassThrottle: shouldResetEmbedRefreshDeclineOnFocus(focusSignals)");
    expect(source).not.toContain("invalidateDesignAuthSessionCache();\n      scheduleFocusSessionRefresh();");
    expect(bffSource).toContain("SESSION_CACHE_MS = 60_000");
  });

  it("uses adaptive non-overlapping /api/runs polling instead of a 2s fixed interval", () => {
    const source = readSource("src/App.tsx");

    expect(source).toContain("RUNS_POLL_ACTIVE_MS = 5_000");
    expect(source).toContain("RUNS_POLL_IDLE_MS = 30_000");
    expect(source).toContain("RUNS_POLL_IDLE_HIDDEN_MS = 120_000");
    expect(source).toContain("runsPollInFlight");
    expect(source).toContain("runsPollPending");
    expect(source).toContain("nextRunsPollDelay");
    expect(source).toContain("handleRunsVisibilityChange");
    expect(source).not.toContain("window.setInterval(refresh, 2000)");
  });
});
