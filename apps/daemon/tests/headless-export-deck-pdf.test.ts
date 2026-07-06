import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildDeckFlattenCssRules,
  buildDeckGuizangPrintFallbackCss,
  buildDeckPrintCss,
  buildDeckScreenExportCss,
  chromiumExecutableCandidates,
  chromiumLaunchArgs,
  chromiumRuntimeEnv,
  chromiumRuntimePaths,
  DECK_CHROME_HIDE_SELECTOR,
  DECK_WRAPPER_SELECTOR,
  ensureChromiumRuntimeDirs,
  imageScreenshotOptions,
  isHeadlessChromiumUnavailableError,
  logChromiumAvailabilityAtBoot,
  patchArtifactDeckPrintBackground,
  resolveExportTimeoutMs,
  resolvePlaywrightChromiumExecutable,
  resolvePlaywrightChromiumExecutables,
} from '../src/headless-export.js';

describe('chromiumExecutableCandidates', () => {
  it('includes OD_EXPORT_CHROMIUM_PATH and common Linux paths', () => {
    const previous = process.env.OD_EXPORT_CHROMIUM_PATH;
    const previousPlaywright = process.env.PLAYWRIGHT_BROWSERS_PATH;
    delete process.env.PLAYWRIGHT_BROWSERS_PATH;
    process.env.OD_EXPORT_CHROMIUM_PATH = '/custom/chromium';
    try {
      const candidates = chromiumExecutableCandidates();
      expect(candidates[0]).toBe('/custom/chromium');
      expect(candidates).toContain('/usr/bin/chromium');
    } finally {
      if (previous === undefined) delete process.env.OD_EXPORT_CHROMIUM_PATH;
      else process.env.OD_EXPORT_CHROMIUM_PATH = previous;
      if (previousPlaywright === undefined) delete process.env.PLAYWRIGHT_BROWSERS_PATH;
      else process.env.PLAYWRIGHT_BROWSERS_PATH = previousPlaywright;
    }
  });

  it('prefers Playwright chromium when PLAYWRIGHT_BROWSERS_PATH is populated', () => {
    const root = `/tmp/od-pw-chromium-${process.pid}`;
    const chromePath = path.join(root, 'chromium-1200', 'chrome-linux', 'chrome');
    const prevRoot = process.env.PLAYWRIGHT_BROWSERS_PATH;
    fs.mkdirSync(path.dirname(chromePath), { recursive: true });
    fs.writeFileSync(chromePath, '');
    process.env.PLAYWRIGHT_BROWSERS_PATH = root;
    try {
      expect(resolvePlaywrightChromiumExecutable()).toBe(chromePath);
      expect(chromiumExecutableCandidates()[0]).toBe(chromePath);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      if (prevRoot === undefined) delete process.env.PLAYWRIGHT_BROWSERS_PATH;
      else process.env.PLAYWRIGHT_BROWSERS_PATH = prevRoot;
    }
  });

  it('also surfaces Playwright chromium_headless_shell as a fallback candidate', () => {
    const root = `/tmp/od-pw-shell-${process.pid}`;
    const chromePath = path.join(root, 'chromium-1200', 'chrome-linux', 'chrome');
    const shellPath = path.join(
      root,
      'chromium_headless_shell-1200',
      'chrome-linux',
      'headless_shell',
    );
    const prevRoot = process.env.PLAYWRIGHT_BROWSERS_PATH;
    fs.mkdirSync(path.dirname(chromePath), { recursive: true });
    fs.writeFileSync(chromePath, '');
    fs.mkdirSync(path.dirname(shellPath), { recursive: true });
    fs.writeFileSync(shellPath, '');
    process.env.PLAYWRIGHT_BROWSERS_PATH = root;
    try {
      const executables = resolvePlaywrightChromiumExecutables();
      expect(executables).toContain(chromePath);
      expect(executables).toContain(shellPath);
      const candidates = chromiumExecutableCandidates();
      expect(candidates.indexOf(chromePath)).toBeLessThan(candidates.indexOf(shellPath));
      expect(candidates.indexOf(shellPath)).toBeLessThan(candidates.indexOf('/usr/bin/chromium'));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      if (prevRoot === undefined) delete process.env.PLAYWRIGHT_BROWSERS_PATH;
      else process.env.PLAYWRIGHT_BROWSERS_PATH = prevRoot;
    }
  });
});

