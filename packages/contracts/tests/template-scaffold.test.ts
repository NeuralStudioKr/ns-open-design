import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import {
  TEMPLATE_SCAFFOLD_MARKER,
  appendTemplateScaffold,
  extractTemplateScaffoldFromHtml,
  skillBodyHasTemplateScaffold,
} from '../src/template-scaffold.js';
import { composeTeamverSlideApiPrompt } from '../src/prompts/system.js';

describe('extractTemplateScaffoldFromHtml', () => {
  it('builds a CONTENT-SWAP scaffold from Daisy Days example.html', async () => {
    const html = await readFile(
      new URL(
        '../../../plugins/_official/examples/html-ppt-zhangzara-daisy-days/example.html',
        import.meta.url,
      ),
      'utf8',
    );
    const scaffold = extractTemplateScaffoldFromHtml(html, {
      title: 'Html Ppt Zhangzara Daisy Days',
    });
    expect(scaffold).toBeTruthy();
    expect(scaffold).toContain(TEMPLATE_SCAFFOLD_MARKER);
    expect(scaffold).toMatch(/CONTENT-SWAP ONLY/i);
    expect(scaffold).toContain('#F5F0E6');
    expect(scaffold).toMatch(/Fredoka/i);
    expect(scaffold).toContain('<section');
    expect(scaffold).toContain('class="slide');
    expect(scaffold).toContain('<style>');
    // Real petal daisy (not sky cloud) should appear via Motif pool.
    expect(scaffold).toMatch(/#FCDF6C/i);
    expect(scaffold).not.toMatch(/#C6E3F6/i);
    // Must fit the BYOK prompt budget.
    expect(scaffold!.length).toBeLessThanOrEqual(16_000);
    // Body-first order inside the HTML fence: first slide before shared style.
    const fence = scaffold!.slice(scaffold!.indexOf('```html'));
    const firstSection = fence.indexOf('<section');
    const sharedStyle = fence.indexOf('\n<style>');
    expect(firstSection).toBeGreaterThan(0);
    expect(sharedStyle).toBeGreaterThan(firstSection);
    // Fonts as <link> outside Motif <style>.
    expect(fence).toMatch(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com/i);
    expect(fence).not.toMatch(/<style>[\s\S]*@import url\(/i);
  });

  it('converts Hermes @import fonts to <link> outside Motif style', async () => {
    const html = await readFile(
      new URL(
        '../../../plugins/_official/examples/html-ppt-hermes-cyber-terminal/example.html',
        import.meta.url,
      ),
      'utf8',
    );
    expect(html).toMatch(/@import url\(['"]https:\/\/fonts\.googleapis\.com/i);
    const scaffold = extractTemplateScaffoldFromHtml(html, {
      title: 'Html Ppt Hermes Cyber Terminal',
    });
    expect(scaffold).toBeTruthy();
    const fence = scaffold!.slice(scaffold!.indexOf('```html'));
    expect(fence).toMatch(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com/i);
    expect(fence).not.toMatch(/<style>[\s\S]*@import url\(/i);
  });

  it('appendTemplateScaffold is idempotent', () => {
    const block = `${TEMPLATE_SCAFFOLD_MARKER}\n\n\`\`\`html\n<html></html>\n\`\`\``;
    const once = appendTemplateScaffold('## Visual summary\n\nCheerful', block);
    const twice = appendTemplateScaffold(once, block);
    expect(twice).toBe(once);
    expect(skillBodyHasTemplateScaffold(once)).toBe(true);
  });
});

describe('composeTeamverSlideApiPrompt with scaffold', () => {
  it('stays token-aware when an opt-in full HTML scaffold is present', () => {
    const scaffold = [
      TEMPLATE_SCAFFOLD_MARKER + ' — Daisy Days',
      '',
      '**CONTENT-SWAP ONLY:** start from this scaffold.',
      '',
      '```html',
      '<!doctype html><html><body><section class="slide"><h1>Title</h1></section>',
      '<style>:root{--cream:#F5F0E6}</style>',
      '</body></html>',
      '```',
    ].join('\n');
    const prompt = composeTeamverSlideApiPrompt({
      skillBody: scaffold,
      skillName: 'Html Ppt Zhangzara Daisy Days',
      designSystemBody: '# Neutral\nNo ornament.',
      designSystemTitle: 'Neutral Modern',
      metadata: {
        selectedDeckTemplateId: 'html-ppt-zhangzara-daisy-days',
        selectedDeckTemplateTitle: 'Html Ppt Zhangzara Daisy Days',
        skipDiscoveryBrief: true,
      },
      locale: 'ko',
    });
    // Opt-in scaffold still recognized, but prompts prefer kit+map if copy would truncate.
    expect(prompt).toMatch(/Template scaffold \(CONTENT-SWAP BASE\)/i);
    expect(prompt).toMatch(/token-safe|kit \+ Template scaffold map|Prefer finishing a complete deck/i);
    expect(prompt).not.toContain('No ornament.');
  });

  it('Teamver slide scaffold prefers overflow:visible on the Teamver override block (§0.80)', async () => {
    const html = await readFile(
      new URL(
        '../../../plugins/_official/examples/html-ppt-zhangzara-daisy-days/example.html',
        import.meta.url,
      ),
      'utf8',
    );
    const scaffold = extractTemplateScaffoldFromHtml(html, {
      title: 'Html Ppt Zhangzara Daisy Days',
    });
    expect(scaffold).toBeTruthy();
    // Teamver override is prepended before template presenter CSS (which may
    // still carry overflow:hidden for fullscreen preview).
    expect(scaffold).toMatch(
      /\.slides-container\{[^}]*overflow:visible[\s\S]*?\.slide\{[^}]*overflow:visible/i,
    );
  });
});
