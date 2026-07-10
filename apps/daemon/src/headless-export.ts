import fs from 'node:fs';
import path from 'node:path';

import type { DesktopExportPdfInput } from '@open-design/sidecar-proto';
import {
  repairArtifactDocumentHead,
  buildArtifactPreviewDomLeakStripScript,
  patchArtifactDeckPrintCss,
  buildDeckSlideExportLayoutHelperJs,
  buildDeckFlattenCssRules as buildSharedDeckFlattenCssRules,
  buildDeckGuizangPrintFallbackCss as buildSharedDeckGuizangPrintFallbackCss,
  buildDeckPrintCss as buildSharedDeckPrintCss,
} from '@open-design/contracts';

import {
  bindExportBrowserLauncher,
  runHeadlessExportJob,
  type ExportJobMeta,
} from './export-runtime.js';

type Browser = any;
type Page = any;

export type HeadlessImageFormat = 'png' | 'jpeg' | 'webp';

export interface HeadlessExportOptions {
  input: DesktopExportPdfInput;
  imageFormat?: HeadlessImageFormat;
  slideIndex?: number;
}

/**
 * Chromium load + evaluate + PDF/screenshot timeout for a single export.
 * Tunable via `OD_EXPORT_TIMEOUT_MS` so ops can dial it up for large
 * decks (Guizang variants routinely take 15–25s) without a code push.
 * The lower bound (1s) guards against footgun typos that would make
 * every export instantly abort.
 */
export function resolveExportTimeoutMs(): number {
  const raw = process.env.OD_EXPORT_TIMEOUT_MS;
  if (!raw) return 30_000;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return 30_000;
  return Math.max(1_000, parsed);
}

const EXPORT_TIMEOUT_MS = resolveExportTimeoutMs();
const DECK_WIDTH = 1920;
const DECK_HEIGHT = 1080;
// Image downloads are user-facing deliverables, not thumbnail previews. Capture
// at 2x device scale so text antialiasing survives PNG/JPEG/WebP encoding.
const IMAGE_DEVICE_SCALE_FACTOR = 2;
// Single source of truth for the deck-slide selector used by both the print
// CSS (apply{Pdf,Screenshot}Styles) and the in-page JS that drives
// scrollIntoView + per-slide screenshot clipping. Decks shipped from different
// generators use different conventions:
//   - `.slide`               — the classic open-design / handwritten convention.
//   - `[data-slide]`         — legacy attribute marker (older agents).
//   - `[data-screen-label]`  — current ProjectView / deck-framework marker.
//   - `section.slide`        — narrowed `section` to avoid grabbing
//                              `<section>` wrappers that aren't slides.
//   - `.deck-slide` / `.ppt-slide` — agent-emitted variants used by some deck
//                                    prompts.
// All five must produce the same slide list whether the deck is being styled
// for print or being measured for a per-slide PNG, otherwise PDF and image
// exports drift apart on the same deck.
const DECK_SLIDE_SELECTOR =
  '.slide, [data-slide], [data-screen-label], section.slide, .deck-slide, .ppt-slide';

/** Horizontal carousel / stage wrappers that must not generate a print box. */
export const DECK_WRAPPER_SELECTOR =
  '.deck, .deck-shell, .deck-stage, #deck-stage, #deck, .stage';

/** Navigation, hints, and non-slide chrome hidden during deck PDF export. */
export const DECK_CHROME_HIDE_SELECTOR =
  '.deck-counter, .deck-hint, .deck-nav, #deck-prev, #deck-next, #deck-cur, #deck-total, #nav, #hint, canvas.bg, #overview, [aria-label="Previous slide"], [aria-label="Next slide"]';

function deckSlideSelectorList(): string[] {
  return DECK_SLIDE_SELECTOR.split(',').map((sel) => sel.trim());
}

/**
 * Print CSS shared by headless PDF and browser Save-as-PDF fallback.
 *
 * Deck-framework decks keep slides as `position:absolute; inset:0` stacked in a
 * 1920×1080 stage and hide inactive slides via
 * `.slide:not(.active) { display: none !important }` (specificity 0,2,1).
 * A naive `.slide { display:flex !important }` inside `@media print` loses
 * that cascade battle, so only the active slide prints and page-break never
 * fires — users see 1–2 squashed A4 pages instead of 12×1920×1080.
 *
 * This block mirrors packages/contracts `DECK_SKELETON_HTML` @media print
 * rules and adds the higher-specificity `.slide:not(.active)` override plus
 * horizontal-snap deck selectors.
 */
export function buildDeckFlattenCssRules(): string {
  return `${buildSharedDeckFlattenCssRules()}${buildDeckGuizangPrintFallbackCss()}`;
}

/** guizang-ppt relies on WebGL canvases + low-opacity ::before overlays. */
export function buildDeckGuizangPrintFallbackCss(): string {
  return buildSharedDeckGuizangPrintFallbackCss();
}

/** Screen-visible flatten rules for standalone HTML deck downloads. */
export function buildDeckScreenExportCss(): string {
  return buildDeckFlattenCssRules();
}

export { buildDeckSlideExportLayoutHelperJs } from '@open-design/contracts';

export function buildDeckPrintCss(): string {
  return buildSharedDeckPrintCss();
}
// Alpine's `chromium` package installs the real binary at /usr/bin/chromium.
// Debian bookworm ships `/usr/bin/chromium` as well. OD_EXPORT_CHROMIUM_PATH
// wins when set (production override). Playwright's bundled browser (when
// PLAYWRIGHT_BROWSERS_PATH is populated in the runtime image) is preferred
// over distro Chromium — bookworm `/usr/bin/chromium` can SIGTRAP in minimal
// containers even with --no-sandbox / --no-zygote.
export function isHeadlessChromiumUnavailableError(err: unknown): boolean {
  const reason = String((err as Error)?.message || err);
  // Match both the classic prose ("headless Chromium unavailable (tried
  // …)") and the structured code we send back over HTTP so callers on
  // either side of the daemon boundary can classify the failure.
  return (
    /headless Chromium unavailable/i.test(reason)
    || /HEADLESS_CHROMIUM_UNAVAILABLE/.test(reason)
  );
}

/** @deprecated alias — import-export routes export name */
export const isHeadlessChromiumUnavailableExportError = isHeadlessChromiumUnavailableError;

/**
 * Relative path segments from a `chromium-*` or `chromium_headless_shell-*`
 * directory to the executable. Playwright v1.49+ switched Linux layouts
 * from `chrome-linux/{chrome,headless_shell}` to
 * `chrome-linux64/chrome` and `chrome-headless-shell-linux64/chrome-headless-shell`.
 * We probe both so images built with either layout keep working.
 */
const PLAYWRIGHT_CHROMIUM_BINARY_LAYOUTS = {
  full: [
    ['chrome-linux64', 'chrome'],
    ['chrome-linux', 'chrome'],
  ],
  headlessShell: [
    ['chrome-headless-shell-linux64', 'chrome-headless-shell'],
    ['chrome-linux', 'headless_shell'],
  ],
} as const;

