import { useEffect, useState, type ReactNode } from 'react';
import { EmbedLoadingShell } from './EmbedLoadingShell';
import { isTeamverEmbedMode } from '../teamver/designApiBase';
import {
  completeTeamverEmbedBoot,
  isTeamverEmbedBootComplete,
  TEAMVER_EMBED_BOOT_FALLBACK_MS,
  TEAMVER_EMBED_BOOTED_CLASS,
  waitForTeamverEmbedBoot,
} from '../teamver/teamverEmbedBoot';

type Props = {
  children: ReactNode;
};

/**
 * One loading shell through embed session/workspace boot. Initial UI unlocks
 * together with boot (`completeTeamverEmbedBoot`), so a second gate wait only
 * added latency and a second fallback timer.
 */
export function EmbedBootstrapGate({ children }: Props) {
  const embed = isTeamverEmbedMode();
  const [bootReady, setBootReady] = useState(
    () => !embed || isTeamverEmbedBootComplete(),
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

  // Already-booted mounts (HMR / late gate) still need the DOM class so themed
  // chrome can replace the cream bootstrap surface.
  useEffect(() => {
    if (!embed || !bootReady) return;
    document.documentElement.classList.add(TEAMVER_EMBED_BOOTED_CLASS);
  }, [embed, bootReady]);

  if (!embed || bootReady) {
    return children;
  }

  return (
    <>
      <EmbedLoadingShell overlay testId="embed-bootstrap-gate" />
      <div className="embed-bootstrap-gate__stage" aria-hidden="true">
        {children}
      </div>
    </>
  );
}
