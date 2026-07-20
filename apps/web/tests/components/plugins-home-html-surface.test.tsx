// @vitest-environment jsdom

// Plugins-home HTML preview surface — authenticated srcDoc + fallback.
//
// Sandboxed iframes cannot send Teamver session cookies, so a bare
// `src=/api/plugins/.../preview` paints nginx's `{"detail":"session_expired"}`
// JSON viewer as the thumb. HtmlSurface parent-fetches HTML and mounts
// via srcDoc; auth/JSON/non-HTML responses use the typographic fallback.

import { describe, expect, it, afterEach, beforeEach, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import {
  HtmlSurface,
  __htmlSurfaceProbeCacheSizeForTests,
  __resetHtmlSurfaceProbeCacheForTests,
  isPluginPreviewUnauthorizedBody,
  looksLikePluginPreviewHtml,
  pluginPreviewSrcDoc,
  resolvePluginPreviewBaseHref,
} from '../../src/components/plugins-home/cards/HtmlSurface';
import type { HtmlPreviewSpec } from '../../src/components/plugins-home/preview';

const PREVIEW: HtmlPreviewSpec = {
  kind: 'html',
  src: '/api/plugins/example-html-ppt/preview',
  label: 'index.html',
  source: 'preview',
};

const SAMPLE_HTML =
  '<!doctype html><html><head><title>t</title></head><body><div class="slide">hi</div></body></html>';

function htmlResponse(html = SAMPLE_HTML): Response {
  return {
    ok: true,
    status: 200,
    headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? 'text/html' : null) },
    text: async () => html,
    clone() {
      return htmlResponse(html);
    },
  } as unknown as Response;
}

function jsonUnauthorizedResponse(): Response {
  const body = '{"detail":"session_expired","login_url":"/login"}';
  return {
    ok: false,
    status: 401,
    headers: {
      get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null),
    },
    text: async () => body,
    clone() {
      return jsonUnauthorizedResponse();
    },
  } as unknown as Response;
}

function notFoundResponse(): Response {
  return {
    ok: false,
    status: 404,
    headers: { get: () => null },
    text: async () => '{"detail":"Not Found"}',
    clone() {
      return notFoundResponse();
    },
  } as unknown as Response;
}

beforeEach(() => {
  __resetHtmlSurfaceProbeCacheForTests();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  __resetHtmlSurfaceProbeCacheForTests();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('plugin preview srcDoc helpers', () => {
  it('detects session_expired JSON envelopes', () => {
    expect(
      isPluginPreviewUnauthorizedBody('{"detail":"session_expired"}', 'application/json'),
    ).toBe(true);
    expect(isPluginPreviewUnauthorizedBody(SAMPLE_HTML, 'text/html')).toBe(false);
    expect(looksLikePluginPreviewHtml(SAMPLE_HTML)).toBe(true);
    expect(looksLikePluginPreviewHtml('{"detail":"session_expired"}')).toBe(false);
  });

  it('resolves a plugin-root base href for relative assets', () => {
    expect(
      resolvePluginPreviewBaseHref(
        '/api/plugins/open-design/example-html-ppt/preview',
        'https://stg-design.teamver.com/home',
      ),
    ).toBe('https://stg-design.teamver.com/api/plugins/open-design/example-html-ppt/');
    expect(
      resolvePluginPreviewBaseHref(
        '/api/plugins/foo/example/index',
        'https://stg-design.teamver.com/',
      ),
    ).toBe('https://stg-design.teamver.com/api/plugins/foo/');
  });

  it('injects a base tag into preview HTML', () => {
    const srcDoc = pluginPreviewSrcDoc(
      SAMPLE_HTML,
      '/api/plugins/example-html-ppt/preview',
    );
    expect(srcDoc).toContain('<base href=');
    expect(srcDoc).toContain('/api/plugins/example-html-ppt/');
  });
});

describe('HtmlSurface authenticated srcDoc', () => {
  it('renders an iframe with srcDoc once HTML loads (not bare src)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(htmlResponse());
    vi.stubGlobal('fetch', fetchMock);
    const { container } = render(
      <HtmlSurface
        preview={PREVIEW}
        pluginId="example-html-ppt"
        pluginTitle="Html Ppt"
        inView
        eager
      />,
    );
    await waitFor(
      () => {
        const iframe = container.querySelector('iframe');
        expect(iframe).toBeTruthy();
        expect(iframe?.getAttribute('src')).toBeNull();
        expect(iframe?.getAttribute('srcdoc') || (iframe as HTMLIFrameElement).srcdoc).toContain(
          '<div class="slide">hi</div>',
        );
      },
      { timeout: 2000 },
    );
    expect(fetchMock).toHaveBeenCalled();
    expect(
      container.querySelector('[data-testid="plugins-home-html-fallback"]'),
    ).toBeNull();
  });

  it('renders the typographic fallback when the URL 404s', async () => {
    const fetchMock = vi.fn().mockResolvedValue(notFoundResponse());
    vi.stubGlobal('fetch', fetchMock);
    const { container } = render(
      <HtmlSurface
        preview={PREVIEW}
        pluginId="example-html-ppt"
        pluginTitle="Html Ppt"
        inView
        eager
      />,
    );
    await waitFor(
      () => {
        expect(
          container.querySelector('[data-testid="plugins-home-html-fallback"]'),
        ).toBeTruthy();
      },
      { timeout: 2000 },
    );
    expect(container.querySelector('iframe')).toBeNull();
    expect(
      container.querySelector('.plugins-home__html-fallback-glyph')?.textContent,
    ).toBe('H');
  });

  it('renders the typographic fallback for session_expired JSON (never paints JSON thumb)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonUnauthorizedResponse());
    vi.stubGlobal('fetch', fetchMock);
    const { container } = render(
      <HtmlSurface
        preview={PREVIEW}
        pluginId="example-html-ppt"
        pluginTitle="Html Ppt"
        inView
        eager
      />,
    );
    await waitFor(
      () => {
        expect(
          container.querySelector('[data-testid="plugins-home-html-fallback"]'),
        ).toBeTruthy();
      },
      { timeout: 2000 },
    );
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.textContent).not.toContain('session_expired');
  });

  it('caps the preview HTML cache and evicts the oldest preview URL', async () => {
    window.localStorage.setItem('open-design:visual-stability', '1');
    const fetchMock = vi.fn().mockImplementation(async (url: string) => htmlResponse(`<html>${url}</html>`));
    vi.stubGlobal('fetch', fetchMock);

    // Exercise the LRU cap without mounting hundreds of iframes (slow under
    // fetchTeamverDaemon header/auth wrapping).
    const { __seedHtmlSurfacePreviewCacheForTests } = await import(
      '../../src/components/plugins-home/cards/HtmlSurface'
    );
    for (let index = 0; index < 260; index += 1) {
      __seedHtmlSurfacePreviewCacheForTests(
        `/api/plugins/example-html-ppt/preview-${index}`,
        `<html>preview-${index}</html>`,
      );
    }
    expect(__htmlSurfaceProbeCacheSizeForTests()).toBe(256);
  });
});
