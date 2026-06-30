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
      const pdf = await page.pdf({
        printBackground: true,
        preferCSSPageSize: true,
        width: options.input.deck ? `${DECK_WIDTH}px` : undefined,
        height: options.input.deck ? `${DECK_HEIGHT}px` : undefined,
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
  let lastError: unknown = null;
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
      lastError = err;
    }
  }
  try {
    return await chromium.launch({
      headless: true,
      args: ['--disable-dev-shm-usage', '--disable-gpu', '--no-sandbox'],
      timeout: EXPORT_TIMEOUT_MS,
    });
  } catch (err) {
    throw new Error(
      `headless Chromium unavailable: ${String((lastError as any)?.message || (err as any)?.message || err)}`,
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
  await page.setContent(withBaseHref(options.input.html, options.input.baseHref || ''), {
    waitUntil: 'domcontentloaded',
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
  await page.addStyleTag({
    content: `
      html, body { margin: 0 !important; background: #fff !important; scrollbar-width: none !important; }
      body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      *::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
      ${deck ? `
      @page { size: ${DECK_WIDTH}px ${DECK_HEIGHT}px; margin: 0; }
      .slide, [data-slide], section {
        break-after: page;
        page-break-after: always;
        overflow: hidden !important;
      }
      .slide:last-child, [data-slide]:last-child, section:last-child {
        break-after: auto;
        page-break-after: auto;
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
      .slide, [data-slide], section { overflow: hidden !important; }` : ''}
    `,
  });
  if (deck) {
    await page.evaluate(`(index) => {
      const all = Array.from(document.querySelectorAll('.slide, [data-slide], section'));
      const slides = all.length > 0 ? all : [document.body];
      const target = slides[Math.max(0, Math.min(index, slides.length - 1))];
      target?.scrollIntoView({ block: 'start', inline: 'start' });
    }`, Number.isFinite(slideIndex) ? Math.max(0, Math.floor(slideIndex || 0)) : 0).catch(() => {});
  }
}

async function deckScreenshotClip(page: Page, slideIndex?: number) {
  const fallback = { x: 0, y: 0, width: DECK_WIDTH, height: DECK_HEIGHT };
  const box = await page.evaluate(`(index) => {
    const all = Array.from(document.querySelectorAll('.slide, [data-slide], section'));
    const slides = all.length > 0 ? all : [document.body];
    const target = slides[Math.max(0, Math.min(index, slides.length - 1))];
    if (!target) return null;
    const rect = target.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: Math.max(0, rect.left + window.scrollX),
      y: Math.max(0, rect.top + window.scrollY),
      width: Math.max(1, rect.width),
      height: Math.max(1, rect.height),
    };
  }`, Number.isFinite(slideIndex) ? Math.max(0, Math.floor(slideIndex || 0)) : 0).catch(() => null);
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
