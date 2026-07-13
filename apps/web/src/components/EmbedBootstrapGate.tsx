import { useEffect, useState, type ReactNode } from 'react';
import { EmbedLoadingShell } from './EmbedLoadingShell';
import { isTeamverEmbedMode } from '../teamver/designApiBase';
import {
  completeTeamverEmbedBoot,
  isTeamverEmbedBootComplete,
  TEAMVER_EMBED_BOOT_FALLBACK_MS,
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
