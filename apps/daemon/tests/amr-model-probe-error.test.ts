import { describe, expect, it } from 'vitest';

import { classifyAmrModelProbeError } from '../src/amr-model-probe-error.js';

describe('classifyAmrModelProbeError', () => {
  it('classifies the vela-binary-missing throw message', () => {
    expect(classifyAmrModelProbeError('AMR vela binary could not be resolved')).toBe(
      'vela_binary_missing',
    );
  });

  it('is case-insensitive on the binary-missing match', () => {
    expect(
      classifyAmrModelProbeError('amr Vela Binary could NOT BE resolved'),
    ).toBe('vela_binary_missing');
  });

  it('classifies the runtime-def-missing throw message', () => {
    expect(classifyAmrModelProbeError('AMR runtime definition is missing')).toBe(
      'runtime_def_missing',
    );
  });

  it('returns null for unknown messages so the caller falls through to a 500', () => {
    expect(classifyAmrModelProbeError('some other failure')).toBeNull();
    expect(classifyAmrModelProbeError('')).toBeNull();
    expect(classifyAmrModelProbeError('vela: ECONNREFUSED 127.0.0.1:8080')).toBeNull();
  });

  it('matches when the message embeds the trigger inside a longer error chain', () => {
    expect(
      classifyAmrModelProbeError(
        'Error: AMR vela binary could not be resolved\n    at resolveAmrModelProbe (...)',
      ),
    ).toBe('vela_binary_missing');
  });
});
