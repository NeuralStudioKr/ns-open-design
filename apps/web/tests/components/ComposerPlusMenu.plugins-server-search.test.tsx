// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '../../src/i18n';

const listPluginsPage = vi.fn();

vi.mock('../../src/state/projects', async () => {
  const actual = await vi.importActual<typeof import('../../src/state/projects')>(
    '../../src/state/projects',
  );
  return {
    ...actual,
    listPluginsPage: (...args: unknown[]) => listPluginsPage(...args),
  };
});

vi.mock('../../src/teamver/designApiBase', async () => {
  const actual = await vi.importActual<typeof import('../../src/teamver/designApiBase')>(
    '../../src/teamver/designApiBase',
  );
  return {
    ...actual,
    isTeamverEmbedMode: () => true,
  };
});

vi.mock('../../src/teamver/branding/config', async () => {
  const actual = await vi.importActual<typeof import('../../src/teamver/branding/config')>(
    '../../src/teamver/branding/config',
  );
  return {
    ...actual,
    resolveTeamverBranding: () => ({
      ...actual.resolveTeamverBranding(),
      slideOnlyMvp: true,
    }),
  };
});

const { ComposerPlusMenu } = await import('../../src/components/ComposerPlusMenu');

function makePlugin(id: string, title = id) {
  return {
    id,
    title,
    version: '1.0.0',
    trust: 'bundled' as const,
    sourceKind: 'bundled' as const,
    source: `/tmp/${id}`,
    capabilitiesGranted: ['prompt:inject'],
    fsPath: `/tmp/${id}`,
    installedAt: 0,
    updatedAt: 0,
    manifest: {
      name: id,
      title,
      version: '1.0.0',
      description: `${title} fixture`,
      od: { kind: 'scenario', mode: 'deck' },
    },
  };
}

describe('ComposerPlusMenu plugin server search (L-484)', () => {
  beforeEach(() => {
    listPluginsPage.mockReset();
    listPluginsPage.mockResolvedValue({
      plugins: [makePlugin('server-daisy', 'Daisy Days')],
      total: 2,
      limit: 24,
      offset: 0,
      nextOffset: 24,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('requests listPluginsPage with q when searching the Plugins flyout', async () => {
    render(
      <I18nProvider initial="en">
        <ComposerPlusMenu
          connectors={[]}
          onPickConnector={() => undefined}
          plugins={[makePlugin('local-only', 'Local Only')]}
          onPickPlugin={() => undefined}
          mcpServers={[]}
          onPickMcp={() => undefined}
          onAttachFiles={() => undefined}
          triggerTestId="plus-trigger"
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByTestId('plus-trigger'));
    fireEvent.click(screen.getByTestId('composer-plus-plugins'));

    const search = document.querySelector('.plus-menu__plugin-main .plus-menu__search input');
    expect(search).toBeTruthy();
    fireEvent.focus(search!);
    fireEvent.change(search!, { target: { value: 'daisy' } });

    await waitFor(() => {
      expect(listPluginsPage).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'deck',
          limit: 24,
          query: 'daisy',
        }),
      );
    });

    expect(screen.getAllByText('Daisy Days').length).toBeGreaterThan(0);
    expect(screen.queryByText('Local Only')).toBeNull();
    expect(screen.getByTestId('composer-plus-plugins-load-more')).toBeTruthy();
  });
});
