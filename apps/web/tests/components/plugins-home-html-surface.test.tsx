// @vitest-environment jsdom

// Plugins-home HTML preview surface — reachability fallback.
//
// The home gallery used to render a permanently-blank tile when a
// plugin declared an `od.preview.entry` that 404'd on the daemon
// (the iframe quietly painted the JSON error envelope as white).
// The HtmlSurface now probes the URL once per session and swaps
// in a typographic fallback tile when the URL is unreachable.
//
// This file:
//   - asserts the iframe is mounted when the probe succeeds;
//   - asserts the typographic fallback renders (and the iframe is
//     skipped) when the probe reports the URL is unreachable.

import { describe, expect, it, afterEach, beforeEach, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import {
  HtmlSurface,
  __htmlSurfaceProbeCacheSizeForTests,
  __resetHtmlSurfaceProbeCacheForTests,
} from '../../src/components/plugins-home/cards/HtmlSurface';
import type { HtmlPreviewSpec } from '../../src/components/plugins-home/preview';

const PREVIEW: HtmlPreviewSpec = {
  kind: 'html',
  src: '/api/plugins/example-html-ppt/preview',
  label: 'index.html',
  source: 'preview',
};

const okResponse = (): Response =>
  ({ ok: true, status: 200 } as unknown as Response);
const notFoundResponse = (): Response =>
  ({ ok: false, status: 404 } as unknown as Response);

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

describe('HtmlSurface reachability probe', () => {
  it('renders the iframe once the URL probes OK and the auto-arm window elapses', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    vi.stubGlobal('fetch', fetchMock);
    const { container } = render(
      <HtmlSurface
        preview={PREVIEW}
        pluginId="example-html-ppt"
        pluginTitle="Html Ppt"
        inView
      />,
    );
    // First the skeleton frame should appear, then after the 280ms
    // arm timer the iframe should mount.
    await waitFor(
      () => {
        expect(container.querySelector('iframe')).toBeTruthy();
      },
      { timeout: 2000 },
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(PREVIEW.src, {
      method: 'GET',
      headers: { Range: 'bytes=0-0' },
    });
    expect(
      container.querySelector('[data-testid="plugins-home-html-fallback"]'),
    ).toBeNull();
  });

  it('renders the typographic fallback (no iframe) when the URL 404s', async () => {
    const fetchMock = vi.fn().mockResolvedValue(notFoundResponse());
    vi.stubGlobal('fetch', fetchMock);
    const { container } = render(
      <HtmlSurface
        preview={PREVIEW}
        pluginId="example-html-ppt"
        pluginTitle="Html Ppt"
        inView
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
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(PREVIEW.src, {
      method: 'GET',
      headers: { Range: 'bytes=0-0' },
    });
    expect(container.querySelector('iframe')).toBeNull();
    expect(
      container.querySelector('.plugins-home__html-fallback-glyph')?.textContent,
    ).toBe('H');
  });

  it('caps the reachability probe cache and evicts the oldest preview URL', async () => {
    window.localStorage.setItem('open-design:visual-stability', '1');
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    vi.stubGlobal('fetch', fetchMock);

    const previews = Array.from({ length: 260 }, (_, index) => ({
      kind: 'html' as const,
      src: `/api/plugins/example-html-ppt/preview-${index}`,
      label: `preview-${index}.html`,
      source: 'preview' as const,
    }));

    const rendered = render(
      <>
        {previews.map((preview, index) => (
          <HtmlSurface
            key={preview.src}
            preview={preview}
            pluginId={`example-html-ppt-${index}`}
            pluginTitle={`Html Ppt ${index}`}
            inView
          />
        ))}
      </>,
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(260);
      expect(__htmlSurfaceProbeCacheSizeForTests()).toBe(256);
    });

    rendered.unmount();

    render(
      <HtmlSurface
        preview={previews[0]!}
        pluginId="example-html-ppt-0"
        pluginTitle="Html Ppt 0"
        inView
      />,
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(261);
      expect(__htmlSurfaceProbeCacheSizeForTests()).toBe(256);
    });
  });
});
