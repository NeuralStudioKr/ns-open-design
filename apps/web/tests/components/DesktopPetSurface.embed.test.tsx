// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/teamver/designApiBase', () => ({
  isTeamverEmbedMode: vi.fn(() => true),
}));

vi.mock('@open-design/host', () => ({
  setHostPetVisible: vi.fn(),
}));

vi.mock('../../src/state/config', () => ({
  loadConfig: vi.fn(() => ({ pet: { enabled: true } })),
}));

vi.mock('../../src/state/projects', () => ({
  listProjects: vi.fn(),
}));

vi.mock('../../src/providers/daemon', () => ({
  RUNS_CHANGED_EVENT: 'od:runs-changed',
  listProjectRuns: vi.fn(),
}));

vi.mock('../../src/components/pet/PetOverlay', () => ({
  PetOverlay: () => <div data-testid="pet-overlay" />,
}));

import { listProjectRuns } from '../../src/providers/daemon';
import { listProjects } from '../../src/state/projects';
import { DesktopPetSurface } from '../../src/components/pet/DesktopPetSurface';

describe('DesktopPetSurface in Teamver embed', () => {
  it('does not mount desktop pet polling', () => {
    render(<DesktopPetSurface />);

    expect(screen.queryByTestId('pet-overlay')).toBeNull();
    expect(listProjects).not.toHaveBeenCalled();
    expect(listProjectRuns).not.toHaveBeenCalled();
  });
});
