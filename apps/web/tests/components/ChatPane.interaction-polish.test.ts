import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const chatPane = readFileSync(join(here, '../../src/components/ChatPane.tsx'), 'utf8');
const chatCss = readFileSync(join(here, '../../src/styles/chat.css'), 'utf8');
const composioCss = readFileSync(join(here, '../../src/styles/viewer/composio.css'), 'utf8');
const routinesCss = readFileSync(join(here, '../../src/styles/viewer/routines.css'), 'utf8');

describe('chat interaction polish (0805-N02)', () => {
  it('opens design artifacts on single click (role=button contract)', () => {
    expect(chatPane).toContain('onClick={openable ? openFile : undefined}');
    expect(chatPane).not.toContain('onDoubleClick={openable ? openFile');
  });

  it('labels the jump-to-latest control for assistive tech', () => {
    expect(chatPane).toContain("aria-label={t('chat.scrollToLatest')}");
  });

  it('keeps answered questions banners from double-muted disabled opacity', () => {
    expect(composioCss).toContain('.questions-banner-answered:disabled');
    expect(composioCss).toMatch(/\.questions-banner-answered:disabled[\s\S]*?opacity:\s*1/);
  });

  it('gives primary chat CTAs and ghosts press + focus feedback', () => {
    expect(chatCss).toContain('.chat-error-action:active');
    expect(chatCss).toContain('.chat-error-action:focus-visible');
    expect(chatCss).toContain('.amr-card__cta:active');
    expect(chatCss).toContain('.chat-error-actions .ghost:active:not(:disabled)');
    expect(chatCss).toContain('.composer-import:active:not(:disabled)');
    expect(chatCss).toContain('.composer-research:focus-visible');
    expect(composioCss).toContain('.chat-jump-btn:active');
    expect(routinesCss).toContain(".chat-design-artifact[role='button']:active");
  });
});
