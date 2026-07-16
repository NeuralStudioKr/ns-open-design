// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RecentProjectsStrip } from '../../src/components/RecentProjectsStrip';
import type { Project } from '../../src/types';
import type { ProjectCoverFile } from '../../src/teamver/projectPreviewFile';
import { clearProjectDeckCoverCacheForTests } from '../../src/teamver/components/ProjectCardHtmlCover';

vi.mock('../../src/providers/registry', () => ({
  projectFileUrl: (projectId: string, fileName: string) =>
    `/api/projects/${projectId}/raw/${fileName}`,
}));

vi.mock('../../src/teamver/prefetchHomeProjectCovers', () => ({
  prefetchHomeProjectCovers: vi.fn(async (projects: Project[]) => {
    const out: Record<string, ProjectCoverFile | null> = {};
    for (const p of projects) {
      if (p.id === 'project-ds') {
        out[p.id] = { kind: 'logo', name: 'assets/logo.svg', version: 3 };
      } else if (p.id === 'project-html') {
        out[p.id] = { kind: 'html', name: 'index.html', version: 2 };
      } else if (p.id === 'project-deck') {
        out[p.id] = {
          kind: 'html',
          name: p.metadata?.entryFile ?? 'index.html',
          version: 2,
        };
      }
    }
    return out;
  }),
}));

afterEach(() => {
  cleanup();
  clearProjectDeckCoverCacheForTests();
  vi.unstubAllGlobals();
});

function project(overrides: Partial<Project>): Project {
  return {
    id: 'project-1',
    name: 'Project',
    skillId: null,
    designSystemId: null,
    createdAt: 1,
    updatedAt: 2,
    status: { value: 'not_started' },
    ...overrides,
  };
}

describe('RecentProjectsStrip', () => {
  it('matches project cards with previews and design-system tags', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html><head></head><body>Prototype</body></html>')),
    );

    const { container } = render(
      <RecentProjectsStrip
        projects={[
          project({
            id: 'project-ds',
            name: 'Acme Design System',
            updatedAt: 4,
            metadata: {
              kind: 'other',
              importedFrom: 'design-system',
            },
          }),
          project({
            id: 'project-html',
            name: 'Web Prototype',
            updatedAt: 3,
          }),
        ]}
        onOpen={() => {}}
        onViewAll={() => {}}
      />,
    );

    expect(screen.getByText('Design System')).toBeTruthy();
    expect(screen.getAllByText('Prototype').length).toBeGreaterThan(0);
    const designSystemCard = container.querySelector('.recent-projects__card.is-design-system-project');
    expect(designSystemCard).toBeTruthy();
    expect(designSystemCard?.querySelectorAll('.design-card-tag')).toHaveLength(1);

    await waitFor(() => {
      expect(designSystemCard?.querySelector('.recent-projects__card-thumb-logo img')).toBeTruthy();
      const iframe = container.querySelector('.recent-projects__card-thumb-html iframe');
      expect(iframe).toBeTruthy();
      expect(iframe?.getAttribute('src')).toBeNull();
      expect(iframe?.getAttribute('srcdoc')).toContain(
        '<base href="/api/projects/project-html/raw/index.html?v=2">',
      );
    });
  });

  it('renders deck project covers without deck navigation controls', async () => {
    const deckHtml = `
          <!doctype html>
          <html>
            <head><title>Deck</title></head>
            <body>
              <section class="slide active">First slide</section>
              <section class="slide">Second slide</section>
              <div class="deck-counter"><button id="deck-prev">‹</button><span>1 / 10</span><button id="deck-next">›</button></div>
              <nav class="page-flip-controls" aria-label="Pagination">01 / 10</nav>
            </body>
          </html>
        `;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(deckHtml)),
    );

    const { container } = render(
      <RecentProjectsStrip
        projects={[
          project({
            id: 'project-deck',
            name: 'Simple Deck',
            updatedAt: 4,
            metadata: { kind: 'deck' },
          }),
          project({
            id: 'project-html',
            name: 'Web Prototype',
            updatedAt: 3,
          }),
        ]}
        onOpen={() => {}}
        onViewAll={() => {}}
      />,
    );

    const deckCard = container.querySelector('[data-project-id="project-deck"]');
    const htmlCard = container.querySelector('[data-project-id="project-html"]');

    await waitFor(() => {
      const deckIframe = deckCard?.querySelector('iframe') as HTMLIFrameElement | null;
      const htmlIframe = htmlCard?.querySelector('iframe') as HTMLIFrameElement | null;
      expect(deckIframe?.getAttribute('srcdoc')).toContain('First slide');
      expect(deckIframe?.getAttribute('srcdoc')).toContain(
        '<base href="/api/projects/project-deck/raw/index.html?v=2">',
      );
      expect(deckIframe?.getAttribute('srcdoc')).toContain('od-deck-card-preview');
      expect(deckIframe?.getAttribute('srcdoc')).toContain('.page-flip-controls');
      expect(deckIframe?.getAttribute('srcdoc')).toContain('[aria-label="Pagination"]');
      expect(deckIframe?.getAttribute('srcdoc')).not.toContain('<script');
      expect(deckIframe?.getAttribute('src')).toBeNull();
      expect(htmlIframe?.getAttribute('src')).toBeNull();
      expect(htmlIframe?.getAttribute('srcdoc')).toContain(
        '<base href="/api/projects/project-html/raw/index.html?v=2">',
      );
      expect(htmlIframe?.getAttribute('srcdoc')).toContain('od-page-card-preview');
    });
  });

  it('resets cover cache when workspaceScopeKey changes', async () => {
    const onOpen = vi.fn();
    const projects = [
      project({
        id: 'project-html',
        name: 'Web Prototype',
        updatedAt: 3,
      }),
    ];
    const { rerender, container } = render(
      <RecentProjectsStrip
        projects={projects}
        workspaceScopeKey="ws-a"
        onOpen={onOpen}
        onViewAll={() => {}}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector('.recent-projects__card-glyph')).toBeNull();
    });

    rerender(
      <RecentProjectsStrip
        projects={projects}
        workspaceScopeKey="ws-b"
        onOpen={onOpen}
        onViewAll={() => {}}
      />,
    );

    expect(container.querySelector('.recent-projects__card-glyph')).toBeTruthy();
  });

  it('opens deck projects with preview file deep-link', async () => {
    const onOpen = vi.fn();
    const { container } = render(
      <RecentProjectsStrip
        projects={[
          project({
            id: 'project-deck',
            name: 'Simple Deck',
            updatedAt: 4,
            metadata: { kind: 'deck', entryFile: 'deck.html' },
          }),
        ]}
        onOpen={onOpen}
        onViewAll={() => {}}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector('[data-project-id="project-deck"]')).toBeTruthy();
    });

    fireEvent.click(container.querySelector('[data-project-id="project-deck"]')!);
    expect(onOpen).toHaveBeenCalledWith('project-deck', { fileName: 'deck.html' });
  });
});
