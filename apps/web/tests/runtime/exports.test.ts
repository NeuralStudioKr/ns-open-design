import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installMockOpenDesignHost } from '@open-design/host/testing';
import {
  archiveFilenameFrom,
  archiveRootFromFilePath,
  buildDesignHandoffContent,
  buildDesignManifestContent,
  downloadImageDataUrl,
  buildSandboxedPreviewDocument,
  exportAsImage,
  exportAsMd,
  exportAsPdf,
  ExportQueueFullError,
  isUsablePrintSize,
  reportPrintSizeWhenStable,
  exportProjectAsHtml,
  exportProjectImageBlob,
  exportProjectAsPdf,
  exportProjectAsPptx,
  exportProjectAsZip,
  isTeamverProjectStoragePrefixRequiredError,
  openSandboxedPreviewInNewTab,
  prepareImageExportTarget,
  resolveExportDownloadTitle,
  requestPreviewSnapshot,
} from '../../src/runtime/exports';

function mockResponse(headers: Record<string, string>): Response {
  return { headers: new Headers(headers) } as Response;
}

describe('resolveExportDownloadTitle', () => {
  it('prefers the project display name over the artifact slug', () => {
    expect(resolveExportDownloadTitle('AI 도입 효과', 'ai-adoption-deck.html')).toBe('AI 도입 효과');
  });

  it('falls back to the file basename when the project name is missing or generic', () => {
    expect(resolveExportDownloadTitle(undefined, 'ai-adoption-deck.html')).toBe('ai-adoption-deck');
    expect(resolveExportDownloadTitle('Design', 'ai-adoption-deck.html')).toBe('ai-adoption-deck');
  });
});

describe('isUsablePrintSize (#4458)', () => {
  // The print-ready handshake reports the artifact's own content size so the
  // desktop bridge can size the PDF page to it. When that size is zero or
  // invalid, the desktop path falls back to measuring the wrapper viewport,
  // which (per inferPageSize's own docs) blanks artifacts whose visible
  // content sits below the fold. Gating on a usable size prevents that.
  it('treats positive finite dimensions as usable', () => {
    expect(isUsablePrintSize(1440, 2000)).toBe(true);
    expect(isUsablePrintSize(1, 1)).toBe(true);
  });

  it('rejects zero, negative, non-finite, or non-number dimensions', () => {
    expect(isUsablePrintSize(0, 2000)).toBe(false);
    expect(isUsablePrintSize(1440, 0)).toBe(false);
    expect(isUsablePrintSize(-5, 100)).toBe(false);
    expect(isUsablePrintSize(Number.NaN, 100)).toBe(false);
    expect(isUsablePrintSize(Number.POSITIVE_INFINITY, 100)).toBe(false);
    expect(isUsablePrintSize('1440' as unknown as number, 2000)).toBe(false);
    expect(isUsablePrintSize(undefined as unknown as number, undefined as unknown as number)).toBe(false);
  });
});

describe('reportPrintSizeWhenStable (#4458)', () => {
  it('reports only once the content has a usable size, polling animation frames', () => {
    // Simulate content that has not finished layout: size is 0 for the first
    // frames, then becomes positive once laid out. The handshake must not
    // report the early zero size (which would blank the PDF).
    const sizes = [
      { width: 0, height: 0 },
      { width: 0, height: 0 },
      { width: 1440, height: 2000 },
    ];
    let call = 0;
    const measure = (): { width: number; height: number } => sizes[Math.min(call++, sizes.length - 1)]!;
    const reported: Array<{ width: number; height: number }> = [];
    const raf = (cb: () => void): void => cb(); // run synchronously
    reportPrintSizeWhenStable(measure, (s) => reported.push(s), 30, raf);
    expect(reported).toEqual([{ width: 1440, height: 2000 }]);
  });

  it('reports the last measured size when frames are exhausted (genuinely empty content)', () => {
    // A truly empty artifact never gains a usable size; rather than hang
    // forever, report best-effort after the frame budget so the desktop
    // path is not left waiting on the readiness handshake indefinitely.
    const measure = (): { width: number; height: number } => ({ width: 0, height: 0 });
    const reported: Array<{ width: number; height: number }> = [];
    const raf = (cb: () => void): void => cb();
    reportPrintSizeWhenStable(measure, (s) => reported.push(s), 3, raf);
    expect(reported).toEqual([{ width: 0, height: 0 }]);
  });
});

describe('injected print-ready parent cache script — runtime behavior (#4458)', () => {
  // Issue #4458 calls out that the existing coverage only proves script
  // *strings* are injected, never that the injected script *behaves*. These
  // specs extract the real parent-cache <script> from a live export, run it,
  // and drive it with postMessage to assert the runtime size gate: a usable
  // size is cached for the desktop inferPageSize(); a zero or non-finite size
  // is rejected so it cannot blank the page (viewport fallback) or poison it.
  async function extractCacheScript(): Promise<{ body: string; nonce: string }> {
    const printPdfMock = vi.fn().mockResolvedValue({ ok: true });
    const restoreHost = installMockOpenDesignHost({ host: { pdf: { print: printPdfMock } } });
    try {
      await exportAsPdf('<div style="height:4000px">tall artifact</div>', 'Cache Eval');
    } finally {
      restoreHost();
    }
    const htmlArg = printPdfMock.mock.calls[0]![0] as string;
    const match = /<script>(window\.__odPrintReady=false;[\s\S]*?)<\/script>/.exec(htmlArg);
    if (!match) throw new Error('parent cache script not found in exported HTML');
    const body = match[1]!;
    const nonceMatch = /nonce===['"]([^'"]+)['"]/.exec(body);
    if (!nonceMatch) throw new Error('nonce not found in parent cache script');
    return { body, nonce: nonceMatch[1]! };
  }

  // This suite runs in the node environment (no DOM), so we drive the real
  // injected script against a minimal fake `window`: a plain object with a
  // message-listener registry. The script wires its handler through
  // `window.addEventListener('message', …)`, so dispatching a message means
  // invoking the registered handler with a `{ data, source }` event — exactly
  // what a real `postMessage` delivers, including the source-identity check.
  type FakeWindow = Record<string, unknown> & {
    __odPrintReady?: unknown;
    __odPrintSize?: unknown;
  };

  function loadCache(body: string): { win: FakeWindow; fire: (event: unknown) => void } {
    const handlers: Array<(event: unknown) => void> = [];
    const win: FakeWindow = {
      addEventListener: (type: string, fn: (event: unknown) => void) => {
        if (type === 'message') handlers.push(fn);
      },
      removeEventListener: () => undefined,
    };
    win.frames = [win];
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
    new Function('window', body)(win);
    return { win, fire: (event) => handlers.slice().forEach((h) => h(event)) };
  }

  function readyEvent(
    nonce: string,
    width: unknown,
    height: unknown,
    source: unknown,
  ): { data: unknown; source: unknown } {
    return { data: { type: 'OD_PRINT_READY', nonce, width, height }, source };
  }

  it('caches a usable content size so the desktop bridge sizes the page to the artifact', async () => {
    const { body, nonce } = await extractCacheScript();
    const { win, fire } = loadCache(body);
    fire(readyEvent(nonce, 1440, 2000, win));
    expect(win.__odPrintReady).toBe(true);
    expect(win.__odPrintSize).toEqual({ width: 1440, height: 2000 });
  });

  it('rejects a zero size so the page does not fall back to the wrapper viewport and blank', async () => {
    const { body, nonce } = await extractCacheScript();
    const { win, fire } = loadCache(body);
    fire(readyEvent(nonce, 0, 0, win));
    // Readiness still resolves (so the desktop bridge never hangs), but the
    // size is withheld so inferPageSize cannot adopt a blank wrapper viewport.
    expect(win.__odPrintReady).toBe(true);
    expect(win.__odPrintSize).toBeNull();
  });

  it('rejects a non-finite size so Infinity cannot poison the page size', async () => {
    const { body, nonce } = await extractCacheScript();
    const { win, fire } = loadCache(body);
    fire(readyEvent(nonce, Number.POSITIVE_INFINITY, 100, win));
    expect(win.__odPrintSize).toBeNull();
  });

  it('ignores a print-ready message carrying the wrong nonce (anti-spoof)', async () => {
    const { body } = await extractCacheScript();
    const { win, fire } = loadCache(body);
    fire(readyEvent('not-the-real-nonce', 1440, 2000, win));
    expect(win.__odPrintReady).toBe(false);
    expect(win.__odPrintSize).toBeNull();
  });
});

describe('archiveRootFromFilePath', () => {
  it('returns the top-level directory name when present', () => {
    expect(archiveRootFromFilePath('ui-design/index.html')).toBe('ui-design');
    expect(archiveRootFromFilePath('ui-design/src/app.css')).toBe('ui-design');
  });

  it('returns empty for files at the project root', () => {
    expect(archiveRootFromFilePath('index.html')).toBe('');
    expect(archiveRootFromFilePath('README.md')).toBe('');
  });

  it('strips a leading slash before scanning', () => {
    expect(archiveRootFromFilePath('/ui-design/index.html')).toBe('ui-design');
    expect(archiveRootFromFilePath('//ui-design/index.html')).toBe('ui-design');
  });

  it('returns empty for empty/garbage input', () => {
    expect(archiveRootFromFilePath('')).toBe('');
    expect(archiveRootFromFilePath('/')).toBe('');
  });
});

