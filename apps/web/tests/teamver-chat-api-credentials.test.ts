import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../src/teamver/designApiBase", () => ({
  isTeamverEmbedMode: vi.fn(() => false),
}));

vi.mock("../src/teamver/branding/applyEmbedConfigLock", () => ({
  isTeamverExecutionConfigLocked: vi.fn(() => false),
}));

import { isTeamverEmbedMode } from "../src/teamver/designApiBase";
import { isTeamverExecutionConfigLocked } from "../src/teamver/branding/applyEmbedConfigLock";
import { hasChatApiCredentials, usesServerManagedChatApiKey } from "../src/teamver/chatApiCredentials";
import { shouldUseManagedProxyApiKey } from "../src/providers/api-proxy";

const mockedEmbedMode = vi.mocked(isTeamverEmbedMode);
const mockedLock = vi.mocked(isTeamverExecutionConfigLocked);

describe("hasChatApiCredentials", () => {
  beforeEach(() => {
    mockedEmbedMode.mockReset();
    mockedLock.mockReset();
  });

  it("accepts a browser BYOK key in standalone mode", () => {
    mockedEmbedMode.mockReturnValue(false);
    expect(hasChatApiCredentials({ apiKey: "sk-test", apiKeyConfigured: false })).toBe(true);
  });

  it("accepts server-managed embed credentials when execution is locked", () => {
    mockedEmbedMode.mockReturnValue(true);
    mockedLock.mockReturnValue(true);
    expect(hasChatApiCredentials({ apiKey: "", apiKeyConfigured: false })).toBe(true);
  });

  it("requires apiKeyConfigured in embed when execution is not locked", () => {
    mockedEmbedMode.mockReturnValue(true);
    mockedLock.mockReturnValue(false);
    expect(hasChatApiCredentials({ apiKey: "", apiKeyConfigured: false })).toBe(false);
    expect(hasChatApiCredentials({ apiKey: "", apiKeyConfigured: true })).toBe(true);
  });

  it("uses server-managed proxy body when execution is locked without apiKeyConfigured", () => {
    mockedEmbedMode.mockReturnValue(true);
    mockedLock.mockReturnValue(true);
    expect(usesServerManagedChatApiKey({ apiKey: "", apiKeyConfigured: false })).toBe(true);
    expect(usesServerManagedChatApiKey({ apiKey: "sk-user", apiKeyConfigured: true })).toBe(false);
  });

  it("shouldUseManagedProxyApiKey is true for any embed host without a browser key", () => {
    mockedEmbedMode.mockReturnValue(true);
    expect(shouldUseManagedProxyApiKey({ apiKey: "", apiKeyConfigured: false })).toBe(true);
    expect(shouldUseManagedProxyApiKey({ apiKey: "sk-user", apiKeyConfigured: true })).toBe(false);
  });
});
