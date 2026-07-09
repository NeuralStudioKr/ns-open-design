import { useEffect, useState, type ReactNode } from 'react';
import { resolveLoadingShellLabel } from '../teamver/branding/loadingShellLabel';
import { isTeamverEmbedMode } from '../teamver/designApiBase';
import {
  completeTeamverEmbedInitialUi,
  isTeamverEmbedInitialUiComplete,
  TEAMVER_EMBED_INITIAL_UI_FALLBACK_MS,
  waitForTeamverEmbedInitialUi,
} from '../teamver/teamverEmbedInitialUi';
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
 * Keep one unified loading shell visible through embed session/workspace boot
 * and the first home/project paint so EntryShell does not flash intermediate
 * auth or spinner copy.
 */
export function EmbedBootstrapGate({ children }: Props) {
  const embed = isTeamverEmbedMode();
  const [bootReady, setBootReady] = useState(
    () => !embed || isTeamverEmbedBootComplete(),
  );
  const [uiReady, setUiReady] = useState(
    () => !embed || isTeamverEmbedInitialUiComplete(),
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
    if (!embed || uiReady) return;
    let cancelled = false;
    const fallback = window.setTimeout(() => {
      completeTeamverEmbedInitialUi();
    }, TEAMVER_EMBED_INITIAL_UI_FALLBACK_MS);
    void waitForTeamverEmbedInitialUi().then(() => {
      if (!cancelled) setUiReady(true);
    });
    return () => {
      cancelled = true;
      window.clearTimeout(fallback);
    };
  }, [embed, uiReady]);

  const showShell = embed && (!bootReady || !uiReady);

  if (!showShell) {
    return children;
  }

  return (
    <>
      <div
        className="od-loading-shell od-loading-shell--overlay"
        data-testid="embed-bootstrap-gate"
      >
        {resolveLoadingShellLabel()}
      </div>
      <div className="embed-bootstrap-gate__stage" aria-hidden="true">
        {children}
      </div>
    </>
  );
}