function playwrightChromiumBinaryCandidates(root: string, dirName: string): string[] {
  const layouts = dirName.startsWith('chromium_headless_shell-')
    ? PLAYWRIGHT_CHROMIUM_BINARY_LAYOUTS.headlessShell
    : dirName.startsWith('chromium-')
      ? PLAYWRIGHT_CHROMIUM_BINARY_LAYOUTS.full
      : [];
  return layouts.map((segments) => path.join(root, dirName, ...segments));
}

/**
 * Enumerate every Playwright-bundled Chromium binary in
 * `$PLAYWRIGHT_BROWSERS_PATH` (or the default `~/.cache/ms-playwright`).
 *
 * Playwright ships two flavors:
 *   - `chromium-<rev>/chrome-linux64/chrome` (v1.49+) or
 *     `chromium-<rev>/chrome-linux/chrome` (legacy) — full Chromium build.
 *   - `chromium_headless_shell-<rev>/chrome-headless-shell-linux64/chrome-headless-shell`
 *     (v1.49+) or `…/chrome-linux/headless_shell` (legacy) — the smaller
 *     headless-only shell used by `install --only-shell`.
 * Both are surfaced so the launcher can fall back to whichever the
 * runtime image actually contains. Newer revisions come first so we
 * prefer the currently-supported ABI when multiple installs coexist.
 */
export function resolvePlaywrightChromiumExecutables(): string[] {
  const root =
    process.env.PLAYWRIGHT_BROWSERS_PATH?.trim()
    || path.join(process.env.HOME?.trim() || '/tmp', '.cache', 'ms-playwright');
  const found: string[] = [];
  const seen = new Set<string>();
  const push = (candidate: string) => {
    if (fs.existsSync(candidate) && !seen.has(candidate)) {
      seen.add(candidate);
      found.push(candidate);
    }
  };
  const listDirs = (prefix: string): string[] => {
    try {
      return fs
        .readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix))
        .map((entry) => entry.name)
        .sort()
        .reverse();
    } catch {
      return [];
    }
  };

  // Full chromium first (executablePath 'chrome') because launch-time
  // Playwright APIs (page.pdf, page.screenshot) are validated only
  // against the full build. The headless_shell fallback is best-effort
  // in case the full build failed to install.
  for (const dirName of listDirs('chromium-')) {
    for (const candidate of playwrightChromiumBinaryCandidates(root, dirName)) {
      push(candidate);
    }
  }
  for (const dirName of listDirs('chromium_headless_shell-')) {
    for (const candidate of playwrightChromiumBinaryCandidates(root, dirName)) {
      push(candidate);
    }
  }
  return found;
}

/** @deprecated Kept for existing tests / callers; returns the top pick. */
export function resolvePlaywrightChromiumExecutable(): string | null {
  return resolvePlaywrightChromiumExecutables()[0] ?? null;
}

