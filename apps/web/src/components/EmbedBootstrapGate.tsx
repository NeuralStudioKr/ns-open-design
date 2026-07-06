import { useEffect, useState, type ReactNode } from 'react';
import { resolveLoadingShellLabel } from '../teamver/branding/loadingShellLabel';
import { isTeamverEmbedMode } from '../teamver/designApiBase';
import { isTeamverEmbedBootComplete, waitForTeamverEmbedBoot } from '../teamver/teamverEmbedBoot';

type Props = {
  children: ReactNode;
};

/**
 * Keep the pre-mount loading shell visible through embed session/workspace boot
 * so EntryShell does not flash intermediate auth states.
 */
export function EmbedBootstrapGate({ children }: Props) {
  const [ready, setReady] = useState(
    () => !isTeamverEmbedMode() || isTeamverEmbedBootComplete(),
  );

  useEffect(() => {
    if (!isTeamverEmbedMode() || ready) return;
    let cancelled = false;
    void waitForTeamverEmbedBoot().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [ready]);

  if (!ready) {
    return (
      <div className="od-loading-shell" data-testid="embed-bootstrap-gate">
        {resolveLoadingShellLabel()}
      </div>
    );
  }

  return children;
}
