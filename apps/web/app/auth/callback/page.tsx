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
import { EmbedLoadingShell } from '@/src/components/EmbedLoadingShell';
import { seedEmbedBootstrapSession } from '@/src/teamver/embedBootstrapSession';
import { setTeamverEmbedSessionAuthenticated } from '@/src/teamver/teamverEmbedSession';
import { setActiveTeamverWorkspace } from '@/src/teamver/setActiveTeamverWorkspace';
import { syncTeamverWorkspaceFromSession } from '@/src/teamver/syncTeamverWorkspace';
import {
  finishEmbedAuthNavigation,
  normalizeEmbedAuthReturnDestination,
  scrubCosmeticLaunchParamsFromBrowserUrl,
} from '@/src/teamver/teamverEmbedAuthNavigation';

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
        invalidateDesignAuthSessionCache();
        const session = await fetchDesignAuthSession({ force: true, resetRefreshState: true });
        if (session?.authenticated) {
          setTeamverEmbedSessionAuthenticated(true);
          const preferred = ws?.trim() || null;
          let activeWorkspaceId: string | null = null;
          if (preferred) {
            // Use recovery ladder + boolean contract — raw POST swallow drifted
            // local store ahead of BFF cookie (§16).
            const advanced = await setActiveTeamverWorkspace(
              preferred,
              session.user?.userId,
            );
            activeWorkspaceId = await syncTeamverWorkspaceFromSession(
              session,
              undefined,
              advanced ? { preferredIdOverride: preferred } : undefined,
            );
          } else {
            activeWorkspaceId = await syncTeamverWorkspaceFromSession(session);
          }
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
      <EmbedLoadingShell label={message} testId="design-auth-callback-error" />
    );
  }

  return <EmbedLoadingShell testId="design-auth-callback-loading" />;
}

export default function DesignAuthCallbackPage() {
  return (
    <Suspense fallback={<EmbedLoadingShell />}>
      <AuthCallbackInner />
    </Suspense>
  );
}