export function chromiumExecutableCandidates(): string[] {
  const ordered = [
    // Playwright-managed browsers come first: they ship the exact
    // libnss3/libnspr4 ABI the launcher was built against and do not
    // depend on Debian's distro chromium package (which SIGTRAPs in
    // minimal containers even with --no-sandbox / --no-zygote).
    ...resolvePlaywrightChromiumExecutables(),
    process.env.OD_EXPORT_CHROMIUM_PATH,
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/lib/chromium/chromium',
    '/usr/lib/chromium-browser/chromium-browser',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  return [...new Set(ordered)];
}

/** Writable dirs for distro Chromium inside read-only / no-home containers. */
export function chromiumRuntimePaths(): { configHome: string; cacheHome: string; crashDir: string } {
  const configHome = process.env.XDG_CONFIG_HOME?.trim() || '/tmp/.chromium';
  const cacheHome = process.env.XDG_CACHE_HOME?.trim() || configHome;
  return {
    configHome,
    cacheHome,
    crashDir: `${configHome}/chromium/Crashpad`,
  };
}

export function chromiumRuntimeEnv(): NodeJS.ProcessEnv {
  const { configHome, cacheHome } = chromiumRuntimePaths();
  return {
    ...process.env,
    DBUS_SESSION_BUS_ADDRESS: process.env.DBUS_SESSION_BUS_ADDRESS || 'disabled:',
    HOME: process.env.HOME?.trim() || configHome,
    XDG_CONFIG_HOME: configHome,
    XDG_CACHE_HOME: cacheHome,
  };
}

export function chromiumLaunchArgs(): string[] {
  const { crashDir } = chromiumRuntimePaths();
  // Order matters: `--headless=new` is safe on full Chromium but the
  // Playwright headless_shell binary already runs headless-only, so
  // passing the flag there is a no-op. `--no-sandbox` +
  // `--disable-setuid-sandbox` are needed because the runtime container
  // does not grant CAP_SYS_ADMIN (no user namespaces).
  const args = [
    '--headless=new',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-setuid-sandbox',
    '--no-sandbox',
    '--font-render-hinting=medium',
    '--disable-crash-reporter',
    '--disable-breakpad',
    '--disable-crashpad',
    '--no-zygote',
    '--no-crashpad',
    '--disable-software-rasterizer',
    `--crash-dumps-dir=${crashDir}`,
  ];
  // `--single-process` was previously enabled in production to sidestep
  // sandboxing on read-only containers, but headless Chromium ≥ M120 can
  // SIGTRAP inside its own IPC layer when run with a single process (the
  // renderer trips on GPU-thread init even with --disable-gpu). Default
  // off; keep OD_CHROMIUM_SINGLE_PROCESS=1 as an opt-in escape hatch for
  // hosts where the multi-process launch is definitively worse.
  if (process.env.OD_CHROMIUM_SINGLE_PROCESS === '1') {
    args.push('--single-process');
  }
  return args;
}

/**
 * Chromium launcher errors that are worth retrying once. The distro
 * Chromium in Debian bookworm occasionally SIGTRAPs on the first launch
 * inside a fresh container tmpfs (Playwright reports
 * `process did exit: exitCode=null, signal=SIGTRAP`), then succeeds on
 * the second try — the first launch appears to warm up
 * `/tmp/.chromium/*` and subsequent runs no longer trip. Timeouts and
 * connection resets also fall into this bucket.
 */
function isTransientChromiumLaunchError(reason: string): boolean {
  return (
    /SIGTRAP/i.test(reason)
    || /Timeout .* exceeded/i.test(reason)
    || /Target page, context or browser has been closed/i.test(reason)
    || /ECONNREFUSED|ECONNRESET|EPIPE/i.test(reason)
  );
}

/**
 * Chromium ≥ M120 refuses to initialize V8 in `--single-process` mode
 * (see `chrome/browser/net/system_network_context_manager.cc:979 —
 * "Cannot use V8 Proxy resolver in single process mode."`) and dies with
 * `signal=SIGTRAP`. When the launch failure log carries either signal,
 * silently strip `--single-process` and try the same executable again so
 * a stale `OD_CHROMIUM_SINGLE_PROCESS=1` env var (leftover from an old
 * compose file) can't take the whole export path down.
 */
function shouldRetryWithoutSingleProcess(reason: string, args: readonly string[]): boolean {
  if (!args.includes('--single-process')) return false;
  return (
    /Cannot use V8 Proxy resolver in single process mode/i.test(reason)
    || /SIGTRAP/i.test(reason)
    || /Target page, context or browser has been closed/i.test(reason)
  );
}

export function ensureChromiumRuntimeDirs(): void {
  const { configHome, cacheHome, crashDir } = chromiumRuntimePaths();
  for (const dir of [configHome, cacheHome, crashDir]) {
    try {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    } catch {
      // Best-effort — launch will surface a clearer error if still not writable.
    }
  }
}

export async function renderHeadlessPdf(
  options: HeadlessExportOptions,
  meta: Partial<ExportJobMeta> = {},
): Promise<Buffer> {
  return runHeadlessExportJob(
    { format: 'pdf', deck: options.input.deck === true, ...meta },
    async (browser) => {
      const page = await preparePage(browser, options);
      try {
        await waitForPrintableContent(page);
        await stripLeakedArtifactTextFromPage(page);
        // Flatten in screen media so getComputedStyle matches the live
        // preview layout; switching to print before reveal forced column
        // flex and white backgrounds from stale @media print rules.
        const deckSlideCount = options.input.deck ? await revealAllDeckSlides(page) : 0;
        if (options.input.deck && deckSlideCount === 0) {
          console.warn('[headless-export] deck PDF: no slides matched selector', {
            selector: DECK_SLIDE_SELECTOR,
            title: options.input.title,
          });
        }
        if (options.input.deck) {
          await page.emulateMedia({ media: 'print' });
        }
        await applyPdfStyles(page, options.input.deck);
        const pdf = await page.pdf(deckPdfOptions(options.input.deck, deckSlideCount));
        return Buffer.from(pdf);
      } finally {
        await page.close().catch(() => {});
      }
    },
  );
}

function deckPdfOptions(deck: boolean, _slideCount: number) {
  const base = {
    printBackground: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
    timeout: EXPORT_TIMEOUT_MS,
  } as const;
  if (!deck) {
    return {
      ...base,
      preferCSSPageSize: true,
      width: '1440px',
    };
  }
  // Pin 1920×1080 per page once every slide is a block-flow segment.
  // preferCSSPageSize alone fell back to A4 in headless Chromium; explicit
  // width/height matches OD desktop printToPDF sizing.
  return {
    ...base,
    preferCSSPageSize: false,
    width: `${DECK_WIDTH}px`,
    height: `${DECK_HEIGHT}px`,
  };
}

export async function renderHeadlessImage(
  options: HeadlessExportOptions,
  meta: Partial<ExportJobMeta> = {},
): Promise<Buffer> {
  return runHeadlessExportJob(
    { format: 'image', deck: options.input.deck === true, ...meta },
    async (browser) => {
      const page = await preparePage(browser, options, {
        deviceScaleFactor: IMAGE_DEVICE_SCALE_FACTOR,
      });
      try {
        await waitForPrintableContent(page);
        if (options.input.deck) {
          await resetDeckScreenshotLayout(page);
        }
        await inlineRenderedResources(page);
        await waitForPrintableContent(page);
        await applyScreenshotStyles(page, options.input.deck, options.slideIndex);
        if (options.input.deck) {
          await revealDeckSlideForScreenshot(page, options.slideIndex);
          await waitForPrintableContent(page);
          const clip = deckScreenshotClip();
          const image = await page.screenshot({
            ...imageScreenshotOptions(options.imageFormat),
            clip,
            timeout: EXPORT_TIMEOUT_MS,
          });
          return Buffer.from(image);
        }
        const image = await page.screenshot({
          ...imageScreenshotOptions(options.imageFormat),
          fullPage: true,
          timeout: EXPORT_TIMEOUT_MS,
        });
        return Buffer.from(image);
      } finally {
        await page.close().catch(() => {});
      }
    },
  );
}

export async function renderHeadlessHtmlSnapshot(
  options: HeadlessExportOptions,
  meta: Partial<ExportJobMeta> = {},
): Promise<string> {
  return runHeadlessExportJob(
    { format: 'html', deck: options.input.deck === true, ...meta },
    async (browser) => {
      const page = await preparePage(browser, options, { deckPrepareMode: 'html' });
      try {
        await waitForPrintableContent(page);
        await stripLeakedArtifactTextFromPage(page);
        if (options.input.deck) {
          const deckSlideCount = await revealAllDeckSlides(page);
          if (deckSlideCount === 0) {
            console.warn('[headless-export] deck HTML: no slides matched selector', {
              selector: DECK_SLIDE_SELECTOR,
              title: options.input.title,
            });
          }
          await applyHtmlDeckExportStyles(page);
        } else {
          await applySnapshotStyles(page, false);
        }
        await inlineRenderedResources(page);
        return await page.content();
      } finally {
        await page.close().catch(() => {});
      }
    },
  );
}

// Detail collected for each failed launch attempt. `executablePath` is
// intentionally `string | undefined` (not `?:`) because tsconfig's
// `exactOptionalPropertyTypes` forbids assigning `undefined` to an
// optional property; the bundled-fallback path pushes without an
// explicit path so we must be able to store `undefined`.
type LaunchAttempt = {
  executablePath: string | undefined;
  error: string;
  retryable: boolean;
};

async function launchChromium(): Promise<Browser> {
  const { chromium } = await dynamicImport('playwright-core');
  ensureChromiumRuntimeDirs();
  const attempts: LaunchAttempt[] = [];
  const baseArgs = chromiumLaunchArgs();
  const launchEnv = chromiumRuntimeEnv();
  const candidates = chromiumExecutableCandidates();

  const tryLaunch = async (
    executablePath: string | undefined,
    args: string[],
    label: string,
  ): Promise<Browser | null> => {
    try {
      const opts: Record<string, unknown> = {
        headless: true,
        args,
        env: launchEnv,
        timeout: EXPORT_TIMEOUT_MS,
      };
      if (executablePath) opts.executablePath = executablePath;
      return await chromium.launch(opts);
    } catch (err) {
      const message = String((err as any)?.message || err);
      attempts.push({
        executablePath,
        error: label ? `(${label}) ${message}` : message,
        retryable: isTransientChromiumLaunchError(message),
      });
      return null;
    }
  };

  /**
   * Attempt strategy per candidate:
   *   1. Try with the launcher's default args (may include
   *      `--single-process` if env forces it on).
   *   2. If the failure text matches
   *      `shouldRetryWithoutSingleProcess`, drop `--single-process` and
   *      retry the same executable — this is the classic Debian
   *      bookworm + M120 SIGTRAP path, and dropping the flag fixes it
   *      99% of the time.
   *   3. If still failing and the error is transient, wait 250ms and
   *      retry the reduced args once more (covers `/tmp` warm-up races).
   */
  const attemptCandidate = async (executablePath: string): Promise<Browser | null> => {
    const first = await tryLaunch(executablePath, baseArgs, '');
    if (first) return first;
    const firstErr = attempts[attempts.length - 1]?.error ?? '';

    let reducedArgs: string[] | null = null;
    if (shouldRetryWithoutSingleProcess(firstErr, baseArgs)) {
      reducedArgs = baseArgs.filter((arg) => arg !== '--single-process');
      const dropSingle = await tryLaunch(executablePath, reducedArgs, 'no-single-process');
      if (dropSingle) {
        console.warn('[headless-export] recovered by dropping --single-process', {
          executablePath,
        });
        return dropSingle;
      }
    }

    const lastErr = attempts[attempts.length - 1];
    if (lastErr?.retryable) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      const backoffArgs = reducedArgs ?? baseArgs;
      const backoff = await tryLaunch(executablePath, backoffArgs, 'retry');
      if (backoff) return backoff;
    }
    return null;
  };

  for (const executablePath of candidates) {
    if (!fs.existsSync(executablePath)) {
      attempts.push({
        executablePath,
        error: 'executable not found',
        retryable: false,
      });
      continue;
    }
    const browser = await attemptCandidate(executablePath);
    if (browser) return browser;
  }

  const skipBundled =
    process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD === '1' || process.env.NODE_ENV === 'production';
  if (!skipBundled) {
    const bundled = await tryLaunch(undefined, baseArgs, 'bundled');
    if (bundled) return bundled;
  }

  // Last-ditch: install Playwright Chromium into a writable tmpfs path
  // (`/tmp/playwright-browsers`) on the fly and retry. This is deliberately
  // slow (~120MB download) but keeps PDF export working even when the
  // baked image lost its `/ms-playwright` payload — a scenario we've seen
  // when Docker build caching skipped the install layer.
  const rescued = await tryRuntimeChromiumInstallAndLaunch(chromium, baseArgs, launchEnv, attempts);
  if (rescued) return rescued;

  console.warn('[headless-export] chromium launch failed', { attempts });
  // Keep the summary short: dump the full Playwright call log to daemon
  // logs (above) but only expose the concise "<path>: <reason>" line to
  // the FE so users do not see kilobytes of stack traces.
  const summary = attempts
    .map((entry) => {
      const reason = firstLineOf(entry.error) || 'unknown launch failure';
      return entry.executablePath ? `${entry.executablePath}: ${reason}` : reason;
    })
    .join('; ');
  throw new Error(
    `headless Chromium unavailable (tried ${attempts.length} path(s)): ${summary}`,
  );
}

