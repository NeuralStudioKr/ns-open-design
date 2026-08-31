// @vitest-environment node

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { looksLikeOfficialFullscreenPresenterDeck } from '@open-design/contracts';
import { buildSrcdoc } from '../../src/runtime/srcdoc';
import {
  looksLikeCompactApiStackedDeck,
  prepareCompactStackedDeckPreviewHtml,
} from '../../src/runtime/compact-api-stacked-deck';

const repoRoot = resolve(import.meta.dirname, '../../../..');
const examplesDir = resolve(repoRoot, 'plugins/_official/examples');

function deckExampleDirs(): string[] {
  return readdirSync(examplesDir).filter((name) => {
    const manifest = resolve(examplesDir, name, 'open-design.json');
    const html = resolve(examplesDir, name, 'example.html');
    if (!existsSync(manifest) || !existsSync(html)) return false;
    try {
      return JSON.parse(readFileSync(manifest, 'utf8'))?.od?.mode === 'deck';
    } catch {
      return false;
    }
  });
}

function extractDeckBridgeScript(srcdoc: string): string {
  const match = srcdoc.match(/<script data-od-deck-bridge>([\s\S]*?)<\/script>/);
  if (!match?.[1]) throw new Error('deck bridge script not found');
  return match[1];
}

function extractNonOdScripts(srcdoc: string): string[] {
  const scripts: string[] = [];
  for (const match of srcdoc.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/data-od-/i.test(match[1] ?? '')) continue;
    const body = match[2]?.trim();
    if (body) scripts.push(body);
  }
  return scripts;
}

function lastSlideState(parentPostMessage: ReturnType<typeof vi.fn>) {
  const messages = parentPostMessage.mock.calls
    .map((call) => call[0])
    .filter((message) => message?.type === 'od:slide-state');
  return messages.at(-1) as { type: string; active: number; count: number } | undefined;
}

function bootDeck(html: string) {
  const srcdoc = buildSrcdoc(html, { deck: true });
  const script = extractDeckBridgeScript(srcdoc);
  const authorScripts = extractNonOdScripts(srcdoc);
  const dom = new JSDOM(srcdoc.replace(/<script\b[\s\S]*?<\/script>/gi, ''), {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const win = dom.window;
  const parentPostMessage = vi.fn();
  Object.defineProperty(win, 'parent', {
    configurable: true,
    value: { postMessage: parentPostMessage },
  });
  if (win.document.querySelector('deck-stage')) {
    class DeckStage extends win.HTMLElement {
      _index = 0;
      connectedCallback() { this._apply(0); }
      get length() {
        return [...this.children].filter((node) => node.nodeType === 1).length;
      }
      goTo(i: number) {
        this._index = Math.max(0, Math.min(this.length - 1, i));
        this._apply(this._index);
      }
      _apply(curr: number) {
        [...this.children].forEach((slide, index) => {
          if (slide.nodeType !== 1) return;
          const el = slide as HTMLElement;
          if (index === curr) el.setAttribute('data-deck-active', '');
          else el.removeAttribute('data-deck-active');
        });
      }
    }
    try { win.customElements.define('deck-stage', DeckStage); } catch { /* defined */ }
  }
  for (const author of authorScripts) {
    try { new win.Function(author).call(win); } catch { /* template chrome */ }
  }
  new win.Function(script).call(win);
  win.document.querySelectorAll('deck-stage').forEach((node) => {
    const cb = (node as { connectedCallback?: () => void }).connectedCallback;
    if (typeof cb === 'function') cb.call(node);
  });
  return { win, parentPostMessage };
}

describe('catalog-wide PreviewModal paint', () => {
  it('does not letterbox hide-toggle html-ppt catalogs as compact fills', () => {
    const hideToggle = [
      'html-ppt-zhangzara-playful',
      'html-ppt-zhangzara-cartesian',
      'html-ppt-zhangzara-block-frame',
      'html-ppt-zhangzara-cobalt-grid',
      'html-ppt-zhangzara-retro-zine',
      'html-ppt-zhangzara-coral',
    ];
    for (const dir of hideToggle) {
      const html = readFileSync(resolve(examplesDir, dir, 'example.html'), 'utf8');
      expect(looksLikeOfficialFullscreenPresenterDeck(html), dir).toBe(true);
      expect(
        looksLikeCompactApiStackedDeck(prepareCompactStackedDeckPreviewHtml(html)),
        dir,
      ).toBe(false);
    }
  });

  it('keeps every mode:deck marked-active slide unhidden after restore + next', async () => {
    const dirs = deckExampleDirs();
    expect(dirs.length).toBeGreaterThan(40);
    const failures: string[] = [];

    for (const dir of dirs) {
      const html = readFileSync(resolve(examplesDir, dir, 'example.html'), 'utf8');
      const { win, parentPostMessage } = bootDeck(html);
      win.dispatchEvent(new win.Event('load'));
      win.dispatchEvent(new win.MessageEvent('message', {
        data: { type: 'od:slide', action: 'go', index: 0 },
      }));
      await new Promise<void>((resolve) => win.setTimeout(resolve, 20));
      win.dispatchEvent(new win.MessageEvent('message', { data: { type: 'od:slide', action: 'next' } }));
      await new Promise<void>((resolve) => win.setTimeout(resolve, 20));

      const after = lastSlideState(parentPostMessage);
      const slides = [...win.document.querySelectorAll(
        '.slide, .ppt-slide, .deck-slide, [data-screen-label]',
      )] as HTMLElement[];
      const marked = slides.filter((el) =>
        el.classList.contains('active')
        || el.classList.contains('is-active')
        || el.classList.contains('current')
        || el.hasAttribute('data-deck-active'),
      );
      const stage = win.document.querySelector('.stage, #stage') as HTMLElement | null;
      if (stage && /translate(?:X|3d)\s*\(\s*-/.test(stage.style.transform || '')) {
        const kids = [...stage.querySelectorAll(':scope > .slide')] as HTMLElement[];
        if (kids.length >= 2) {
          const dx = Math.abs((kids[1]!.offsetLeft || 0) - (kids[0]!.offsetLeft || 0));
          const dy = Math.abs((kids[1]!.offsetTop || 0) - (kids[0]!.offsetTop || 0));
          if (dx < 16 && dy < 16) {
            failures.push(`${dir}: opacity-stack .stage translated off-canvas`);
          }
        }
      }
      const trapped = marked.filter((el) =>
        el.style.display === 'none' || el.style.visibility === 'hidden',
      );
      if (trapped.length) {
        failures.push(`${dir}: ${trapped.length} marked-active slide(s) host-hidden`);
      }
      const reported = after ? slides[after.active] : undefined;
      if (reported && (reported.style.display === 'none' || reported.style.visibility === 'hidden')) {
        failures.push(`${dir}: reported active ${after?.active} host-hidden`);
      }
      win.close();
    }

    expect(failures).toEqual([]);
  }, 30_000);
});
