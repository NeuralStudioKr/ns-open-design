// Inspector-style detail surface for plain scenario plugins.
//
// Used as the fallback when `inferPluginPreview` returns `text` —
// the plugin ships no image/video poster, no runnable HTML preview,
// and no design-system signal. The body delegates to
// `PluginMetaSections` so the same manifest-driven inspector surface
// is reused by every other variant; this file owns the modal shell
// (backdrop, header, byline, hero, footer with Use plugin CTA).

import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog } from '@open-design/components';
import type {
  InstalledPluginRecord,
  PluginManifest,
} from '@open-design/contracts';
import { useI18n } from '../../i18n';
import { Icon } from '../Icon';
import { TrustBadge } from '../TrustBadge';
import { PluginPreviewHero } from './PluginPreviewHero';
import { PluginMetaSections } from './PluginMetaSections';
import { PluginShareMenu } from './PluginShareMenu';
import { buildPluginUseMenu, pluginUsePrimaryAction } from './pluginUseMenu';
import { resolveGalleryOdMode } from '../plugins-home/galleryOdMode';
import type { PluginUseAction } from '../plugins-home/useActions';
import { useTeamverBranding } from '../../teamver/branding/TeamverBrandingProvider';
import {
  shouldHideTeamverPluginDeveloperChrome,
  teamverEndUserPluginMetaOmit,
} from '../../teamver/branding/pluginDetailDisplay';

const TEAMVER_HIDDEN_DETAIL_TAGS = new Set([
  'new-generation',
  'scenario',
  'bundled',
  'example',
  'first-party',
  'deck',
  'marketing',
  'web',
]);

interface Props {
  record: InstalledPluginRecord;
  onClose: () => void;
  onUse: (record: InstalledPluginRecord, action: PluginUseAction) => void;
  isApplying?: boolean;
  hideUseAction?: boolean;
  hideComposerSeedActions?: boolean;
}

