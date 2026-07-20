import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { test } from 'vitest';
import { pipeVelaProxyStreamWithGuard } from '../src/vela-proxy-stream.js';

test('AMR proxy stream guard routes source errors to the handler', () => {
  const source = new PassThrough();
  const dest = new PassThrough();
  const errors: string[] = [];

  pipeVelaProxyStreamWithGuard(source, dest, (err) => {
    errors.push(err.message);
    dest.destroy();
  });

  source.emit('error', new Error('upstream reset'));

  assert.deepEqual(errors, ['upstream reset']);
});
