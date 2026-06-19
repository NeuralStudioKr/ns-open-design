import { describe, expect, it, beforeEach, vi } from "vitest";
import * as designApiBase from "../src/teamver/designApiBase";

vi.mock("../src/teamver/designApiBase", () => ({
  isTeamverEmbedMode: vi.fn(() => false),
}));
import { applyTeamverEmbedConfigLockIfNeeded } from "../src/teamver/branding/applyEmbedConfigLock";
import {
  pinTeamverExecutionConfig,
  resetPinnedTeamverExecutionConfigForTests,
} from "../src/teamver/branding/pinnedExecutionConfig";
import { mergeTeamverRuntimeConfigIntoAppConfig } from "../src/teamver/applyTeamverRuntimeConfig";
import { DEFAULT_CONFIG } from "../src/state/config";

describe("teamver embed execution config lock", () => {
  beforeEach(() => {
    resetPinnedTeamverExecutionConfigForTests();
    vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(true);
  });

  it("pins runtime-config and clears per-protocol model shadows", () => {
    pinTeamverExecutionConfig({
      apiKey: "sk-server",
      apiProtocol: "anthropic",
      baseUrl: "https://api.anthropic.com",
      model: "claude-sonnet-4-5",
    });

    const locked = applyTeamverEmbedConfigLockIfNeeded({
      ...DEFAULT_CONFIG,
      mode: "daemon",
      agentId: "claude",
      model: "gpt-4o",
      apiProtocolConfigs: { anthropic: { model: "claude-opus-4" } },
    });

    expect(locked.mode).toBe("api");
    expect(locked.agentId).toBeNull();
    expect(locked.model).toBe("claude-sonnet-4-5");
    expect(locked.apiKey).toBe("sk-server");
    expect(locked.apiProtocolConfigs).toEqual({});
  });

  it("mergeTeamverRuntimeConfigIntoAppConfig pins and strips protocol configs", () => {
    const merged = mergeTeamverRuntimeConfigIntoAppConfig(
      {
        ...DEFAULT_CONFIG,
        mode: "daemon",
        apiProtocolConfigs: { openai: { model: "gpt-4o" } },
      },
      {
        configured: true,
        apiKey: "sk-managed",
        apiProtocol: "anthropic",
        baseUrl: "https://api.anthropic.com",
        model: "claude-sonnet-4-5",
      },
    );

    expect(merged.mode).toBe("api");
    expect(merged.apiKey).toBe("sk-managed");
    expect(merged.model).toBe("claude-sonnet-4-5");
    expect(merged.apiProtocolConfigs).toEqual({});

    const locked = applyTeamverEmbedConfigLockIfNeeded(merged);
    expect(locked.model).toBe("claude-sonnet-4-5");
  });
});
