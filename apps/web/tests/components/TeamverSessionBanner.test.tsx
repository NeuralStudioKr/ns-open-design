// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TeamverSessionBanner } from '../../src/components/TeamverSessionBanner';
import { I18nProvider } from '../../src/i18n';

const embedState = vi.hoisted(() => ({
  loading: false,
  authenticated: false,
  designAppEnabled: true,
  designDisabledReason: null as string | null,
  userLabel: null as string | null,
  userId: null as string | null,
  userImageUrl: null as string | null,
  workspaces: [] as Array<{ id: string; name: string }>,
  activeWorkspaceId: null as string | null,
  error: null as string | null,
  switchWorkspace: vi.fn(async () => undefined),
  refresh: vi.fn(async () => undefined),
}));

vi.mock('../../src/teamver/useTeamverEmbed', () => ({
  useTeamverEmbed: () => embedState,
}));

vi.mock('../../src/teamver/designApiBase', () => ({
  resolveTeamverLoginUrl: () => 'https://teamver.com/auth/signin?returnTo=design',
  resolveTeamverMainOrigin: () => 'https://teamver.com',
}));

vi.mock('../../src/teamver/designBffClient', () => ({
  prepareDesignAuthSessionReload: vi.fn(),
}));

function renderBanner() {
  return render(
    <I18nProvider initial="ko">
      <TeamverSessionBanner teamverEmbed />
    </I18nProvider>,
  );
}

describe('TeamverSessionBanner', () => {
  afterEach(() => {
    cleanup();
    embedState.loading = false;
    embedState.authenticated = false;
    embedState.designAppEnabled = true;
    embedState.designDisabledReason = null;
    embedState.userLabel = null;
    embedState.userId = null;
    embedState.userImageUrl = null;
    embedState.workspaces = [];
    embedState.activeWorkspaceId = null;
    embedState.error = null;
    embedState.refresh.mockClear();
  });

  it('renders nothing outside embed mode', () => {
    const { container } = render(
      <I18nProvider initial="ko">
        <TeamverSessionBanner teamverEmbed={false} />
      </I18nProvider>,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows a loading state while the session is resolving', () => {
    embedState.loading = true;
    renderBanner();

    const bar = screen.getByTestId('teamver-embed-bar');
    expect(bar.getAttribute('data-state')).toBe('loading');
    expect(screen.getByText('Teamver 세션 확인 중…')).toBeTruthy();
  });

  it('shows a sign-in link when unauthenticated', () => {
    renderBanner();

    const signIn = screen.getByRole('link', { name: 'Teamver 로그인' });
    expect(signIn.getAttribute('href')).toBe('https://teamver.com/auth/signin?returnTo=design');
  });

  it('shows workspace switcher, Teamver app link, and user chip when authenticated', () => {
    embedState.authenticated = true;
    embedState.userLabel = '김워크';
    embedState.userId = 'user-1';
    embedState.userImageUrl = 'https://cdn.example/avatar.png';
    embedState.workspaces = [{ id: 'WS-1', name: 'Alpha Team' }];
    embedState.activeWorkspaceId = 'WS-1';

    renderBanner();

    expect(screen.getByTestId('teamver-embed-bar').getAttribute('data-state')).toBe('ok');
    expect(screen.getByTestId('teamver-workspace-chip').getAttribute('aria-label')).toBe(
      '워크스페이스: Alpha Team',
    );
    const teamverApp = screen.getByTestId('teamver-embed-main-link');
    expect(teamverApp.getAttribute('href')).toBe('https://teamver.com');
    expect(teamverApp.textContent).toContain('Teamver 앱');
    expect(screen.getByTestId('teamver-embed-user')).toBeTruthy();
  });

  it('shows a disabled-app warning when design is not enabled for the workspace', () => {
    embedState.authenticated = true;
    embedState.designAppEnabled = false;
    embedState.designDisabledReason = 'Plan does not include Design';

    renderBanner();

    expect(screen.getByTestId('teamver-embed-bar').getAttribute('data-state')).toBe('warn');
    expect(screen.getByTestId('teamver-embed-app-disabled').textContent).toContain('Design 사용 불가');
  });

  it('exposes a session retry chip while authenticated when BFF is unreachable', () => {
    embedState.authenticated = true;
    embedState.error = 'session_unreachable';
    embedState.workspaces = [{ id: 'WS-1', name: 'Alpha Team' }];
    embedState.activeWorkspaceId = 'WS-1';

    renderBanner();

    expect(screen.getByTestId('teamver-embed-bar').getAttribute('data-state')).toBe('warn');
    expect(screen.getByTestId('teamver-embed-session-warn').textContent).toContain('세션 확인 실패');
    const retry = screen.getByTestId('teamver-embed-session-retry');
    expect(retry.textContent).toContain('세션 다시 확인');
    fireEvent.click(retry);
    // Explicit user retry clears the sticky refresh-decline guard so a
    // previously-declined `/teamver-bff/auth/refresh` (e.g. 400 from
    // `user_not_found`) gets one fresh attempt.
    expect(embedState.refresh).toHaveBeenCalledWith({
      force: true,
      resetRefreshState: true,
    });
  });

  it('renders a retry button alongside sign-in when unauthenticated due to session_unreachable', () => {
    embedState.authenticated = false;
    embedState.error = 'session_unreachable';

    renderBanner();

    expect(screen.getByRole('link', { name: 'Teamver 로그인' })).toBeTruthy();
    const retry = screen.getByTestId('teamver-embed-session-retry');
    expect(retry.textContent).toContain('다시 시도');
    fireEvent.click(retry);
    expect(embedState.refresh).toHaveBeenCalledWith({
      force: true,
      resetRefreshState: true,
    });
  });
});