/**
 * Fallback that installs Playwright Chromium at runtime into a writable
 * tmpfs location. Triggered only when every baked-in candidate has
 * failed. We cache the result so a burst of concurrent exports does not
 * fan out into many install processes.
 *
 * Disabled entirely by setting `OD_DISABLE_RUNTIME_CHROMIUM_INSTALL=1`
 * (some deployments prefer to hard-fail rather than pay the download
 * cost on the request path).
 */
let runtimeChromiumInstallPromise: Promise<string | null> | null = null;
async function tryRuntimeChromiumInstallAndLaunch(
  chromium: any,
  baseArgs: string[],
  launchEnv: NodeJS.ProcessEnv,
  attempts: LaunchAttempt[],
): Promise<Browser | null> {
  if (process.env.OD_DISABLE_RUNTIME_CHROMIUM_INSTALL === '1') return null;
  if (!runtimeChromiumInstallPromise) {
    runtimeChromiumInstallPromise = installPlaywrightChromiumToTmpfs();
  }
  let installedPath: string | null = null;
  try {
    installedPath = await runtimeChromiumInstallPromise;
  } catch (err) {
    attempts.push({
      executablePath: undefined,
      error: `(runtime-install) ${String((err as any)?.message || err)}`,
      retryable: false,
    });
    runtimeChromiumInstallPromise = null;
    return null;
  }
  if (!installedPath) {
    attempts.push({
      executablePath: undefined,
      error: '(runtime-install) no chromium binary produced',
      retryable: false,
    });
    return null;
  }
  const reducedArgs = baseArgs.filter((arg) => arg !== '--single-process');
  try {
    return await chromium.launch({
      executablePath: installedPath,
      headless: true,
      args: reducedArgs,
      env: launchEnv,
      timeout: EXPORT_TIMEOUT_MS,
    });
  } catch (err) {
    attempts.push({
      executablePath: installedPath,
      error: `(runtime-install-launch) ${String((err as any)?.message || err)}`,
      retryable: false,
    });
    return null;
  }
}

async function installPlaywrightChromiumToTmpfs(): Promise<string | null> {
  const target = process.env.OD_RUNTIME_CHROMIUM_DIR?.trim() || '/tmp/playwright-browsers';
  try {
    fs.mkdirSync(target, { recursive: true, mode: 0o755 });
  } catch (err) {
    console.warn('[headless-export] runtime-install: mkdir failed', {
      target,
      error: String((err as any)?.message || err),
    });
    return null;
  }

  // If a previous boot already dropped a chromium here, reuse it.
  const existing = findChromiumBinaryUnder(target);
  if (existing) {
    console.warn('[headless-export] runtime-install: reusing cached binary', {
      path: existing,
    });
    return existing;
  }

  const spec = process.env.OD_RUNTIME_CHROMIUM_SPEC?.trim() || 'playwright-core@1.60.0';
  console.warn('[headless-export] runtime-install: fetching chromium', { target, spec });
  const { spawn } = await import('node:child_process');
  const child = spawn(
    'npx',
    ['--yes', spec, 'install', 'chromium'],
    {
      env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: target },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const stderrChunks: Buffer[] = [];
  child.stderr?.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
  const status: number | null = await new Promise((resolve) => {
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {}
      resolve(null);
    }, 180_000);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
    child.on('error', () => {
      clearTimeout(timer);
      resolve(null);
    });
  });
  if (status !== 0) {
    console.warn('[headless-export] runtime-install: npx exited non-zero', {
      status,
      stderr: Buffer.concat(stderrChunks).toString('utf8').slice(0, 500),
    });
    return null;
  }
  return findChromiumBinaryUnder(target);
}

