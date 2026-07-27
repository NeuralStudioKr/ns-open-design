'use client';

import { useEffect, useRef } from 'react';
import { clearDesignAuthSessionFull } from '@/src/teamver/designAuthFlow';
import { EmbedLoadingShell } from '@/src/components/EmbedLoadingShell';

/**
 * Main FE logout iframe target — clears Design host-only BFF cookie.
 * Loaded cross-origin from teamver.com; no UI beyond a blank shell.
 */
export default function DesignLogoutBridgePage() {
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void clearDesignAuthSessionFull();
  }, []);

  return <EmbedLoadingShell testId="design-logout-bridge" label="" />;
}
