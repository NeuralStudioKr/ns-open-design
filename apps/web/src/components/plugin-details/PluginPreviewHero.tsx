// Hero preview surface for the PluginDetailsModal.
//
// Renders example outputs declared in the manifest's
// `od.useCase.exampleOutputs[]` as a sandboxed iframe inside a
// browser-chrome frame, with a tab pill row when more than one
// example exists. HTML is parent-fetched (authenticated) into srcDoc —
// bare sandboxed `src=/api/plugins/.../example` omits cookies and paints
// session_expired JSON as the preview in Teamver embed.

import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../Icon';
import { fetchPluginExampleHtml } from '../../providers/registry';
import { pluginPreviewSrcDoc } from '../../runtime/authenticatedHtmlSrcDoc';

export interface PluginExampleEntry {
  path: string;
  title?: string;
}

interface Props {
  pluginId: string;
  pluginTitle: string;
  examples: PluginExampleEntry[];
}

interface NormalizedExample {
  key: string;
  name: string;
  stem: string;
  href: string;
}

export function PluginPreviewHero({ pluginId, pluginTitle, examples }: Props) {
  const items = useMemo<NormalizedExample[]>(
    () => examples.map((e, idx) => normalize(pluginId, e, idx)),
    [pluginId, examples],
  );
  const [activeKey, setActiveKey] = useState<string | null>(
    items[0]?.key ?? null,
  );
  const [srcDoc, setSrcDoc] = useState<string | null>(null);

  const active = items.find((it) => it.key === activeKey) ?? items[0] ?? null;

  useEffect(() => {
    if (!active) {
      setSrcDoc(null);
      return;
    }
    let cancelled = false;
    setSrcDoc(null);
    const href = active.href;
    const stem = active.stem;
    void fetchPluginExampleHtml(pluginId, stem).then((result) => {
      if (cancelled) return;
      if (!('html' in result) || !result.html) {
        setSrcDoc(null);
        return;
      }
      setSrcDoc(pluginPreviewSrcDoc(result.html, href));
    });
    return () => {
      cancelled = true;
    };
  }, [pluginId, active?.key, active?.stem, active?.href]);

  if (items.length === 0 || !active) return null;

  return (
    <section
      className="plugin-details-modal__hero"
      data-testid="plugin-details-hero"
    >
      <div className="plugin-details-modal__hero-head">
        <div className="plugin-details-modal__hero-eyebrow">
          <span className="plugin-details-modal__hero-dot" aria-hidden />
          What it produces
        </div>
        {items.length > 1 ? (
          <div
            className="plugin-details-modal__hero-tabs"
            role="tablist"
            aria-label="Example outputs"
          >
            {items.map((it) => {
              const isActive = it.key === active.key;
              return (
                <button
                  key={it.key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`plugin-details-modal__hero-tab${isActive ? ' is-active' : ''}`}
                  onClick={() => setActiveKey(it.key)}
                >
                  {it.name}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="plugin-details-modal__hero-frame">
        <div className="plugin-details-modal__hero-chrome">
          <span
            className="plugin-details-modal__hero-light is-red"
            aria-hidden
          />
          <span
            className="plugin-details-modal__hero-light is-yellow"
            aria-hidden
          />
          <span
            className="plugin-details-modal__hero-light is-green"
            aria-hidden
          />
          <div
            className="plugin-details-modal__hero-url"
            title={active.name}
          >
            <Icon name="eye" size={11} />
            <span>{active.name}</span>
          </div>
          <a
            className="plugin-details-modal__hero-popout"
            href={active.href}
            target="_blank"
            rel="noreferrer"
            title="Open this example in a new tab"
            data-testid="plugin-details-hero-popout"
          >
            <Icon name="external-link" size={12} />
            <span>Open</span>
          </a>
        </div>
        {srcDoc ? (
          <iframe
            key={active.key}
            title={`${pluginTitle} — ${active.name}`}
            srcDoc={srcDoc}
            sandbox="allow-scripts"
            loading="lazy"
            className="plugin-details-modal__hero-iframe"
            data-testid="plugin-details-hero-iframe"
          />
        ) : (
          <div
            className="plugin-details-modal__hero-iframe"
            data-testid="plugin-details-hero-loading"
            aria-hidden
          />
        )}
      </div>
    </section>
  );
}

function normalize(
  pluginId: string,
  entry: PluginExampleEntry,
  index: number,
): NormalizedExample {
  const segments = entry.path.split(/[\\/]/).filter(Boolean);
  const base = segments[segments.length - 1] ?? `${index}`;
  const stem = base.replace(/\.[^.]+$/, '');
  const name = entry.title ?? stem;
  const href = `/api/plugins/${encodeURIComponent(pluginId)}/example/${encodeURIComponent(stem)}`;
  return { key: `${entry.path}-${index}`, name, stem, href };
}