describe('isHeadlessChromiumUnavailableError', () => {
  it('detects the daemon summary message', () => {
    expect(
      isHeadlessChromiumUnavailableError(
        new Error('headless Chromium unavailable (tried 8 path(s)): /usr/bin/chromium: SIGTRAP'),
      ),
    ).toBe(true);
  });

  it('detects the HEADLESS_CHROMIUM_UNAVAILABLE structured code from the FE side', () => {
    expect(isHeadlessChromiumUnavailableError('HEADLESS_CHROMIUM_UNAVAILABLE')).toBe(true);
  });

  it('rejects unrelated errors', () => {
    expect(isHeadlessChromiumUnavailableError(new Error('teamver_project_s3_prefix_required'))).toBe(
      false,
    );
  });
});

describe('chromiumRuntimePaths', () => {
  it('defaults to /tmp/.chromium for read-only container compatibility', () => {
    const prevConfig = process.env.XDG_CONFIG_HOME;
    const prevCache = process.env.XDG_CACHE_HOME;
    delete process.env.XDG_CONFIG_HOME;
    delete process.env.XDG_CACHE_HOME;
    try {
      const paths = chromiumRuntimePaths();
      expect(paths.configHome).toBe('/tmp/.chromium');
      expect(paths.crashDir).toBe('/tmp/.chromium/chromium/Crashpad');
    } finally {
      if (prevConfig === undefined) delete process.env.XDG_CONFIG_HOME;
      else process.env.XDG_CONFIG_HOME = prevConfig;
      if (prevCache === undefined) delete process.env.XDG_CACHE_HOME;
      else process.env.XDG_CACHE_HOME = prevCache;
    }
  });

  it('creates crashpad dirs before launch', () => {
    const dir = `/tmp/od-chromium-test-${process.pid}`;
    const prevConfig = process.env.XDG_CONFIG_HOME;
    const prevCache = process.env.XDG_CACHE_HOME;
    const prevDbus = process.env.DBUS_SESSION_BUS_ADDRESS;
    const prevSingle = process.env.OD_CHROMIUM_SINGLE_PROCESS;
    process.env.XDG_CONFIG_HOME = dir;
    process.env.XDG_CACHE_HOME = dir;
    delete process.env.DBUS_SESSION_BUS_ADDRESS;
    delete process.env.OD_CHROMIUM_SINGLE_PROCESS;
    try {
      ensureChromiumRuntimeDirs();
      expect(chromiumRuntimePaths().crashDir).toContain(dir);
      const args = chromiumLaunchArgs();
      expect(args).toContain('--headless=new');
      expect(args).toContain('--disable-crash-reporter');
      expect(args).toContain('--disable-crashpad');
      expect(args.some((arg) => arg.startsWith('--crash-dumps-dir='))).toBe(true);
      expect(args).toContain('--no-zygote');
      expect(args).toContain('--no-crashpad');
      // --single-process must not be added by default: M120+ Chromium
      // SIGTRAPs on startup with that flag in tmpfs-only containers.
      expect(args).not.toContain('--single-process');
      const env = chromiumRuntimeEnv();
      expect(env.DBUS_SESSION_BUS_ADDRESS).toBe('disabled:');
      expect(env.XDG_CONFIG_HOME).toBe(dir);
      expect(env.XDG_CACHE_HOME).toBe(dir);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
      if (prevConfig === undefined) delete process.env.XDG_CONFIG_HOME;
      else process.env.XDG_CONFIG_HOME = prevConfig;
      if (prevCache === undefined) delete process.env.XDG_CACHE_HOME;
      else process.env.XDG_CACHE_HOME = prevCache;
      if (prevDbus === undefined) delete process.env.DBUS_SESSION_BUS_ADDRESS;
      else process.env.DBUS_SESSION_BUS_ADDRESS = prevDbus;
      if (prevSingle === undefined) delete process.env.OD_CHROMIUM_SINGLE_PROCESS;
      else process.env.OD_CHROMIUM_SINGLE_PROCESS = prevSingle;
    }
  });

  it('adds --single-process only when OD_CHROMIUM_SINGLE_PROCESS=1 is set', () => {
    const prev = process.env.OD_CHROMIUM_SINGLE_PROCESS;
    process.env.OD_CHROMIUM_SINGLE_PROCESS = '1';
    try {
      expect(chromiumLaunchArgs()).toContain('--single-process');
    } finally {
      if (prev === undefined) delete process.env.OD_CHROMIUM_SINGLE_PROCESS;
      else process.env.OD_CHROMIUM_SINGLE_PROCESS = prev;
    }
  });
});

