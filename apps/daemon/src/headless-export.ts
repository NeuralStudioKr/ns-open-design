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
export function buildDeckPrintCss(): string {
  const slides = deckSlideSelectorList().join(', ');
  const slidesNotActive = deckSlideSelectorList().map((sel) => `${sel}:not(.active)`).join(', ');
  const slidesLastChild = deckSlideSelectorList().map((sel) => `${sel}:last-child`).join(', ');
  return `
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
  .deck-shell {
    position: static !important;
    display: block !important;
    inset: auto !important;
    overflow: visible !important;
    width: ${DECK_WIDTH}px !important;
    height: auto !important;
  }
  .deck-stage, .stage {
    width: ${DECK_WIDTH}px !important;
    height: auto !important;
    min-height: 0 !important;
    transform: none !important;
    box-shadow: none !important;
    position: static !important;
    inset: auto !important;
    overflow: visible !important;
  }
  ${slidesNotActive},
  ${slides} {
    display: flex !important;
    flex-direction: column !important;
    flex: none !important;
    position: relative !important;
    inset: auto !important;
    width: ${DECK_WIDTH}px !important;
    height: ${DECK_HEIGHT}px !important;
    min-height: ${DECK_HEIGHT}px !important;
    max-height: ${DECK_HEIGHT}px !important;
    page-break-after: always !important;
    break-after: page !important;
    break-inside: avoid !important;
    scroll-snap-align: none !important;
    transform: none !important;
    overflow: hidden !important;
    visibility: visible !important;
    opacity: 1 !important;
  }
  ${slidesLastChild} {
    page-break-after: auto !important;
    break-after: auto !important;
  }
  .deck-counter, .deck-hint, .deck-nav,
  #deck-prev, #deck-next, #deck-cur, #deck-total,
  [aria-label="Previous slide"], [aria-label="Next slide"] {
    display: none !important;
  }
}`;
}
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
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
].filter(Boolean) as string[];

let queue: Promise<void> = Promise.resolve();

export async function renderHeadlessPdf(options: HeadlessExportOptions): Promise<Buffer> {
  return runExclusive(async () => {
    const browser = await launchChromium();
    try {
      const page = await preparePage(browser, options);
      await waitForPrintableContent(page);
      let deckSlideCount = 0;
      if (options.input.deck) {
        deckSlideCount = await revealAllDeckSlides(page);
        await page.emulateMedia({ media: 'print' });
      }
      await applyPdfStyles(page, options.input.deck);
      const pdf = await page.pdf(deckPdfOptions(options.input.deck, deckSlideCount));
      return Buffer.from(pdf);
    } finally {
      await browser.close().catch(() => {});
    }
  });
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
  const html = options.input.deck
    ? buildPrintableHtml(options.input)
    : withBaseHref(options.input.html, options.input.baseHref || '');
  // `load` (not `domcontentloaded`) ensures the deck framework's `fit()` /
  // scripts and stylesheets have run before we flatten slides for print.
  await page.setContent(html, {
    waitUntil: 'load',
    timeout: EXPORT_TIMEOUT_MS,
  });
  return page;
}

/**
 * Force every deck slide visible and stack them in block flow with explicit
 * page breaks. Inline `!important` styles beat deck-framework's
 * `.slide:not(.active) { display: none !important }` regardless of stylesheet
 * order or @media print specificity battles.
 */
export async function revealAllDeckSlides(page: Page): Promise<number> {
  const count = await page.evaluate(
    `((args) => {
      const slides = Array.from(document.querySelectorAll(args.selector));
      if (slides.length === 0) return 0;

      const set = (el, prop, value) => el.style.setProperty(prop, value, 'important');

      document.querySelectorAll('.deck-shell, .deck-stage, #deck-stage, .stage').forEach((el) => {
        set(el, 'position', 'static');
        set(el, 'display', 'block');
        set(el, 'inset', 'auto');
        set(el, 'overflow', 'visible');
        set(el, 'width', args.width + 'px');
        set(el, 'height', 'auto');
        set(el, 'min-height', '0');
        set(el, 'transform', 'none');
        set(el, 'box-shadow', 'none');
      });

      set(document.documentElement, 'overflow', 'visible');
      set(document.documentElement, 'width', args.width + 'px');
      set(document.documentElement, 'height', 'auto');
      set(document.body, 'overflow', 'visible');
      set(document.body, 'display', 'block');
      set(document.body, 'scroll-snap-type', 'none');
      set(document.body, 'transform', 'none');
      set(document.body, 'width', args.width + 'px');
      set(document.body, 'height', 'auto');

      slides.forEach((el, index) => {
        set(el, 'display', 'flex');
        set(el, 'flex-direction', 'column');
        set(el, 'flex', 'none');
        set(el, 'position', 'relative');
        set(el, 'inset', 'auto');
        set(el, 'width', args.width + 'px');
        set(el, 'height', args.height + 'px');
        set(el, 'min-height', args.height + 'px');
        set(el, 'max-height', args.height + 'px');
        set(el, 'visibility', 'visible');
        set(el, 'opacity', '1');
        set(el, 'overflow', 'hidden');
        set(el, 'scroll-snap-align', 'none');
        set(el, 'transform', 'none');
        set(el, 'page-break-after', index < slides.length - 1 ? 'always' : 'auto');
        set(el, 'break-after', index < slides.length - 1 ? 'page' : 'auto');
        set(el, 'break-inside', 'avoid');
      });

      document
        .querySelectorAll(
          '.deck-counter, .deck-hint, .deck-nav, #deck-prev, #deck-next, #deck-cur, #deck-total, [aria-label="Previous slide"], [aria-label="Next slide"]',
        )
        .forEach((el) => set(el, 'display', 'none'));

      return slides.length;
    })`,
    {
      selector: DECK_SLIDE_SELECTOR,
      width: DECK_WIDTH,
      height: DECK_HEIGHT,
    },
  ).catch(() => 0);
  return typeof count === 'number' && Number.isFinite(count) ? count : 0;
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
      html, body { margin: 0 !important; background: #fff !important; scrollbar-width: none !important; }
      body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      *::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
      ${deck ? '' : `@page { margin: 0; size: auto; }`}
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

function buildPrintableHtml(input: DesktopExportPdfInput): string {
  let doc = withBaseHref(input.html, input.baseHref || '');
  doc = injectTitle(doc, input.title);
  return injectPrintStylesheet(doc, buildDeckPrintCss());
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
