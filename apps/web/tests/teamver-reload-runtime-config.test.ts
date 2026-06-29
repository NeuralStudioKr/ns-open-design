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

  it("returns the same config reference when managed values match the previous config", async () => {
    mockedFetch.mockResolvedValue({
      configured: true,
      apiKeyConfigured: true,
      apiProtocol: "anthropic",
      baseUrl: "https://api.example.com",
      model: "claude-prev",
    });
    const prev = baseConfig({
      apiKey: "",
      apiKeyConfigured: true,
    });
    const next = await reloadTeamverRuntimeConfigIntoAppConfig(prev);
    expect(next).toBe(prev);
    expect(mockedPin).toHaveBeenCalledTimes(1);
  });

  it("never stores apiKey from runtime-config — server-managed only", async () => {
    mockedFetch.mockResolvedValue({
      configured: true,
      apiKeyConfigured: true,
      apiProtocol: "anthropic",
      baseUrl: "https://api.example.com",
      model: "claude-next",
    });
    const prev = baseConfig();
    const next = await reloadTeamverRuntimeConfigIntoAppConfig(prev);
    expect(next.apiKey).toBe("");
    expect(next.apiKeyConfigured).toBe(true);
    expect(next.model).toBe("claude-next");
    expect(mockedPin).toHaveBeenCalledWith(
      expect.objectContaining({ managedApiConfigured: true }),
    );
  });

  it("delegates to mergeTeamverRuntimeConfigIntoAppConfig for protocol normalization", async () => {
    mockedFetch.mockResolvedValue({
      configured: true,
      apiKeyConfigured: true,
      apiProtocol: "unknown-protocol",
    });
    const prev = baseConfig();
    const next = await reloadTeamverRuntimeConfigIntoAppConfig(prev);
    expect(next.apiProtocol).toBe("anthropic");
    expect(next.apiKey).toBe("");
    expect(next.apiKeyConfigured).toBe(true);
  });

  it("mergeTeamverRuntimeConfigIntoAppConfig short-circuits when apiKeyConfigured is false", () => {
    const prev = baseConfig();
    const same = mergeTeamverRuntimeConfigIntoAppConfig(prev, {
      configured: true,
      apiKeyConfigured: false,
    });
    expect(same).toBe(prev);
    expect(mockedPin).not.toHaveBeenCalled();
  });
});