describe('logChromiumAvailabilityAtBoot', () => {
  it('emits an od_chromium_boot marker even when no binary exists', () => {
    const prevRoot = process.env.PLAYWRIGHT_BROWSERS_PATH;
    const prevOverride = process.env.OD_EXPORT_CHROMIUM_PATH;
    process.env.PLAYWRIGHT_BROWSERS_PATH = `/tmp/od-boot-empty-${process.pid}`;
    delete process.env.OD_EXPORT_CHROMIUM_PATH;
    const errCalls: unknown[][] = [];
    const infoCalls: unknown[][] = [];
    const prevErr = console.error;
    const prevInfo = console.info;
    console.error = (...args: unknown[]) => {
      errCalls.push(args);
    };
    console.info = (...args: unknown[]) => {
      infoCalls.push(args);
    };
    try {
      logChromiumAvailabilityAtBoot();
      const allCalls = [...errCalls, ...infoCalls];
      // At least one boot log line must be emitted with the structured
      // marker so ops greps like `od_chromium_boot` are stable.
      const flat = JSON.stringify(allCalls);
      expect(flat).toContain('od_chromium_boot');
    } finally {
      console.error = prevErr;
      console.info = prevInfo;
      if (prevRoot === undefined) delete process.env.PLAYWRIGHT_BROWSERS_PATH;
      else process.env.PLAYWRIGHT_BROWSERS_PATH = prevRoot;
      if (prevOverride === undefined) delete process.env.OD_EXPORT_CHROMIUM_PATH;
      else process.env.OD_EXPORT_CHROMIUM_PATH = prevOverride;
    }
  });
});

describe('resolveExportTimeoutMs', () => {
  const previous = process.env.OD_EXPORT_TIMEOUT_MS;
  const restore = () => {
    if (previous === undefined) delete process.env.OD_EXPORT_TIMEOUT_MS;
    else process.env.OD_EXPORT_TIMEOUT_MS = previous;
  };

  it('defaults to 30s when the env var is unset', () => {
    delete process.env.OD_EXPORT_TIMEOUT_MS;
    try {
      expect(resolveExportTimeoutMs()).toBe(30_000);
    } finally {
      restore();
    }
  });

  it('honors a valid env override', () => {
    process.env.OD_EXPORT_TIMEOUT_MS = '90000';
    try {
      expect(resolveExportTimeoutMs()).toBe(90_000);
    } finally {
      restore();
    }
  });

  it('clamps below the 1s floor to guard against typos', () => {
    process.env.OD_EXPORT_TIMEOUT_MS = '10';
    try {
      expect(resolveExportTimeoutMs()).toBe(1_000);
    } finally {
      restore();
    }
  });

  it('falls back to the default for non-numeric overrides', () => {
    process.env.OD_EXPORT_TIMEOUT_MS = 'not-a-number';
    try {
      expect(resolveExportTimeoutMs()).toBe(30_000);
    } finally {
      restore();
    }
  });
});