describe('archiveFilenameFrom', () => {
  it('decodes the RFC 5987 UTF-8 filename* form (preserves multi-byte chars)', () => {
    // 'café-design.zip' encoded — the é is a 2-byte UTF-8 sequence (%C3%A9),
    // which is enough to fail under naive ASCII-only handling.
    const resp = mockResponse({
      'content-disposition':
        "attachment; filename=\"project.zip\"; filename*=UTF-8''caf%C3%A9-design.zip",
    });
    expect(archiveFilenameFrom(resp, 'fallback', 'ui-design')).toBe('café-design.zip');
  });

  it('falls back to the legacy quoted filename= when filename* is absent', () => {
    const resp = mockResponse({
      'content-disposition': 'attachment; filename="ui-design.zip"',
    });
    expect(archiveFilenameFrom(resp, 'fallback', 'ui-design')).toBe('ui-design.zip');
  });

  it('falls back to the active root slug when the header is missing', () => {
    const resp = mockResponse({});
    expect(archiveFilenameFrom(resp, 'fallback-title', 'ui-design')).toBe('ui-design.zip');
  });

  it('falls back to the title slug when both header and root are absent', () => {
    const resp = mockResponse({});
    expect(archiveFilenameFrom(resp, 'My Artifact', '')).toBe('My Artifact.zip');
  });

  it('falls through to the slug when filename* is malformed', () => {
    // Truncated percent-escape — decodeURIComponent throws; we should not
    // surface the exception, just fall back to the next strategy.
    const resp = mockResponse({
      'content-disposition': "attachment; filename*=UTF-8''%E9%9D",
    });
    expect(archiveFilenameFrom(resp, 'fallback', 'ui-design')).toBe('ui-design.zip');
  });
});

describe('buildDesignHandoffContent', () => {
  it('documents coding handoff and responsive verification expectations', () => {
    const content = buildDesignHandoffContent({
      title: 'Checkout Design',
      entryFile: 'index.html',
      files: ['index.html', 'src/app.css', 'src/app.js'],
    });

    expect(content).toContain('Checkout Design implementation handoff');
    expect(content).toContain('Mobile compact: 360×800');
    expect(content).toContain('Tablet portrait: 820×1180');
    expect(content).toContain('Wide desktop: 1920×1080');
    expect(content).toContain('`src/app.css`');
    expect(content).toContain('visual system');
    expect(content).toContain('Design fidelity contract');
    expect(content).toContain('CJX-ready UX contract');
    expect(content).toContain('DESIGN-MANIFEST.json');
    expect(content).toContain('in-app modules/components');
    expect(content).toContain('OS widgets are home-screen/lock-screen/quick-access surfaces');
    expect(content).toContain('Color and brand contract');
    expect(content).toContain('Do not introduce warm beige / cream / peach / pink / orange-brown background washes');
    expect(content).toContain('Build product screens and domain-specific in-app modules');
  });

  it('builds a machine-readable design manifest for coding tools', () => {
    const manifest = JSON.parse(buildDesignManifestContent({
      title: 'Checkout Design',
      entryFile: 'index.html',
      files: ['index.html', 'src/app.css', 'src/app.js'],
    }));

    expect(manifest.schema).toBe('open-design.design-manifest.v1');
    expect(manifest.entryFile).toBe('index.html');
    expect(manifest.sourceFiles.css).toEqual(['src/app.css']);
    expect(manifest.sourceFiles.scriptsAndComponents).toEqual(['src/app.js']);
    expect(manifest.appModules.join(' ')).toContain('domain-specific in-app modules');
    expect(manifest.osWidgets.join(' ')).toContain('home-screen');
    expect(manifest.responsiveViewports).toContainEqual({
      name: 'tablet-portrait',
      width: 820,
      height: 1180,
      category: 'tablet',
      mustAvoidHorizontalScroll: true,
    });
    expect(manifest.implementationChecklist.join(' ')).toContain('landing pages, in-app modules, and OS widgets');
  });

  it('does not classify plain home.html as a landing page in the manifest', () => {
    const manifest = JSON.parse(buildDesignManifestContent({
      title: 'Product App',
      entryFile: 'home.html',
      files: ['home.html', 'dashboard.html', 'marketing.html'],
    }));

    const screens = new Map(manifest.screens.map((screen: { file: string; role: string }) => [screen.file, screen.role]));
    expect(screens.get('home.html')).not.toBe('landing-page');
    expect(screens.get('marketing.html')).toBe('landing-page');
    expect(screens.get('dashboard.html')).toBe('product-screen');
  });

  it('keeps frame wrapper HTML out of client export manifest screens', () => {
    const manifest = JSON.parse(buildDesignManifestContent({
      title: 'Framed App',
      entryFile: 'index.html',
      files: ['index.html', 'frames/iphone-15-pro.html', 'browser-chrome.html', 'src/app.css'],
    }));

    expect(manifest.sourceFiles.html).toEqual(['browser-chrome.html', 'frames/iphone-15-pro.html', 'index.html']);
    expect(manifest.screens.map((screen: { file: string }) => screen.file)).toEqual(['index.html']);
  });

  it('normalizes a frame-wrapper active file to the implementable screen entry in manifest and handoff', () => {
    const manifest = JSON.parse(buildDesignManifestContent({
      title: 'Framed App',
      entryFile: 'frames/iphone-15-pro.html',
      files: ['index.html', 'landing.html', 'frames/iphone-15-pro.html', 'src/app.css'],
    }));
    const handoff = buildDesignHandoffContent({
      title: 'Framed App',
      entryFile: 'frames/iphone-15-pro.html',
      files: ['index.html', 'landing.html', 'frames/iphone-15-pro.html', 'src/app.css'],
    });

    expect(manifest.entryFile).toBe('index.html');
    expect(manifest.screens.map((screen: { file: string }) => screen.file)).toEqual(['index.html', 'landing.html']);
    expect(handoff).toContain('Primary entry: `index.html`');
    expect(handoff).toContain('Open `index.html` and `DESIGN-MANIFEST.json`');
    expect(handoff).not.toContain('Primary entry: `frames/iphone-15-pro.html`');
  });

  it('keeps phone.html and iphone-upgrade.html as real screens when outside frames/ directory', () => {
    // phone.html as a carrier storefront screen, iphone-upgrade.html as a
    // product surface — neither should be silently dropped from screens just
    // because the filename resembles a device name.
    const manifest = JSON.parse(buildDesignManifestContent({
      title: 'Carrier Storefront',
      entryFile: 'phone.html',
      files: ['phone.html', 'iphone-upgrade.html', 'frames/browser-shell.html', 'src/app.css'],
    }));

    const screenFiles = manifest.screens.map((screen: { file: string }) => screen.file);
    expect(screenFiles).toContain('phone.html');
    expect(screenFiles).toContain('iphone-upgrade.html');
    // frame wrapper inside frames/ is still excluded
    expect(screenFiles).not.toContain('frames/browser-shell.html');
    // both real screens appear in sourceFiles.html
    expect(manifest.sourceFiles.html).toContain('phone.html');
    expect(manifest.sourceFiles.html).toContain('iphone-upgrade.html');
    expect(manifest.sourceFiles.html).toContain('frames/browser-shell.html');
  });
});

