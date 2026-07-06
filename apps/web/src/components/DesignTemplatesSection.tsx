import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import type { SkillSummary } from '@open-design/contracts';

import { useI18n, useT } from '../i18n';
import {
  localizeSkillDescription,
  localizeSkillName,
} from '../i18n/content';
import { fetchDesignTemplates } from '../providers/registry';
import { useTeamverBranding } from '../teamver/branding/TeamverBrandingProvider';
import {
  canToggleDesignTemplateInSettings,
  isDesignTemplateEnabled,
  isDesignTemplateVisibleInSettings,
} from '../teamver/branding/designTemplateVisibility';
import type { AppConfig } from '../types';
import { Icon } from './Icon';

interface Props {
  cfg: AppConfig;
  setCfg: Dispatch<SetStateAction<AppConfig>>;
}

export function DesignTemplatesSection({ cfg, setCfg }: Props) {
  const { locale, t } = useI18n();
  const translate = useT();
  const branding = useTeamverBranding();
  const [templates, setTemplates] = useState<SkillSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modeFilter, setModeFilter] = useState<string>('all');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchDesignTemplates(
        branding.slideOnlyMvp ? { mode: 'deck', limit: 48 } : undefined,
      );
      setTemplates(list);
    } finally {
      setLoading(false);
    }
  }, [branding.slideOnlyMvp]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const modeOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of templates) {
      counts.set(item.mode, (counts.get(item.mode) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [templates]);

  const filteredTemplates = useMemo(() => {
    const q = search.toLowerCase().trim();
    return templates.filter((item) => {
      if (!isDesignTemplateVisibleInSettings(item, branding)) return false;
      if (modeFilter !== 'all' && item.mode !== modeFilter) return false;
      if (!q) return true;
      const hay = `${item.name}\n${localizeSkillName(locale, item)}\n${item.description}\n${localizeSkillDescription(locale, item)}\n${(item.triggers ?? []).join(' ')}`;
      return hay.toLowerCase().includes(q);
    });
  }, [templates, modeFilter, search, locale, branding]);

  const toggleEnabled = useCallback(
    (template: SkillSummary, enabled: boolean) => {
      if (!canToggleDesignTemplateInSettings(template, branding)) return;
      setCfg((current) => {
        const set = new Set(current.disabledSkills ?? []);
        if (enabled) set.delete(template.id);
        else set.add(template.id);
        return { ...current, disabledSkills: [...set] };
      });
    },
    [branding, setCfg],
  );

  return (
    <section className="settings-section settings-skills settings-design-templates">
      <div className="library-toolbar skills-toolbar">
        <div className="skills-toolbar-top">
          <input
            type="search"
            className="library-search"
            placeholder={t('settings.librarySearch')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="library-filter-selects">
          <label className="library-filter-select">
            <span className="library-filter-select-label">Type</span>
            <select
              value={modeFilter}
              data-active={modeFilter !== 'all' ? 'true' : undefined}
              onChange={(e) => setModeFilter(e.target.value)}
            >
              <option value="all">
                {t('settings.libraryAll')} ({templates.length})
              </option>
              {modeOptions.map(([mode, count]) => (
                <option key={mode} value={mode}>
                  {mode} ({count})
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {loading ? (
        <p className="library-empty">{t('settings.libraryLoading')}</p>
      ) : filteredTemplates.length === 0 ? (
        <div className="empty-card">
          <strong>{t('settings.libraryNoResults')}</strong>
        </div>
      ) : (
        <div className="skills-rows" data-testid="design-templates-list">
          {filteredTemplates.map((template) => {
            const enabled = isDesignTemplateEnabled(
              template,
              cfg.disabledSkills,
              branding,
            );
            const toggleLocked = !canToggleDesignTemplateInSettings(template, branding);
            const summaryName = localizeSkillName(locale, template) || template.id;
            const summaryDescription = localizeSkillDescription(locale, template);
            return (
              <div
                key={template.id}
                className={`skills-row${enabled ? '' : ' skills-row-disabled'}${
                  toggleLocked ? ' skills-row-locked' : ''
                }`}
                data-testid={`design-template-row-${template.id}`}
              >
                <div className="skills-row-head">
                  <div className="skills-row-summary-btn skills-row-summary-btn-static">
                    <span className="skills-row-icon" aria-hidden>
                      <Icon name="layers-filled" size={14} />
                    </span>
                    <span className="skills-row-summary">
                      <span className="skills-row-summary-line">
                        <span className="skills-row-summary-name">{summaryName}</span>
                        <span className="skills-row-summary-mode">{template.mode}</span>
                      </span>
                      {summaryDescription ? (
                        <span className="skills-row-summary-desc">{summaryDescription}</span>
                      ) : null}
                    </span>
                  </div>
                  <div className="skills-row-actions">
                    <label
                      className="toggle-switch toggle-switch-sm skills-row-enable"
                      title={
                        toggleLocked
                          ? translate('settings.designTemplatesLockedDeck')
                          : t('settings.libraryToggleLabel')
                      }
                    >
                      <input
                        type="checkbox"
                        checked={enabled}
                        disabled={toggleLocked}
                        onChange={(e) => toggleEnabled(template, e.target.checked)}
                        aria-label={t('settings.libraryToggleLabel')}
                      />
                      <span className="toggle-slider" />
                    </label>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
