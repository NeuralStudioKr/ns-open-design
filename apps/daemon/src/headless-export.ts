import type { DesktopExportPdfInput } from '@open-design/sidecar-proto';

type Browser = any;
type Page = any;

export type HeadlessImageFormat = 'png' | 'jpeg' | 'webp';

export interface HeadlessExportOptions {
  input: DesktopExportPdfInput;
  imageFormat?: HeadlessImageFormat;
  slideIndex?: number;
}

const EXPORT_TIMEOUT_MS = 30_000;
const DECK_WIDTH = 1920;
const DECK_HEIGHT = 1080;
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
// Alpine's `chromium` package installs the real binary at /usr/bin/chromium
// and ships /usr/bin/chromium-browser as a symlink. Some minimised images
// drop the symlink to save space, so list both and let launchChromium try
// them in order. OD_EXPORT_CHROMIUM_PATH wins when set (production override).
const CHROMIUM_CANDIDATES = [
  process.env.OD_EXPORT_CHROMIUM_PATH,
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
].filter(Boolean) as string[];

let queue: Promise<void> = Promise.resolve();

export async function renderHeadlessPdf(options: HeadlessExportOptions): Promise<Buffer> {
  return runExclusive(async () => {
    const browser = await launchChromium();
    try {
      const page = await preparePage(browser, options);
      await applyPdfStyles(page, options.input.deck);
      // Rely on CSS `@page { size: 1920px 1080px }` from applyPdfStyles via
      // `preferCSSPageSize: true`. Passing width/height here would override
      // the CSS @page rule and collapse multi-slide decks to a single page
      // (Chromium ignores per-slide break-after when an explicit page size
      // is supplied alongside `preferCSSPageSize`).
      const pdf = await page.pdf({
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
        timeout: EXPORT_TIMEOUT_MS,
      });
      return Buffer.from(pdf);
    } finally {
      await browser.close().catch(() => {});
    }
  });
}

export async function renderHeadlessImage(options: HeadlessExportOptions): Promise<Buffer> {
  return runExclusive(async () => {
    const browser = await launchChromium();
    try {
      const page = await preparePage(browser, options);
      await applyScreenshotStyles(page, options.input.deck, options.slideIndex);
      if (options.input.deck) {
        const clip = await deckScreenshotClip(page, options.slideIndex);
        const image = await page.screenshot({
          type: normalizedImageFormat(options.imageFormat),
          clip,
          timeout: EXPORT_TIMEOUT_MS,
        });
        return Buffer.from(image);
      }
      const image = await page.screenshot({
        type: normalizedImageFormat(options.imageFormat),
        fullPage: true,
        timeout: EXPORT_TIMEOUT_MS,
      });
      return Buffer.from(image);
    } finally {
      await browser.close().catch(() => {});
    }
  });
}

async function runExclusive<T>(work: () => Promise<T>): Promise<T> {
  const previous = queue;
  let release!: () => void;
  queue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous.catch(() => {});
  try {
    return await work();
  } finally {
    release();
  }
}

async function launchChromium(): Promise<Browser> {
  const { chromium } = await dynamicImport('playwright-core');
  const attempts: Array<{ executablePath?: string; error: string }> = [];
  for (const executablePath of CHROMIUM_CANDIDATES) {
    try {
      return await chromium.launch({
        executablePath,
        headless: true,
        args: [
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-setuid-sandbox',
          '--no-sandbox',
          '--font-render-hinting=medium',
        ],
        timeout: EXPORT_TIMEOUT_MS,
      });
    } catch (err) {
      attempts.push({ executablePath, error: String((err as any)?.message || err) });
    }
  }
  try {
    // Final fallback — let Playwright pick up a bundled Chromium / system
    // default if one was installed via `npx playwright install`. Mostly
    // relevant for local dev where OD_EXPORT_CHROMIUM_PATH isn't set and
    // none of the Alpine/Debian package paths apply.
    return await chromium.launch({
      headless: true,
      args: ['--disable-dev-shm-usage', '--disable-gpu', '--no-sandbox'],
      timeout: EXPORT_TIMEOUT_MS,
    });
  } catch (err) {
    // Omit `executablePath` — with exactOptionalPropertyTypes an optional
    // `string` property cannot be explicitly set to `undefined`.
    attempts.push({ error: String((err as any)?.message || err) });
    // Surface the full attempt log to stderr so operators can see which
    // candidate paths exist on disk vs which actually failed to launch.
    console.warn('[headless-export] chromium launch failed', { attempts });
    const lastError = attempts.at(-1)?.error ?? String(err);
    throw new Error(
      `headless Chromium unavailable (tried ${attempts.length} path(s)): ${lastError}`,
    );
  }
}

