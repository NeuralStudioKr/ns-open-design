import fs from 'node:fs';

import type { DesktopExportPdfInput } from '@open-design/sidecar-proto';
import {
  repairArtifactDocumentHead,
  ARTIFACT_VIEWPORT_DOM_TEXT_LEAK_SOURCE,
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
// wins when set (production override). Playwright's bundled browsers are glibc
// only — never used in production containers (PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1).
export function chromiumExecutableCandidates(): string[] {
  const ordered = [
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
    HOME: process.env.HOME?.trim() || configHome,
    XDG_CONFIG_HOME: configHome,
    XDG_CACHE_HOME: cacheHome,
  };
}

export function chromiumLaunchArgs(): string[] {
  const { crashDir } = chromiumRuntimePaths();
  return [
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-setuid-sandbox',
    '--no-sandbox',
    '--font-render-hinting=medium',
    '--disable-crash-reporter',
    '--disable-breakpad',
    '--no-crashpad',
    `--crash-dumps-dir=${crashDir}`,
  ];
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
        if (options.input.deck) {
          await page.emulateMedia({ media: 'print' });
        }
        await stripLeakedArtifactTextFromPage(page);
        const deckSlideCount = options.input.deck ? await revealAllDeckSlides(page) : 0;
        if (options.input.deck && deckSlideCount === 0) {
          console.warn('[headless-export] deck PDF: no slides matched selector', {
            selector: DECK_SLIDE_SELECTOR,
            title: options.input.title,
          });
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
      const page = await preparePage(browser, options);
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

async function launchChromium(): Promise<Browser> {
  const { chromium } = await dynamicImport('playwright-core');
  ensureChromiumRuntimeDirs();
  const attempts: Array<{ executablePath?: string; error: string }> = [];
  const launchArgs = chromiumLaunchArgs();
  const launchEnv = chromiumRuntimeEnv();
  for (const executablePath of chromiumExecutableCandidates()) {
    if (!fs.existsSync(executablePath)) {
      attempts.push({ executablePath, error: 'executable not found' });
      continue;
    }
    try {
      return await chromium.launch({
        executablePath,
        headless: true,
        args: launchArgs,
        env: launchEnv,
        timeout: EXPORT_TIMEOUT_MS,
      });
    } catch (err) {
      attempts.push({ executablePath, error: String((err as any)?.message || err) });
    }
  }
  const skipBundled =
    process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD === '1' || process.env.NODE_ENV === 'production';
  if (!skipBundled) {
    try {
      return await chromium.launch({
        headless: true,
        args: launchArgs,
        env: launchEnv,
        timeout: EXPORT_TIMEOUT_MS,
      });
    } catch (err) {
      attempts.push({ error: String((err as any)?.message || err) });
    }
  }
  console.warn('[headless-export] chromium launch failed', { attempts });
  const summary = attempts
    .map((entry) =>
      entry.executablePath ? `${entry.executablePath}: ${entry.error}` : entry.error,
    )
    .join('; ');
  throw new Error(
    `headless Chromium unavailable (tried ${attempts.length} path(s)): ${summary}`,
  );
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
  pageOptions: { deviceScaleFactor?: number } = {},
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
    ? buildPrintableHtml(options.input)
    : repairArtifactDocumentHead(withBaseHref(options.input.html, options.input.baseHref || ''));
  // `load` (not `domcontentloaded`) ensures the deck framework's `fit()` /
  // scripts and stylesheets have run before we flatten slides for print.
  await page.setContent(html, {
    waitUntil: 'load',
    timeout: EXPORT_TIMEOUT_MS,
  });
  return page;
}

/** Remove truncated viewport / meta tails that survived string repair into the DOM. */
async function stripLeakedArtifactTextFromPage(page: Page): Promise<void> {
  await evaluateInPage(
    page,
    `
      const leak = new RegExp(${JSON.stringify(ARTIFACT_VIEWPORT_DOM_TEXT_LEAK_SOURCE)}, 'i');
      const walk = (root) => {
        for (const node of Array.from(root.childNodes)) {
          if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent || '';
            if (leak.test(text)) node.remove();
            continue;
          }
          if (node.nodeType === Node.ELEMENT_NODE) walk(node);
        }
      };
      if (document.head) walk(document.head);
      if (document.body) walk(document.body);
    `,
    {},
  ).catch(() => {});
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

      const set = (el, prop, value) => el.style.setProperty(prop, value, 'important');

      const rootStyle = window.getComputedStyle(document.documentElement);
      const resolveShellBackground = () =>
        rootStyle.getPropertyValue('--shell').trim() ||
        rootStyle.getPropertyValue('--bg').trim() ||
        rootStyle.getPropertyValue('--ink').trim() ||
        rootStyle.getPropertyValue('background-color').trim() ||
        '#0a0c10';

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

      const shellBg = resolveShellBackground();

      document.querySelectorAll(args.wrapperSelector).forEach((el) => {
        set(el, 'display', 'contents');
        set(el, 'transform', 'none');
        set(el, 'box-shadow', 'none');
      });

      set(document.documentElement, 'overflow', 'visible');
      set(document.documentElement, 'width', args.width + 'px');
      set(document.documentElement, 'background', shellBg);
      set(document.body, 'overflow', 'visible');
      set(document.body, 'display', 'block');
      set(document.body, 'scroll-snap-type', 'none');
      set(document.body, 'transform', 'none');
      set(document.body, 'width', args.width + 'px');
      set(document.body, 'background', shellBg);
      const totalHeight = slides.length * args.height;
      set(document.documentElement, 'height', totalHeight + 'px');
      set(document.body, 'height', totalHeight + 'px');
      set(document.body, 'margin', '0');

      ${buildDeckSlideExportLayoutHelperJs()}

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

function buildPrintableHtml(input: DesktopExportPdfInput): string {
  let doc = patchArtifactDeckPrintCss(
    repairArtifactDocumentHead(withBaseHref(input.html, input.baseHref || '')),
  );
  doc = injectTitle(doc, input.title);
  return injectPrintStylesheet(doc, buildDeckPrintCss());
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

bindExportBrowserLauncher(() => launchChromium());
