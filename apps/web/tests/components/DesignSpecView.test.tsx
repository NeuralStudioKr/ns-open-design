// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { DesignSpecView } from '../../src/components/DesignSpecView';

describe('DesignSpecView', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows loading only while source is undefined', () => {
    render(
      <DesignSpecView
        source={undefined}
        loadingLabel="Loading DESIGN.md…"
        emptyLabel="Could not load DESIGN.md"
      />,
    );
    expect(screen.getByText('Loading DESIGN.md…')).toBeTruthy();
  });

  it('shows empty/error when source is null instead of infinite loading', () => {
    render(
      <DesignSpecView
        source={null}
        loadingLabel="Loading DESIGN.md…"
        emptyLabel="Could not load DESIGN.md"
      />,
    );
    expect(screen.getByText('Could not load DESIGN.md')).toBeTruthy();
    expect(screen.queryByText('Loading DESIGN.md…')).toBeNull();
  });

  it('renders markdown body when source is a string', () => {
    render(
      <DesignSpecView
        source="# Neutral Modern\n\nTokens and components."
        loadingLabel="Loading DESIGN.md…"
      />,
    );
    expect(screen.getByText(/Neutral Modern/)).toBeTruthy();
  });
});
