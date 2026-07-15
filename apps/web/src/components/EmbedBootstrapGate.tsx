import { useEffect, useState, type ReactNode } from 'react';
import { EmbedLoadingShell } from './EmbedLoadingShell';
import { isTeamverEmbedMode } from '../teamver/designApiBase';
import {
  completeTeamverEmbedBoot,
  isTeamverEmbedBootComplete,
  isTeamverEmbedChromeRevealed,
  revealTeamverEmbedChrome,
  TEAMVER_EMBED_BOOT_FALLBACK_MS,
  TEAMVER_EMBED_CHROME_FALLBACK_MS,
  TEAMVER_EMBED_CHROME_READY_EVENT,
  waitForTeamverEmbedBoot,
  waitForTeamverEmbedChrome,
} from '../teamver/teamverEmbedBoot';

type Props = {
  children: ReactNode;
};

/**
 * One cream loading shell through session boot AND first chrome paint.
 * Session boot alone used to unmask a dark EntryShell while projects were
 * still loading — that read as yet another loading screen.
 */
export function EmbedBootstrapGate({ children }: Props) {
  const embed = isTeamverEmbedMode();
  const [bootReady, setBootReady] = useState(
    () => !embed || isTeamverEmbedBootComplete(),
  );
  const [chromeReady, setChromeReady] = useState(
    () => !embed || isTeamverEmbedChromeRevealed(),
  );

  useEffect(() => {
    if (!embed || bootReady) return;
    let cancelled = false;
    const fallback = window.setTimeout(() => {
      completeTeamverEmbedBoot();
    }, TEAMVER_EMBED_BOOT_FALLBACK_MS);
    void waitForTeamverEmbedBoot().then(() => {
      if (!cancelled) setBootReady(true);
    });
    return () => {
      cancelled = true;
      window.clearTimeout(fallback);
    };
  }, [embed, bootReady]);

  useEffect(() => {
    if (!embed || !bootReady || chromeReady) return;
    let cancelled = false;
    const fallback = window.setTimeout(() => {
      revealTeamverEmbedChrome();
    }, TEAMVER_EMBED_CHROME_FALLBACK_MS);
    const onReady = () => {
      if (!cancelled) setChromeReady(true);
    };
    window.addEventListener(TEAMVER_EMBED_CHROME_READY_EVENT, onReady);
    void waitForTeamverEmbedChrome().then(onReady);
    return () => {
      cancelled = true;
      window.clearTimeout(fallback);
      window.removeEventListener(TEAMVER_EMBED_CHROME_READY_EVENT, onReady);
    };
  }, [embed, bootReady, chromeReady]);

  if (!embed || (bootReady && chromeReady)) {
    return children;
  }

  return (
    <>
      <EmbedLoadingShell overlay testId="embed-bootstrap-gate" />
      {/* Mount children under the shell once session is ready so project list
          fetch can complete; keep them visually hidden until chrome reveal. */}
      <div
        className={bootReady ? undefined : 'embed-bootstrap-gate__stage'}
        style={
          bootReady
            ? { visibility: 'hidden', pointerEvents: 'none', position: 'fixed', inset: 0 }
            : undefined
        }
        aria-hidden="true"
      >
        {children}
      </div>
    </>
  );
}
