'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
import { setTeamverEmbedSessionAuthenticated } from '@/src/teamver/teamverEmbedSession';
import { syncTeamverWorkspaceFromSession } from '@/src/teamver/syncTeamverWorkspace';

function AuthCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState<string | null>(null);
  const exchangeStartedRef = useRef(false);

  useEffect(() => {
    const returnToParam = searchParams.get('return_to');
    if (returnToParam?.startsWith('/')) storeAuthReturnTo(returnToParam);
    const returnTo = consumeAuthReturnTo('/');

    const code = searchParams.get('code');
    if (!code) {
      router.replace(returnTo.startsWith('/') ? returnTo : '/');
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
          await syncTeamverWorkspaceFromSession(session);
        }
        window.history.replaceState({}, '', '/auth/callback');
        router.replace(returnTo.startsWith('/') ? returnTo : '/');
      } catch {
        setMessage('로그인 연결에 실패했습니다. Teamver에서 다시 로그인해 주세요.');
      }
    })();
  }, [router, searchParams]);

  if (message) {
    return (
      <div className="od-loading-shell" data-testid="design-auth-callback-error">
        {message}
      </div>
    );
  }

  return <div className="od-loading-shell" data-testid="design-auth-callback-loading">로그인 연결 중…</div>;
}

export default function DesignAuthCallbackPage() {
  return (
    <Suspense fallback={<div className="od-loading-shell">로그인 연결 중…</div>}>
      <AuthCallbackInner />
    </Suspense>
  );
}
