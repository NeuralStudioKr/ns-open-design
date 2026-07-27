// @vitest-environment jsdom

// Home composer Send attention sheen: must not fire on dead-end submits,
// and should fire when a submittable preset is picked while a draft exists.

import { act, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HomeView } from '../../src/components/HomeView';
import { I18nProvider } from '../../src/i18n';
import { writeHomeGuideStage } from '../../src/components/home-hero/firstRunGuide';
import { setHomeHeroPrompt } from '../helpers/home-hero-lexical';

vi.mock('../../src/teamver/designApiBase', () => ({
  isTeamverEmbedMode: () => false,
}));

vi.mock('../../src/teamver/branding/TeamverBrandingProvider', () => ({
  useTeamverBranding: () => ({
    enabled: false,
    slideOnlyMvp: false,
    hideCommunityGallery: false,
    hidePluginRegistry: false,
    hideNavViews: new Set<string>(),
    hideTopbarExecutionSwitcher: false,
    hideUseEverywhereChip: false,
    hideSettingsDialogLink: false,
    allowedSettingsSections: null,
    hideStudioExecutionControls: false,
    hideUsefulTips: false,
    hideHandoffButton: false,
    hideAssistantModelLabels: false,
    hideAssistantThinkingDetails: false,
    lockExecutionConfig: false,
    hideLocalWorkspaceControls: false,
    hideWorkspaceTabsBar: false,
    hideComposerIntegrations: false,
    hideExternalShareSurfaces: false,
    title: 'Open Design',
    subtitle: '',
    heroTitle: 'Open Design',
    heroSubtitle: 'Create with AI',
  }),
  TeamverBrandingProvider: ({ children }: { children: ReactNode }) => children,
}));

function isPluginsListRequest(url: RequestInfo | URL): boolean {
  return typeof url === 'string' && (url === '/api/plugins' || url.startsWith('/api/plugins?'));
}

const WEB_PROTOTYPE_PLUGIN = {
  id: 'example-web-prototype',
  title: 'Web Prototype',
  version: '0.1.0',
  trust: 'bundled' as const,
  sourceKind: 'bundled' as const,
  source: '/tmp/web-prototype',
  capabilitiesGranted: ['prompt:inject'],
  fsPath: '/tmp/web-prototype',
  installedAt: 0,
  updatedAt: 0,
  manifest: {
    name: 'example-web-prototype',
    title: 'Web Prototype',
    version: '0.1.0',
    description: 'General-purpose desktop web prototype.',
    od: {
      kind: 'scenario',
      taskKind: 'new-generation',
      useCase: {
        query: 'Build a {{fidelity}} {{artifactKind}} for {{audience}} using {{designSystem}} from {{template}}.',
      },
      inputs: [
        {
          name: 'artifactKind',
          type: 'string',
          required: true,
          default: 'web prototype',
          label: 'Artifact kind',
        },
        {
          name: 'fidelity',
          type: 'select',
          required: true,
          options: ['wireframe', 'high-fidelity'],
          default: 'high-fidelity',
          label: 'Fidelity',
        },
        {
          name: 'audience',
          type: 'string',
          required: true,
          default: 'product evaluators',
          label: 'Audience',
        },
        {
          name: 'designSystem',
          type: 'string',
          default: 'the active project design system',
          label: 'Design system',
        },
        {
          name: 'template',
          type: 'string',
          default: 'the bundled web prototype seed',
          label: 'Template',
        },
      ],
    },
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
  window.localStorage.clear();
});

const REQUIRED_INPUT_PLUGIN = {
  ...WEB_PROTOTYPE_PLUGIN,
  id: 'required-input-plugin',
  title: 'Required Input Plugin',
  source: '/tmp/required-input',
  fsPath: '/tmp/required-input',
  manifest: {
    ...WEB_PROTOTYPE_PLUGIN.manifest,
    name: 'required-input-plugin',
    title: 'Required Input Plugin',
    od: {
      kind: 'scenario',
      taskKind: 'new-generation',
      useCase: { query: 'Build a landing page about {{topic}}.' },
      inputs: [{ name: 'topic', type: 'string', required: true }],
    },
  },
};

describe('use-with-query send pulse gating', () => {
  it('does not pulse Send when required inputs are still missing', async () => {
    writeHomeGuideStage('done');
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
      if (isPluginsListRequest(url)) {
        return new Response(JSON.stringify({ plugins: [REQUIRED_INPUT_PLUGIN] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    }));

    const view = render(
      <I18nProvider initial="en">
        <div className="entry-main--scroll">
          <HomeView
            projects={[]}
            onSubmit={() => undefined}
            onOpenProject={() => undefined}
            onViewAllProjects={() => undefined}
          />
        </div>
      </I18nProvider>,
    );
    const scrollContainer = view.container.querySelector('.entry-main--scroll') as HTMLElement;
    scrollContainer.scrollTop = 400;

    fireEvent.click(await screen.findByTestId('plugins-home-details-required-input-plugin'));
    fireEvent.click(await screen.findByTestId('plugin-details-use-required-input-plugin'));

    const submit = (await screen.findByTestId('home-hero-submit')) as HTMLButtonElement;
    await waitFor(() => {
      expect(screen.getByTestId('home-hero-active-plugin')).toBeTruthy();
    });
    expect(submit.disabled).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(submit.className).not.toContain('home-hero__attention-sheen');
  });
});

describe('preset pick send pulse', () => {
  it('pulses Send when a preset is picked while the composer already has a draft', async () => {
    writeHomeGuideStage('done');
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
      if (isPluginsListRequest(url)) {
        return new Response(JSON.stringify({ plugins: [WEB_PROTOTYPE_PLUGIN] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    }));

    render(
      <I18nProvider initial="en">
        <HomeView
          projects={[]}
          onSubmit={() => undefined}
          onOpenProject={() => undefined}
          onViewAllProjects={() => undefined}
        />
      </I18nProvider>,
    );

    fireEvent.click(await screen.findByTestId('home-hero-rail-prototype'));
    await waitFor(() => {
      expect(screen.getAllByTestId('home-hero-plugin-preset').length).toBeGreaterThan(0);
    });

    setHomeHeroPrompt('Launch page for a robotics studio');
    await act(async () => {
      await Promise.resolve();
    });

    const submit = screen.getByTestId('home-hero-submit');
    expect(submit.className).not.toContain('home-hero__attention-sheen');

    fireEvent.click(screen.getAllByTestId('home-hero-plugin-preset')[0]!);
    await waitFor(() => {
      expect(submit.className).toContain('home-hero__attention-sheen');
    });
  });
});