describe('exportProjectAsPdf', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('uses the daemon desktop PDF export API before falling back to browser print', async () => {
    const restoreHost = installMockOpenDesignHost();
    try {
      const fallback = vi.fn();
      vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));

      const result = await exportProjectAsPdf({
        deck: true,
        fallbackPdf: fallback,
        filePath: 'deck/index.html',
        projectId: 'proj-1',
        title: 'Seed Deck',
      });

      expect(result).toBe('desktop');
      expect(fallback).not.toHaveBeenCalled();
      expect(fetch).toHaveBeenCalledWith('/api/projects/proj-1/export/pdf', {
        body: JSON.stringify({ deck: true, delivery: 'ticket', fileName: 'deck/index.html', title: 'Seed Deck' }),
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
    } finally {
      restoreHost();
    }
  });

  it('downloads daemon-rendered PDF blobs on web staging', async () => {
    const fallback = vi.fn();
    let capturedBlob: Blob | undefined;
    let capturedFilename: string | undefined;
    vi.stubGlobal('URL', {
      createObjectURL: (blob: Blob) => {
        capturedBlob = blob;
        return 'blob:pdf';
      },
      revokeObjectURL: vi.fn(),
    });
    vi.stubGlobal('document', {
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn(),
      },
      createElement: vi.fn(() => ({
        click: vi.fn(),
        set download(value: string) {
          capturedFilename = value;
        },
        set href(_value: string) {},
      })),
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['%PDF'], { type: 'application/pdf' }), {
      headers: {
        'content-disposition': 'attachment; filename="Seed-Deck.pdf"',
        'content-type': 'application/pdf',
      },
      status: 200,
    })));

    const result = await exportProjectAsPdf({
      deck: true,
      fallbackPdf: fallback,
      filePath: 'deck/index.html',
      projectId: 'proj-1',
      title: 'Seed Deck',
    });

    expect(result).toBe('desktop');
    expect(fallback).not.toHaveBeenCalled();
    expect(capturedBlob?.type).toBe('application/pdf');
    expect(capturedFilename).toBe('Seed-Deck.pdf');
  });

  it('does not fall back to browser print when rendered PDF export is required', async () => {
    const fallback = vi.fn();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ error: { code: 'UPSTREAM_UNAVAILABLE', message: 'tenant storage sync failed' } }), {
        status: 502,
      }),
    ));

    await expect(exportProjectAsPdf({
      deck: true,
      fallbackPdf: fallback,
      filePath: 'deck/index.html',
      projectId: 'proj-1',
      requireRenderedExport: true,
      title: 'Seed Deck',
    })).rejects.toThrow('tenant storage sync failed');

    expect(fallback).not.toHaveBeenCalled();
  });

  it('falls back to browser print in embed when daemon Chromium is unavailable', async () => {
    const fallback = vi.fn();
    const open = vi.fn(() => ({
      location: { href: '' },
      opener: null,
    }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('window', {
      open,
      location: {
        hostname: 'stg-design.teamver.com',
        origin: 'https://stg-design.teamver.com',
        href: 'https://stg-design.teamver.com/',
      },
      setTimeout: (fn: () => void) => fn(),
    });
    vi.stubGlobal('document', { baseURI: 'https://stg-design.teamver.com/' });
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:pdf'),
      revokeObjectURL: vi.fn(),
    });
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({
        error: {
          code: 'EXPORT_FAILED',
          message: 'headless Chromium unavailable (tried 2 path(s)): signal=SIGTRAP',
        },
      }), { status: 500 }),
    ));

    const result = await exportProjectAsPdf({
      deck: true,
      fallbackPdf: fallback,
      filePath: 'deck/index.html',
      htmlSnapshot: '<!doctype html><section class="slide">Snapshot</section>',
      projectId: 'proj-1',
      requireRenderedExport: true,
      title: 'Seed Deck',
    });

    expect(result).toBe('fallback');
    expect(open).toHaveBeenCalledOnce();
    expect(fallback).not.toHaveBeenCalled();
  });

  it('falls back to browser print when the daemon returns the HEADLESS_CHROMIUM_UNAVAILABLE structured code', async () => {
    // Once the fixed image rolls forward, the daemon emits a 503 with a
    // dedicated error code instead of the legacy "tried N paths" string.
    // The FE must trigger the browser-print fallback for both shapes.
    const fallback = vi.fn();
    const open = vi.fn(() => ({
      location: { href: '' },
      opener: null,
    }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('window', {
      open,
      location: {
        hostname: 'stg-design.teamver.com',
        origin: 'https://stg-design.teamver.com',
        href: 'https://stg-design.teamver.com/',
      },
      setTimeout: (fn: () => void) => fn(),
    });
    vi.stubGlobal('document', { baseURI: 'https://stg-design.teamver.com/' });
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:pdf'),
      revokeObjectURL: vi.fn(),
    });
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({
        error: {
          code: 'HEADLESS_CHROMIUM_UNAVAILABLE',
          message: 'headless Chromium unavailable — falling back to browser print',
        },
      }), { status: 503 }),
    ));

    const result = await exportProjectAsPdf({
      deck: true,
      fallbackPdf: fallback,
      filePath: 'deck/index.html',
      htmlSnapshot: '<!doctype html><section class="slide">Snapshot</section>',
      projectId: 'proj-1',
      requireRenderedExport: true,
      title: 'Seed Deck',
    });

    expect(result).toBe('fallback');
    expect(open).toHaveBeenCalledOnce();
    expect(fallback).not.toHaveBeenCalled();
  });

  it('treats a canceled desktop PDF save dialog as a silent no-op', async () => {
    const restoreHost = installMockOpenDesignHost();
    try {
      const fallback = vi.fn();
      vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, canceled: true }), { status: 200 })));

      const result = await exportProjectAsPdf({
        deck: true,
        fallbackPdf: fallback,
        filePath: 'deck/index.html',
        projectId: 'proj-1',
        title: 'Seed Deck',
      });

      expect(result).toBe('cancelled');
      expect(fallback).not.toHaveBeenCalled();
    } finally {
      restoreHost();
    }
  });

  it('falls back to browser print when the desktop PDF export API is unavailable', async () => {
    const restoreHost = installMockOpenDesignHost();
    try {
      const fallback = vi.fn();
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { message: 'unavailable' } }), { status: 501 })));

      const result = await exportProjectAsPdf({
        deck: false,
        fallbackPdf: fallback,
        filePath: 'index.html',
        projectId: 'proj-1',
        title: 'Landing',
      });

      expect(result).toBe('fallback');
      expect(fallback).toHaveBeenCalledTimes(1);
    } finally {
      restoreHost();
    }
  });

  it('uses inline browser print after daemon PDF export fails on web', async () => {
    const fallback = vi.fn();
    let capturedBlob: Blob | undefined;
    const open = vi.fn(() => ({
      location: { href: '' },
      opener: null,
    }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('window', {
      open,
      location: {
        hostname: 'stg-design.teamver.com',
        origin: 'https://stg-design.teamver.com',
        href: 'https://stg-design.teamver.com/',
      },
      setTimeout: (fn: () => void) => fn(),
    });
    vi.stubGlobal('document', {
      baseURI: 'https://stg-design.teamver.com/',
    });
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn((blob: Blob) => {
        capturedBlob = blob;
        return 'blob:pdf';
      }),
      revokeObjectURL: vi.fn(),
    });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === '/api/projects/proj-1/export/deck/index.html?inline=1') {
        return new Response('<main class="slide">inlined deck</main>', { status: 200 });
      }
      return new Response('missing', { status: 404 });
    }));

    const result = await exportProjectAsPdf({
      deck: true,
      fallbackPdf: fallback,
      filePath: 'deck/index.html',
      projectId: 'proj-1',
      title: 'Seed Deck',
    });

    expect(result).toBe('fallback');
    expect(fetch).toHaveBeenCalledWith('/api/projects/proj-1/export/pdf', expect.objectContaining({
      method: 'POST',
    }));
    expect(fetch).toHaveBeenCalledWith('/api/projects/proj-1/export/deck/index.html?inline=1', expect.objectContaining({
      credentials: 'include',
    }));
    expect(open).toHaveBeenCalledOnce();
    expect(capturedBlob).toBeDefined();
    const printedDoc = await capturedBlob!.text();
    expect(printedDoc).not.toContain('sandbox="allow-scripts allow-modals"');
    expect(printedDoc).toContain('data-deck-print="injected"');
    expect(printedDoc).toContain('<main class="slide">inlined deck</main>');
  });

  it('forwards htmlSnapshot to the daemon so the export bypasses tenant-storage resolution', async () => {
    const restoreHost = installMockOpenDesignHost();
    try {
      const fallback = vi.fn();
      const fetchMock = vi.fn(async () =>
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
      vi.stubGlobal('fetch', fetchMock);

      const result = await exportProjectAsPdf({
        deck: true,
        fallbackPdf: fallback,
        filePath: 'deck/index.html',
        htmlSnapshot: '<!doctype html><section class="slide">Snapshot</section>',
        projectId: 'proj-1',
        title: 'Seed Deck',
      });

      expect(result).toBe('desktop');
      expect(fallback).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const call = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
      const body = JSON.parse(call[1].body);
      expect(body.deck).toBe(true);
      expect(body.delivery).toBe('ticket');
      expect(body.fileName).toBe('deck/index.html');
      expect(body.title).toBe('Seed Deck');
      expect(body.html).toContain('<section class="slide">Snapshot</section>');
      expect(body.html).not.toContain('flex-direction: column !important');
    } finally {
      restoreHost();
    }
  });

  it('does not retry on teamver_project_s3_prefix_required when htmlSnapshot is present', async () => {
    const fallback = vi.fn();
    let capturedBlob: Blob | undefined;
    const open = vi.fn(() => ({ location: { href: '' }, opener: null }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.stubGlobal('window', {
      open,
      location: {
        hostname: 'stg-design.teamver.com',
        origin: 'https://stg-design.teamver.com',
        href: 'https://stg-design.teamver.com/',
      },
      setTimeout: (fn: () => void) => fn(),
    });
    vi.stubGlobal('document', { baseURI: 'https://stg-design.teamver.com/' });
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn((blob: Blob) => {
        capturedBlob = blob;
        return 'blob:pdf';
      }),
      revokeObjectURL: vi.fn(),
    });
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          error: { code: 'UPSTREAM_UNAVAILABLE', message: 'teamver_project_s3_prefix_required' },
        }),
        { status: 502, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const started = Date.now();
    const result = await exportProjectAsPdf({
      deck: true,
      fallbackPdf: fallback,
      filePath: 'deck/index.html',
      htmlSnapshot: '<!doctype html><section class="slide">Snapshot</section>',
      projectId: 'proj-1',
      title: 'Seed Deck',
    });
    const elapsed = Date.now() - started;

    expect(result).toBe('fallback');
    // Single daemon POST — no retry sleeps consume the 2.4s budget.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(elapsed).toBeLessThan(500);
    // Browser-print fallback drove from the snapshot, not from a fresh fetch.
    expect(capturedBlob).toBeDefined();
  });

  it('drives browser print fallback directly from htmlSnapshot without hitting inline URL', async () => {
    const fallback = vi.fn();
    let capturedBlob: Blob | undefined;
    const open = vi.fn(() => ({ location: { href: '' }, opener: null }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('window', {
      open,
      location: {
        hostname: 'stg-design.teamver.com',
        origin: 'https://stg-design.teamver.com',
        href: 'https://stg-design.teamver.com/',
      },
      setTimeout: (fn: () => void) => fn(),
    });
    vi.stubGlobal('document', { baseURI: 'https://stg-design.teamver.com/' });
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn((blob: Blob) => {
        capturedBlob = blob;
        return 'blob:pdf';
      }),
      revokeObjectURL: vi.fn(),
    });
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/export/pdf')) {
        return new Response(
          JSON.stringify({ error: { code: 'UPSTREAM_UNAVAILABLE', message: 'boom' } }),
          { status: 502, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error(`unexpected fetch to ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await exportProjectAsPdf({
      deck: true,
      fallbackPdf: fallback,
      filePath: 'deck/index.html',
      htmlSnapshot: '<!doctype html><section class="slide">Snapshot</section>',
      projectId: 'proj-1',
      title: 'Seed Deck',
    });

    expect(result).toBe('fallback');
    expect(fallback).not.toHaveBeenCalled();
    // Snapshot fallback must not hit /export/deck/index.html?inline=1 —
    // that endpoint shares the same tenant-storage middleware.
    for (const [url] of fetchMock.mock.calls as Array<[string]>) {
      expect(url).not.toContain('inline=1');
    }
    expect(capturedBlob).toBeDefined();
    const printedDoc = await capturedBlob!.text();
    expect(printedDoc).toContain('<section class="slide">Snapshot</section>');
  });

  it('retries when the daemon reports teamver_project_s3_prefix_required and eventually succeeds', async () => {
    const restoreHost = installMockOpenDesignHost();
    try {
      const fallback = vi.fn();
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(console, 'info').mockImplementation(() => {});
      let call = 0;
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          call += 1;
          if (call === 1) {
            return new Response(
              JSON.stringify({
                error: {
                  code: 'UPSTREAM_UNAVAILABLE',
                  message: 'teamver_project_s3_prefix_required',
                },
              }),
              { status: 502, headers: { 'content-type': 'application/json' } },
            );
          }
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }),
      );

      const result = await exportProjectAsPdf({
        deck: true,
        fallbackPdf: fallback,
        filePath: 'deck/index.html',
        projectId: 'proj-1',
        title: 'Seed Deck',
      });

      expect(result).toBe('desktop');
      expect(fallback).not.toHaveBeenCalled();
      // First request 502 → prefix cache warm → retry → 200.
      expect(fetch).toHaveBeenCalledTimes(2);
    } finally {
      restoreHost();
    }
  });

  it('exposes teamver_project_s3_prefix_required via the typed guard when required', async () => {
    const fallback = vi.fn();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            error: {
              code: 'UPSTREAM_UNAVAILABLE',
              message: 'teamver_project_s3_prefix_required',
            },
          }),
          { status: 502, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );

    let caught: unknown;
    try {
      await exportProjectAsPdf({
        deck: true,
        fallbackPdf: fallback,
        filePath: 'deck/index.html',
        projectId: 'proj-1',
        requireRenderedExport: true,
        title: 'Seed Deck',
      });
    } catch (err) {
      caught = err;
    }
    expect(isTeamverProjectStoragePrefixRequiredError(caught)).toBe(true);
    expect(fallback).not.toHaveBeenCalled();
  });

  it('uses host print after desktop PDF API fails on desktop', async () => {
    const printSpy = vi.fn(async () => ({ ok: true as const }));
    const restoreHost = installMockOpenDesignHost({ host: { pdf: { print: printSpy } } });
    try {
      const fallback = vi.fn();
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.stubGlobal('fetch', vi.fn(async (url: string) => {
        if (url === '/api/projects/proj-1/export/pdf') {
          return new Response(JSON.stringify({ error: { message: 'unavailable' } }), { status: 501 });
        }
        if (url === '/api/projects/proj-1/export/deck/index.html?inline=1') {
          return new Response('<main class="slide">inlined deck</main>', { status: 200 });
        }
        return new Response('missing', { status: 404 });
      }));

      const result = await exportProjectAsPdf({
        deck: true,
        fallbackPdf: fallback,
        filePath: 'deck/index.html',
        projectId: 'proj-1',
        title: 'Seed Deck',
      });

      expect(result).toBe('fallback');
      expect(fetch).toHaveBeenCalledWith('/api/projects/proj-1/export/deck/index.html?inline=1', expect.objectContaining({
        credentials: 'same-origin',
      }));
      expect(printSpy).toHaveBeenCalledOnce();
      expect(fallback).not.toHaveBeenCalled();
    } finally {
      restoreHost();
    }
  });
});

describe('exportProjectImageBlob', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns daemon-rendered image blobs with attachment filenames', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['png'], { type: 'image/png' }), {
      headers: {
        'content-disposition': 'attachment; filename="Seed-Deck.png"',
        'content-type': 'image/png',
      },
      status: 200,
    })));

    const result = await exportProjectImageBlob({
      deck: true,
      filePath: 'deck/index.html',
      format: 'png',
      projectId: 'proj-1',
      slideIndex: 2,
      title: 'Seed Deck',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.filename).toBe('Seed-Deck.png');
      expect(result.blob.type).toBe('image/png');
    }
    expect(fetch).toHaveBeenCalledWith('/api/projects/proj-1/export/image', {
      body: JSON.stringify({
        deck: true,
        delivery: 'ticket',
        fileName: 'deck/index.html',
        format: 'png',
        slideIndex: 2,
        title: 'Seed Deck',
      }),
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
  });

  it('requests webp from the daemon when format is webp', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['webp'], { type: 'image/webp' }), {
      headers: {
        'content-disposition': 'attachment; filename="Seed-Deck.webp"',
        'content-type': 'image/webp',
      },
      status: 200,
    })));

    const result = await exportProjectImageBlob({
      deck: true,
      filePath: 'deck/index.html',
      format: 'webp',
      projectId: 'proj-1',
      slideIndex: 0,
      title: 'Seed Deck',
    });

    expect(result.ok).toBe(true);
    expect(fetch).toHaveBeenCalledWith('/api/projects/proj-1/export/image', expect.objectContaining({
      body: JSON.stringify({
        deck: true,
        delivery: 'ticket',
        fileName: 'deck/index.html',
        format: 'webp',
        slideIndex: 0,
        title: 'Seed Deck',
      }),
    }));
  });

  it('rejects daemon image blobs when the mime type does not match the requested format', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['png'], { type: 'image/png' }), {
      headers: {
        'content-disposition': 'attachment; filename="Seed-Deck.jpg"',
        'content-type': 'image/png',
      },
      status: 200,
    })));

    const result = await exportProjectImageBlob({
      deck: true,
      filePath: 'deck/index.html',
      format: 'jpeg',
      projectId: 'proj-1',
      slideIndex: 0,
      title: 'Seed Deck',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('image/png');
      expect(result.reason).toContain('jpeg');
    }
  });

  it('extracts daemon ApiError envelopes on 500 EXPORT_FAILED so the reason is not [object Object]', async () => {
    // The daemon serialises errors as the canonical envelope shape
    // (`{ error: { code, message, ... } }`, see packages/contracts/errors.ts).
    // Naive `String(body.error)` would stringify the object as
    // `"[object Object]"` and leak that into the modal — this test pins the
    // FE parser to the real shape so a regression there can't be hidden by
    // a more forgiving mock.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({
        error: {
          code: 'EXPORT_FAILED',
          message: 'headless Chromium unavailable (tried 3 path(s)): spawn ENOENT',
        },
      }),
      { headers: { 'content-type': 'application/json' }, status: 500 },
    )));

    const result = await exportProjectImageBlob({
      deck: true,
      filePath: 'deck/index.html',
      format: 'png',
      projectId: 'proj-1',
      title: 'Seed Deck',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('headless Chromium unavailable');
      expect(result.reason).toContain('500');
      // Critical: must NOT contain the stringified-object marker. If this
      // assertion ever flips green for the wrong reason, the parser is
      // serialising the envelope object as text.
      expect(result.reason).not.toContain('[object Object]');
    }
  });

  it('falls back to a status-only reason when the daemon body is unstructured / missing', async () => {
    // Some upstream proxies (nginx, CDN) replace the JSON body on 5xx with
    // an HTML or empty body. The FE parser must degrade gracefully to the
    // status-line reason instead of throwing on the JSON parse.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      '<html><body>502 Bad Gateway</body></html>',
      { headers: { 'content-type': 'text/html' }, status: 502 },
    )));

    const result = await exportProjectImageBlob({
      deck: true,
      filePath: 'deck/index.html',
      format: 'png',
      projectId: 'proj-1',
      title: 'Seed Deck',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('502');
      expect(result.reason).not.toContain('[object Object]');
    }
  });

  it('also handles legacy { error: "string" } compat responses', async () => {
    // packages/contracts/src/errors.ts LegacyErrorResponse — older code
    // paths still surface a bare string under `error`. Should be returned
    // verbatim as the reason.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: 'legacy daemon failure mode' }),
      { headers: { 'content-type': 'application/json' }, status: 500 },
    )));

    const result = await exportProjectImageBlob({
      deck: true,
      filePath: 'deck/index.html',
      format: 'png',
      projectId: 'proj-1',
      title: 'Seed Deck',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('legacy daemon failure mode');
    }
  });

  it('surfaces export queue full as a retryable user message', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({
        error: {
          code: 'EXPORT_QUEUE_FULL',
          message: 'export queue full — retry shortly',
        },
      }),
      { headers: { 'content-type': 'application/json', 'retry-after': '15' }, status: 503 },
    )));

    const result = await exportProjectImageBlob({
      deck: true,
      filePath: 'deck/index.html',
      format: 'png',
      projectId: 'proj-1',
      title: 'Seed Deck',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('15초');
    }
  });
});

describe('exportProjectAsHtml', () => {
  let capturedBlob: Blob | undefined;
  let capturedFilename: string | undefined;

  beforeEach(() => {
    capturedBlob = undefined;
    capturedFilename = undefined;
    vi.stubGlobal('URL', {
      createObjectURL: (blob: Blob) => {
        capturedBlob = blob;
        return 'blob:test';
      },
      revokeObjectURL: () => {},
    });
    vi.stubGlobal('document', {
      createElement: () => {
        const anchor = { href: '', click: () => {} } as { href: string; download?: string; click: () => void };
        Object.defineProperty(anchor, 'download', {
          set(value: string) {
            capturedFilename = value;
          },
          get() {
            return capturedFilename ?? '';
          },
        });
        return anchor;
      },
      body: { appendChild: () => {}, removeChild: () => {} },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('downloads daemon-rendered project HTML instead of the raw source body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<!doctype html><p>inlined</p>', {
      headers: {
        'content-disposition': 'attachment; filename="Main-Page.html"',
        'content-type': 'text/html',
      },
      status: 200,
    })));

    await exportProjectAsHtml({
      deck: true,
      projectId: 'proj 1',
      filePath: 'screens/main page.html',
      fallbackHtml: '<script type="module" src="/src/main.tsx"></script>',
      fallbackTitle: 'Main Page',
    });

    expect(fetch).toHaveBeenCalledWith('/api/projects/proj%201/export/html', {
      body: JSON.stringify({
        deck: true,
        delivery: 'ticket',
        fileName: 'screens/main page.html',
        title: 'Main Page',
      }),
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    expect(capturedFilename).toBe('Main-Page.html');
    expect(await capturedBlob!.text()).toBe('<!doctype html><p>inlined</p>');
  });

  it('fetches export tickets with credentials instead of navigating the SPA tab', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === '/api/projects/proj-1/export/html') {
        return new Response(
          JSON.stringify({
            delivery: 'ticket',
            downloadUrl: '/api/projects/proj-1/export/downloads/ticket-1',
            filename: 'Seed-Deck.html',
          }),
          { status: 201, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === '/api/projects/proj-1/export/downloads/ticket-1') {
        return new Response('<!doctype html><p>ticket html</p>', {
          headers: {
            'content-disposition': 'attachment; filename="Seed-Deck.html"',
            'content-type': 'text/html',
          },
          status: 200,
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    }));

    await exportProjectAsHtml({
      deck: true,
      projectId: 'proj-1',
      filePath: 'deck/index.html',
      fallbackHtml: '<section>fallback</section>',
      fallbackTitle: 'Seed Deck',
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      '/api/projects/proj-1/export/downloads/ticket-1',
      expect.objectContaining({ credentials: 'same-origin' }),
    );
    expect(capturedFilename).toBe('Seed-Deck.html');
    expect(await capturedBlob!.text()).toBe('<!doctype html><p>ticket html</p>');
  });

  it('falls back to daemon inline HTML when rendered HTML export fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === '/api/projects/proj-1/export/html') {
        return new Response('nope', { status: 500 });
      }
      return new Response('<!doctype html><p>inline fallback</p>', {
      headers: { 'content-type': 'text/html' },
      status: 200,
      });
    }));

    await exportProjectAsHtml({
      projectId: 'proj-1',
      filePath: 'index.html',
      fallbackHtml: '<main>fallback</main>',
      fallbackTitle: 'Fallback',
    });

    expect(capturedFilename).toBe('Fallback.html');
    expect(await capturedBlob!.text()).toContain('inline fallback');
  });

  it('falls back to the source HTML export when the daemon inline endpoint fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));

    await exportProjectAsHtml({
      projectId: 'proj-1',
      filePath: 'index.html',
      fallbackHtml: '<main>fallback</main>',
      fallbackTitle: 'Fallback',
    });

    expect(capturedFilename).toBe('Fallback.html');
    expect(await capturedBlob!.text()).toContain('<main>fallback</main>');
  });

  it('does not fall back to source HTML when rendered export is required', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));

    await expect(exportProjectAsHtml({
      projectId: 'proj-1',
      filePath: 'index.html',
      fallbackHtml: '<main>fallback</main>',
      fallbackTitle: 'Fallback',
      requireRenderedExport: true,
    })).rejects.toThrow('렌더링된 HTML 다운로드');

    expect(capturedBlob).toBeUndefined();
  });
});

describe('exportProjectAsZip', () => {
  let capturedBlob: Blob | undefined;
  let capturedFilename: string | undefined;

  beforeEach(() => {
    capturedBlob = undefined;
    capturedFilename = undefined;
    vi.stubGlobal('URL', {
      createObjectURL: (blob: Blob) => {
        capturedBlob = blob;
        return 'blob:test';
      },
      revokeObjectURL: () => {},
    });
    vi.stubGlobal('document', {
      createElement: () => {
        const anchor = { href: '', click: () => {} } as { href: string; download?: string; click: () => void };
        Object.defineProperty(anchor, 'download', {
          set(value: string) {
            capturedFilename = value;
          },
          get() {
            return capturedFilename ?? '';
          },
        });
        return anchor;
      },
      body: { appendChild: () => {}, removeChild: () => {} },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('downloads daemon-rendered ZIP so ZIP download matches the preview renderer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['rendered zip'], { type: 'application/zip' }), {
      headers: {
        'content-disposition': 'attachment; filename="Seed-Deck.zip"',
        'content-type': 'application/zip',
      },
      status: 200,
    })));

    await exportProjectAsZip({
      deck: true,
      projectId: 'proj-1',
      filePath: 'deck/index.html',
      fallbackHtml: '<link rel="stylesheet" href="style.css"><section>raw fallback</section>',
      fallbackTitle: 'Seed Deck',
    });

    expect(fetch).toHaveBeenCalledWith('/api/projects/proj-1/export/zip', {
      body: JSON.stringify({
        deck: true,
        delivery: 'ticket',
        fileName: 'deck/index.html',
        title: 'Seed Deck',
      }),
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    expect(capturedFilename).toBe('Seed-Deck.zip');
    expect(await capturedBlob!.text()).toBe('rendered zip');
  });

  it('falls back to the raw project archive when rendered inline HTML is unavailable', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const archiveBlob = new Blob(['raw archive'], { type: 'application/zip' });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === '/api/projects/proj-1/export/zip') {
        return new Response('missing', { status: 404 });
      }
      if (url === '/api/projects/proj-1/archive?root=deck') {
        return new Response(archiveBlob, {
          headers: { 'content-disposition': 'attachment; filename="deck.zip"' },
          status: 200,
        });
      }
      return new Response('unexpected', { status: 500 });
    }));

    await exportProjectAsZip({
      projectId: 'proj-1',
      filePath: 'deck/index.html',
      fallbackHtml: '<section>fallback</section>',
      fallbackTitle: 'Seed Deck',
    });

    expect(capturedFilename).toBe('deck.zip');
    expect(await capturedBlob!.text()).toBe('raw archive');
  });

  it('does not fall back to raw archives when rendered ZIP export is required', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => new Response('missing', { status: 404 })));

    await expect(exportProjectAsZip({
      projectId: 'proj-1',
      filePath: 'deck/index.html',
      fallbackHtml: '<section>fallback</section>',
      fallbackTitle: 'Seed Deck',
      requireRenderedExport: true,
    })).rejects.toThrow('렌더링된 ZIP 다운로드');

    expect(capturedBlob).toBeUndefined();
  });
});

describe('exportProjectAsPptx', () => {
  let capturedBlob: Blob | undefined;
  let capturedFilename: string | undefined;

  beforeEach(() => {
    capturedBlob = undefined;
    capturedFilename = undefined;
    vi.stubGlobal('URL', {
      createObjectURL: (blob: Blob) => {
        capturedBlob = blob;
        return 'blob:test';
      },
      revokeObjectURL: () => {},
    });
    vi.stubGlobal('document', {
      createElement: () => {
        const anchor = { href: '', click: () => {} } as { href: string; download?: string; click: () => void };
        Object.defineProperty(anchor, 'download', {
          set(value: string) {
            capturedFilename = value;
          },
          get() {
            return capturedFilename ?? '';
          },
        });
        return anchor;
      },
      body: { appendChild: () => {}, removeChild: () => {} },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('requests daemon-rendered PPTX with the live HTML snapshot', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['pptx'], {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    }), {
      headers: {
        'content-disposition': 'attachment; filename="Seed-Deck.pptx"',
        'content-type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      },
      status: 200,
    })));

    await exportProjectAsPptx({
      deck: true,
      projectId: 'proj-1',
      filePath: 'deck/index.html',
      title: 'Seed Deck',
      htmlSnapshot: '<!doctype html><section class="slide">A</section>',
    });

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    const requestBody = JSON.parse(String((init as RequestInit).body));
    expect(fetch).toHaveBeenCalledWith('/api/projects/proj-1/export/pptx', {
      body: expect.any(String),
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    expect(requestBody).toMatchObject({
      deck: true,
      delivery: 'ticket',
      editable: true,
      fileName: 'deck/index.html',
      title: 'Seed Deck',
    });
    expect(requestBody.html).toContain('<section class="slide">A</section>');
    expect(capturedBlob?.size).toBe(4);
    expect(capturedFilename).toBe('Seed-Deck.pptx');
  });
});

// `exportAsMd` is a pass-through (the file body is the artifact source
// verbatim, only the extension and Content-Type flip). Tests exercise it
// end-to-end by stubbing the few DOM globals `triggerDownload` touches —
// we run under `environment: 'node'`, so `document` and `URL` aren't
// available by default. See issue #279.
describe('exportAsMd', () => {
  let capturedBlob: Blob | undefined;
  let capturedFilename: string | undefined;

  beforeEach(() => {
    capturedBlob = undefined;
    capturedFilename = undefined;
    vi.stubGlobal('URL', {
      createObjectURL: (blob: Blob) => {
        capturedBlob = blob;
        return 'blob:test';
      },
      revokeObjectURL: () => {},
    });
    vi.stubGlobal('document', {
      createElement: () => {
        const anchor = { href: '', click: () => {} } as { href: string; download?: string; click: () => void };
        Object.defineProperty(anchor, 'download', {
          set(value: string) {
            capturedFilename = value;
          },
          get() {
            return capturedFilename ?? '';
          },
        });
        return anchor;
      },
      body: { appendChild: () => {}, removeChild: () => {} },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('downloads the source bytes verbatim under a `.md` extension', async () => {
    const source = '<!doctype html>\n<html lang="en"><body>hi</body></html>\n';

    exportAsMd(source, 'TTC — Seed Round · 2026');

    expect(capturedBlob).toBeDefined();
    expect(capturedBlob!.type).toBe('text/markdown;charset=utf-8');
    // Critical: no transformation, no normalization, no trimming. Whatever
    // the Source view shows is what lands in the .md.
    expect(await capturedBlob!.text()).toBe(source);
    expect(capturedFilename).toBe('TTC — Seed Round · 2026.md');
  });

  it('falls back to "artifact.md" when the title is empty or unsafe', () => {
    exportAsMd('hello', '');
    expect(capturedFilename).toBe('artifact.md');

    exportAsMd('hello', '???');
    expect(capturedFilename).toBe('artifact.md');
  });

  it('keeps multi-byte content (UTF-8) intact end-to-end', async () => {
    const source = '# 中文标题\n\n这是 markdown 文件 — でも本当は HTML 源代码 (مرحبا)。\n';

    exportAsMd(source, 'mixed');

    expect(await capturedBlob!.text()).toBe(source);
  });
});

describe('sandboxed preview Blob exports', () => {
  let capturedBlobs: Blob[];
  let capturedBlob: Blob | undefined;
  let openedFeatures: string | undefined;
  let mockWin: { opener: unknown; location: { href: string } };
  let openCalls: string[][];
  let blobUrlCounter: number;

  beforeEach(() => {
    capturedBlobs = [];
    capturedBlob = undefined;
    openedFeatures = undefined;
    openCalls = [];
    blobUrlCounter = 0;
    mockWin = { opener: {}, location: { href: '' } };
    vi.stubGlobal('URL', {
      createObjectURL: (blob: Blob) => {
        capturedBlobs.push(blob);
        capturedBlob = blob;
        blobUrlCounter += 1;
        return `blob:test-${blobUrlCounter}`;
      },
      revokeObjectURL: vi.fn(),
    });
    vi.stubGlobal('window', {
      location: {
        href: 'https://open-design.test/plugins/example',
        origin: 'https://open-design.test',
      },
      open: (_url: string, _target: string, features?: string) => {
        openCalls.push([_url, _target]);
        openedFeatures = features;
        return mockWin;
      },
      addEventListener: () => {},
    });
    vi.stubGlobal('alert', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('wraps generated HTML in an opaque-origin sandbox for new-tab previews', async () => {
    openSandboxedPreviewInNewTab('<script>window.parent.localStorage.clear()</script>', 'Unsafe preview');

    expect(openedFeatures).toBe('noopener,noreferrer');
    expect(capturedBlobs).toHaveLength(2);
    const wrapper = await capturedBlobs[1]!.text();
    const inner = await capturedBlobs[0]!.text();
    expect(wrapper).toContain('sandbox="allow-scripts"');
    expect(wrapper).not.toContain('allow-same-origin');
    expect(wrapper).toContain('src="blob:test-1"');
    expect(wrapper).not.toContain('srcdoc=');
    expect(inner).toContain('<script>window.parent.localStorage.clear()</script>');
    expect(wrapper).not.toContain('<script>window.parent.localStorage.clear()</script>');
  });

  it('anchors new-tab srcdoc previews to the current origin when no explicit base is provided', async () => {
    openSandboxedPreviewInNewTab('<img src="/api/plugins/example/assets/hero.png"><img src="assets/card.png">', 'Plugin preview');

    expect(capturedBlobs).toHaveLength(2);
    const inner = await capturedBlobs[0]!.text();
    expect(inner).toContain('<base href="https://open-design.test/">');
  });

  it('passes srcdoc options through the sandboxed new-tab wrapper', async () => {
    openSandboxedPreviewInNewTab('<section class="slide">One</section>', 'Deck preview', {
      deck: true,
      baseHref: '/artifacts/project/assets/',
      initialSlideIndex: 2,
    });

    expect(openedFeatures).toBe('noopener,noreferrer');
    expect(capturedBlobs).toHaveLength(2);
    const wrapper = await capturedBlobs[1]!.text();
    const inner = await capturedBlobs[0]!.text();
    expect(wrapper).toContain('sandbox="allow-scripts"');
    expect(wrapper).not.toContain('allow-same-origin');
    expect(wrapper).toContain('src="blob:test-1"');
    expect(wrapper).toContain('data-od-deck-host-viewport');
    expect(wrapper).toContain("type: 'od:deck-host-viewport'");
    expect(inner).toContain('<base href="/artifacts/project/assets/">');
    expect(inner).toContain('od:slide');
  });

  it('loads large deck HTML via blob iframe src instead of an inline srcdoc attribute', async () => {
    const largeDeck = `<section class="slide">${'x'.repeat(120_000)}</section>`;
    openSandboxedPreviewInNewTab(largeDeck, 'Large deck', { deck: true });

    expect(capturedBlobs).toHaveLength(2);
    const wrapper = await capturedBlobs[1]!.text();
    const inner = await capturedBlobs[0]!.text();
    expect(wrapper).not.toContain('srcdoc=');
    expect(inner).toContain(largeDeck);
    expect(inner.length).toBeGreaterThan(100_000);
  });

  it('can build a print wrapper without granting same-origin access', () => {
    const wrapper = buildSandboxedPreviewDocument('<!doctype html><title>x</title>', 'Print', {
      allowModals: true,
    });

    expect(wrapper).toContain('sandbox="allow-scripts allow-modals"');
    expect(wrapper).not.toContain('allow-same-origin');
  });

  it('uses a sandboxed Blob wrapper with synchronous popup detection for PDF exports', async () => {
    await exportAsPdf('<script>window.parent.document.body.innerHTML="owned"</script>', 'PDF');

    expect(openCalls).toEqual([['', '_blank']]);
    expect(mockWin.opener).toBeNull();
    expect(mockWin.location.href).toBe('blob:test-1');
    expect(capturedBlob).toBeDefined();
    const wrapper = await capturedBlob!.text();
    expect(wrapper).toContain('sandbox="allow-scripts allow-modals"');
    expect(wrapper).not.toContain('allow-same-origin');
    expect(wrapper).toContain('&lt;script&gt;window.parent.document.body.innerHTML=&quot;owned&quot;&lt;/script&gt;');
    expect(wrapper).not.toContain('<script>window.parent.document.body.innerHTML="owned"</script>');
  });

  it('paints a title-only splash into the popup so the blob URL is never the tab label', async () => {
    // Give the mock popup a document with a spyable write() implementation so
    // we can assert the intermediate splash is emitted before the location
    // is redirected to the blob URL.
    const writes: string[] = [];
    const winWithDoc = {
      ...mockWin,
      document: {
        open: () => {},
        close: () => {},
        write: (chunk: string) => {
          writes.push(chunk);
        },
      },
    };
    vi.stubGlobal('window', {
      location: {
        href: 'https://open-design.test/plugins/example',
        origin: 'https://open-design.test',
      },
      open: (_url: string, _target: string) => {
        openCalls.push([_url, _target]);
        return winWithDoc;
      },
      addEventListener: () => {},
    });

    await exportAsPdf('<main>Doc</main>', 'Friendly Tab Title');

    expect(writes.length).toBe(1);
    const splash = writes[0]!;
    expect(splash).toContain('<title>Friendly Tab Title</title>');
    expect(splash).toContain('Preparing PDF');
    // The splash must render before the blob navigation completes.
    expect(winWithDoc.location.href).toBe('blob:test-1');
  });

  it('swallows splash write errors so environments without a writable document still receive the blob', async () => {
    const winReadOnlyDoc = {
      ...mockWin,
      document: {
        // Throwing on open() emulates a cross-origin / sandboxed popup where
        // document.write is disallowed. The function must still complete
        // and navigate to the blob URL.
        open: () => {
          throw new Error('cross-origin');
        },
        close: () => {},
        write: () => {},
      },
    };
    vi.stubGlobal('window', {
      location: {
        href: 'https://open-design.test/plugins/example',
        origin: 'https://open-design.test',
      },
      open: (_url: string, _target: string) => {
        openCalls.push([_url, _target]);
        return winReadOnlyDoc;
      },
      addEventListener: () => {},
    });

    await expect(
      exportAsPdf('<main>Doc</main>', 'Sandboxed'),
    ).resolves.toBeUndefined();
    expect(winReadOnlyDoc.location.href).toBe('blob:test-1');
  });

  it('prints deck PDF fallbacks as a top-level document so slide CSS controls the page', async () => {
    await exportAsPdf('<section class="slide">One</section>', 'Deck PDF', { deck: true });

    expect(openCalls).toEqual([['', '_blank']]);
    expect(mockWin.location.href).toBe('blob:test-1');
    expect(capturedBlob).toBeDefined();
    const doc = await capturedBlob!.text();
    expect(doc).not.toContain('sandbox="allow-scripts allow-modals"');
    expect(doc).not.toContain('<iframe');
    expect(doc).toContain('data-deck-print="injected"');
    expect(doc).toContain('page-break-after: always !important');
    expect(doc).not.toContain('data-od-snapshot-bridge');
    expect(doc).not.toContain('data-od-tweaks-bridge');
    expect(doc).not.toContain('data-od-deck-bridge');
    expect(doc).toContain('data-od-preview-artifact-guard');
  });

  it('strips viewport text leaks from exported PDF HTML', async () => {
    await exportAsPdf(
      `<!doctype html><html><head><title>T</title></head><body>viewport=width=device-width, initial-scale=1" /><main>OK</main></body></html>`,
      'Leak PDF',
    );
    const doc = await capturedBlob!.text();
    expect(doc).not.toMatch(/viewport=width=device-width/i);
    expect(doc).toContain('&lt;main&gt;OK&lt;/main&gt;');
  });

  it('allows explicit trusted PDF opt-out without changing the secure default', async () => {
    await exportAsPdf('<main>Trusted local document</main>', 'Trusted PDF', {
      sandboxedPreview: false,
    });

    expect(openCalls).toEqual([['', '_blank']]);
    expect(mockWin.opener).toEqual({});
    expect(mockWin.location.href).toBe('blob:test-1');
    expect(capturedBlob).toBeDefined();
    const doc = await capturedBlob!.text();
    expect(doc).not.toContain('sandbox="allow-scripts allow-modals"');
    expect(doc).toContain('<main>Trusted local document</main>');
  });

  it('shows an alert and revokes the blob URL when the popup is blocked', async () => {
    vi.stubGlobal('window', {
      open: () => null,
      addEventListener: () => {},
    });

    const revokeSpy = URL.revokeObjectURL as ReturnType<typeof vi.fn>;
    revokeSpy.mockClear();

    await exportAsPdf('<p>test</p>', 'Blocked');

    expect(alert).toHaveBeenCalledWith('Popup blocked! Click the popup-blocked icon in your browser address bar (or browser menu), choose "Always allow pop-ups" for this site, then retry Export PDF.');
    expect(revokeSpy).toHaveBeenCalledWith('blob:test-1');
  });

  it('uses the desktop native print bridge when the host PDF bridge is available', async () => {
    const printPdfMock = vi.fn().mockResolvedValue({ ok: true });
    const restoreHost = installMockOpenDesignHost({
      host: { pdf: { print: printPdfMock } },
    });

    try {
      await exportAsPdf('<script>window.parent.document.body.innerHTML="owned"</script>', 'Desktop PDF');
    } finally {
      restoreHost();
    }

    expect(printPdfMock).toHaveBeenCalledTimes(1);
    expect(openCalls).toEqual([]);

    const htmlArg = printPdfMock.mock.calls[0]![0];
    expect(htmlArg).toContain('sandbox="allow-scripts"');
    expect(htmlArg).not.toContain('allow-modals');
    expect(htmlArg).toContain('&lt;script&gt;window.parent.document.body.innerHTML=&quot;owned&quot;&lt;/script&gt;');
    expect(htmlArg).not.toContain('<script>window.parent.document.body.innerHTML="owned"</script>');
    // Verify the readiness handshake is present — the sandboxed iframe posts
    // 'OD_PRINT_READY' to the parent once fonts and images are loaded.
    expect(htmlArg).toContain('OD_PRINT_READY');
    // Verify the parent-wrapper cache script is present so the handshake is
    // never missed even if 'OD_PRINT_READY' fires before the listener attaches.
    expect(htmlArg).toContain('__odPrintReady');
    // Verify the print script is NOT injected — Electron renders via the
    // native printToPDF path, so a self-printing document would trigger a
    // second print dialog.
    expect(htmlArg).not.toContain('window.print()');
  });

  it('passes deck intent through the desktop native print bridge', async () => {
    const printPdfMock = vi.fn().mockResolvedValue({ ok: true });
    const restoreHost = installMockOpenDesignHost({
      host: { pdf: { print: printPdfMock } },
    });

    try {
      await exportAsPdf('<section class="slide">One</section>', 'Desktop Deck', { deck: true });
    } finally {
      restoreHost();
    }

    expect(printPdfMock).toHaveBeenCalledTimes(1);
    expect(printPdfMock.mock.calls[0]![2]).toEqual({ deck: true });
    expect(printPdfMock.mock.calls[0]![0]).toContain('data-deck-print=&quot;injected&quot;');
  });

  it('injects image-waiting logic into the print-ready handshake for the desktop bridge', async () => {
    const printPdfMock = vi.fn().mockResolvedValue({ ok: true });
    const restoreHost = installMockOpenDesignHost({
      host: { pdf: { print: printPdfMock } },
    });

    // HTML with an intentionally non-loadable image to exercise the
    // incomplete-image detection in the injected handshake.
    const html = '<div><img src="https://example.com/will-not-load.png" alt="test"/></div>';
    try {
      await exportAsPdf(html, 'Image Test');
    } finally {
      restoreHost();
    }

    const htmlArg = printPdfMock.mock.calls[0]![0];
    // In the sandboxed wrapper the srcdoc attribute is HTML-escaped, so the
    // handshake script content is present as unescaped JS fragments.
    expect(htmlArg).toContain('document.images');
    expect(htmlArg).toContain("img.addEventListener('load'");
    expect(htmlArg).toContain("img.addEventListener('error'");
    expect(htmlArg).toContain('img.complete');
    expect(htmlArg).toContain('waitForCssBackgroundImages');
    expect(htmlArg).toContain('window.getComputedStyle');
    expect(htmlArg).toContain('style.backgroundImage');
    expect(htmlArg).toContain('style.borderImageSource');
    expect(htmlArg).toContain('style.listStyleImage');
    expect(htmlArg).toContain('new Image()');
    expect(htmlArg).toContain('requestAnimationFrame');
    // The original font- and load-waiting logic must still be present.
    expect(htmlArg).toContain('document.fonts');
    expect(htmlArg).toContain('OD_PRINT_READY');
    // The handshake posts an object with a per-export nonce to prevent
    // spoofing by untrusted artifact code.
    expect(htmlArg).toContain("type:'OD_PRINT_READY'");
    expect(htmlArg).toContain("nonce:'");
    // The cache script also validates the nonce and event source.
    expect(htmlArg).toContain("e.data.type==='OD_PRINT_READY'");
    expect(htmlArg).toContain("e.data.nonce===");
    expect(htmlArg).toContain('e.source===');
    // The parent cache should still be injected.
    expect(htmlArg).toContain('__odPrintReady');
    // No window.print() since the desktop bridge handles printing natively.
    expect(htmlArg).not.toContain('window.print()');
  });

  it('reports the artifact content size through the handshake so the desktop page is sized to the content, not the wrapper viewport (issue #4067)', async () => {
    const printPdfMock = vi.fn().mockResolvedValue({ ok: true });
    const restoreHost = installMockOpenDesignHost({
      host: { pdf: { print: printPdfMock } },
    });

    try {
      await exportAsPdf('<div style="height:4000px">tall artifact</div>', 'Tall PDF');
    } finally {
      restoreHost();
    }

    const htmlArg = printPdfMock.mock.calls[0]![0];
    // The in-iframe handshake measures the artifact's own document dimensions.
    // The parent wrapper cannot do this itself: the sandboxed preview iframe is
    // `allow-scripts` with no `allow-same-origin`, so iframe.contentDocument is
    // null. Measuring from inside is the only way to learn the real size.
    expect(htmlArg).toContain('document.documentElement');
    expect(htmlArg).toContain('scrollHeight');
    expect(htmlArg).toContain('offsetHeight');
    // ...and it ships that size to the parent, but only once the content has a
    // usable (non-zero) size, by driving the measurement through
    // reportPrintSizeWhenStable. The polling/gating behavior itself is covered
    // by the reportPrintSizeWhenStable unit tests above (real-logic behavior
    // assertions, not string presence); here we assert the handshake is wired
    // to it so a heavier artifact that lays out late is not reported at size 0,
    // which would blank the PDF (#4458).
    expect(htmlArg).toContain('reportPrintSizeWhenStable');
    expect(htmlArg).toContain('width:size.width');
    expect(htmlArg).toContain('height:size.height');
    // The parent wrapper caches the reported size for inferPageSize() to read,
    // gating it through isUsablePrintSize so a malformed/oversized message
    // cannot poison the page size. The finite check matters: `Infinity > 0` is
    // true, so a bare `typeof === 'number'` guard would cache a non-finite
    // dimension and let it leak into the page size. (isUsablePrintSize's own
    // boundary behavior is covered by its unit tests above.)
    expect(htmlArg).toContain('window.__odPrintSize');
    expect(htmlArg).toContain('__odUsable(e.data.width,e.data.height)');
    expect(htmlArg).toContain('Number.isFinite(width)');
  });

  it('injects the readiness cache for non-sandboxed desktop exports too', async () => {
    const printPdfMock = vi.fn().mockResolvedValue({ ok: true });
    const restoreHost = installMockOpenDesignHost({
      host: { pdf: { print: printPdfMock } },
    });

    try {
      await exportAsPdf('<main>Trusted local document</main>', 'Trusted', {
        sandboxedPreview: false,
      });
    } finally {
      restoreHost();
    }

    expect(printPdfMock).toHaveBeenCalledTimes(1);
    const htmlArg = printPdfMock.mock.calls[0]![0];
    // No sandbox wrapper — the document is passed through directly.
    expect(htmlArg).not.toContain('sandbox="allow-scripts"');
    expect(htmlArg).toContain('<main>Trusted local document</main>');
    // The readiness handshake must still be injected.
    expect(htmlArg).toContain('OD_PRINT_READY');
    // The cache must be present so waitForPrintReadyHandshake never hangs.
    expect(htmlArg).toContain('__odPrintReady');
    // No window.print() since the desktop bridge handles printing natively.
    expect(htmlArg).not.toContain('window.print()');
  });
});

