// @vitest-environment jsdom
//
// End-to-end regression pin for the "empty element-patch body" root
// cause fixed on 2026-07-29.
//
// The bug: the assistant-prose sanitizer's pseudo-tool strip list
// includes `patch` (Claude's file-edit pseudo-tool), and that strip
// was chewing through <patch target-id="…" slide-index="…" kind="…">
// blocks nested inside <artifact type="element-patch"> bodies. By the
// time parseElementPatch looked at the body it saw only whitespace,
// returning { ok: false, reason: 'empty element-patch body' }, which
// then routed to auto-continue → 3 retries → generic incomplete_output
// banner. Four staging conversations on 2026-07-29 hit this loop.
//
// The fix masks closed <artifact> regions before any strip runs and
// restores them after the entire strip chain completes, so <patch>
// blocks inside the artifact body survive verbatim.
//
// This suite exercises the FULL pipeline (sanitize → artifact parser →
// parseElementPatch → applyElementPatches) so a future regression at
// any layer surfaces immediately.

import { describe, expect, it } from 'vitest';
import { sanitizeAssistantProseForDisplay, sanitizeLeakedAgentProse } from '@open-design/contracts';
import { createArtifactParser } from '../src/artifacts/parser';
import { applyElementPatches, parseElementPatch } from '../src/artifacts/element-patch';

const CURRENT_HTML = `<!doctype html><html><body>
<section class="slide" data-slide-index="0"><h1>Intro</h1></section>
<section class="slide" data-slide-index="1">
  <p data-od-id="path-1-2">회사 이름</p>
</section>
</body></html>`;

const MODEL_STREAM_OUTPUT = `Here's the edit:

<artifact type="element-patch" identifier="deck">
  <patch target-id="path-1-2" slide-index="1" kind="set-text">뉴럴스튜디오</patch>
</artifact>`;

function extractArtifactBody(streamText: string): { artifactType: string; body: string } | null {
  const parser = createArtifactParser();
  let artifactType = '';
  let body = '';
  for (const event of parser.feed(streamText)) {
    if (event.type === 'artifact:start') {
      artifactType = event.artifactType;
      body = '';
    } else if (event.type === 'artifact:chunk') {
      body += event.delta;
    } else if (event.type === 'artifact:end') {
      body = event.fullContent;
    }
  }
  for (const event of parser.flush()) {
    if (event.type === 'artifact:chunk') body += event.delta;
    else if (event.type === 'artifact:end') body = event.fullContent;
  }
  return artifactType ? { artifactType, body } : null;
}

describe('element-patch sanitize → parse → apply full pipeline', () => {
  it('sanitizer streaming mode preserves <patch> body inside <artifact type="element-patch">', () => {
    const sanitized = sanitizeAssistantProseForDisplay(MODEL_STREAM_OUTPUT, { streaming: true });
    expect(sanitized).toContain('<patch target-id="path-1-2"');
    expect(sanitized).toContain('</patch>');
  });

  it('artifact parser extracts a non-empty element-patch body after sanitize', () => {
    const sanitized = sanitizeAssistantProseForDisplay(MODEL_STREAM_OUTPUT, { streaming: true });
    const artifact = extractArtifactBody(sanitized);
    expect(artifact, 'artifact must be present').not.toBeNull();
    if (!artifact) return;
    expect(artifact.artifactType).toBe('element-patch');
    expect(artifact.body.trim().length).toBeGreaterThan(0);
    expect(artifact.body).toContain('<patch target-id="path-1-2"');
  });

  it('parseElementPatch succeeds on the sanitized body', () => {
    const sanitized = sanitizeAssistantProseForDisplay(MODEL_STREAM_OUTPUT, { streaming: true });
    const artifact = extractArtifactBody(sanitized);
    expect(artifact).not.toBeNull();
    if (!artifact) return;
    const parsed = parseElementPatch(artifact.body);
    expect(parsed.ok, JSON.stringify(parsed)).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.patches).toHaveLength(1);
    expect(parsed.patches[0]).toMatchObject({
      id: 'path-1-2',
      kind: 'set-text',
      slideIndex: 1,
      value: '뉴럴스튜디오',
    });
  });

  it('applyElementPatches lands the edit on the current deck', () => {
    const sanitized = sanitizeAssistantProseForDisplay(MODEL_STREAM_OUTPUT, { streaming: true });
    const artifact = extractArtifactBody(sanitized);
    expect(artifact).not.toBeNull();
    if (!artifact) return;
    const parsed = parseElementPatch(artifact.body);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const applied = applyElementPatches({
      currentHtml: CURRENT_HTML,
      patches: parsed.patches,
    });
    expect(applied.ok, JSON.stringify(applied)).toBe(true);
    if (!applied.ok) return;
    expect(applied.html).toContain('data-od-id="path-1-2"');
    expect(applied.html).toContain('뉴럴스튜디오');
    expect(applied.html).not.toContain('회사 이름');
  });

  it('streaming across chunk boundaries still preserves <patch>', () => {
    // Feed the sanitized output one character at a time through the
    // artifact parser to make sure the fix survives the smallest
    // possible chunk boundary — the daemon's SSE deltas can arrive
    // per-token, which is close to per-character in practice.
    const sanitized = sanitizeAssistantProseForDisplay(MODEL_STREAM_OUTPUT, { streaming: true });
    const parser = createArtifactParser();
    let body = '';
    let inArtifact = false;
    for (const ch of sanitized) {
      for (const event of parser.feed(ch)) {
        if (event.type === 'artifact:start') {
          inArtifact = true;
          body = '';
        } else if (event.type === 'artifact:chunk' && inArtifact) {
          body += event.delta;
        } else if (event.type === 'artifact:end') {
          body = event.fullContent;
          inArtifact = false;
        }
      }
    }
    expect(body).toContain('<patch target-id="path-1-2"');
    expect(body).toContain('뉴럴스튜디오');
  });

  it('sanitizeLeakedAgentProse directly preserves <patch> in streaming mode', () => {
    // Direct call — no display sanitizer wrapper — matches the daemon
    // path where createStreamingProseDeltaGuard runs on each delta.
    const out = sanitizeLeakedAgentProse(MODEL_STREAM_OUTPUT, { preserveClosedArtifact: true });
    expect(out).toContain('<patch target-id="path-1-2"');
    expect(out).toContain('뉴럴스튜디오');
  });
});