async function dynamicImport(specifier: string): Promise<any> {
  return Function('specifier', 'return import(specifier)')(specifier);
}

async function preparePage(browser: Browser, options: HeadlessExportOptions): Promise<Page> {
  const page = await browser.newPage({
    viewport: {
      width: options.input.deck ? DECK_WIDTH : 1440,
      height: options.input.deck ? DECK_HEIGHT : 1200,
    },
    deviceScaleFactor: 1,
  });
  page.setDefaultTimeout(EXPORT_TIMEOUT_MS);
  page.setDefaultNavigationTimeout(EXPORT_TIMEOUT_MS);
  // `load` (not `domcontentloaded`) ensures the deck framework's `fit()` /
  // scripts and stylesheets have run before applyPdfStyles attaches the
  // print overrides that need to defeat the runtime transform/scale.
  await page.setContent(withBaseHref(options.input.html, options.input.baseHref || ''), {
    waitUntil: 'load',
    timeout: EXPORT_TIMEOUT_MS,
  });
  await waitForPageSettled(page);
  return page;
}

async function waitForPageSettled(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
  await page.evaluate(`
    (async () => {
      const fonts = document.fonts;
      if (fonts && fonts.ready) await fonts.ready.catch(() => {});
      await Promise.all(Array.from(document.images).map((img) => {
        if (img.complete) return undefined;
        return new Promise((resolve) => {
          img.addEventListener('load', () => resolve(), { once: true });
          img.addEventListener('error', () => resolve(), { once: true });
        });
      }));
    })()
  `).catch(() => {});
}

async function applyPdfStyles(page: Page, deck: boolean): Promise<void> {
  // Mirrors apps/web/src/runtime/exports.ts DECK_PRINT_CSS so the headless
  // and browser-print paths render decks the same way:
  //   - horizontal-snap / flex track decks are flattened to block flow with
  //     one page per slide (override the framework's display:flex /
  //     overflow:hidden / scroll-snap rules).
  //   - deck-framework `fit()` transform is neutralised so the 1920x1080
  //     stage prints at native size instead of a scaled-down sliver.
  //   - all preview chrome (counter, prev/next, nav, deck-stage hints) is
  //     hidden so the PDF only contains the slide content.
  //   - scrollbars are removed in both webkit and firefox-based renderers.
  await page.addStyleTag({
    content: `
      html, body { margin: 0 !important; background: #fff !important; scrollbar-width: none !important; }
      body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      *::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
      ${deck ? `
      @media print {
        @page { size: ${DECK_WIDTH}px ${DECK_HEIGHT}px; margin: 0; }
        html, body {
          width: ${DECK_WIDTH}px !important;
          height: auto !important;
          overflow: visible !important;
          background: #fff !important;
        }
        body {
          display: block !important;
          scroll-snap-type: none !important;
          transform: none !important;
        }
        .deck-shell, .deck-stage, .stage {
          transform: none !important;
          width: ${DECK_WIDTH}px !important;
          height: ${DECK_HEIGHT}px !important;
          inset: auto !important;
          position: relative !important;
          place-content: flex-start !important;
          overflow: visible !important;
        }
        ${DECK_SLIDE_SELECTOR} {
          flex: none !important;
          width: ${DECK_WIDTH}px !important;
          height: ${DECK_HEIGHT}px !important;
          min-height: ${DECK_HEIGHT}px !important;
          max-height: ${DECK_HEIGHT}px !important;
          page-break-after: always;
          break-after: page;
          scroll-snap-align: none !important;
          transform: none !important;
          position: relative !important;
          overflow: hidden !important;
        }
        ${DECK_SLIDE_SELECTOR.split(',').map((sel) => `${sel.trim()}:last-child`).join(', ')} {
          page-break-after: auto;
          break-after: auto;
        }
        .deck-counter, .deck-hint, .deck-nav,
        #deck-prev, #deck-next, #deck-cur, #deck-total,
        [aria-label="Previous slide"], [aria-label="Next slide"] {
          display: none !important;
        }
      }` : `
      @page { margin: 0; }`}
    `,
  });
}

