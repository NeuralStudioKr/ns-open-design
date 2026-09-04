// Design-system detail surface for plugins that ship as part of the
// design-systems family. Mirrors the existing DesignSystemPreviewModal:
//
//   - Showcase tab — the marketing-style HTML page rendered from the
//     referenced design system (`/api/design-systems/:slug/showcase`)
//   - Tokens tab   — the palette / typography / components inspector
//     (`/api/design-systems/:slug/preview`)
//   - Plugin info sidebar — manifest metadata first, with the raw
//     DESIGN.md spec included as a section underneath
//     (`/api/plugins/:id/asset/DESIGN.md`)
//
// Falls back gracefully when the plugin does not reference an
// upstream design system (some bundles ship DESIGN.md only): the
// tabs collapse and the modal renders the spec sidebar by default.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { InstalledPluginRecord } from '@open-design/contracts';
import { useI18n } from '../../i18n';
import { localizePluginDescription, localizePluginTitle } from '../plugins-home/localization';
import {
  fetchDesignSystemPreviewResult,
  fetchDesignSystemShowcaseResult,
  fetchPluginAssetText,
} from '../../providers/registry';
import { DesignSpecView } from '../DesignSpecView';
import {
  PreviewModal,
  type PreviewSharePopoverItem,
  type PreviewView,
} from '../PreviewModal';
import { buildPluginShareUrl, PluginShareMenu } from './PluginShareMenu';
import { PluginMetaSections } from './PluginMetaSections';
import { buildPluginUseMenu, pluginUsePrimaryAction } from './pluginUseMenu';
import type { PluginUseAction } from '../plugins-home/useActions';
import { useTeamverBranding } from '../../teamver/branding/TeamverBrandingProvider';
import {
  shouldHideTeamverPluginDeveloperChrome,
  teamverEndUserPluginMetaOmit,
  teamverPluginShareTargetUrl,
} from '../../teamver/branding/pluginDetailDisplay';

interface Props {
  record: InstalledPluginRecord;
  onClose: () => void;
  onUse: (record: InstalledPluginRecord, action: PluginUseAction) => void;
  isApplying?: boolean;
  hideUseAction?: boolean;
  hideComposerSeedActions?: boolean;
  // Analytics — forwarded to PreviewModal's share popover.
  onSharePopoverItemClick?: (item: PreviewSharePopoverItem) => void;
}

interface ContextRef {
  ref?: string;
  path?: string;
  primary?: boolean;
}

type LoadStatus = 'idle' | 'loading' | 'ok' | 'error';

function designSystemRef(record: InstalledPluginRecord): string | null {
  const ds = (record.manifest?.od?.context as { designSystem?: ContextRef } | undefined)
    ?.designSystem;
  if (!ds) return null;
  if (typeof ds.ref === 'string' && ds.ref.length > 0) return ds.ref;
  return null;
}

function specAssetPath(record: InstalledPluginRecord): string {
  // Most design-system plugins ship `DESIGN.md` at the bundle root,
  // but `od.context.assets[0]` may point at a different relpath when
  // the bundle has co-located docs. Prefer the assets entry when it
  // smells like a markdown spec; otherwise fall back to the canonical
  // filename so the sidebar still has something to load.
  const assets = (record.manifest?.od?.context?.assets ?? []) as string[];
  const md = assets.find((a) => /\.md$/i.test(a));
  return md ?? './DESIGN.md';
}

