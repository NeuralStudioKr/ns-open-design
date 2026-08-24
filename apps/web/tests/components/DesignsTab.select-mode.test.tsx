// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { DesignsTab } from '../../src/components/DesignsTab';
import type { Project } from '../../src/types';

vi.mock('../../src/providers/registry', () => ({
  deleteLiveArtifact: vi.fn(),
  fetchLiveArtifacts: vi.fn(async () => []),
  fetchProjectFiles: vi.fn(async () => []),
  liveArtifactPreviewUrl: (projectId: string, artifactId: string) =>
    `/api/projects/${projectId}/live-artifacts/${artifactId}/preview`,
  projectFileUrl: (projectId: string, fileName: string) =>
    `/api/projects/${projectId}/files/${fileName}`,
}));

const project: Project = {
  id: 'project-1',
  name: 'Landing refresh',
  skillId: null,
  designSystemId: null,
  createdAt: 1,
  updatedAt: 2,
  status: { value: 'not_started' },
};

describe('DesignsTab select mode', () => {
  beforeAll(() => {
    if (window.localStorage) return;
    const store = new Map<string, string>();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        clear: () => store.clear(),
        getItem: (key: string) => store.get(key) ?? null,
        removeItem: (key: string) => store.delete(key),
        setItem: (key: string, value: string) => store.set(key, value),
      },
    });
  });

  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('exposes select mode on the projects grid', () => {
    render(
      <DesignsTab
        projects={[project]}
        skills={[]}
        designSystems={[]}
        onOpen={vi.fn()}
        onOpenLiveArtifact={vi.fn()}
        onDelete={vi.fn()}
        onRename={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Select' })).toBeTruthy();
    expect(screen.queryByTestId('designs-view-kanban')).toBeNull();
    expect(screen.queryByTestId('designs-view-grid')).toBeNull();
  });

  it('keeps select mode available without a view toggle', () => {
    render(
      <DesignsTab
        projects={[project]}
        skills={[]}
        designSystems={[]}
        onOpen={vi.fn()}
        onOpenLiveArtifact={vi.fn()}
        onDelete={vi.fn()}
        onRename={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    expect(screen.getByText('0 selected')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
  });

  it('confirms bulk project deletion and shows success feedback', async () => {
    const onDelete = vi.fn().mockResolvedValue(true);
    render(
      <DesignsTab
        projects={[
          project,
          {
            ...project,
            id: 'project-2',
            name: 'Brand system',
            createdAt: 3,
            updatedAt: 4,
          },
        ]}
        skills={[]}
        designSystems={[]}
        onOpen={vi.fn()}
        onOpenLiveArtifact={vi.fn()}
        onDelete={onDelete}
        onRename={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    fireEvent.click(screen.getByText('Landing refresh').closest('.design-card') as HTMLElement);
    fireEvent.click(screen.getByText('Brand system').closest('.design-card') as HTMLElement);

    expect(screen.getByText('2 selected')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Delete selected' }));
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Delete selected',
      }),
    );

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledTimes(2);
    });
    expect(onDelete).toHaveBeenNthCalledWith(1, 'project-1');
    expect(onDelete).toHaveBeenNthCalledWith(2, 'project-2');
    expect(screen.getByRole('status').textContent).toContain(
      '2 project(s) deleted successfully.',
    );
    expect(screen.queryByText('2 selected')).toBeNull();
  });

  it('restarts the bulk delete toast timer for repeated matching results', async () => {
    vi.useFakeTimers();
    const onDelete = vi.fn().mockResolvedValue(true);

    const flushDelete = async () => {
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
    };
    const deleteSelectedProject = async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Select' }));
      fireEvent.click(screen.getByText('Landing refresh').closest('.design-card') as HTMLElement);
      fireEvent.click(screen.getByRole('button', { name: 'Delete selected' }));
      fireEvent.click(
        within(screen.getByRole('alertdialog')).getByRole('button', {
          name: 'Delete selected',
        }),
      );
      await flushDelete();
    };

    try {
      render(
        <DesignsTab
          projects={[project]}
          skills={[]}
          designSystems={[]}
          onOpen={vi.fn()}
          onOpenLiveArtifact={vi.fn()}
          onDelete={onDelete}
          onRename={vi.fn()}
        />,
      );

      await deleteSelectedProject();
      expect(screen.getByRole('status').textContent).toContain(
        '1 project(s) deleted successfully.',
      );

      act(() => {
        vi.advanceTimersByTime(3000);
      });
      await deleteSelectedProject();

      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(screen.getByRole('status').textContent).toContain(
        '1 project(s) deleted successfully.',
      );

      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(screen.queryByRole('status')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('marks design-system projects with a dedicated tag', () => {
    render(
      <DesignsTab
        projects={[
          {
            ...project,
            id: 'project-ds',
            name: 'Acme Design System',
            metadata: {
              kind: 'other',
              importedFrom: 'design-system',
            },
          },
        ]}
        skills={[]}
        designSystems={[]}
        onOpen={vi.fn()}
        onOpenLiveArtifact={vi.fn()}
        onDelete={vi.fn()}
        onRename={vi.fn()}
      />,
    );

    expect(screen.getByText('Design System')).toBeTruthy();
  });

  it('uses the same updated time in recent and yours tabs', () => {
    const now = Date.UTC(2026, 4, 19, 9, 0, 0);
    vi.useFakeTimers();
    vi.setSystemTime(now);

    render(
      <DesignsTab
        projects={[
          {
            ...project,
            createdAt: now - 70 * 60 * 1000,
            updatedAt: now - 54 * 60 * 1000,
          },
        ]}
        skills={[]}
        designSystems={[]}
        onOpen={vi.fn()}
        onOpenLiveArtifact={vi.fn()}
        onDelete={vi.fn()}
        onRename={vi.fn()}
      />,
    );

    expect(screen.getByText('54m ago')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Your designs' }));

    expect(screen.getByText('54m ago')).toBeTruthy();
    expect(screen.queryByText('1h ago')).toBeNull();

    vi.useRealTimers();
  });
});