export function PluginScenarioDetail({
  record,
  onClose,
  onUse,
  isApplying,
  hideUseAction,
  hideComposerSeedActions,
}: Props) {
  const { t } = useI18n();
  const { slideOnlyMvp } = useTeamverBranding();
  const closeRef = useRef<HTMLButtonElement | null>(null);
  // The text/scenario fallback modal gets the same split "Use plugin /
  // Replicate this content" affordance as the HTML/design/media variants, so a
  // scenario plugin with an `od.useCase.query` still offers use-with-query.
  const useMenu = buildPluginUseMenu(record, onUse, t, {
    hideComposerSeed: hideComposerSeedActions,
  });
  const [useMenuOpen, setUseMenuOpen] = useState(false);
  const useMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!useMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!useMenuRef.current?.contains(e.target as Node)) setUseMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [useMenuOpen]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Move focus to the close button on mount so keyboard users land
  // somewhere sensible without trapping them inside the long body.
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  const manifest: PluginManifest = record.manifest ?? ({} as PluginManifest);
  const od = manifest.od ?? {};
  const examples = useMemo(
    () => (od.useCase?.exampleOutputs ?? []) as Array<{ path: string; title?: string }>,
    [od.useCase?.exampleOutputs],
  );
  const tags = (manifest.tags ?? []).filter((tag) =>
    slideOnlyMvp ? !TEAMVER_HIDDEN_DETAIL_TAGS.has(tag.trim().toLowerCase()) : true,
  );

  return (
    <Dialog
      backdropClassName="plugin-details-modal-backdrop"
      className="plugin-details-modal"
      includeChromeClassName={false}
      ariaLabel={`${record.title} details`}
      onClose={onClose}
      closeOnEscape
      data-testid="plugin-details-modal"
      data-plugin-id={record.id}
      data-detail-variant="scenario"
    >
        <header className="plugin-details-modal__head">
          <div className="plugin-details-modal__head-titles">
            <div className="plugin-details-modal__head-row">
              <h2 className="plugin-details-modal__title">{record.title}</h2>
              {shouldHideTeamverPluginDeveloperChrome({ slideOnlyMvp }) ? null : (
                <TrustBadge trust={record.trust} />
              )}
            </div>
            {shouldHideTeamverPluginDeveloperChrome({ slideOnlyMvp }) ? (
              tags.length > 0 ? (
                <div className="plugin-details-modal__meta">
                  <span className="plugin-details-modal__meta-tags">
                    {tags.slice(0, 4).map((tag) => (
                      <span key={tag} className="plugin-details-modal__tag">
                        {tag}
                      </span>
                    ))}
                  </span>
                </div>
              ) : null
            ) : (
              <div className="plugin-details-modal__meta">
                <span>v{record.version}</span>
                {od.taskKind ? <span>· {od.taskKind}</span> : null}
                {od.kind ? <span>· {od.kind}</span> : null}
                <span>· {record.sourceKind}</span>
                {tags.length > 0 ? (
                  <span className="plugin-details-modal__meta-tags">
                    {tags.slice(0, 4).map((tag) => (
                      <span key={tag} className="plugin-details-modal__tag">
                        {tag}
                      </span>
                    ))}
                  </span>
                ) : null}
              </div>
            )}
          </div>
          <div className="plugin-details-modal__head-actions">
            <PluginShareMenu record={record} variant="default" />
            <button
              ref={closeRef}
              type="button"
              className="plugin-details-modal__close"
              onClick={onClose}
              aria-label={t('common.close')}
              title={`${t('common.close')} (Esc)`}
            >
              <Icon name="close" size={18} />
            </button>
          </div>
        </header>

        <div className="plugin-details-modal__body">
          {examples.length > 0 ? (
            <PluginPreviewHero
              pluginId={record.id}
              pluginTitle={record.title}
              examples={examples}
              preferDeckCover={resolveGalleryOdMode(record) === 'deck'}
            />
          ) : null}

          <PluginMetaSections
            record={record}
            omit={teamverEndUserPluginMetaOmit({ slideOnlyMvp })}
          />
        </div>

        <footer className="plugin-details-modal__foot">
          <button
            type="button"
            className="plugin-details-modal__secondary"
            onClick={onClose}
          >
            {t('common.close')}
          </button>
          {hideUseAction ? null : useMenu ? (
            <div className="plugin-details-modal__use-split" ref={useMenuRef}>
              <button
                type="button"
                className="plugin-details-modal__primary plugin-details-modal__use-main"
                onClick={() => onUse(record, pluginUsePrimaryAction(record, t).action)}
                disabled={isApplying}
                aria-busy={isApplying ? 'true' : undefined}
                data-testid={`plugin-details-use-${record.id}`}
              >
                {isApplying ? 'Applying…' : pluginUsePrimaryAction(record, t).label}
              </button>
              <button
                type="button"
                className="plugin-details-modal__primary plugin-details-modal__use-caret"
                onClick={() => setUseMenuOpen((v) => !v)}
                disabled={isApplying}
                aria-haspopup="menu"
                aria-expanded={useMenuOpen}
                aria-label={`More ways to ${pluginUsePrimaryAction(record, t).label}`}
                data-testid={`plugin-details-use-${record.id}-menu`}
              >
                <Icon name="chevron-down" size={12} />
              </button>
              {useMenuOpen ? (
                <div className="plugin-details-modal__use-menu" role="menu">
                  {useMenu.map((item, index) => (
                    <button
                      key={item.testId ?? `${item.label}-${index}`}
                      type="button"
                      role="menuitem"
                      className="plugin-details-modal__use-menu-item"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setUseMenuOpen(false);
                        item.onClick();
                      }}
                      {...(item.testId ? { 'data-testid': item.testId } : {})}
                    >
                      <span className="plugin-details-modal__use-menu-label">
                        {item.label}
                      </span>
                      {item.description ? (
                        <span className="plugin-details-modal__use-menu-desc">
                          {item.description}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <button
              type="button"
              className="plugin-details-modal__primary"
              onClick={() => onUse(record, 'use')}
              disabled={isApplying}
              aria-busy={isApplying ? 'true' : undefined}
              data-testid={`plugin-details-use-${record.id}`}
            >
              {isApplying ? 'Applying…' : t('preview.usePlugin')}
            </button>
          )}
        </footer>
    </Dialog>
  );
}