async function applyScreenshotStyles(page: Page, deck: boolean, slideIndex?: number): Promise<void> {
  await page.addStyleTag({
    content: `
      html, body { margin: 0 !important; background: #fff !important; scrollbar-width: none !important; }
      *::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
      ${deck ? `
      html, body { width: ${DECK_WIDTH}px !important; min-height: ${DECK_HEIGHT}px !important; overflow: hidden !important; }
      ${DECK_SLIDE_SELECTOR} { overflow: hidden !important; }
      .deck-counter, .deck-hint, .deck-nav,
      #deck-prev, #deck-next, #deck-cur, #deck-total,
      [aria-label="Previous slide"], [aria-label="Next slide"] {
        display: none !important;
      }` : ''}
    `,
  });
  if (deck) {
    // Selector must match DECK_SLIDE_SELECTOR so the slide picked here lines
    // up with the slide that was style-targeted in applyScreenshotStyles.
    await page.evaluate(`(args) => {
      const all = Array.from(document.querySelectorAll(args.selector));
      const slides = all.length > 0 ? all : [document.body];
      const target = slides[Math.max(0, Math.min(args.index, slides.length - 1))];
      target?.scrollIntoView({ block: 'start', inline: 'start' });
    }`, {
      index: Number.isFinite(slideIndex) ? Math.max(0, Math.floor(slideIndex || 0)) : 0,
      selector: DECK_SLIDE_SELECTOR,
    }).catch(() => {});
  }
}

async function deckScreenshotClip(page: Page, slideIndex?: number) {
  const fallback = { x: 0, y: 0, width: DECK_WIDTH, height: DECK_HEIGHT };
  const box = await page.evaluate(`(args) => {
    const all = Array.from(document.querySelectorAll(args.selector));
    const slides = all.length > 0 ? all : [document.body];
    const target = slides[Math.max(0, Math.min(args.index, slides.length - 1))];
    if (!target) return null;
    const rect = target.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: Math.max(0, rect.left + window.scrollX),
      y: Math.max(0, rect.top + window.scrollY),
      width: Math.max(1, rect.width),
      height: Math.max(1, rect.height),
    };
  }`, {
    index: Number.isFinite(slideIndex) ? Math.max(0, Math.floor(slideIndex || 0)) : 0,
    selector: DECK_SLIDE_SELECTOR,
  }).catch(() => null);
  if (!box) return fallback;
  return {
    x: Math.round(box.x),
    y: Math.round(box.y),
    width: Math.round(Math.min(Math.max(box.width, 1), DECK_WIDTH * 2)),
    height: Math.round(Math.min(Math.max(box.height, 1), DECK_HEIGHT * 2)),
  };
}

function withBaseHref(html: string, baseHref: string): string {
  const safeBase = escapeHtmlAttribute(baseHref);
  const baseTag = `<base href="${safeBase}">`;
  if (/<base\b/i.test(html)) return html;
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`);
  return `<!doctype html><html><head>${baseTag}</head><body>${html}</body></html>`;
}

function normalizedImageFormat(format: HeadlessImageFormat | undefined): 'png' | 'jpeg' {
  return format === 'jpeg' ? 'jpeg' : 'png';
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
