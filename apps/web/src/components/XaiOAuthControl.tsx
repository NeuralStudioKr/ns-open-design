// xAI / SuperGrok OAuth control rendered inside the Grok provider row in
// the Settings → Media Providers panel.
//
// Mirrors the shape of McpOAuthControl in McpClientSection.tsx (state
// machine, polling cadence, CSS classes), but skips the postMessage /
// BroadcastChannel handshake because the xAI callback is served by the
// one-shot listener on 127.0.0.1:56121 — a separate process that can't
// talk to the OD UI directly. Polling /api/xai/auth/status is the only
// delivery channel for "auth completed".
//
// TODO(i18n): the visible strings are hardcoded English for the PoC;
// migrate to apps/web/src/i18n/types.ts before stable release.

'use client';

import { useEffect, useRef, useState } from 'react';
import { embedUiLabel } from '../teamver/embedUiLabels';

interface XaiAuthStatus {
  connected: boolean;
  listening?: boolean;
  expiresAt?: number | null;
  scope?: string | null;
  savedAt?: number;
}

interface StartResponse {
  authorizeUrl: string;
  state: string;
  callback: { host: string; port: number };
}

type Busy =
  | 'idle'
  | 'starting'
  | 'awaiting'
  | 'disconnecting'
  | 'refreshing';

async function fetchStatus(): Promise<XaiAuthStatus | null> {
  try {
    const r = await fetch('/api/xai/auth/status', { credentials: 'same-origin' });
    if (!r.ok) return null;
    return (await r.json()) as XaiAuthStatus;
  } catch {
    return null;
  }
}

async function startOAuth(): Promise<
  { ok: true; response: StartResponse } | { ok: false; message: string }