describe('buildDeckPrintCss', () => {
  it('overrides inactive slides so every deck-framework slide prints', () => {
    const css = buildDeckPrintCss();
    expect(css).toContain('@media print');
    expect(css).toContain('.slide:not(.active)');
    expect(css).toContain('display: block !important');
    expect(css).not.toContain('flex-direction: column !important');
    expect(css).toContain('.deck');
    expect(css).toContain('.deck-shell');
    expect(css).toContain('.deck-stage');
    expect(css).toContain('#deck');
    expect(css).toContain('#nav');
    expect(css).toContain('canvas.bg');
    expect(css).not.toMatch(/\.deck-stage[^}]*height:\s*auto/);
    expect(css).toContain('page-break-before: avoid !important');
    expect(css).toContain('page-break-after: always !important');
  });

  it('buildDeckScreenExportCss exposes flatten rules without @media print', () => {
    const screenCss = buildDeckScreenExportCss();
    const flattenRules = buildDeckFlattenCssRules();
    expect(screenCss).toBe(flattenRules);
    expect(screenCss).not.toContain('@media print');
    expect(screenCss).toContain('.slide:not(.active)');
    expect(screenCss).toContain('display: block !important');
    expect(screenCss).not.toContain('flex-direction: column !important');
    expect(screenCss).toContain('background: var(--bg');
    expect(screenCss).toContain('background: var(--shell');
    expect(screenCss).not.toContain('background: #fff !important');
    expect(screenCss).toContain('print-color-adjust: exact');
  });

  it('exports shared deck wrapper and chrome hide selectors', () => {
    expect(DECK_WRAPPER_SELECTOR).toContain('#deck');
    expect(DECK_CHROME_HIDE_SELECTOR).toContain('#nav');
    expect(DECK_CHROME_HIDE_SELECTOR).toContain('canvas.bg');
  });

  it('strengthens guizang ::before overlays for print', () => {
    const css = buildDeckGuizangPrintFallbackCss();
    expect(css).toContain('.slide.hero.dark::before');
    expect(css).toContain('rgba(var(--ink-rgb), .88)');
    expect(css).toContain('backdrop-filter: none');
  });

  it('patches artifact @media print white backgrounds to deck CSS variables', () => {
    const input = `@media print { html, body { background: #fff !important; } }`;
    const out = patchArtifactDeckPrintBackground(input);
    expect(out).toContain('background: var(--shell, var(--bg, #fff)) !important');
    expect(out).not.toContain('background: #fff !important');
  });

  it('exports revealAllDeckSlides for runtime flattening', async () => {
    const mod = await import('../src/headless-export.js');
    expect(typeof mod.revealAllDeckSlides).toBe('function');
  });

  it('pins deck screenshot clips to the 1920×1080 slide frame', async () => {
    const { deckScreenshotClipRect } = await import('../src/headless-export.js');
    expect(deckScreenshotClipRect()).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
  });
});

describe('imageScreenshotOptions', () => {
  it('keeps PNG lossless and transparent-capable', () => {
    expect(imageScreenshotOptions('png')).toEqual({
      type: 'png',
      omitBackground: true,
    });
  });

  it('uses high-quality opaque JPEG output for text-heavy decks', () => {
    expect(imageScreenshotOptions('jpeg')).toEqual({
      type: 'jpeg',
      omitBackground: false,
      quality: 96,
    });
  });

  it('uses high-quality opaque WebP output for text-heavy decks', () => {
    expect(imageScreenshotOptions('webp')).toEqual({
      type: 'webp',
      omitBackground: false,
      quality: 96,
    });
  });
});