function findChromiumBinaryUnder(root: string): string | null {
  try {
    const dirs = fs
      .readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
      .reverse();
    for (const dir of dirs) {
      if (!dir.startsWith('chromium-') && !dir.startsWith('chromium_headless_shell-')) continue;
      for (const candidate of playwrightChromiumBinaryCandidates(root, dir)) {
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  } catch {}
  return null;
}

function firstLineOf(message: string): string {
  const idx = message.indexOf('\n');
  return idx === -1 ? message.trim() : message.slice(0, idx).trim();
}

async function dynamicImport(specifier: string): Promise<any> {
  return Function('specifier', 'return import(specifier)')(specifier);
}

/** Playwright evaluates string expressions; pass only the function body. */
async function evaluateInPage<T>(
  page: Page,
  fnBody: string,
  args: Record<string, unknown>,
): Promise<T> {
  const argJson = JSON.stringify(args);
  return page.evaluate(`(function(args){${fnBody}})(${argJson})`);
}

async function preparePage(
  browser: Browser,
  options: HeadlessExportOptions,
  pageOptions: { deviceScaleFactor?: number; deckPrepareMode?: 'pdf' | 'html' } = {},
): Promise<Page> {
  const page = await browser.newPage({
    viewport: {
      width: options.input.deck ? DECK_WIDTH : 1440,
      height: options.input.deck ? DECK_HEIGHT : 1200,
    },
    deviceScaleFactor: pageOptions.deviceScaleFactor ?? 1,
  });
  page.setDefaultTimeout(EXPORT_TIMEOUT_MS);
  page.setDefaultNavigationTimeout(EXPORT_TIMEOUT_MS);
  const html = options.input.deck
    ? pageOptions.deckPrepareMode === 'html'
      ? buildDeckExportHtml(options.input)
      : buildPrintableHtml(options.input)
    : repairArtifactDocumentHead(withBaseHref(options.input.html, options.input.baseHref || ''));
  // `load` (not `domcontentloaded`) ensures the deck framework's `fit()` /
  // scripts and stylesheets have run before we flatten slides for print.
  await page.setContent(html, {
    waitUntil: 'load',
    timeout: EXPORT_TIMEOUT_MS,
  });
  return page;
}

/** Remove truncated viewport / meta tails and other agent leaks in the live DOM. */
async function stripLeakedArtifactTextFromPage(page: Page): Promise<void> {
  await page.evaluate(buildArtifactPreviewDomLeakStripScript()).catch(() => {});
}

/**
 * Force every deck slide visible and stack them in block flow with explicit
 * page breaks. Inline `!important` styles beat deck-framework's
 * `.slide:not(.active) { display: none !important }` regardless of stylesheet
 * order or @media print specificity battles.
 */
export async function revealAllDeckSlides(page: Page): Promise<number> {
  const result = await evaluateInPage<{
    count: number;
    canvasBgAttempted: number;
    canvasBgRasterized: number;
    canvasBgFailed: number;
    canvasBgFailReasons: string[];
  }>(
    page,
    `
      const slides = Array.from(document.querySelectorAll(args.selector));
      if (slides.length === 0) {
        return { count: 0, canvasBgAttempted: 0, canvasBgRasterized: 0, canvasBgFailed: 0, canvasBgFailReasons: [] };
      }

      // Agents sometimes leak the deck title into <body> as a bare text node
      // (e.g. \`<body>AI 도입 효과 <style>…</style>…\`). Each leaked pixel of
      // body flow shifts every slide down and pushes the last N pixels of
      // each slide onto the next PDF page (empty page with just the footer
      // sliver). Remove non-whitespace text nodes that sit as direct
      // children of <html> / <body> so slides always start at y=0.
      const stripDeckLoosePageFlow = (root) => {
        if (!root || !root.childNodes) return;
        for (let i = root.childNodes.length - 1; i >= 0; i--) {
          const node = root.childNodes[i];
          if (node.nodeType === Node.TEXT_NODE) {
            if ((node.textContent || '').trim().length > 0) node.remove();
          }
        }
      };
      stripDeckLoosePageFlow(document.documentElement);
      stripDeckLoosePageFlow(document.body);

      const set = (el, prop, value) => el.style.setProperty(prop, value, 'important');

      // Layout helper below defines resolveSlidePaperBackground() — reused
      // for the html/body surface so light-theme decks don't get --shell (dark).
      ${buildDeckSlideExportLayoutHelperJs()}

      let canvasBgAttempted = 0;
      let canvasBgRasterized = 0;
      let canvasBgFailed = 0;
      const canvasBgFailReasons = [];
      document.querySelectorAll('canvas.bg').forEach((canvas) => {
        canvasBgAttempted += 1;
        try {
          const dataUrl = canvas.toDataURL('image/png');
          if (!dataUrl || dataUrl === 'data:,') {
            canvasBgFailed += 1;
            canvasBgFailReasons.push('empty-data-url');
            return;
          }
          const img = document.createElement('img');
          img.setAttribute('data-od-rasterized-bg', canvas.id || 'bg');
          img.src = dataUrl;
          set(img, 'position', 'fixed');
          set(img, 'inset', '0');
          set(img, 'width', '100%');
          set(img, 'height', '100%');
          set(img, 'z-index', '0');
          set(img, 'pointer-events', 'none');
          set(img, 'object-fit', 'cover');
          const opacity = window.getComputedStyle(canvas).opacity;
          if (opacity) set(img, 'opacity', opacity);
          canvas.replaceWith(img);
          canvasBgRasterized += 1;
        } catch (err) {
          canvasBgFailed += 1;
          // toDataURL on a WebGL canvas without preserveDrawingBuffer,
          // or a tainted canvas, is the common failure mode. Keep the
          // reason short but distinctive so daemon logs can group.
          const reason = err && err.name ? err.name : String(err || 'unknown').slice(0, 64);
          canvasBgFailReasons.push(reason);
        }
      });

      const pageSurfaceBg = resolveSlidePaperBackground();

      document.querySelectorAll(args.wrapperSelector).forEach((el) => {
        set(el, 'display', 'contents');
        set(el, 'transform', 'none');
        set(el, 'box-shadow', 'none');
      });

      set(document.documentElement, 'overflow', 'visible');
      set(document.documentElement, 'width', args.width + 'px');
      set(document.documentElement, 'background', pageSurfaceBg);
      set(document.body, 'overflow', 'visible');
      set(document.body, 'display', 'block');
      set(document.body, 'scroll-snap-type', 'none');
      set(document.body, 'transform', 'none');
      set(document.body, 'width', args.width + 'px');
      set(document.body, 'background', pageSurfaceBg);
      const totalHeight = slides.length * args.height;
      set(document.documentElement, 'height', totalHeight + 'px');
      set(document.body, 'height', totalHeight + 'px');
      set(document.body, 'margin', '0');

      slides.forEach((el, index) => {
        el.classList.add('active');
        applySlideExportLayout(el);
        set(el, 'flex', 'none');
        set(el, 'position', 'relative');
        set(el, 'inset', 'auto');
        set(el, 'width', args.width + 'px');
        set(el, 'height', args.height + 'px');
        set(el, 'min-height', args.height + 'px');
        set(el, 'max-height', args.height + 'px');
        set(el, 'background', resolveSlidePrintBackground(el));
        set(el, 'visibility', 'visible');
        set(el, 'opacity', '1');
        set(el, 'overflow', 'hidden');
        set(el, 'transform', 'none');
        set(el, 'page-break-after', index < slides.length - 1 ? 'always' : 'auto');
        set(el, 'break-after', index < slides.length - 1 ? 'page' : 'auto');
        set(el, 'break-inside', 'avoid');
        if (index === 0) {
          set(el, 'page-break-before', 'avoid');
          set(el, 'break-before', 'avoid');
        }
      });

      document.documentElement.style.setProperty('--deck-scale', '1');

      document
        .querySelectorAll(args.chromeHideSelector)
        .forEach((el) => set(el, 'display', 'none'));

      return {
        count: slides.length,
        canvasBgAttempted,
        canvasBgRasterized,
        canvasBgFailed,
        canvasBgFailReasons,
      };
    `,
    {
      selector: DECK_SLIDE_SELECTOR,
      wrapperSelector: DECK_WRAPPER_SELECTOR,
      chromeHideSelector: DECK_CHROME_HIDE_SELECTOR,
      width: DECK_WIDTH,
      height: DECK_HEIGHT,
    },
  ).catch((err: unknown) => {
    console.warn('[headless-export] revealAllDeckSlides failed', err);
    return { count: 0, canvasBgAttempted: 0, canvasBgRasterized: 0, canvasBgFailed: 0, canvasBgFailReasons: [] };
  });
  if (result.canvasBgFailed > 0) {
    // Currently the primary failure mode is WebGL contexts that were not
    // created with preserveDrawingBuffer:true — the resulting toDataURL
    // returns an empty buffer, which then falls back to the CSS/shell
    // background color. Emitting the summary here lets ops correlate
    // "blank first page" bug reports with template regressions.
    console.warn(
      JSON.stringify({
        metric: 'od_export_canvas_bg_rasterize',
        attempted: result.canvasBgAttempted,
        rasterized: result.canvasBgRasterized,
        failed: result.canvasBgFailed,
        reasons: Array.from(new Set(result.canvasBgFailReasons)).slice(0, 4),
      }),
    );
  }
  return Number.isFinite(result.count) ? result.count : 0;
}

async function waitForPrintableContent(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
  await page.evaluate(`
    (async () => {
      const fonts = document.fonts;
      if (fonts && fonts.ready) await fonts.ready.catch(() => {});

      await Promise.all(
        Array.from(document.images || []).map((img) => {
          if (img.complete) return Promise.resolve();
          return new Promise((resolve) => {
            img.addEventListener('load', () => resolve(), { once: true });
            img.addEventListener('error', () => resolve(), { once: true });
          });
        }),
      );

      const cssUrlValues = (value) => {
        const urls = [];
        if (!value || value === 'none') return urls;
        value.replace(/url\\((['"]?)(.*?)\\1\\)/g, (_, _quote, rawUrl) => {
          if (rawUrl && !/^data:/i.test(rawUrl)) urls.push(rawUrl);
          return '';
        });
        return urls;
      };

      const bgUrls = new Set();
      Array.from(document.querySelectorAll('*')).forEach((el) => {
        const style = window.getComputedStyle(el);
        cssUrlValues(style.backgroundImage).forEach((url) => bgUrls.add(url));
        cssUrlValues(style.borderImageSource).forEach((url) => bgUrls.add(url));
        cssUrlValues(style.listStyleImage).forEach((url) => bgUrls.add(url));
      });

      await Promise.all(
        Array.from(bgUrls).map(
          (url) =>
            new Promise((resolve) => {
              const img = new Image();
              img.onload = resolve;
              img.onerror = resolve;
              img.src = url;
            }),
        ),
      );

      await new Promise((resolve) => requestAnimationFrame(() => resolve()));
      await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    })()
  `).catch(() => {});
}

async function applyPdfStyles(page: Page, deck: boolean): Promise<void> {
  await page.addStyleTag({
    content: `
      html, body {
        margin: 0 !important;
        scrollbar-width: none !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        ${deck ? 'background: var(--shell, var(--bg, #ffffff)) !important;' : 'background: #fff !important;'}
      }
      *::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
      ${deck ? buildDeckPrintCss() : '@page { margin: 0; size: auto; }'}
    `,
  });
}

async function applyScreenshotStyles(page: Page, deck: boolean, slideIndex?: number): Promise<void> {
  await page.addStyleTag({
    content: `
      html, body {
        margin: 0 !important;
        scrollbar-width: none !important;
        ${deck ? '-webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;' : 'background: #fff !important;'}
      }
      *::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
      ${deck ? `
      html, body { width: ${DECK_WIDTH}px !important; min-height: ${DECK_HEIGHT}px !important; overflow: hidden !important; }
      ${DECK_SLIDE_SELECTOR} { overflow: hidden !important; }
      ${DECK_CHROME_HIDE_SELECTOR} {
        display: none !important;
      }` : ''}
    `,
  });
  if (deck) {
    // Selector must match DECK_SLIDE_SELECTOR so the slide picked here lines
    // up with the slide that was style-targeted in applyScreenshotStyles.
    await evaluateInPage(
      page,
      `
      const all = Array.from(document.querySelectorAll(args.selector));
      const slides = all.length > 0 ? all : [document.body];
      const target = slides[Math.max(0, Math.min(args.index, slides.length - 1))];
      target?.scrollIntoView({ block: 'start', inline: 'start' });
    `,
      {
        index: Number.isFinite(slideIndex) ? Math.max(0, Math.floor(slideIndex || 0)) : 0,
        selector: DECK_SLIDE_SELECTOR,
      },
    ).catch(() => {});
  }
}

async function revealDeckSlideForScreenshot(page: Page, slideIndex?: number): Promise<void> {
  await evaluateInPage(
    page,
    `
    const all = Array.from(document.querySelectorAll(args.selector));
    const slides = all.length > 0 ? all : [document.body];
    const index = Math.max(0, Math.min(args.index, slides.length - 1));
    const target = slides[index];
    const set = (el, prop, value) => el.style.setProperty(prop, value, 'important');

    set(document.documentElement, 'overflow', 'hidden');
    set(document.documentElement, 'width', args.width + 'px');
    set(document.documentElement, 'height', args.height + 'px');
    set(document.body, 'overflow', 'hidden');
    set(document.body, 'margin', '0');
    set(document.body, 'width', args.width + 'px');
    set(document.body, 'height', args.height + 'px');

    document.querySelectorAll(args.wrapperSelector).forEach((el) => {
      set(el, 'position', 'relative');
      set(el, 'display', 'block');
      set(el, 'inset', 'auto');
      set(el, 'overflow', 'hidden');
      set(el, 'width', args.width + 'px');
      set(el, 'height', args.height + 'px');
      set(el, 'min-height', args.height + 'px');
      set(el, 'transform', 'none');
      set(el, 'box-shadow', 'none');
    });

    slides.forEach((el) => {
      if (el !== target) {
        set(el, 'display', 'none');
        return;
      }
      set(el, 'display', 'flex');
      set(el, 'flex-direction', 'column');
      set(el, 'position', 'relative');
      set(el, 'inset', 'auto');
      set(el, 'width', args.width + 'px');
      set(el, 'height', args.height + 'px');
      set(el, 'min-height', args.height + 'px');
      set(el, 'max-height', args.height + 'px');
      set(el, 'visibility', 'visible');
      set(el, 'opacity', '1');
      set(el, 'overflow', 'hidden');
      set(el, 'transform', 'none');
    });
    target?.scrollIntoView({ block: 'start', inline: 'start' });
  `,
    {
      index: Number.isFinite(slideIndex) ? Math.max(0, Math.floor(slideIndex || 0)) : 0,
      selector: DECK_SLIDE_SELECTOR,
      wrapperSelector: DECK_WRAPPER_SELECTOR,
      width: DECK_WIDTH,
      height: DECK_HEIGHT,
    },
  ).catch(() => {});
}

async function applySnapshotStyles(page: Page, deck: boolean): Promise<void> {
  await page.addStyleTag({
    content: `
      html, body {
        margin: 0 !important;
        scrollbar-width: none !important;
        ${deck ? '-webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;' : 'background: #fff !important;'}
      }
      *::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
      ${deck ? `
      ${DECK_CHROME_HIDE_SELECTOR} {
        display: none !important;
      }` : ''}
    `,
  });
}

async function applyHtmlDeckExportStyles(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      html, body {
        margin: 0 !important;
        scrollbar-width: none !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      *::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
      ${buildDeckScreenExportCss()}
    `,
  });
}

async function inlineRenderedResources(page: Page): Promise<void> {
  await page.evaluate(`
    (async () => {
      const blobToDataUrl = (blob) =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
          reader.readAsDataURL(blob);
        });

      const absolutize = (url) => {
        try { return new URL(url, document.baseURI).href; } catch { return ''; }
      };

      const resolveCssHref = (rawUrl, cssHref) => {
        if (/^\\/assets\\//.test(rawUrl)) {
          const distIndex = cssHref.indexOf('/dist/');
          if (distIndex >= 0) return cssHref.slice(0, distIndex + '/dist/'.length) + rawUrl.slice(1);
        }
        return new URL(rawUrl, cssHref).href;
      };

      const inlineCssUrls = async (cssText, cssHref, seen = new Set()) => {
        if (seen.has(cssHref)) return cssText;
        seen.add(cssHref);
        const imports = Array.from(cssText.matchAll(/@import\\s+(?:url\\()?['"]?([^'")\\s;]+)['"]?\\)?\\s*;/g));
        let output = cssText;
        await Promise.all(imports.map(async (match) => {
          const rawUrl = match[1];
          if (!rawUrl || /^data:/i.test(rawUrl)) return;
          try {
            const href = resolveCssHref(rawUrl, cssHref);
            const resp = await fetch(href, { credentials: 'include' });
            if (!resp.ok) return;
            const imported = await inlineCssUrls(await resp.text(), href, seen);
            output = output.split(match[0]).join(imported);
          } catch {}
        }));

        const matches = Array.from(output.matchAll(/url\\((['"]?)(.*?)\\1\\)/g));
        await Promise.all(matches.map(async (match) => {
          const rawUrl = match[2];
          if (!rawUrl || /^data:/i.test(rawUrl) || /^#/.test(rawUrl)) return;
          try {
            const href = resolveCssHref(rawUrl, cssHref);
            const resp = await fetch(href, { credentials: 'include' });
            if (!resp.ok) return;
            output = output.split(match[0]).join('url("' + await blobToDataUrl(await resp.blob()) + '")');
          } catch {}
        }));
        return output;
      };

      await Promise.all(Array.from(document.querySelectorAll('link[rel~="stylesheet"][href]')).map(async (link) => {
        try {
          const href = absolutize(link.getAttribute('href') || '');
          if (!href) return;
          const resp = await fetch(href, { credentials: 'include' });
          if (!resp.ok) return;
          const style = document.createElement('style');
          style.setAttribute('data-od-rendered-inline', href);
          style.textContent = await inlineCssUrls(await resp.text(), href);
          link.replaceWith(style);
        } catch {}
      }));

      await Promise.all(Array.from(document.images || []).map(async (img) => {
        try {
          const src = img.currentSrc || img.getAttribute('src') || '';
          if (!src || /^data:/i.test(src)) return;
          const href = absolutize(src);
          if (!href) return;
          const resp = await fetch(href, { credentials: 'include' });
          if (!resp.ok) return;
          img.setAttribute('src', await blobToDataUrl(await resp.blob()));
          img.removeAttribute('srcset');
        } catch {}
      }));

      const cssUrlValues = (value) => {
        const urls = [];
        if (!value || value === 'none') return urls;
        value.replace(/url\\((['"]?)(.*?)\\1\\)/g, (_, _quote, rawUrl) => {
          if (rawUrl && !/^data:/i.test(rawUrl)) urls.push(rawUrl);
          return '';
        });
        return urls;
      };

      await Promise.all(Array.from(document.querySelectorAll('*')).map(async (el) => {
        try {
          const style = window.getComputedStyle(el);
          const bg = cssUrlValues(style.backgroundImage)[0];
          if (!bg) return;
          const href = absolutize(bg);
          if (!href) return;
          const resp = await fetch(href, { credentials: 'include' });
          if (!resp.ok) return;
          el.style.backgroundImage = 'url("' + await blobToDataUrl(await resp.blob()) + '")';
        } catch {}
      }));

      document.querySelectorAll('base').forEach((base) => base.remove());
      document.querySelectorAll('script').forEach((script) => script.remove());
    })()
  `).catch(() => {});
}

async function resetDeckScreenshotLayout(page: Page): Promise<void> {
  await evaluateInPage(
    page,
    `
    const set = (el, prop, value) => el.style.setProperty(prop, value, 'important');
    document.querySelectorAll(args.wrapperSelector).forEach((el) => {
      set(el, 'transform', 'none');
      set(el, 'box-shadow', 'none');
    });
    set(document.documentElement, 'width', args.width + 'px');
    set(document.documentElement, 'height', args.height + 'px');
    set(document.body, 'width', args.width + 'px');
    set(document.body, 'height', args.height + 'px');
    set(document.body, 'margin', '0');
    document.documentElement.style.setProperty('--deck-scale', '1');
  `,
    { width: DECK_WIDTH, height: DECK_HEIGHT, wrapperSelector: DECK_WRAPPER_SELECTOR },
  ).catch(() => {});
}

function deckScreenshotClip(): { x: number; y: number; width: number; height: number } {
  // Pin the slide frame — getBoundingClientRect drifts when deck fit() scaled
  // the stage in the preview viewport, producing cropped or letterboxed PNGs.
  return { x: 0, y: 0, width: DECK_WIDTH, height: DECK_HEIGHT };
}

export { deckScreenshotClip as deckScreenshotClipRect };

function buildDeckExportBaseHtml(input: DesktopExportPdfInput): string {
  let doc = patchArtifactDeckPrintCss(
    repairArtifactDocumentHead(withBaseHref(input.html, input.baseHref || '')),
  );
  doc = injectTitle(doc, input.title);
  return doc;
}

function buildDeckExportHtml(input: DesktopExportPdfInput): string {
  return buildDeckExportBaseHtml(input);
}

function buildPrintableHtml(input: DesktopExportPdfInput): string {
  return injectPrintStylesheet(buildDeckExportBaseHtml(input), buildDeckPrintCss());
}

/** @deprecated Use patchArtifactDeckPrintCss from @open-design/contracts */
export function patchArtifactDeckPrintBackground(doc: string): string {
  return patchArtifactDeckPrintCss(doc);
}

function injectTitle(doc: string, title: string): string {
  const tag = `<title>${escapeHtmlText(title)}</title>`;
  if (/<title[^>]*>.*?<\/title>/is.test(doc)) return doc.replace(/<title[^>]*>.*?<\/title>/is, tag);
  if (/<head[^>]*>/i.test(doc)) return doc.replace(/<head[^>]*>/i, (match) => `${match}${tag}`);
  if (/<html[^>]*>/i.test(doc)) return doc.replace(/<html[^>]*>/i, (match) => `${match}<head>${tag}</head>`);
  return `<!doctype html><html><head>${tag}</head><body>${doc}</body></html>`;
}

function injectPrintStylesheet(doc: string, css: string): string {
  const tag = `<style data-od-headless-pdf>${css}</style>`;
  if (/<\/head>/i.test(doc)) return doc.replace(/<\/head>/i, `${tag}</head>`);
  if (/<head[^>]*>/i.test(doc)) return doc.replace(/<head[^>]*>/i, (match) => `${match}${tag}`);
  return `${tag}${doc}`;
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function withBaseHref(html: string, baseHref: string): string {
  const safeBase = escapeHtmlAttribute(baseHref);
  const baseTag = `<base href="${safeBase}">`;
  if (/<base\b/i.test(html)) return html;
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`);
  return `<!doctype html><html><head>${baseTag}</head><body>${html}</body></html>`;
}

function normalizedImageFormat(format: HeadlessImageFormat | undefined): 'png' | 'jpeg' | 'webp' {
  if (format === 'jpeg') return 'jpeg';
  if (format === 'webp') return 'webp';
  return 'png';
}

export function imageScreenshotOptions(format: HeadlessImageFormat | undefined): Record<string, unknown> {
  const type = normalizedImageFormat(format);
  return {
    type,
    // PNG can preserve transparent artifacts. JPEG/WebP cannot, so force the
    // white stage background we already inject in applyScreenshotStyles.
    omitBackground: type === 'png',
    ...(type === 'jpeg' || type === 'webp' ? { quality: 96 } : {}),
  };
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Log which chromium binaries the launcher can see at boot so ops can
 * catch a broken image (missing Playwright download, wrong compose
 * env) before the first user PDF export fails. Emits one structured
 * line per candidate — grep for `od_chromium_boot` in daemon logs.
 */
export function logChromiumAvailabilityAtBoot(): void {
  const candidates = chromiumExecutableCandidates();
  const summary = candidates.map((executablePath) => ({
    executablePath,
    exists: fs.existsSync(executablePath),
  }));
  const anyAvailable = summary.some((entry) => entry.exists);
  const level = anyAvailable ? 'info' : 'error';
  const payload = {
    marker: 'od_chromium_boot',
    playwrightBrowsersPath: process.env.PLAYWRIGHT_BROWSERS_PATH || null,
    odExportChromiumPath: process.env.OD_EXPORT_CHROMIUM_PATH || null,
    odChromiumSingleProcess: process.env.OD_CHROMIUM_SINGLE_PROCESS === '1',
    launchArgsIncludeSingleProcess: chromiumLaunchArgs().includes('--single-process'),
    candidates: summary,
    anyAvailable,
  };
  if (level === 'error') {
    console.error('[headless-export] boot: no chromium binaries found', payload);
  } else {
    console.info('[headless-export] boot: chromium ready', payload);
  }
}

/**
 * Actively probe headless Chromium at daemon startup. Runs
 * `launchChromium()` (with the same self-healing / retry pipeline the
 * export routes use) and immediately closes the browser. Emits a
 * structured `od_chromium_warmup` log so ops can verify PDF export is
 * functional the moment the container comes up, instead of discovering
 * a broken image only when a user clicks "PDF 다운로드".
 *
 * Optional strict mode (`OD_CHROMIUM_BOOT_WARMUP=strict`) exits the
 * process with a non-zero code so the orchestrator restarts the pod;
 * default behaviour keeps the daemon alive so unrelated features (chat,
 * BYOK, project sync) still work while ops investigates.
 *
 * Disable entirely with `OD_CHROMIUM_BOOT_WARMUP=off` (useful for unit
 * tests and CI environments where Chromium isn't available).
 */
export async function warmupHeadlessChromiumAtBoot(): Promise<void> {
  const mode = (process.env.OD_CHROMIUM_BOOT_WARMUP || '').trim().toLowerCase();
  if (mode === 'off' || mode === '0' || mode === 'false') return;
  const strict = mode === 'strict';
  const startedAt = Date.now();
  let browser: Awaited<ReturnType<typeof launchChromium>> | null = null;
  try {
    browser = await launchChromium();
    const elapsedMs = Date.now() - startedAt;
    console.info('[headless-export] boot: chromium warm-up ok', {
      marker: 'od_chromium_warmup',
      elapsedMs,
    });
  } catch (err) {
    const elapsedMs = Date.now() - startedAt;
    const reason = err instanceof Error ? err.message : String(err ?? '');
    console.error('[headless-export] boot: chromium warm-up FAILED', {
      marker: 'od_chromium_warmup',
      elapsedMs,
      strict,
      // First line only — the full attempts array is already dumped by
      // launchChromium() above. Keep this payload greppable.
      reason: firstLineOf(reason),
    });
    if (strict) {
      console.error(
        '[headless-export] OD_CHROMIUM_BOOT_WARMUP=strict — exiting so orchestrator restarts the container',
      );
      // Prefer process.exit over throwing so the failure is not swallowed
      // by a downstream .catch() that only logs. Exit code 78 (EX_CONFIG,
      // BSD sysexits) signals a configuration/environmental failure to
      // supervisors that inspect codes.
      process.exit(78);
    }
    return;
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // Best-effort: an already-dying browser is fine, we care about
        // the launch signal, not the teardown path.
      }
    }
  }
}

bindExportBrowserLauncher(() => launchChromium());
logChromiumAvailabilityAtBoot();
// Fire-and-forget: the warm-up promise must not block module import.
// It's harmless to have export routes handle an in-flight warm-up
// because launchChromium is called per-export anyway.
void warmupHeadlessChromiumAtBoot();
