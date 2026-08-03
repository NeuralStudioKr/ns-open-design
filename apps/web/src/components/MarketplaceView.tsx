// Plan G4 / spec §11.6 — Marketplace catalog grid.
//
// Lists every installed plugin as a card grid (the most reliable
// snapshot of what the user can apply right now). Configured
// marketplaces are rendered as a secondary "Catalogs" panel so the
// user can register / refresh / remove without leaving the page.
//
// Click a card → navigate to /marketplace/:id (PluginDetailView).
// This is the deep-browsing surface; the inline rail (§8) stays the
// primary daily-driver flow.

import { useEffect, useState } from 'react';
import type { InstalledPluginRecord } from '@open-design/contracts';
import { listPlugins } from '../state/projects';
import { navigate } from '../router';
import { useI18n } from '../i18n';
import { embedUiLabel } from '../teamver/embedUiLabels';
import { localizePluginDescription, localizePluginTitle } from './plugins-home/localization';

interface Marketplace {
  id: string;
  url: string;
  trust: 'official' | 'trusted' | 'restricted';
  manifest: { name?: string; plugins?: Array<{ name: string; source: string; description?: string }> };
}

export function MarketplaceView() {
  const { locale } = useI18n();
  const [plugins, setPlugins] = useState<InstalledPluginRecord[]>([]);
  const [marketplaces, setMarketplaces] = useState<Marketplace[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'trusted' | 'restricted'>('all');

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      listPlugins(),
      fetch('/api/marketplaces')
        .then((r) => (r.ok ? r.json() : { marketplaces: [] }))
        .then((d) => (d?.marketplaces ?? []) as Marketplace[]),
    ]).then(([rows, mps]) => {
      if (cancelled) return;
      setPlugins(rows);
      setMarketplaces(mps);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = plugins.filter((p) => filter === 'all' || p.trust === filter);

  return (
    <div className="marketplace-view" data-testid="marketplace-view">
      <header className="marketplace-view__header">
        <h1>{embedUiLabel('Plugins marketplace', '플러그인 마켓플레이스')}</h1>
        <div className="marketplace-view__filters">
          <button
            type="button"
            data-active={filter === 'all'}
            onClick={() => setFilter('all')}
          >
            {embedUiLabel('All', '전체')}
          </button>
          <button
            type="button"
            data-active={filter === 'trusted'}
            onClick={() => setFilter('trusted')}
          >
            {embedUiLabel('Trusted', '신뢰됨')}
          </button>
          <button
            type="button"
            data-active={filter === 'restricted'}
            onClick={() => setFilter('restricted')}
          >
            {embedUiLabel('Restricted', '제한됨')}
          </button>
        </div>
      </header>

      {loading ? (
        <div className="marketplace-view__loading">
          {embedUiLabel('Loading…', '불러오는 중…')}
        </div>
      ) : null}

      <section className="marketplace-view__grid" data-testid="marketplace-grid">
        {visible.length === 0 && !loading ? (
          <div className="marketplace-view__empty">
            {embedUiLabel(
              'No plugins installed yet. Try ',
              '아직 설치된 플러그인이 없습니다. ',
            )}
            <code>od plugin install &lt;source&gt;</code>
            {embedUiLabel(
              ' or register a marketplace below.',
              ' 을 실행하거나 아래에서 마켓플레이스를 등록하세요.',
            )}
          </div>
        ) : null}
        {visible.map((p) => (
          <button
            type="button"
            key={p.id}
            className="marketplace-view__card"
            onClick={() => navigate({ kind: 'marketplace-detail', pluginId: p.id })}
            data-plugin-id={p.id}
          >
            <div className="marketplace-view__card-title">{localizePluginTitle(locale, p)}</div>
            {localizePluginDescription(locale, p) ? (
              <div className="marketplace-view__card-desc">{localizePluginDescription(locale, p)}</div>
            ) : null}
            <div className="marketplace-view__card-meta">
              <span>v{p.version}</span>
              <span>trust: {p.trust}</span>
              <span>{p.sourceKind}</span>
            </div>
          </button>
        ))}
      </section>

      <section className="marketplace-view__catalogs" data-testid="marketplace-catalogs">
        <h2>{embedUiLabel('Configured catalogs', '등록된 카탈로그')}</h2>
        {marketplaces.length === 0 ? (
          <div>
            {embedUiLabel('None registered. Add one with ', '등록된 항목이 없습니다. ')}
            <code>od marketplace add &lt;url&gt;</code>
            {embedUiLabel('.', ' 로 추가하세요.')}
          </div>
        ) : (
          <ul>
            {marketplaces.map((m) => (
              <li key={m.id}>
                <strong>{m.manifest.name ?? m.url}</strong>{' '}
                <span className="marketplace-view__catalog-trust">trust: {m.trust}</span>
                {' · '}
                <a href={m.url} target="_blank" rel="noreferrer">{m.url}</a>
                {' · '}
                {m.manifest.plugins?.length ?? 0} plugin(s)
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
