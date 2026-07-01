import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  buildDeckPrintCss,
  chromiumExecutableCandidates,
  chromiumLaunchArgs,
  chromiumRuntimeEnv,
  chromiumRuntimePaths,
  ensureChromiumRuntimeDirs,
} from '../src/headless-export.js';

describe('chromiumExecutableCandidates', () => {
  it('prefers OD_EXPORT_CHROMIUM_PATH and includes common Linux paths', () => {
    const previous = process.env.OD_EXPORT_CHROMIUM_PATH;
    process.env.OD_EXPORT_CHROMIUM_PATH = '/custom/chromium';
    try {
      const candidates = chromiumExecutableCandidates();
      expect(candidates[0]).toBe('/custom/chromium');
      expect(candidates).toContain('/usr/bin/chromium');
    } finally {
      if (previous === undefined) delete process.env.OD_EXPORT_CHROMIUM_PATH;
      else process.env.OD_EXPORT_CHROMIUM_PATH = previous;
    }
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
    process.env.XDG_CONFIG_HOME = dir;
    process.env.XDG_CACHE_HOME = dir;
    try {
      ensureChromiumRuntimeDirs();
      expect(chromiumRuntimePaths().crashDir).toContain(dir);
      const args = chromiumLaunchArgs();
      expect(args).toContain('--disable-crash-reporter');
      expect(args.some((arg) => arg.startsWith('--crash-dumps-dir='))).toBe(true);
      const env = chromiumRuntimeEnv();
      expect(env.XDG_CONFIG_HOME).toBe(dir);
      expect(env.XDG_CACHE_HOME).toBe(dir);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
      if (prevConfig === undefined) delete process.env.XDG_CONFIG_HOME;
      else process.env.XDG_CONFIG_HOME = prevConfig;
      if (prevCache === undefined) delete process.env.XDG_CACHE_HOME;
      else process.env.XDG_CACHE_HOME = prevCache;
    }
  });
});

describe('buildDeckPrintCss', () => {
  it('overrides inactive slides so every deck-framework slide prints', () => {
    const css = buildDeckPrintCss();
    expect(css).toContain('.slide:not(.active)');
    expect(css).toContain('display: flex !important');
    expect(css).toContain('display: contents !important');
    expect(css).toContain('.deck-shell');
    expect(css).toContain('.deck-stage');
    expect(css).not.toMatch(/\.deck-stage[^}]*height:\s*auto/);
    expect(css).toContain('page-break-before: avoid !important');
    expect(css).toContain('page-break-after: always !important');
  });

  it('exports revealAllDeckSlides for runtime flattening', async () => {
    const mod = await import('../src/headless-export.js');
    expect(typeof mod.revealAllDeckSlides).toBe('function');
  });
});
