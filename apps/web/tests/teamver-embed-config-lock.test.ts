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

  it("pins managed runtime prefs and clears per-protocol model shadows without a browser key", () => {
    pinTeamverExecutionConfig({
      apiProtocol: "anthropic",
      baseUrl: "https://api.anthropic.com",
      model: "claude-sonnet-4-6",
      managedApiConfigured: true,
    });

    const locked = applyTeamverEmbedConfigLockIfNeeded({
      ...DEFAULT_CONFIG,
      mode: "api",
      agentId: "claude",
      model: "gpt-4o",
      apiKey: "sk-stale-local",
      apiProtocolConfigs: {
        anthropic: {
          apiKey: "sk-shadow",
          baseUrl: "https://api.anthropic.com",
          model: "claude-opus-4",
        },
      },
    });

    expect(locked.mode).toBe("api");
    expect(locked.agentId).toBeNull();
    expect(locked.model).toBe("claude-sonnet-4-6");
    expect(locked.apiKey).toBe("");
    expect(locked.apiKeyConfigured).toBe(true);
    expect(locked.apiProtocolConfigs).toEqual({});
  });

  it("locks keyless managed runtime without reusing local apiKey", () => {
    pinTeamverExecutionConfig({
      apiProtocol: "anthropic",
      baseUrl: "https://api.anthropic.com",
      model: "claude-sonnet-4-6",
      managedApiConfigured: true,
    });

    const locked = applyTeamverEmbedConfigLockIfNeeded({
      ...DEFAULT_CONFIG,
      mode: "api",
      apiKey: "sk-stale-local",
      agentId: "claude",
      model: "gpt-4o",
    });

    expect(locked.mode).toBe("api");
    expect(locked.agentId).toBeNull();
    expect(locked.apiKey).toBe("");
    expect(locked.model).toBe("claude-sonnet-4-6");
  });

  it("mergeTeamverRuntimeConfigIntoAppConfig pins and strips protocol configs", () => {
    const merged = mergeTeamverRuntimeConfigIntoAppConfig(
      {
        ...DEFAULT_CONFIG,
        mode: "daemon",
        apiProtocolConfigs: {
          openai: {
            apiKey: "sk-shadow",
            baseUrl: "https://api.openai.com/v1",
            model: "gpt-4o",
          },
        },
      },
      {
        configured: true,
        apiKeyConfigured: true,
        apiProtocol: "anthropic",
        baseUrl: "https://api.anthropic.com",
        model: "claude-sonnet-4-6",
      },
    );

    expect(merged.mode).toBe("api");
    expect(merged.apiKey).toBe("");
    expect(merged.apiKeyConfigured).toBe(true);
    expect(merged.model).toBe("claude-sonnet-4-6");
    expect(merged.apiProtocolConfigs).toEqual({});

    const locked = applyTeamverEmbedConfigLockIfNeeded(merged);
    expect(locked.model).toBe("claude-sonnet-4-6");
  });

  it("auto-acknowledges OD privacy and opts out of OD telemetry sharing", () => {
    const locked = applyTeamverEmbedConfigLockIfNeeded({
      ...DEFAULT_CONFIG,
      privacyDecisionAt: null,
      installationId: "old-install-id",
      telemetry: { metrics: true, content: true },
    });

    expect(locked.privacyDecisionAt).toBeTypeOf("number");
    expect(locked.installationId).toBeUndefined();
    expect(locked.telemetry?.metrics).toBe(false);
    expect(locked.telemetry?.content).toBe(false);
    expect(locked.onboardingCompleted).toBe(true);
  });

  it("mergeTeamverRuntimeConfigIntoAppConfig supports keyless managed runtime", () => {
    const merged = mergeTeamverRuntimeConfigIntoAppConfig(
      {
        ...DEFAULT_CONFIG,
        mode: "api",
        apiKey: "sk-stale-local",
        agentId: "claude",
      },
      {
        configured: true,
        apiKeyConfigured: true,
        apiProtocol: "anthropic",
        baseUrl: "https://api.anthropic.com",
        model: "claude-sonnet-4-6",
      },
    );

    expect(merged.mode).toBe("api");
    expect(merged.apiKey).toBe("");
    expect(merged.model).toBe("claude-sonnet-4-6");
  });
});
