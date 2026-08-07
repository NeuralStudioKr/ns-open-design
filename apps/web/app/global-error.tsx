'use client';

import { useState } from 'react';

import {
  embedFatalErrorButtonStyle,
  embedFatalErrorShellStyle,
  isChunkLoadError,
  maybeReloadOnChunkError,
} from '../src/teamver/embedChunkLoadRecovery';
import { isTeamverEmbedBuild } from '../src/teamver/branding/siteMetadata';
import {
  TEAMVER_EMBED_LOADING_BG,
  TEAMVER_EMBED_LOADING_TEXT,
} from '../src/teamver/branding/loadingShellLabel';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const embed = isTeamverEmbedBuild();
  const [autoReloading] = useState(() => maybeReloadOnChunkError(error));
  const chunk = isChunkLoadError(error);

  return (
    <html lang={embed ? 'ko' : 'en'}>
      <body
        style={{
          margin: 0,
          backgroundColor: embed ? TEAMVER_EMBED_LOADING_BG : '#faf9f7',
          color: embed ? TEAMVER_EMBED_LOADING_TEXT : '#1a1916',
        }}
      >
        {autoReloading ? (
          <div style={embedFatalErrorShellStyle} role="status" aria-live="polite">
            <p>{embed ? '화면을 다시 불러오는 중…' : 'Reloading…'}</p>
          </div>
        ) : (
          <div style={embedFatalErrorShellStyle} role="alert">
            <p style={{ margin: 0, fontWeight: 600 }}>
              {embed ? '화면을 불러오지 못했습니다' : 'Something went wrong'}
            </p>
            <p style={{ margin: 0, opacity: 0.85 }}>
              {embed
                ? chunk
                  ? '배포 직후 일시적으로 발생할 수 있습니다. 새로고침 후 다시 시도해 주세요.'
                  : '잠시 후 다시 시도하거나 새로고침해 주세요.'
                : 'Please try again or reload the page.'}
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              <button
                type="button"
                style={embedFatalErrorButtonStyle}
                onClick={() => (chunk ? window.location.reload() : reset())}
              >
                {embed ? '새로고침' : 'Try again'}
              </button>
              {chunk ? (
                <button
                  type="button"
                  style={embedFatalErrorButtonStyle}
                  onClick={() => reset()}
                >
                  {embed ? '다시 시도' : 'Reset'}
                </button>
              ) : null}
            </div>
          </div>
        )}
      </body>
    </html>
  );
}