> {
  try {
    const r = await fetch('/api/xai/oauth/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: '{}',
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) {
      const message =
        typeof body?.error === 'string' && body.error
          ? body.error
          : `daemon returned HTTP ${r.status}`;
      return { ok: false, message };
    }
    return { ok: true, response: body as StartResponse };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

async function disconnectOAuth(): Promise<boolean> {
  try {
    const r = await fetch('/api/xai/oauth/disconnect', {
      method: 'POST',
      credentials: 'same-origin',
    });
    return r.ok;
  } catch {
    return false;
  }
}

async function cancelInFlightOAuth(): Promise<void> {
  // Best-effort. If the daemon is unreachable the listener will still
  // self-close on its 30 min timeout; we don't surface a failure to
  // the user because Cancel is a UX affordance, not a critical action.
  try {
    await fetch('/api/xai/oauth/cancel', {
      method: 'POST',
      credentials: 'same-origin',
    });
  } catch {
    // ignore
  }
}

async function completeOAuthManual(
  state: string,
  code: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const r = await fetch('/api/xai/oauth/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ state, code }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) {
      const message =
        typeof body?.error === 'string' && body.error
          ? body.error
          : `daemon returned HTTP ${r.status}`;
      return { ok: false, message };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export function XaiOAuthControl() {
  const [status, setStatus] = useState<XaiAuthStatus | null>(null);
  const [busy, setBusy] = useState<Busy>('idle');
  const [error, setError] = useState<string | null>(null);
  // Authorize URL kept around as a fallback link in case the popup blocker
  // ate window.open or the user closed the tab and wants to re-open it.
  const [pendingAuthUrl, setPendingAuthUrl] = useState<string | null>(null);
  // State emitted by /oauth/start. Needed to complete a paste-back when
  // xAI shows a manual code instead of redirecting to the loopback.
  const [pendingState, setPendingState] = useState<string | null>(null);
  const [pasteCode, setPasteCode] = useState('');
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = async () => {
    const data = await fetchStatus();
    if (data) setStatus(data);
    return data;
  };

  useEffect(() => {
    void refresh();
    return () => stopPoll();
  }, []);

  function stopPoll() {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }

  function startPoll() {
    stopPoll();
    let elapsed = 0;
    pollTimer.current = setInterval(() => {
      elapsed += 2000;
      void (async () => {
        const data = await refresh();
        if (data?.connected) {
          setBusy('idle');
          setError(null);
          setPendingAuthUrl(null);
          setPendingState(null);
          setPasteCode('');
          stopPoll();
        }
        // Intentionally NOT auto-clearing the awaiting state when
        // `data.listening` flips false. xAI commonly shows a paste-back
        // page instead of redirecting, in which case the loopback
        // listener never receives a callback and self-closes after its
        // 30 min timeout — but the user still has a valid code in their
        // clipboard. Keeping pendingState live lets them paste it; the
        // `Cancel` button is the manual way out.
      })();
      // Hard cap at 30 min — same as the daemon-side listener timeout.
      if (elapsed >= 30 * 60 * 1000) stopPoll();
    }, 2000);
  }

  const onConnect = async () => {
    setError(null);
    setPendingAuthUrl(null);
    setPendingState(null);
    setPasteCode('');
    setBusy('starting');
    const result = await startOAuth();
    if (!result.ok) {
      setBusy('idle');
      setError(result.message);
      return;
    }
    setBusy('awaiting');
    setPendingAuthUrl(result.response.authorizeUrl);
    setPendingState(result.response.state);
    startPoll();
    try {
      // noopener,noreferrer breaks the auth.x.ai tab's reference back to
      // this Settings tab, defending against reverse-tabnabbing if the
      // remote page (or any redirect-target along the OAuth chain) ever
      // turns hostile. The xAI flow doesn't use postMessage — the
      // callback comes back through the daemon's :56121 listener (or
      // the paste-back input below), so opener access is unnecessary.
      window.open(
        result.response.authorizeUrl,
        '_blank',
        'noopener,noreferrer',
      );
    } catch {
      // Fallback anchor is always rendered while pending.
    }
  };

  const onPasteSubmit = async () => {
    const trimmed = pasteCode.trim();
    if (!pendingState || !trimmed) return;
    setBusy('refreshing');
    setError(null);
    const result = await completeOAuthManual(pendingState, trimmed);
    if (!result.ok) {
      setBusy('awaiting');
      setError(result.message);
      return;
    }
    setBusy('idle');
    setPendingAuthUrl(null);
    setPendingState(null);
    setPasteCode('');
    stopPoll();
    await refresh();
  };

  const onRefreshStatus = async () => {
    setBusy('refreshing');
    const data = await refresh();
    setBusy('idle');
    if (data?.connected) {
      setError(null);
      setPendingAuthUrl(null);
      stopPoll();
    } else if (busy === 'awaiting' || pendingAuthUrl) {
      setBusy('awaiting');
    }
  };

  const onCancelPending = () => {
    // Tell the daemon to stop its one-shot 127.0.0.1:56121 listener so
    // the singleton port doesn't sit pinned for the full 30 min server
    // timeout. Fire-and-forget — UI state clears immediately either way.
    void cancelInFlightOAuth();
    setPendingAuthUrl(null);
    setPendingState(null);
    setPasteCode('');
    setBusy('idle');
    setError(null);
    stopPoll();
  };

  const onDisconnect = async () => {
    setBusy('disconnecting');
    const ok = await disconnectOAuth();
    setBusy('idle');
    if (ok) {
      setError(null);
      setPendingAuthUrl(null);
      setStatus({ connected: false });
    } else {
      setError('Disconnect failed. Check daemon logs.');
    }
  };

  const connected = Boolean(status?.connected);
  const expiresLabel =
    status?.expiresAt && status.expiresAt > 0
      ? new Date(status.expiresAt).toLocaleString()
      : null;
  // "Awaiting" once we've started the dance: the authorize URL is open OR
  // a state is pending OR the daemon is processing a paste-back. Stays
  // true even when the loopback listener self-closes, so the paste-back
  // input stays interactive until the user cancels or the token lands.
  const isAwaiting =
    busy === 'awaiting'
    || busy === 'refreshing'
    || (Boolean(pendingState) && !connected)
    || (Boolean(pendingAuthUrl) && !connected);

  return (
    <div className={`mcp-oauth-control${connected ? ' connected' : ''}`}>
      <div className="mcp-oauth-status" aria-live="polite">
        {connected ? (
          <>
            <span className="mcp-oauth-dot mcp-oauth-dot-ok" aria-hidden />
            <span>
              <strong>{embedUiLabel('Signed in with X.', 'X로 로그인됨.')}</strong>{' '}
              {expiresLabel ? (
                <span className="hint">
                  {embedUiLabel(
                    `SuperGrok subscription token expires ${expiresLabel}. You can close any open xAI browser tabs now.`,
                    `SuperGrok 구독 토큰이 ${expiresLabel}에 만료됩니다. 열린 xAI 탭은 닫아도 됩니다.`,
                  )}
                </span>
              ) : (
                <span className="hint">
                  {embedUiLabel(
                    'SuperGrok subscription connected. You can close any open xAI browser tabs now.',
                    'SuperGrok 구독이 연결되었습니다. 열린 xAI 탭은 닫아도 됩니다.',
                  )}
                </span>
              )}
            </span>
          </>
        ) : isAwaiting ? (
          <>
            <span className="mcp-oauth-dot mcp-oauth-dot-pending" aria-hidden />
            <span>
              <strong>{embedUiLabel('Waiting for authorization…', '승인 대기 중…')}</strong>{' '}
              <span className="hint">
                {embedUiLabel(
                  'Listening for the callback in the background. This panel will switch to Signed in within a few seconds of your approving on xAI.',
                  '백그라운드에서 콜백을 기다립니다. xAI에서 승인하면 잠시 후 로그인됨으로 바뀝니다.',
                )}
              </span>
            </span>
          </>
        ) : (
          <>
            <span className="mcp-oauth-dot" aria-hidden />
            <span>
              <strong>{embedUiLabel('Not signed in.', '로그인되지 않음.')}</strong>{' '}
              <span className="hint">
                {embedUiLabel(
                  'Click Sign in with X to use your SuperGrok subscription for Grok image, video, and TTS — no API key needed.',
                  'X로 로그인하면 SuperGrok 구독으로 Grok 이미지·영상·TTS를 사용할 수 있습니다. API 키는 필요 없습니다.',
                )}
              </span>
            </span>
          </>
        )}
      </div>

      {isAwaiting ? (
        <div className="xai-oauth-warning" role="status">
          <strong>{embedUiLabel('Heads up:', '안내:')}</strong>{' '}
          {embedUiLabel(
            'xAI may show a page that says "Cannot connect to your application". That is a UX bug on xAI\'s side — authorization is still delivered in the background. Stay on this panel; it will switch to Signed in with X automatically. Do not retry from xAI\'s page.',
            'xAI에서 "앱에 연결할 수 없음" 같은 페이지가 보일 수 있습니다. xAI 쪽 UX 버그이며 승인은 백그라운드로 전달됩니다. 이 패널에 머무르면 자동으로 X 로그인됨으로 바뀝니다. xAI 페이지에서 재시도하지 마세요.',
          )}
        </div>
      ) : null}

      <div className="mcp-oauth-actions">
        {connected ? (
          <>
            <button
              type="button"
              className="primary"
              onClick={onConnect}
              disabled={busy !== 'idle' && busy !== 'refreshing'}
              title={embedUiLabel(
                'Re-authenticate (replaces the existing token)',
                '다시 인증 (기존 토큰 교체)',
              )}
            >
              {busy === 'starting' || busy === 'awaiting'
                ? embedUiLabel('Connecting…', '연결 중…')
                : embedUiLabel('Reconnect', '다시 연결')}
            </button>
            <button
              type="button"
              onClick={onDisconnect}
              disabled={busy !== 'idle'}
            >
              {busy === 'disconnecting'
                ? embedUiLabel('Disconnecting…', '연결 해제 중…')
                : embedUiLabel('Disconnect', '연결 해제')}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="primary"
              onClick={onConnect}
              disabled={busy !== 'idle'}
            >
              {busy === 'starting'
                ? embedUiLabel('Opening browser…', '브라우저 여는 중…')
                : embedUiLabel('Sign in with X', 'X로 로그인')}
            </button>
            {isAwaiting ? (
              <>
                <button type="button" onClick={onRefreshStatus} disabled={busy === 'refreshing'}>
                  {busy === 'refreshing'
                    ? embedUiLabel('Checking…', '확인 중…')
                    : embedUiLabel('Refresh status', '상태 새로고침')}
                </button>
                <button type="button" onClick={onCancelPending}>
                  {embedUiLabel('Cancel', '취소')}
                </button>
              </>
            ) : null}
          </>
        )}
      </div>

      {pendingAuthUrl && !connected ? (
        <div className="mcp-oauth-fallback hint">
          {embedUiLabel('Browser tab didn\'t open? ', '브라우저 탭이 안 열렸나요? ')}
          <a href={pendingAuthUrl} target="_blank" rel="noopener noreferrer">
            {embedUiLabel('Click here to open the authorize URL manually', '여기를 눌러 승인 URL을 직접 열기')}
          </a>
          .
        </div>
      ) : null}

      {isAwaiting && pendingState ? (
        <div className="xai-oauth-paste">
          <p className="hint">
            {embedUiLabel(
              'xAI may show a code instead of redirecting back. Paste it here:',
              'xAI가 리다이렉트 대신 코드를 보여줄 수 있습니다. 여기에 붙여넣으세요:',
            )}
          </p>
          <div className="xai-oauth-paste-row">
            <input
              type="text"
              value={pasteCode}
              placeholder={embedUiLabel('Paste auth code from xAI', 'xAI 인증 코드를 붙여넣으세요')}
              onChange={(e) => setPasteCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && pasteCode.trim()) {
                  void onPasteSubmit();
                }
              }}
              disabled={busy === 'refreshing'}
              aria-label={embedUiLabel('Paste auth code from xAI', 'xAI 인증 코드를 붙여넣으세요')}
            />
            <button
              type="button"
              onClick={onPasteSubmit}
              disabled={!pasteCode.trim() || busy === 'refreshing'}
            >
              {busy === 'refreshing'
                ? embedUiLabel('Submitting…', '제출 중…')
                : embedUiLabel('Submit code', '코드 제출')}
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="mcp-oauth-error" role="alert">
          {error}
        </div>
      ) : null}

      {status?.scope ? (
        <div className="mcp-oauth-scope hint">
          {embedUiLabel('Granted scopes:', '허용된 범위:')} <code>{status.scope}</code>
        </div>
      ) : null}
    </div>
  );
}
