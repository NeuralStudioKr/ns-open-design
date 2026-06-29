import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/teamver/designApiBase', () => ({
  isTeamverEmbedMode: vi.fn(() => false),
}));

import { isTeamverEmbedMode } from '../../src/teamver/designApiBase';
import {
  shouldFetchAgentRegistryOnBoot,
  shouldFetchAihubmixMediaCatalog,
  shouldFetchAmrIntegrationApis,
  shouldFetchAppVersionAboutPanel,
  shouldFetchAutomationTaskApis,
  shouldFetchConnectorCatalog,
  shouldFetchMarketingCommunityApis,
  shouldFetchMediaProviderConfig,
  shouldFetchPromptTemplateCatalog,
  shouldFetchRecentLinkedDirs,
  shouldMountPluginRegistryView,
  shouldSubscribeMemoryEvents,
} from '../../src/teamver/embedDaemonFetchPolicy';

describe('embedDaemonFetchPolicy', () => {
  afterEach(() => {
    vi.mocked(isTeamverEmbedMode).mockReturnValue(false);
  });

  it('allows optional APIs outside embed', () => {
    expect(shouldFetchMarketingCommunityApis()).toBe(true);
    expect(shouldFetchConnectorCatalog()).toBe(true);
    expect(shouldFetchAutomationTaskApis()).toBe(true);
    expect(shouldMountPluginRegistryView()).toBe(true);
    expect(shouldFetchRecentLinkedDirs()).toBe(true);
    expect(shouldSubscribeMemoryEvents()).toBe(true);
    expect(shouldFetchAihubmixMediaCatalog()).toBe(true);
    expect(shouldFetchAgentRegistryOnBoot()).toBe(true);
    expect(shouldFetchAmrIntegrationApis()).toBe(true);
    expect(shouldFetchPromptTemplateCatalog()).toBe(true);
    expect(shouldFetchMediaProviderConfig()).toBe(true);
    expect(shouldFetchAppVersionAboutPanel()).toBe(true);
  });

  it('blocks embed-hidden surfaces and desktop-only boot fetches', () => {
    vi.mocked(isTeamverEmbedMode).mockReturnValue(true);
    expect(shouldFetchMarketingCommunityApis()).toBe(false);
    expect(shouldFetchConnectorCatalog()).toBe(false);
    expect(shouldFetchAutomationTaskApis()).toBe(false);
    expect(shouldMountPluginRegistryView()).toBe(false);
    expect(shouldFetchRecentLinkedDirs()).toBe(false);
    expect(shouldSubscribeMemoryEvents()).toBe(false);
    expect(shouldFetchAihubmixMediaCatalog()).toBe(false);
    expect(shouldFetchAgentRegistryOnBoot()).toBe(false);
    expect(shouldFetchAmrIntegrationApis()).toBe(false);
    expect(shouldFetchPromptTemplateCatalog()).toBe(false);
    expect(shouldFetchMediaProviderConfig()).toBe(false);
    expect(shouldFetchAppVersionAboutPanel()).toBe(false);
  });
});
