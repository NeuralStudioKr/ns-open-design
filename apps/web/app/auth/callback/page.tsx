'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  buildAuthCallbackRedirectUrl,
  consumeAuthReturnTo,
  exchangeAuthCodeForDesignSession,
  storeAuthReturnTo,
} from '@/src/teamver/designAuthFlow';
import {
  fetchDesignAuthSession,
  invalidateDesignAuthSessionCache,
  prepareDesignAuthSessionReload,
} from '@/src/teamver/designBffClient';
import { postDesignAuthWorkspace } from '@/src/teamver/designAuthClient';
import { resolveEmbedBootstrapLoadingLabel } from '@/src/teamver/branding/loadingShellLabel';
import { seedEmbedBootstrapSession } from '@/src/teamver/embedBootstrapSession';
import { setTeamverEmbedSessionAuthenticated } from '@/src/teamver/teamverEmbedSession';
import { syncTeamverWorkspaceFromSession } from '@/src/teamver/syncTeamverWorkspace';
import {
  finishEmbedAuthNavigation,
  normalizeEmbedAuthReturnDestination,
  scrubCosmeticLaunchParamsFromBrowserUrl,
} from '@/src/teamver/teamverEmbedAuthNavigation';

const BOOTSTRAP_LOADING_LABEL = resolveEmbedBootstrapLoadingLabel();

function AuthCallbackInner() {
  const searchParams = useSearchParams();
  const [message, setMessage] = useState<string | null>(null);
  const exchangeStartedRef = useRef(false);

  useEffect(() => {
    scrubCosmeticLaunchParamsFromBrowserUrl();

    const returnToParam = searchParams.get('return_to');
    if (returnToParam?.startsWith('/')) storeAuthReturnTo(returnToParam);
    const returnTo = consumeAuthReturnTo('/');

    const code = searchParams.get('code');
    if (!code) {
      finishEmbedAuthNavigation(returnTo);
      return;
    }

    if (exchangeStartedRef.current) return;
    exchangeStartedRef.current = true;

    void (async () => {
      try {
        prepareDesignAuthSessionReload();
        const redirectUrl = buildAuthCallbackRedirectUrl('/auth/callback');
        const ws = searchParams.get('workspace_id') || searchParams.get('workspace');
        await exchangeAuthCodeForDesignSession(code, redirectUrl, ws);
        if (ws?.trim()) {
          try {
            await postDesignAuthWorkspace(ws.trim());
          } catch {
            // workspace selection can happen on next boot
          }
        }
        invalidateDesignAuthSessionCache();
        const session = await fetchDesignAuthSession({ force: true, resetRefreshState: true });
        if (session?.authenticated) {
          setTeamverEmbedSessionAuthenticated(true);
          const activeWorkspaceId = await syncTeamverWorkspaceFromSession(session);
          // finishEmbedAuthNavigation replaces the page below, so this snapshot
          // is a defensive seed for any future SPA navigation path — the fresh
          // module instance on the destination page cannot see it. The main
          // App boot re-seeds this snapshot before `EmbedBootstrapGate` clears.
          seedEmbedBootstrapSession({ session, activeWorkspaceId });
        }
        finishEmbedAuthNavigation(
          normalizeEmbedAuthReturnDestination(returnTo),
        );
      } catch {
        setMessage('로그인 연결에 실패했습니다. Teamver에서 다시 로그인해 주세요.');
      }
    })();
  }, [searchParams]);

  if (message) {
    return (
      <div className="od-loading-shell" data-testid="design-auth-callback-error">
        {message}
      </div>
    );
  }

  return <div className="od-loading-shell" data-testid="design-auth-callback-loading">{BOOTSTRAP_LOADING_LABEL}</div>;
}

export default function DesignAuthCallbackPage() {
  return (
    <Suspense fallback={<div className="od-loading-shell">{BOOTSTRAP_LOADING_LABEL}</div>}>
      <AuthCallbackInner />
    </Suspense>
  );
}
