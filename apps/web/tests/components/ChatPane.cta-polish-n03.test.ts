import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const tools = readFileSync(join(here, '../../src/styles/viewer/tools.css'), 'utf8');
const theater = readFileSync(join(here, '../../src/styles/viewer/theater.css'), 'utf8');
const chat = readFileSync(join(here, '../../src/styles/chat.css'), 'utf8');
const composio = readFileSync(join(here, '../../src/styles/viewer/composio.css'), 'utf8');
const routines = readFileSync(join(here, '../../src/styles/viewer/routines.css'), 'utf8');

describe('chat CTA polish (0805-N03)', () => {
  it('gives plugin actions press and focus feedback without brightness hacks', () => {
    expect(tools).toContain('.plugin-action-button:active:not(:disabled)');
    expect(tools).toContain('.plugin-action-button:focus-visible');
    expect(tools).toContain('.plugin-action-button--primary:active:not(:disabled)');
    expect(tools).not.toMatch(/\.plugin-action-button--primary:hover[^{]*\{[^}]*filter:\s*brightness/);
  });

  it('aligns assistant footer and feedback submit states', () => {
    expect(theater).toContain('.assistant-copy-button:active:not(:disabled)');
    expect(theater).toContain('.assistant-feedback-button:focus-visible');
    expect(theater).toContain('.assistant-feedback-submit:active:not(:disabled)');
    expect(theater).toContain('.assistant-feedback-submit:focus-visible');
  });

  it('covers queue, session picker, stop, chips, and tool disclosures', () => {
    expect(chat).toContain('.chat-queued-send-action:active:not(:disabled)');
    expect(chat).toContain('.chat-session-trigger:focus-visible');
    expect(chat).toContain('.composer-send.stop:active:not(:disabled)');
    expect(chat).toContain('.staged-remove:active');
    expect(chat).toContain('.user-attachment.openable:focus-visible');
    expect(composio).toContain('.chat-history-new:focus-visible');
    expect(composio).toContain('.chat-conv-item:active');
    expect(composio).toContain('.chat-conv-item-del:active');
    expect(tools).toContain('.file-ops-toggle:focus-visible');
    expect(tools).toContain('.op-open:focus-visible');
    expect(routines).toContain('.action-card-toggle:focus-visible');
  });
});
