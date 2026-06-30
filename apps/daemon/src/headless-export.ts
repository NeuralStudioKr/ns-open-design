import fs from 'node:fs';

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
    overflow: visible !important;
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

let queue: Promise<void> = Promise.resolve();

export async function renderHeadlessPdf(options: HeadlessExportOptions): Promise<Buffer> {
  return runExclusive(async () => {
    const browser = await launchChromium();
    try {
      const page = await preparePage(browser, options);
      await waitForPrintableContent(page);
      if (options.input.deck) {
        await page.emulateMedia({ media: 'print' });
      }
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
      await waitForPrintableContent(page);
      await applyScreenshotStyles(page, options.input.deck, options.slideIndex);
      if (options.input.deck) {
        await revealDeckSlideForScreenshot(page, options.slideIndex);
        await waitForPrintableContent(page);
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

export async function renderHeadlessHtmlSnapshot(options: HeadlessExportOptions): Promise<string> {
  return runExclusive(async () => {
    const browser = await launchChromium();
    try {
      const page = await preparePage(browser, options);
      await waitForPrintableContent(page);
      if (options.input.deck) {
        await revealAllDeckSlides(page);
      }
      await applySnapshotStyles(page, options.input.deck);
      await inlineRenderedResources(page);
      return await page.content();
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
  const launchArgs = [
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-setuid-sandbox',
    '--no-sandbox',
    '--font-render-hinting=medium',
  ];
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
        args: ['--disable-dev-shm-usage', '--disable-gpu', '--no-sandbox'],
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
        set(el, 'overflow', 'visible');
        set(el, 'transform', 'none');
        set(el, 'page-break-after', index < slides.length - 1 ? 'always' : 'auto');
        set(el, 'break-after', index < slides.length - 1 ? 'page' : 'auto');
        set(el, 'break-inside', 'avoid');
        el.querySelectorAll(':scope > *').forEach((child) => {
          set(child, 'position', 'relative');
          set(child, 'inset', 'auto');
          set(child, 'transform', 'none');
          set(child, 'height', 'auto');
          set(child, 'min-height', '0');
          set(child, 'max-height', 'none');
        });
      });

      document.documentElement.style.setProperty('--deck-scale', '1');

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
      ${deck ? buildDeckPrintCss() : '@page { margin: 0; size: auto; }'}
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

async function revealDeckSlideForScreenshot(page: Page, slideIndex?: number): Promise<void> {
  await page.evaluate(`(args) => {
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

    document.querySelectorAll('.deck-shell, .deck-stage, #deck-stage, .stage').forEach((el) => {
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
  }`, {
    index: Number.isFinite(slideIndex) ? Math.max(0, Math.floor(slideIndex || 0)) : 0,
    selector: DECK_SLIDE_SELECTOR,
    width: DECK_WIDTH,
    height: DECK_HEIGHT,
  }).catch(() => {});
}

async function applySnapshotStyles(page: Page, deck: boolean): Promise<void> {
  await page.addStyleTag({
    content: `
      html, body { margin: 0 !important; background: #fff !important; scrollbar-width: none !important; }
      *::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
      ${deck ? `
      .deck-counter, .deck-hint, .deck-nav,
      #deck-prev, #deck-next, #deck-cur, #deck-total,
      [aria-label="Previous slide"], [aria-label="Next slide"] {
        display: none !important;
      }` : ''}
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
