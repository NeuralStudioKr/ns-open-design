import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAnalytics } from '../analytics/provider';
import {
  trackDesignSystemsTemplatesModalClick,
  trackDesignSystemsTemplatesModalSharePopoverClick,
  trackDesignSystemsTemplatesModalSurfaceView,
} from '../analytics/events';
import { useT } from '../i18n';
import {
  fetchDesignSystem,
  fetchDesignSystemPreviewResult,
  fetchDesignSystemShowcaseResult,
} from '../providers/registry';
import type { DesignSystemSummary } from '../types';
import { DesignSpecView } from './DesignSpecView';
import { PreviewModal } from './PreviewModal';

interface Props {
  system: DesignSystemSummary;
  onClose: () => void;
}

type LoadStatus = 'idle' | 'loading' | 'ok' | 'error';

// Two-tab DS preview: a complete Showcase webpage rendered from the system's
// tokens, and the original Tokens view (palette / typography / components +
// rendered DESIGN.md prose). A toggleable side panel surfaces the raw
// DESIGN.md so users can compare spec to render at the same time, mirroring
// the styles.refero.design layout.
export function DesignSystemPreviewModal({ system, onClose }: Props) {
  const t = useT();
  const analytics = useAnalytics();
  const surfaceViewFiredRef = useRef<string | null>(null);
  useEffect(() => {
    if (surfaceViewFiredRef.current === system.id) return;
    surfaceViewFiredRef.current = system.id;
    trackDesignSystemsTemplatesModalSurfaceView(analytics.track, {
      page_name: 'design_systems',
      area: 'templates_modal',
      templates_id: system.id,
      templates_type: system.source ?? 'library',
    });
  }, [analytics.track, system.id, system.source]);

  const [showcaseHtml, setShowcaseHtml] = useState<string | null | undefined>(undefined);
  const [tokensHtml, setTokensHtml] = useState<string | null | undefined>(undefined);
  const [showcaseError, setShowcaseError] = useState<string | null>(null);
  const [tokensError, setTokensError] = useState<string | null>(null);
  const [specBody, setSpecBody] = useState<string | null | undefined>(undefined);
  const showcaseGenRef = useRef(0);
  const tokensGenRef = useRef(0);
  const specGenRef = useRef(0);
  const showcaseStatusRef = useRef<LoadStatus>('idle');
  const tokensStatusRef = useRef<LoadStatus>('idle');
  const specStatusRef = useRef<LoadStatus>('idle');

  const loadShowcase = useCallback(async () => {
    const gen = ++showcaseGenRef.current;
    showcaseStatusRef.current = 'loading';
    setShowcaseHtml(null);
    setShowcaseError(null);
    const result = await fetchDesignSystemShowcaseResult(system.id);
    if (gen !== showcaseGenRef.current) return;
    if (result.ok) {
      showcaseStatusRef.current = 'ok';
      setShowcaseHtml(result.html);
      return;
    }
    showcaseStatusRef.current = 'error';
    setShowcaseError(result.reason);
    setShowcaseHtml(undefined);
  }, [system.id]);

  const loadTokens = useCallback(async () => {
    const gen = ++tokensGenRef.current;
    tokensStatusRef.current = 'loading';
    setTokensHtml(null);
    setTokensError(null);
    const result = await fetchDesignSystemPreviewResult(system.id);
    if (gen !== tokensGenRef.current) return;
    if (result.ok) {
      tokensStatusRef.current = 'ok';
      setTokensHtml(result.html);
      return;
    }
    tokensStatusRef.current = 'error';
    setTokensError(result.reason);
    setTokensHtml(undefined);
  }, [system.id]);

  const loadSpec = useCallback(async () => {
    const gen = ++specGenRef.current;
    specStatusRef.current = 'loading';
    setSpecBody(null);
    const detail = await fetchDesignSystem(system.id);
    if (gen !== specGenRef.current) return;
    // null = failed/empty (DesignSpecView shows empty, not infinite loading).
    if (detail?.body?.trim()) {
      specStatusRef.current = 'ok';
      setSpecBody(detail.body);
      return;
    }
    specStatusRef.current = 'error';
    setSpecBody(null);
  }, [system.id]);

  // Lazy-load each view on first reveal / Retry. Keep onView identity stable
  // (status via refs) so PreviewModal's mount effect does not thrash or loop.
  const initialViewIdRef = useRef<string | null>(null);
  const handleView = useCallback(
    (viewId: string) => {
      if (initialViewIdRef.current === null) {
        initialViewIdRef.current = viewId;
      } else if (initialViewIdRef.current !== viewId) {
        initialViewIdRef.current = viewId;
        if (viewId === 'showcase' || viewId === 'tokens') {
          trackDesignSystemsTemplatesModalClick(analytics.track, {
            page_name: 'design_systems',
            area: 'templates_modal',
            element: viewId,
            templates_id: system.id,
            templates_type: system.source ?? 'library',
          });
        }
      }
      if (viewId === 'showcase') {
        if (
          showcaseStatusRef.current === 'idle'
          || showcaseStatusRef.current === 'error'
        ) {
          void loadShowcase();
        }
      }
      if (viewId === 'tokens') {
        if (
          tokensStatusRef.current === 'idle'
          || tokensStatusRef.current === 'error'
        ) {
          void loadTokens();
        }
      }
    },
    [analytics.track, system.id, system.source, loadShowcase, loadTokens],
  );

  const handleSidebarToggle = useCallback(
    (open: boolean) => {
      if (!open) return;
      if (
        specStatusRef.current === 'idle'
        || specStatusRef.current === 'error'
      ) {
        void loadSpec();
      }
    },
    [loadSpec],
  );

  // If the system swaps under us (rare but possible), wipe all caches.
  // Skip the initial mount — wiping there races PreviewModal's first onView
  // and can discard an in-flight showcase/DESIGN.md fetch, leaving infinite
  // "불러오는 중…".
  const prevSystemIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevSystemIdRef.current === null) {
      prevSystemIdRef.current = system.id;
      return;
    }
    if (prevSystemIdRef.current === system.id) return;
    prevSystemIdRef.current = system.id;
    showcaseGenRef.current += 1;
    tokensGenRef.current += 1;
    specGenRef.current += 1;
    showcaseStatusRef.current = 'idle';
    tokensStatusRef.current = 'idle';
    specStatusRef.current = 'idle';
    initialViewIdRef.current = null;
    setShowcaseHtml(undefined);
    setTokensHtml(undefined);
    setShowcaseError(null);
    setTokensError(null);
    setSpecBody(undefined);
  }, [system.id]);

  const detail = (
    <PreviewModal
      title={system.title}
      subtitle={system.summary || system.category}
      views={[
        {
          id: 'showcase',
          label: t('ds.showcase'),
          html: showcaseHtml,
          error: showcaseError,
        },
        {
          id: 'tokens',
          label: t('ds.tokens'),
          html: tokensHtml,
          error: tokensError,
        },
      ]}
      initialViewId="showcase"
      onView={handleView}
      exportTitleFor={(viewId) => `${system.title} — ${viewId}`}
      onClose={onClose}
      onFullscreenClick={() =>
        trackDesignSystemsTemplatesModalClick(analytics.track, {
          page_name: 'design_systems',
          area: 'templates_modal',
          element: 'fullscreen',
          templates_id: system.id,
          templates_type: system.source ?? 'library',
        })
      }
      onShareClick={() =>
        trackDesignSystemsTemplatesModalClick(analytics.track, {
          page_name: 'design_systems',
          area: 'templates_modal',
          element: 'share',
          templates_id: system.id,
          templates_type: system.source ?? 'library',
        })
      }
      onSidebarToggleClick={() =>
        trackDesignSystemsTemplatesModalClick(analytics.track, {
          page_name: 'design_systems',
          area: 'templates_modal',
          element: 'design_md',
          templates_id: system.id,
          templates_type: system.source ?? 'library',
        })
      }
      onSharePopoverItemClick={(item) =>
        trackDesignSystemsTemplatesModalSharePopoverClick(analytics.track, {
          page_name: 'design_systems',
          area: 'templates_modal_share_popover',
          element: item,
          templates_id: system.id,
          templates_type: system.source ?? 'library',
        })
      }
      sidebar={{
        label: t('ds.specToggle'),
        defaultOpen: true,
        onToggle: handleSidebarToggle,
        // Re-fire onToggle when the system swaps under us so the new
        // DESIGN.md fetch starts even if the sidebar never closed.
        contentKey: system.id,
        content: (
          <DesignSpecView
            source={specBody}
            loadingLabel={t('ds.specLoading')}
            emptyLabel={t('preview.errorBody')}
          />
        ),
      }}
    />
  );

  if (typeof document === 'undefined') return detail;
  return createPortal(detail, document.body);
}
