/** Headless export concurrency, browser pool, queue limits — see docs-teamver/34. */

export class ExportQueueFullError extends Error {
  readonly code = 'EXPORT_QUEUE_FULL';

  constructor(message = 'export queue full — retry shortly') {
    super(message);
    this.name = 'ExportQueueFullError';
  }
}

export type ExportJobMeta = {
  format: 'pdf' | 'html' | 'zip' | 'image';
  deck: boolean;
  projectId?: string;
};

export type ExportJobMetrics = ExportJobMeta & {
  queueWaitMs: number;
  durationMs: number;
  chromiumAcquireMs: number;
  bytes?: number;
  ok: boolean;
  error?: string;
};

function parseEnvInt(name: string, fallback: number, min: number, max: number): number {
  const raw = (process.env[name] ?? '').trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function isProductionEnv(): boolean {
  return (process.env.NODE_ENV ?? '').trim().toLowerCase() === 'production';
}

export function exportMaxConcurrent(): number {
  return parseEnvInt(
    'OD_EXPORT_MAX_CONCURRENT',
    isProductionEnv() ? 6 : 4,
    1,
    16,
  );
}

export function exportBrowserPoolSize(): number {
  const poolDefault = isProductionEnv() ? 3 : 2;
  const pool = parseEnvInt('OD_EXPORT_BROWSER_POOL_SIZE', poolDefault, 1, 8);
  return Math.min(pool, exportMaxConcurrent());
}

export function exportQueueMax(): number {
  return parseEnvInt(
    'OD_EXPORT_QUEUE_MAX',
    isProductionEnv() ? 64 : 32,
    4,
    256,
  );
}

class ExportSemaphore {
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  get pending(): number {
    return this.waiters.length;
  }

  get running(): number {
    return this.active;
  }

  async acquire(maxWaiters: number): Promise<void> {
    const max = exportMaxConcurrent();
    if (this.active < max) {
      this.active += 1;
      return;
    }
    if (this.waiters.length >= maxWaiters) {
      throw new ExportQueueFullError();
    }
    await new Promise<void>((resolve) => {
      this.waiters.push(() => {
        this.active += 1;
        resolve();
      });
    });
  }

  release(): void {
    this.active = Math.max(0, this.active - 1);
    const next = this.waiters.shift();
    if (next) next();
  }
}

type BrowserLike = {
  newPage: (...args: unknown[]) => Promise<unknown>;
  close: () => Promise<void>;
  isConnected?: () => boolean;
};

type BrowserPoolState = {
  available: BrowserLike[];
  total: number;
  waiters: Array<(browser: BrowserLike) => void>;
  poolSize: number;
};

const browserPool: BrowserPoolState = {
  available: [],
  total: 0,
  waiters: [],
  poolSize: exportBrowserPoolSize(),
};

let launchBrowser: (() => Promise<BrowserLike>) | null = null;

export function bindExportBrowserLauncher(launcher: () => Promise<BrowserLike>): void {
  launchBrowser = launcher;
}

async function browserConnected(browser: BrowserLike): Promise<boolean> {
  try {
    if (typeof browser.isConnected === 'function') return browser.isConnected();
    return true;
  } catch {
    return false;
  }
}

async function discardBrowser(browser: BrowserLike): Promise<void> {
  browserPool.total = Math.max(0, browserPool.total - 1);
  await browser.close().catch(() => {});
}

async function launchPooledBrowser(): Promise<BrowserLike> {
  if (!launchBrowser) {
    throw new Error('export browser launcher not configured');
  }
  const browser = await launchBrowser();
  browserPool.total += 1;
  return browser;
}

async function acquireBrowser(): Promise<{ browser: BrowserLike; acquireMs: number }> {
  const started = Date.now();
  browserPool.poolSize = exportBrowserPoolSize();

  while (browserPool.available.length > 0) {
    const browser = browserPool.available.pop()!;
    if (await browserConnected(browser)) {
      return { browser, acquireMs: Date.now() - started };
    }
    await discardBrowser(browser);
  }

  if (browserPool.total < browserPool.poolSize) {
    const browser = await launchPooledBrowser();
    return { browser, acquireMs: Date.now() - started };
  }

  const browser = await new Promise<BrowserLike>((resolve) => {
    browserPool.waiters.push(resolve);
  });
  return { browser, acquireMs: Date.now() - started };
}

async function releaseBrowser(browser: BrowserLike): Promise<void> {
  if (!(await browserConnected(browser))) {
    await discardBrowser(browser);
    if (browserPool.waiters.length > 0) {
      void launchPooledBrowser()
        .then((replacement) => {
          const waiter = browserPool.waiters.shift();
          if (waiter) waiter(replacement);
          else browserPool.available.push(replacement);
        })
        .catch(() => {
          const waiter = browserPool.waiters.shift();
          if (waiter) {
            void launchPooledBrowser().then(waiter).catch(() => {});
          }
        });
    }
    return;
  }

  const waiter = browserPool.waiters.shift();
  if (waiter) {
    waiter(browser);
    return;
  }
  browserPool.available.push(browser);
}

const exportSemaphore = new ExportSemaphore();

export function logExportMetrics(metrics: ExportJobMetrics): void {
  const payload = {
    marker: metrics.ok ? 'od_export_done' : 'od_export_failed',
    format: metrics.format,
    deck: metrics.deck,
    projectId: metrics.projectId,
    queueWaitMs: metrics.queueWaitMs,
    durationMs: metrics.durationMs,
    chromiumAcquireMs: metrics.chromiumAcquireMs,
    bytes: metrics.bytes,
    error: metrics.error,
    concurrentMax: exportMaxConcurrent(),
    poolSize: exportBrowserPoolSize(),
  };
  if (metrics.ok) {
    console.info(JSON.stringify(payload));
  } else {
    console.warn(JSON.stringify(payload));
  }
}

export async function runHeadlessExportJob<T>(
  meta: ExportJobMeta,
  work: (browser: BrowserLike) => Promise<T>,
): Promise<T> {
  const queueStart = Date.now();
  await exportSemaphore.acquire(exportQueueMax());
  const queueWaitMs = Date.now() - queueStart;

  let browser: BrowserLike | null = null;
  let chromiumAcquireMs = 0;
  const exportStart = Date.now();

  try {
    ({ browser, acquireMs: chromiumAcquireMs } = await acquireBrowser());
    const result = await work(browser);
    const bytes =
      result instanceof Buffer
        ? result.length
        : typeof result === 'string'
          ? Buffer.byteLength(result, 'utf8')
          : undefined;
    logExportMetrics({
      ...meta,
      queueWaitMs,
      durationMs: Date.now() - exportStart,
      chromiumAcquireMs,
      ...(bytes !== undefined ? { bytes } : {}),
      ok: true,
    });
    return result;
  } catch (err) {
    logExportMetrics({
      ...meta,
      queueWaitMs,
      durationMs: Date.now() - exportStart,
      chromiumAcquireMs,
      ok: false,
      error: String((err as Error)?.message || err),
    });
    throw err;
  } finally {
    if (browser) await releaseBrowser(browser);
    exportSemaphore.release();
  }
}

/** @internal vitest */
export async function resetExportRuntimeForTests(): Promise<void> {
  while (browserPool.available.length > 0) {
    const browser = browserPool.available.pop();
    if (browser) await browser.close().catch(() => {});
  }
  browserPool.total = 0;
  browserPool.waiters.length = 0;
  launchBrowser = null;
}

/** @internal vitest */
export function exportRuntimeStatsForTests(): {
  poolAvailable: number;
  poolTotal: number;
  running: number;
  pending: number;
} {
  return {
    poolAvailable: browserPool.available.length,
    poolTotal: browserPool.total,
    running: exportSemaphore.running,
    pending: exportSemaphore.pending,
  };
}
