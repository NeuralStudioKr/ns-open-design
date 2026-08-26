import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildDeckFlattenCssRules,
  buildDeckGuizangPrintFallbackCss,
  buildDeckPrintCss,
  buildDeckScreenExportCss,
  buildDeckHtmlExportScreenCss,
  chromiumExecutableCandidates,
  chromiumLaunchArgs,
  chromiumRuntimeEnv,
  chromiumRuntimePaths,
  DECK_CHROME_HIDE_SELECTOR,
  DECK_WRAPPER_SELECTOR,
  DeckSlideCountLimitError,
  ensureChromiumRuntimeDirs,
  imageScreenshotOptions,
  isHeadlessChromiumUnavailableError,
  logChromiumAvailabilityAtBoot,
  patchArtifactDeckPrintBackground,
  resolveExportTimeoutMs,
  resolvePptxMaxSlides,
  resolvePlaywrightChromiumExecutable,
  resolvePlaywrightChromiumExecutables,
  warmupHeadlessChromiumAtBoot,
} from '../src/headless-export.js';

describe('PPTX slide count cap', () => {
  it('defaults to 40 slides and can be disabled with 0', () => {
    const previous = process.env.OD_EXPORT_PPTX_MAX_SLIDES;
    try {
      delete process.env.OD_EXPORT_PPTX_MAX_SLIDES;
      expect(resolvePptxMaxSlides()).toBe(40);

      process.env.OD_EXPORT_PPTX_MAX_SLIDES = '0';
      expect(resolvePptxMaxSlides()).toBe(0);

      process.env.OD_EXPORT_PPTX_MAX_SLIDES = '120';
      expect(resolvePptxMaxSlides()).toBe(120);

      process.env.OD_EXPORT_PPTX_MAX_SLIDES = 'nope';
      expect(resolvePptxMaxSlides()).toBe(40);
    } finally {
      if (previous === undefined) delete process.env.OD_EXPORT_PPTX_MAX_SLIDES;
      else process.env.OD_EXPORT_PPTX_MAX_SLIDES = previous;
    }
  });

  it('surfaces a stable error code for oversized PPTX decks', () => {
    const err = new DeckSlideCountLimitError(41, 40);
    expect(err.code).toBe('EXPORT_DECK_TOO_LARGE');
    expect(err.message).toContain('Use PDF download for this large deck');
  });
});

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

  it('resolves Playwright v1.49+ chrome-linux64 and chrome-headless-shell-linux64 layouts', () => {
    const root = `/tmp/od-pw-linux64-${process.pid}`;
    const chromePath = path.join(root, 'chromium-1223', 'chrome-linux64', 'chrome');
    const shellPath = path.join(
      root,
      'chromium_headless_shell-1223',
      'chrome-headless-shell-linux64',
      'chrome-headless-shell',
    );
    const prevRoot = process.env.PLAYWRIGHT_BROWSERS_PATH;
    fs.mkdirSync(path.dirname(chromePath), { recursive: true });
    fs.writeFileSync(chromePath, '');
    fs.mkdirSync(path.dirname(shellPath), { recursive: true });
    fs.writeFileSync(shellPath, '');
    process.env.PLAYWRIGHT_BROWSERS_PATH = root;
    try {
      const executables = resolvePlaywrightChromiumExecutables();
      expect(executables).toEqual([chromePath, shellPath]);
      expect(resolvePlaywrightChromiumExecutable()).toBe(chromePath);
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

describe('warmupHeadlessChromiumAtBoot', () => {
  it('skips the launch attempt when OD_CHROMIUM_BOOT_WARMUP=off', async () => {
    const prev = process.env.OD_CHROMIUM_BOOT_WARMUP;
    process.env.OD_CHROMIUM_BOOT_WARMUP = 'off';
    const infoCalls: unknown[][] = [];
    const errorCalls: unknown[][] = [];
    const prevInfo = console.info;
    const prevError = console.error;
    console.info = (...args: unknown[]) => infoCalls.push(args);
    console.error = (...args: unknown[]) => errorCalls.push(args);
    try {
      await warmupHeadlessChromiumAtBoot();
      // Not launching means neither info nor error warm-up marker fires.
      const flat = JSON.stringify([...infoCalls, ...errorCalls]);
      expect(flat).not.toContain('od_chromium_warmup');
    } finally {
      console.info = prevInfo;
      console.error = prevError;
      if (prev === undefined) delete process.env.OD_CHROMIUM_BOOT_WARMUP;
      else process.env.OD_CHROMIUM_BOOT_WARMUP = prev;
    }
  });

  it('logs od_chromium_warmup ERROR when no chromium binary can launch', async () => {
    // Force launcher to fail: point PLAYWRIGHT_BROWSERS_PATH at an
    // empty directory and set OD_DISABLE_RUNTIME_CHROMIUM_INSTALL so
    // the last-ditch npx install fallback does not attempt a real
    // download during unit tests.
    const emptyRoot = `/tmp/od-warmup-empty-${process.pid}`;
    const prevWarmup = process.env.OD_CHROMIUM_BOOT_WARMUP;
    const prevRoot = process.env.PLAYWRIGHT_BROWSERS_PATH;
    const prevOverride = process.env.OD_EXPORT_CHROMIUM_PATH;
    const prevNoInstall = process.env.OD_DISABLE_RUNTIME_CHROMIUM_INSTALL;
    process.env.OD_CHROMIUM_BOOT_WARMUP = 'log';
    process.env.PLAYWRIGHT_BROWSERS_PATH = emptyRoot;
    process.env.OD_EXPORT_CHROMIUM_PATH = '/nonexistent/chromium';
    process.env.OD_DISABLE_RUNTIME_CHROMIUM_INSTALL = '1';
    const errorCalls: unknown[][] = [];
    const infoCalls: unknown[][] = [];
    const warnCalls: unknown[][] = [];
    const prevError = console.error;
    const prevInfo = console.info;
    const prevWarn = console.warn;
    console.error = (...args: unknown[]) => errorCalls.push(args);
    console.info = (...args: unknown[]) => infoCalls.push(args);
    console.warn = (...args: unknown[]) => warnCalls.push(args);
    try {
      await warmupHeadlessChromiumAtBoot();
      const flat = JSON.stringify(errorCalls);
      expect(flat).toContain('od_chromium_warmup');
      expect(flat).toContain('chromium warm-up FAILED');
    } finally {
      console.error = prevError;
      console.info = prevInfo;
      console.warn = prevWarn;
      if (prevWarmup === undefined) delete process.env.OD_CHROMIUM_BOOT_WARMUP;
      else process.env.OD_CHROMIUM_BOOT_WARMUP = prevWarmup;
      if (prevRoot === undefined) delete process.env.PLAYWRIGHT_BROWSERS_PATH;
      else process.env.PLAYWRIGHT_BROWSERS_PATH = prevRoot;
      if (prevOverride === undefined) delete process.env.OD_EXPORT_CHROMIUM_PATH;
      else process.env.OD_EXPORT_CHROMIUM_PATH = prevOverride;
      if (prevNoInstall === undefined) delete process.env.OD_DISABLE_RUNTIME_CHROMIUM_INSTALL;
      else process.env.OD_DISABLE_RUNTIME_CHROMIUM_INSTALL = prevNoInstall;
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
    // Absolute-layout covers (Cobalt Grid) break if flatten forces column flex.
    expect(css).not.toMatch(/\n\s*flex-direction:\s*column\s*!important/);
    expect(css).toContain('.nav-hint');
    expect(css).not.toMatch(/\.deck-stage[^}]*height:\s*auto/);
    expect(css).toContain('body > .stage');
    expect(css).not.toMatch(/,\s*\.stage\s*\{/);
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
    expect(screenCss).toContain('background: var(--bg');
    // Paper color (--bg) must appear before frame chrome (--shell) in the
    // fallback chain so a light-theme deck stays light in PDF exports.
    expect(screenCss).toMatch(/background:\s*var\(--bg,[^)]*var\(--paper/);
    expect(screenCss).not.toContain('background: #fff !important');
    expect(screenCss).toContain('print-color-adjust: exact');
    expect(screenCss).toContain('body > .stage');
    expect(screenCss).not.toMatch(/,\s*\.stage\s*\{/);
  });

  it('buildDeckHtmlExportScreenCss uses viewport scaling instead of print flatten', () => {
    const css = buildDeckHtmlExportScreenCss();
    expect(css).toContain('zoom: var(--od-html-export-scale, 1) !important');
    expect(css).toContain('width: 100% !important');
    expect(css).not.toContain('display: contents !important');
    expect(css).not.toContain('break-after: page !important');
    expect(css).toMatch(/background:\s*var\(--bg,[^)]*var\(--paper/);
    expect(css).not.toContain('background: var(--shell, #0a0c10)');
    expect(css).not.toContain('box-shadow: 0 12px 48px');
    // Preserve flex Motif covers — do not force slide display:block.
    expect(css).not.toMatch(/\.slide[^{]*\{[^}]*display:\s*block\s*!important/);
    expect(css).toContain('body > .stage');
    expect(css).not.toMatch(/,\s*\.stage\s*\{/);
  });

  it('deck PDF page options use PPT inches + scale (not 1920px MediaBox)', async () => {
    const { resolveDeckPdfPagePdfOptions } = await import('../src/headless-export.js');
    const opts = resolveDeckPdfPagePdfOptions();
    expect(opts.width).toBe('13.333333in');
    expect(opts.height).toBe('7.5in');
    expect(opts.preferCSSPageSize).toBe(false);
    expect(opts.scale).toBeCloseTo(2 / 3, 5);
    expect(opts.width).not.toContain('px');
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'headless-export.ts'),
      'utf8',
    );
    expect(source).toContain('buildDeckPdfPagePdfOptions');
    expect(source).not.toMatch(
      /deckPdfOptions[\s\S]{0,400}width:\s*`\$\{DECK_WIDTH\}px`/,
    );
  });

  it('applyPdfStyles uses paper-first background chain for deck exports', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'headless-export.ts'),
      'utf8',
    );
    expect(source).toMatch(
      /applyPdfStyles[\s\S]{0,600}background:\s*var\(--bg,\s*var\(--paper,\s*var\(--shell/,
    );
    expect(source).not.toMatch(
      /applyPdfStyles[\s\S]{0,600}background:\s*var\(--shell,\s*var\(--bg/,
    );
  });

  it('applyHtmlDeckExportStyles uses html screen layout helpers', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'headless-export.ts'),
      'utf8',
    );
    expect(source).toContain('buildDeckHtmlExportScreenCss');
    expect(source).toContain('buildDeckHtmlExportFinalizeLayoutJs');
    expect(source).toContain('data-od-html-export-screen');
    expect(source).toContain('injectSharedDeckHtmlExportViewportScript');
    expect(source).not.toMatch(
      /applyHtmlDeckExportStyles[\s\S]{0,800}data-od-html-export-viewport/,
    );
  });

  it('renderHeadlessHtmlSnapshot injects viewport script after inline asset pass', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'headless-export.ts'),
      'utf8',
    );
    expect(source).toMatch(
      /inlineRenderedResources\(page\)[\s\S]{0,200}injectSharedDeckHtmlExportViewportScript\(html\)/,
    );
  });

  it('exports shared deck wrapper and chrome hide selectors', () => {
    expect(DECK_WRAPPER_SELECTOR).toContain('#deck');
    expect(DECK_CHROME_HIDE_SELECTOR).toContain('#nav');
    expect(DECK_CHROME_HIDE_SELECTOR).toContain('canvas.bg');
    expect(DECK_CHROME_HIDE_SELECTOR).not.toContain('grain-overlay');
  });

  it('revealDeckSlidesForHtmlExport reuses static flex-preserve reveal', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'headless-export.ts'),
      'utf8',
    );
    expect(source).toMatch(
      /revealDeckSlidesForHtmlExport[\s\S]{0,400}buildSharedDeckHtmlExportStaticRevealScript/,
    );
  });

  it('strengthens guizang ::before overlays for print', () => {
    const css = buildDeckGuizangPrintFallbackCss();
    expect(css).toContain('.slide.hero.dark::before');
    expect(css).toContain('rgba(var(--ink-rgb), .88)');
    expect(css).toContain('backdrop-filter: none');
  });

  it('patches artifact @media print white backgrounds to the paper CSS variable chain', () => {
    const input = `@media print { html, body { background: #fff !important; } }`;
    const out = patchArtifactDeckPrintBackground(input);
    // Paper (--bg) must win over frame chrome (--shell): a light-theme deck's
    // --bg is the deck-stage color that slides sit on. Falling back to --shell
    // painted the whole PDF page dark for #FAFAFA + #0a0e1a decks.
    expect(out).toContain('background: var(--bg, var(--paper, var(--shell, #fff))) !important');
    expect(out).not.toContain('background: #fff !important');
  });

  it('exports revealAllDeckSlides for runtime flattening', async () => {
    const mod = await import('../src/headless-export.js');
    expect(typeof mod.revealAllDeckSlides).toBe('function');
  });

  it('revealAllDeckSlides source strips leaked body-level text nodes before flattening', () => {
    // Agents sometimes emit the deck title as a bare text node between <body>
    // and the first .slide (e.g. `<body>AI 도입 효과 <style>…</style>…`).
    // Even a single line of leaked text shifts every slide down and pushes
    // each slide's bottom sliver onto its own blank PDF page. The reveal
    // script must scrub these text nodes before laying slides out in flow.
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'headless-export.ts'),
      'utf8',
    );
    expect(source).toContain('stripDeckLoosePageFlow');
    expect(source).toMatch(
      /stripDeckLoosePageFlow\s*\(\s*document\.documentElement\s*\)[\s\S]{0,80}stripDeckLoosePageFlow\s*\(\s*document\.body\s*\)/,
    );
    expect(source).toContain('Node.TEXT_NODE');
  });

  it('revealAllDeckSlides injects the layout helper only once', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'headless-export.ts'),
      'utf8',
    );
    const revealBlock = source.slice(
      source.indexOf('export async function revealAllDeckSlides'),
      source.indexOf('async function waitForPrintableContent'),
    );
    expect(revealBlock.match(/buildDeckSlideExportLayoutHelperJs\(\)/g)?.length).toBe(1);
  });

  it('revealAllDeckSlides promotes wrapper decorations before display:contents', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'headless-export.ts'),
      'utf8',
    );
    const revealBlock = source.slice(
      source.indexOf('export async function revealAllDeckSlides'),
      source.indexOf('async function waitForPrintableContent'),
    );
    expect(revealBlock).toContain('promoteWrapperBackgroundDecorations(slides)');
    expect(revealBlock).toContain('applySlideExportSurface(el, resolveSlidePrintBackground(el))');
    expect(revealBlock).toContain("set(document.documentElement, 'background-color', pageSurfaceBg)");
    expect(revealBlock).not.toMatch(
      /set\(document\.documentElement,\s*'background',\s*pageSurfaceBg\)/,
    );
    expect(revealBlock).toContain('ensureEmojiFontFallbacks(document)');
    expect(
      revealBlock.indexOf('promoteWrapperBackgroundDecorations(slides)'),
    ).toBeLessThan(revealBlock.indexOf("set(el, 'display', 'contents')"));
    expect(revealBlock).toContain('if (el.closest(args.selector)) return');
  });

  it('renderHeadlessPdf auto-detects decks when callers pass deck=false', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'headless-export.ts'),
      'utf8',
    );
    expect(source).toContain('pageLooksLikeDeckExport');
    expect(source).toMatch(
      /renderHeadlessPdf[\s\S]{0,900}pageLooksLikeDeckExport/,
    );
  });

  it('HTML deck export uses light reveal (keeps stage ::before) not PDF flatten', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'headless-export.ts'),
      'utf8',
    );
    expect(source).toContain('revealDeckSlidesForHtmlExport');
    const htmlBlock = source.slice(
      source.indexOf('export async function renderHeadlessHtmlSnapshot'),
      source.indexOf('// Detail collected for each failed launch attempt'),
    );
    expect(htmlBlock).toContain('revealDeckSlidesForHtmlExport(page)');
    expect(htmlBlock).not.toContain('revealAllDeckSlides(page)');
  });

  it('injectPrintStylesheet appends emoji font fallbacks for custom type stacks', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'headless-export.ts'),
      'utf8',
    );
    expect(source).toContain('Noto Color Emoji');
    expect(source).toContain('unicode-range');
    expect(source).toContain('ensureEmojiFontFallbacks');
  });

  it('pins deck screenshot clips to the 1920×1080 slide frame', async () => {
    const { deckScreenshotClipRect } = await import('../src/headless-export.js');
    expect(deckScreenshotClipRect()).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
  });

  it('uses screen deck HTML, not print-flattened HTML, for deck screenshot captures', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'headless-export.ts'),
      'utf8',
    );
    const imageBlock = source.slice(
      source.indexOf('export async function renderHeadlessImage'),
      source.indexOf('export async function renderHeadlessDeckImages'),
    );
    const pptxBlock = source.slice(
      source.indexOf('export async function renderHeadlessDeckImages'),
      source.indexOf('export async function renderHeadlessHtmlSnapshot'),
    );
    expect(imageBlock).toContain("deckPrepareMode: 'html'");
    expect(pptxBlock).toContain("deckPrepareMode: 'html'");
  });

  it('routes explicit deck PDF downloads through the preview screenshot pipeline', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'headless-export.ts'),
      'utf8',
    );
    const pdfBlock = source.slice(
      source.indexOf('export async function renderHeadlessPdf'),
      source.indexOf('function deckPdfOptions'),
    );
    expect(pdfBlock).toContain('renderHeadlessDeckScreenshotPdf');
    expect(pdfBlock).toContain("imageFormat: 'jpeg'");
    expect(pdfBlock).toContain("deckPrepareMode: 'preview'");
    expect(pdfBlock).toContain('buildDeckImagePdf(rendered.images)');
    expect(pdfBlock.indexOf('renderHeadlessDeckScreenshotPdf')).toBeLessThan(
      pdfBlock.indexOf('page.pdf'),
    );
  });

  it('builds deck screenshot PDFs as 16:9 image pages', async () => {
    const { buildDeckImagePdfForTests, readJpegDimensionsForTests } = await import('../src/headless-export.js');
    const jpeg3840 = Buffer.from([
      0xff, 0xd8,
      0xff, 0xc0,
      0x00, 0x11,
      0x08,
      0x08, 0x70,
      0x0f, 0x00,
      0x03,
      0x01, 0x11, 0x00,
      0x02, 0x11, 0x00,
      0x03, 0x11, 0x00,
      0xff, 0xd9,
    ]);
    expect(readJpegDimensionsForTests(jpeg3840)).toEqual({ width: 3840, height: 2160 });
    const pdf = buildDeckImagePdfForTests([
      { buffer: jpeg3840, jpeg: true },
      { buffer: jpeg3840, jpeg: true },
    ]);
    const text = pdf.toString('binary');
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toContain('/Type /Pages /Count 2');
    expect(text).toContain('/MediaBox [0 0 960 540]');
    expect(text).toContain('/Width 3840 /Height 2160');
    expect(text).toContain('/Subtype /Image');
    expect(text).toContain('/Filter /DCTDecode');
  });

  it('does not force deck screenshot slides into a flex column layout', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'headless-export.ts'),
      'utf8',
    );
    const revealBlock = source.slice(
      source.indexOf('async function revealDeckSlideForScreenshot'),
      source.indexOf('async function applySnapshotStyles'),
    );
    expect(revealBlock).not.toContain("set(el, 'display', 'flex')");
    expect(revealBlock).not.toContain("set(el, 'flex-direction', 'column')");
    expect(revealBlock).toContain("el.classList.add('active', 'current', 'is-active')");
    expect(revealBlock).toContain("el.style.removeProperty('display')");
  });

  it('includes a daemon-side editable PPTX renderer backed by dom-to-pptx', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'headless-export.ts'),
      'utf8',
    );
    expect(source).toContain('renderHeadlessEditablePptx');
    expect(source).toContain('loadDomToPptxBundle');
    expect(source).toContain('dom-to-pptx.bundle.js.gz');
    expect(source).toContain('w.domToPptx.exportToPptx');
    expect(source).toContain('svgAsVector: true');
    expect(source).toContain('stabilizeCompactMetricText');
    expect(source).toContain('stabilizeShortNoWrapText');
    expect(source).toContain('isShortNoWrapText(text)');
    expect(source).toContain('isCompactMetricText(text)');
    expect(source).toContain("el.style.setProperty('white-space', 'nowrap', 'important')");
    expect(source).toContain("el.style.setProperty('hyphens', 'none', 'important')");
  });

  it('prepares deck HTML/PPTX from standalone healing but deck PDF from preview HTML', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'headless-export.ts'),
      'utf8',
    );
    const baseHtmlBlock = source.slice(
      source.indexOf('function buildDeckExportBaseHtml'),
      source.indexOf('function buildDeckExportHtml'),
    );
    expect(source).toContain('healDeckHtmlForStandaloneExport');
    expect(baseHtmlBlock).toContain('healDeckHtmlForStandaloneExport(withBaseHref');
    expect(baseHtmlBlock).toContain('patchArtifactDeckPrintCss');
    expect(source).toContain('function buildDeckPreviewHtml');
    expect(source).toContain('buildDeckPreviewHtml(options.input)');
  });

  it('busts deck download caches when the shared layout renderer changes', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'export-render-service.ts'),
      'utf8',
    );
    expect(source).toContain("DECK_LAYOUT_RENDER_CACHE_VERSION = 'deck-layout-preview-parity-v5'");
    expect(source).toContain("`${DECK_LAYOUT_RENDER_CACHE_VERSION}:pdf-v1`");
    expect(source).toContain("`${DECK_LAYOUT_RENDER_CACHE_VERSION}:html-v1`");
    expect(source).toContain("`${DECK_LAYOUT_RENDER_CACHE_VERSION}:zip-v1`");
    expect(source).toContain('DECK_PPTX_EDITABLE_RENDER_CACHE_VERSION');
    expect(source).toContain('DECK_PPTX_SCREEN_RENDER_CACHE_VERSION');
    expect(source).not.toContain('pptx-editable-dom-v3');
  });

  it('keeps PDF inline snapshots on preview preparation while other exports stay standalone', () => {
    const webExportSource = fs.readFileSync(
      path.join(__dirname, '..', '..', 'web', 'src', 'runtime', 'exports.ts'),
      'utf8',
    );
    const daemonPdfSource = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'pdf-export.ts'),
      'utf8',
    );
    expect(webExportSource).toContain("inlineHtmlPrepareMode: 'preview'");
    expect(webExportSource).toContain("opts.deck ? 'preview' : 'standalone'");
    expect(daemonPdfSource).toContain("options.inlineHtmlPrepareMode === 'preview'");
    expect(daemonPdfSource).toContain('healDeckHtmlForStandaloneExport(inline)');
  });

  it('keeps PPTX downloads editable by default and screenshot-based only when opted out', () => {
    const routeSource = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'import-export-routes.ts'),
      'utf8',
    );
    const serviceSource = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'export-render-service.ts'),
      'utf8',
    );
    const routePptxBlock = routeSource.slice(
      routeSource.indexOf("app.post('/api/projects/:id/export/pptx'"),
      routeSource.indexOf("app.post('/api/projects/:id/export/html'"),
    );
    const servicePptxBlock = serviceSource.slice(
      serviceSource.indexOf('export async function renderPptxExportOutcome'),
      serviceSource.indexOf('export async function renderHtmlExportOutcome'),
    );
    expect(routePptxBlock).toContain('editable: req.body?.editable');
    expect(servicePptxBlock).toContain('renderHeadlessEditablePptx');
    expect(servicePptxBlock).toContain('req.editable !== false');
    expect(servicePptxBlock).toContain('DECK_PPTX_EDITABLE_RENDER_CACHE_VERSION');
    expect(servicePptxBlock).toContain('buildScreenshotPptx');
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
