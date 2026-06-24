import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../src/teamver/designBffClient", () => ({
  fetchTeamverRuntimeConfig: vi.fn(),
}));

vi.mock("../src/teamver/branding/pinnedExecutionConfig", () => ({
  pinTeamverExecutionConfig: vi.fn(),
}));

import {
  mergeTeamverRuntimeConfigIntoAppConfig,
  reloadTeamverRuntimeConfigIntoAppConfig,
} from "../src/teamver/applyTeamverRuntimeConfig";
import { fetchTeamverRuntimeConfig } from "../src/teamver/designBffClient";
import { pinTeamverExecutionConfig } from "../src/teamver/branding/pinnedExecutionConfig";
import type { AppConfig } from "../src/types";

const mockedFetch = vi.mocked(fetchTeamverRuntimeConfig);
const mockedPin = vi.mocked(pinTeamverExecutionConfig);

function baseConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    mode: "api",
    apiKey: "k-prev",
    apiProtocol: "anthropic",
    baseUrl: "https://api.example.com",
    model: "claude-prev",
    apiProtocolConfigs: {},
    ...overrides,
  } as AppConfig;
}

describe("reloadTeamverRuntimeConfigIntoAppConfig", () => {
  beforeEach(() => {
    mockedFetch.mockReset();
    mockedPin.mockReset();
  });

  it("returns the same config reference when runtime-config is null", async () => {
    mockedFetch.mockResolvedValue(null);
    const prev = baseConfig();
    const next = await reloadTeamverRuntimeConfigIntoAppConfig(prev);
    expect(next).toBe(prev);
    expect(mockedPin).not.toHaveBeenCalled();
  });

  it("returns the same config reference when configured=false", async () => {
    mockedFetch.mockResolvedValue({ configured: false });
    const prev = baseConfig();
    const next = await reloadTeamverRuntimeConfigIntoAppConfig(prev);
    expect(next).toBe(prev);
    expect(mockedPin).not.toHaveBeenCalled();
  });

  it("returns the same config reference when merged values match the previous config", async () => {
    mockedFetch.mockResolvedValue({
      configured: true,
      apiKey: "k-prev",
      apiProtocol: "anthropic",
      baseUrl: "https://api.example.com",
      model: "claude-prev",
    });
    const prev = baseConfig();
    const next = await reloadTeamverRuntimeConfigIntoAppConfig(prev);
    expect(next).toBe(prev);
    // pin is still invoked to keep the lock fresh, but config reference is reused
    expect(mockedPin).toHaveBeenCalledTimes(1);
  });

  it("returns a new config when the runtime API key rotates", async () => {
    mockedFetch.mockResolvedValue({
      configured: true,
      apiKey: "k-rotated",
      apiProtocol: "anthropic",
      baseUrl: "https://api.example.com",
      model: "claude-prev",
    });
    const prev = baseConfig();
    const next = await reloadTeamverRuntimeConfigIntoAppConfig(prev);
    expect(next).not.toBe(prev);
    expect(next.apiKey).toBe("k-rotated");
    expect(next.mode).toBe("api");
    expect(mockedPin).toHaveBeenCalledTimes(1);
  });

  it("delegates to mergeTeamverRuntimeConfigIntoAppConfig for protocol normalization", async () => {
    mockedFetch.mockResolvedValue({
      configured: true,
      apiKey: "k-rotated",
      apiProtocol: "unknown-protocol",
    });
    const prev = baseConfig();
    const next = await reloadTeamverRuntimeConfigIntoAppConfig(prev);
    // unknown protocol falls back to prev.apiProtocol (anthropic)
    expect(next.apiProtocol).toBe("anthropic");
    expect(next.apiKey).toBe("k-rotated");
  });

  it("mergeTeamverRuntimeConfigIntoAppConfig short-circuits when runtime config is empty key", () => {
    const prev = baseConfig();
    const same = mergeTeamverRuntimeConfigIntoAppConfig(prev, {
      configured: true,
      apiKey: "   ",
    });
    expect(same).toBe(prev);
    expect(mockedPin).not.toHaveBeenCalled();
  });
});