// ---------------------------------------------------------------------------
// Image screenshot export
// ---------------------------------------------------------------------------

describe('requestPreviewSnapshot', () => {
  let listeners: Map<string, Set<(ev: unknown) => void>>;

  beforeEach(() => {
    listeners = new Map();
    vi.stubGlobal('window', {
      addEventListener: (type: string, fn: (ev: unknown) => void) => {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(fn);
      },
      removeEventListener: (type: string, fn: (ev: unknown) => void) => {
        listeners.get(type)?.delete(fn);
      },
      dispatchEvent: (ev: { type: string }) => {
        for (const fn of listeners.get(ev.type) ?? []) fn(ev);
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns null when the iframe has no contentWindow', async () => {
    const iframe = { contentWindow: null } as unknown as HTMLIFrameElement;
    const result = await requestPreviewSnapshot(iframe);
    expect(result).toBeNull();
  });

  it('resolves with snapshot data when the bridge responds', async () => {
    const postMessageMock = vi.fn();
    const contentWindow = { postMessage: postMessageMock };
    const iframe = { contentWindow } as unknown as HTMLIFrameElement;

    const promise = requestPreviewSnapshot(iframe);

    expect(postMessageMock).toHaveBeenCalledOnce();
    const { id } = postMessageMock.mock.calls[0]![0] as { type: string; id: string };

    // Simulate the bridge responding — source must match iframe.contentWindow
    window.dispatchEvent(
      { type: 'message', source: contentWindow, data: { type: 'od:snapshot:result', id, dataUrl: 'data:image/png;base64,abc', w: 100, h: 50 } } as unknown as Event,
    );

    const result = await promise;
    expect(result).toEqual({ dataUrl: 'data:image/png;base64,abc', w: 100, h: 50 });
  });

  it('resolves null when the bridge responds with an error', async () => {
    const postMessageMock = vi.fn();
    const contentWindow = { postMessage: postMessageMock };
    const iframe = { contentWindow } as unknown as HTMLIFrameElement;

    const promise = requestPreviewSnapshot(iframe);
    const { id } = postMessageMock.mock.calls[0]![0] as { type: string; id: string };

    window.dispatchEvent(
      { type: 'message', source: contentWindow, data: { type: 'od:snapshot:result', id, error: 'snapshot image failed' } } as unknown as Event,
    );

    const result = await promise;
    expect(result).toBeNull();
  });

  it('resolves null on timeout', async () => {
    vi.useFakeTimers();
    const iframe = {
      contentWindow: { postMessage: vi.fn() },
    } as unknown as HTMLIFrameElement;

    const promise = requestPreviewSnapshot(iframe, 100);
    vi.advanceTimersByTime(150);

    const result = await promise;
    expect(result).toBeNull();
    vi.useRealTimers();
  });

  it('ignores messages with a mismatched id', async () => {
    vi.useFakeTimers();
    const postMessageMock = vi.fn();
    const contentWindow = { postMessage: postMessageMock };
    const iframe = { contentWindow } as unknown as HTMLIFrameElement;

    const promise = requestPreviewSnapshot(iframe, 100);

    // Correct source but wrong id — should be ignored
    window.dispatchEvent(
      { type: 'message', source: contentWindow, data: { type: 'od:snapshot:result', id: 'wrong-id', dataUrl: 'data:image/png;base64,abc', w: 100, h: 50 } } as unknown as Event,
    );

    vi.advanceTimersByTime(150);
    const result = await promise;
    expect(result).toBeNull();
    vi.useRealTimers();
  });

  it('ignores messages from a different source window', async () => {
    vi.useFakeTimers();
    const postMessageMock = vi.fn();
    const contentWindow = { postMessage: postMessageMock };
    const iframe = { contentWindow } as unknown as HTMLIFrameElement;

    const promise = requestPreviewSnapshot(iframe, 100);
    const { id } = postMessageMock.mock.calls[0]![0] as { type: string; id: string };

    // Correct id but wrong source — should be ignored
    window.dispatchEvent(
      { type: 'message', source: { other: true }, data: { type: 'od:snapshot:result', id, dataUrl: 'data:image/png;base64,abc', w: 100, h: 50 } } as unknown as Event,
    );

    vi.advanceTimersByTime(150);
    const result = await promise;
    expect(result).toBeNull();
    vi.useRealTimers();
  });
});

describe('exportAsImage', () => {
  let clickMock: ReturnType<typeof vi.fn>;
  let createObjectURLMock: ReturnType<typeof vi.fn>;
  let anchors: Array<{ href: string; download: string; click: ReturnType<typeof vi.fn> }>;

  beforeEach(() => {
    clickMock = vi.fn();
    createObjectURLMock = vi.fn(() => 'blob:mock-url');
    anchors = [];
    vi.stubGlobal('URL', { createObjectURL: createObjectURLMock, revokeObjectURL: vi.fn() });
    vi.stubGlobal('document', {
      createElement: () => {
        const el = { href: '', download: '', click: clickMock };
        anchors.push(el);
        return el;
      },
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn(),
      },
    });
    // triggerDownload calls setTimeout for deferred revoke
    vi.stubGlobal('setTimeout', (fn: () => void) => fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('triggers a download with a .png filename', () => {
    const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    exportAsImage(dataUrl, 'My Design');

    expect(clickMock).toHaveBeenCalledOnce();
    expect(anchors).toHaveLength(1);
    expect(anchors[0]!.download).toBe('My Design.png');
  });

  it('sanitizes the title into a safe filename', () => {
    exportAsImage('data:image/png;base64,AA==', 'Hello <World> / Test!');

    expect(anchors[0]!.download).toBe('Hello World Test!.png');
  });

  it('does not download an empty image snapshot', () => {
    expect(() => exportAsImage('data:image/png;base64,', 'Empty')).toThrow('Image snapshot is empty');

    expect(clickMock).not.toHaveBeenCalled();
    expect(anchors).toHaveLength(0);
  });

  it('downloads a validated image data URL through a blob URL', () => {
    const dataUrl = 'data:image/png;base64,AA==';

    downloadImageDataUrl(dataUrl, 'workspace.png');

    expect(clickMock).toHaveBeenCalledOnce();
    expect(createObjectURLMock).toHaveBeenCalledOnce();
    expect(anchors[0]!.href).toBe('blob:mock-url');
    expect(anchors[0]!.download).toBe('workspace.png');
  });

  it('does not download an empty image data URL', () => {
    expect(() => downloadImageDataUrl('data:image/png;base64,', 'workspace.png')).toThrow('Image snapshot is empty');

    expect(clickMock).not.toHaveBeenCalled();
    expect(anchors).toHaveLength(0);
  });

  it('falls back to download when the native save picker is blocked', async () => {
    const showSaveFilePicker = vi.fn().mockRejectedValue(
      new DOMException('Must be handling a user gesture to show a file picker.', 'SecurityError'),
    );
    vi.stubGlobal('window', { showSaveFilePicker });

    const target = await prepareImageExportTarget('My Design', 'jpeg');

    expect(showSaveFilePicker).toHaveBeenCalledOnce();
    expect(target?.method).toBe('download');
    expect(target?.filename).toBe('My Design.jpg');

    await target?.save(new Blob(['jpeg'], { type: 'image/jpeg' }));

    expect(clickMock).toHaveBeenCalledOnce();
    expect(anchors[0]!.download).toBe('My Design.jpg');
  });

  it('falls back to download when the native save picker reports a cross-realm SecurityError', async () => {
    const securityError = Object.assign(new Error('Must be handling a user gesture to show a file picker.'), {
      name: 'SecurityError',
    });
    const showSaveFilePicker = vi.fn().mockRejectedValue(securityError);
    vi.stubGlobal('window', { showSaveFilePicker });

    const target = await prepareImageExportTarget('My Design', 'webp');

    expect(showSaveFilePicker).toHaveBeenCalledOnce();
    expect(target?.method).toBe('download');
    expect(target?.filename).toBe('My Design.webp');
  });

  it('can skip the native save picker to avoid pre-creating empty files', async () => {
    const showSaveFilePicker = vi.fn();
    vi.stubGlobal('window', { showSaveFilePicker });

    const target = await prepareImageExportTarget('My Design', 'png', { useNativePicker: false });

    expect(showSaveFilePicker).not.toHaveBeenCalled();
    expect(target?.method).toBe('download');
    expect(target?.filename).toBe('My Design.png');
  });
});
