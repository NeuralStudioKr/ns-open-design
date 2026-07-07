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
  shouldEagerLoadCommunityPluginPreviews,
  shouldFetchAutomationTaskApis,
  shouldFetchConnectorCatalog,
  shouldFetchEntryCatalogsOnBoot,
  shouldFetchHomeProjectsOnBoot,
  shouldFetchMarketingCommunityApis,
  shouldFetchMediaProviderConfig,
  shouldFetchPromptTemplateCatalog,
  shouldFetchRecentLinkedDirs,
  shouldMountPluginRegistryView,
  shouldPollDaemonRuns,
  shouldPostDaemonActiveContext,
  shouldShowOpenDesignPrivacyConsent,
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
    expect(shouldPostDaemonActiveContext()).toBe(true);
    expect(shouldPollDaemonRuns()).toBe(true);
    expect(shouldFetchEntryCatalogsOnBoot('project')).toBe(true);
    expect(shouldFetchHomeProjectsOnBoot('project')).toBe(true);
    expect(shouldEagerLoadCommunityPluginPreviews()).toBe(true);
    expect(shouldShowOpenDesignPrivacyConsent()).toBe(true);
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
    expect(shouldPostDaemonActiveContext()).toBe(false);
    expect(shouldPollDaemonRuns()).toBe(false);
    expect(shouldFetchEntryCatalogsOnBoot('project')).toBe(false);
    expect(shouldFetchHomeProjectsOnBoot('project')).toBe(false);
    expect(shouldFetchEntryCatalogsOnBoot('home')).toBe(true);
    expect(shouldFetchHomeProjectsOnBoot('home')).toBe(true);
    expect(shouldEagerLoadCommunityPluginPreviews()).toBe(false);
    expect(shouldShowOpenDesignPrivacyConsent()).toBe(false);
  });
});
