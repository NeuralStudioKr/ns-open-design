// HTML-preview detail surface for plugins that ship a runnable
// `od.preview` entry or example output (the same surface ExamplesTab
// uses for skill cards). Wraps the shared PreviewModal so the user
// gets the full chrome — sandboxed iframe, Fullscreen, merged Share menu —
// plus a primary
// "Use plugin" action that routes through the home applyPlugin flow.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { InstalledPluginRecord } from '@open-design/contracts';
import { useI18n } from '../../i18n';
import { localizePluginDescription, localizePluginTitle } from '../plugins-home/localization';
import {
  fetchPluginExampleHtml,
  fetchPluginPreviewHtml,
  type SkillExampleResult,
} from '../../providers/registry';
import { PreviewModal, type PreviewSharePopoverItem } from '../PreviewModal';
import { buildPluginShareUrl } from './PluginShareMenu';
import { PluginMetaSections } from './PluginMetaSections';
import { buildPluginUseMenu, pluginUsePrimaryAction } from './pluginUseMenu';
import type { PluginUseAction } from '../plugins-home/useActions';
import { embedUiLabel } from '../../teamver/embedUiLabels';

interface Props {
  record: InstalledPluginRecord;
  /** When set, fetch this specific example stem; otherwise hit /preview. */
  exampleStem?: string | null;
  onClose: () => void;
  onUse: (record: InstalledPluginRecord, action: PluginUseAction) => void;
  isApplying?: boolean;
  hideUseAction?: boolean;
  // Analytics — forwarded to PreviewModal's share popover.
  onSharePopoverItemClick?: (item: PreviewSharePopoverItem) => void;
}

export function PluginExampleDetail({
  record,
  exampleStem,
  onClose,
  onUse,
  isApplying,
  hideUseAction,
  onSharePopoverItemClick,
}: Props) {
  const { t, locale } = useI18n();
  const localizedTitle = localizePluginTitle(locale, record);
  const [html, setHtml] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [unavailableKind, setUnavailableKind] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  const load = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      setHtml(null);
      setError(null);
      setUnavailableKind(null);
      const result: SkillExampleResult = exampleStem
        ? await fetchPluginExampleHtml(record.id, exampleStem)
        : await fetchPluginPreviewHtml(record.id);
      if ('html' in result) {
        setHtml(result.html);
      } else if ('error' in result) {
        setError(result.error);
        setHtml(undefined);
      } else {
        // unavailable: the plugin's manifest declares no shipped
        // preview entry (or the daemon 404s on its /preview path —
        // common for bundled plugins like example-live-artifact whose
        // manifest references an example file that doesn't ship).
        // Forward to PreviewModal as a typed unavailable view so it
        // renders the calm "no shipped preview" placeholder instead
        // of the misleading "Couldn't load this example." error. The
        // skill helper has had this treatment since #897; the plugin
        // helper gained it later — keep both consumers in lockstep.
        setUnavailableKind(result.kind);
        setHtml(undefined);
      }
    } finally {
      inFlightRef.current = false;
    }
  }, [record.id, exampleStem]);

  useEffect(() => {
    void load();
  }, [load]);

  // Stable identity for PreviewModal's onView so its mount-time
  // effect doesn't re-fire on every render.
  const onView = useCallback(() => {
    void load();
  }, [load]);

  const description = localizePluginDescription(locale, record);
  // Community gallery templates are almost always decks; also treat `template`
  // mode and html preview entries as deck so host slide chrome appears even
  // when the shipped page has no in-document prev/next buttons.
  const odMode = record.manifest?.od?.mode;
  const previewBlock = record.manifest?.od?.preview as { type?: unknown } | undefined;
  const isDeck =
    odMode === 'deck' ||
    odMode === 'template' ||
    previewBlock?.type === 'html';
  const infoLabel = isDeck
    ? embedUiLabel('Template info', '템플릿 정보')
    : embedUiLabel('Plugin info', '플러그인 정보');
  const primary = pluginUsePrimaryAction(record, t);
  const primaryLabel = isDeck ? t('automations.useTemplate') : primary.label;
  const useMenu = buildPluginUseMenu(record, onUse, t);
  // Primary CTA already runs `use`. Drop the duplicate structure-only row from
  // the caret so templates only offer the distinct "use with query" path.
  const templateUseMenu = isDeck && useMenu
    ? useMenu
        .filter((item) => item.testId?.includes('use-with-query'))
        .map((item) => ({
          ...item,
          label: embedUiLabel('Start with this design', '이 디자인으로 시작'),
          description: embedUiLabel(
            'Apply the template and load the example prompt into chat',
            '템플릿을 적용하고 예시 프롬프트를 채팅에 불러옵니다',
          ),
        }))
    : useMenu;

  return (
    <PreviewModal
      title={localizedTitle}
      views={[
        {
          id: 'preview',
          label: t('examples.previewLabel'),
          html,
          error,
          // Pass the surface-appropriate noun so the unavailable placeholder
          // reads "this plugin" / "this template" instead of falling back to
          // the legacy skills-only "this skill" copy. Issue #3216.
          unavailable: unavailableKind
            ? { kind: unavailableKind, noun: isDeck ? 'template' : 'plugin' }
            : null,
          deck: isDeck,
        },
      ]}
      onView={onView}
      exportTitleFor={() => localizedTitle}
      shareTarget={{
        title: localizedTitle,
        description: description || undefined,
        url: buildPluginShareUrl(record),
      }}
      onClose={onClose}
      sidebar={{
        // Surface every plugin-common manifest field — workflow, context
        // bundles, connectors, file paths, source provenance — alongside
        // the rendered HTML preview. Designers are the primary audience
        // here, so the sidebar starts COLLAPSED — the preview is the
        // hero and gets the full stage by default — and when opened it
        // shows a designer-first slice (description + author + example
        // query) with the developer manifest detail tucked behind a
        // "Developer details" disclosure (variant="minimal").
        label: infoLabel,
        defaultOpen: false,
        contentKey: record.id,
        content: (
          <div className="plugin-info-pane">
            <PluginMetaSections
              record={record}
              compact
              heading={infoLabel}
              variant="minimal"
            />
          </div>
        ),
      }}
      primaryAction={hideUseAction
        ? undefined
        : {
            label: primaryLabel,
            onClick: () => onUse(record, primary.action),
            busy: !!isApplying,
            busyLabel: t('homeHero.applying'),
            testId: `plugin-details-use-${record.id}`,
            // Empty caret menu → plain primary button (no split).
            menu:
              templateUseMenu && templateUseMenu.length > 0
                ? templateUseMenu
                : undefined,
          }}
      hideSidebarToggle
      // Temporarily hide Share until the template export/share menu is redesigned.
      hideShareMenu
      onSharePopoverItemClick={onSharePopoverItemClick}
    />
  );
}
