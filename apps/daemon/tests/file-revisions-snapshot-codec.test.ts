import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  applySuffixPrefixPatch,
  computeSuffixPrefixPatch,
  decodePayload,
  gzipRevisionSnapshot,
  gunzipRevisionSnapshot,
  shouldForceFullSnapshot,
} from '../src/file-revisions/snapshot-codec.js';

describe('snapshot-codec', () => {
  it('round-trips a suffix/prefix patch', () => {
    const parent = '<html><head></head><body><h1>Hello</h1></body></html>';
    const child = '<html><head></head><body><h1>Hello world</h1></body></html>';
    const patch = computeSuffixPrefixPatch(parent, child);
    expect(applySuffixPrefixPatch(parent, patch)).toBe(child);
  });

  it('stores smaller gzip diff payloads for localized HTML edits', () => {
    const parent = `<!doctype html><html><body>${'x'.repeat(8_000)}<h1>v1</h1>${'y'.repeat(8_000)}</body></html>`;
    const child = `<!doctype html><html><body>${'x'.repeat(8_000)}<h1>v2</h1>${'y'.repeat(8_000)}</body></html>`;
    const diff = gzipRevisionSnapshot(child, { parentContent: parent });
    const full = gzipRevisionSnapshot(child, { forceFull: true });
    expect(diff.kind).toBe('diff');
    expect(diff.compressed.length).toBeLessThan(full.compressed.length);
    expect(gunzipRevisionSnapshot(diff.compressed, () => parent)).toBe(child);
  });

  it('forces periodic full checkpoints', () => {
    expect(shouldForceFullSnapshot(1)).toBe(true);
    expect(shouldForceFullSnapshot(6)).toBe(true);
    expect(shouldForceFullSnapshot(7)).toBe(false);
    expect(shouldForceFullSnapshot(6, 3)).toBe(false);
    expect(shouldForceFullSnapshot(7, 3)).toBe(true);
  });

  it('encodes and decodes full payloads', () => {
    const encoded = gzipRevisionSnapshot('<html>full</html>', { forceFull: true });
    const decoded = decodePayload(gunzipSync(encoded.compressed));
    expect(decoded.kind).toBe('full');
    expect(decoded.content).toBe('<html>full</html>');
  });
});