export function PluginDesignSystemDetail({
  record,
  onClose,
  onUse,
  isApplying,
  hideUseAction,
  hideComposerSeedActions,
  onSharePopoverItemClick,
}: Props) {
  const { t, locale } = useI18n();
  const { slideOnlyMvp, hideExternalShareSurfaces } = useTeamverBranding();
  const localizedTitle = localizePluginTitle(locale, record);
  const localizedDescription = localizePluginDescription(locale, record);
  const dsRef = designSystemRef(record);
  const assetPath = specAssetPath(record);

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

  // Reset caches when the modal swaps to a different plugin.
  // Skip initial mount so we don't cancel the first onView fetch (gen bump).
  const prevRecordIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevRecordIdRef.current === null) {
      prevRecordIdRef.current = record.id;
      return;
    }
    if (prevRecordIdRef.current === record.id) return;
    prevRecordIdRef.current = record.id;
    showcaseGenRef.current += 1;
    tokensGenRef.current += 1;
    specGenRef.current += 1;
    showcaseStatusRef.current = 'idle';
    tokensStatusRef.current = 'idle';
    specStatusRef.current = 'idle';
    setShowcaseHtml(undefined);
    setTokensHtml(undefined);
    setShowcaseError(null);
    setTokensError(null);
    setSpecBody(undefined);
  }, [record.id]);

  const loadShowcase = useCallback(async () => {
    if (!dsRef) return;
    const gen = ++showcaseGenRef.current;
    showcaseStatusRef.current = 'loading';
    setShowcaseHtml(null);
    setShowcaseError(null);
    const result = await fetchDesignSystemShowcaseResult(dsRef);
    if (gen !== showcaseGenRef.current) return;
    if (result.ok) {
      showcaseStatusRef.current = 'ok';
      setShowcaseHtml(result.html);
      return;
    }
    showcaseStatusRef.current = 'error';
    setShowcaseError(result.reason);
    setShowcaseHtml(undefined);
  }, [dsRef]);

  const loadTokens = useCallback(async () => {
    if (!dsRef) return;
    const gen = ++tokensGenRef.current;
    tokensStatusRef.current = 'loading';
    setTokensHtml(null);
    setTokensError(null);
    const result = await fetchDesignSystemPreviewResult(dsRef);
    if (gen !== tokensGenRef.current) return;
    if (result.ok) {
      tokensStatusRef.current = 'ok';
      setTokensHtml(result.html);
      return;
    }
    tokensStatusRef.current = 'error';
    setTokensError(result.reason);
    setTokensHtml(undefined);
  }, [dsRef]);

  const loadSpec = useCallback(async () => {
    const gen = ++specGenRef.current;
    specStatusRef.current = 'loading';
    setSpecBody(null);
    const body = await fetchPluginAssetText(record.id, assetPath);
    if (gen !== specGenRef.current) return;
    if (body?.trim()) {
      specStatusRef.current = 'ok';
      setSpecBody(body);
      return;
    }
    specStatusRef.current = 'error';
    setSpecBody(null);
  }, [record.id, assetPath]);

  const handleView = useCallback(
    (viewId: string) => {
      if (!dsRef) return;
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
    [dsRef, loadShowcase, loadTokens],
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

  // When no upstream design system is referenced we still need a view
  // for the iframe stage so PreviewModal has something to render. Fall
  // back to a minimal placeholder that explains the design spec lives
  // in the plugin-info sidebar; the user can still apply the plugin
  // from the primary CTA.
  const views: PreviewView[] = dsRef
    ? [
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
      ]
    : [
        {
          id: 'spec',
          label: 'Spec',
          html: '<!doctype html><meta charset="utf-8"><body style="font:14px system-ui;color:#666;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;padding:0 24px;margin:0;">This plugin ships only the design spec — open Plugin info to read DESIGN.md.</body>',
        },
      ];

  return (
    <PreviewModal
      title={localizedTitle}
      subtitle={localizedDescription || dsRef || undefined}
      views={views}
      initialViewId={dsRef ? 'showcase' : 'spec'}
      onView={handleView}
      exportTitleFor={(viewId) => `${localizedTitle} — ${viewId}`}
      shareTarget={{
        title: localizedTitle,
        description: localizedDescription || dsRef || undefined,
        url: teamverPluginShareTargetUrl(
          { hideExternalShareSurfaces },
          buildPluginShareUrl(record),
        ),
      }}
      onClose={onClose}
      sidebar={{
        label: 'Plugin info',
        defaultOpen: true,
        onToggle: handleSidebarToggle,
        contentKey: record.id,
        // Design-system plugins are still plugins, so the inspector
        // comes first. DESIGN.md remains available in the same sidebar,
        // but as a spec section below the plugin-common metadata.
        content: (
          <div className="plugin-design-sidebar">
            <div className="plugin-info-pane">
              <PluginMetaSections
                record={record}
                omit={teamverEndUserPluginMetaOmit({ slideOnlyMvp }, { description: true })}
                compact
                heading="Plugin info"
              />
            </div>
            {slideOnlyMvp ? null : (
              <section className="plugin-design-sidebar__spec">
                <div className="plugin-design-sidebar__spec-head">
                  <h3>DESIGN.md</h3>
                  <span>{assetPath.replace(/^\.\//, '')}</span>
                </div>
                <DesignSpecView
                  source={specBody}
                  loadingLabel={t('ds.specLoading')}
                  emptyLabel={t('preview.errorBody')}
                />
              </section>
            )}
          </div>
        ),
      }}
      primaryAction={hideUseAction
        ? undefined
        : {
            label: pluginUsePrimaryAction(record, t).label,
            onClick: () => onUse(record, pluginUsePrimaryAction(record, t).action),
            busy: !!isApplying,
            busyLabel: 'Applying…',
            testId: `plugin-details-use-${record.id}`,
            menu: buildPluginUseMenu(record, onUse, t, {
              hideComposerSeed: hideComposerSeedActions,
            }),
          }}
      hideShareMenu={shouldHideTeamverPluginDeveloperChrome({ slideOnlyMvp })}
      headerExtras={<PluginShareMenu record={record} variant="inline" />}
      onSharePopoverItemClick={onSharePopoverItemClick}
    />
  );
}
