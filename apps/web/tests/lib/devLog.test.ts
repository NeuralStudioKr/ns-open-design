import { afterEach, describe, expect, it, vi } from 'vitest';

describe('devLog', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('emits warn/info/debug outside production', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const { devLog } = await import('../../src/lib/devLog');
    devLog.warn('w');
    devLog.info('i');
    devLog.debug('d');
    expect(warn).toHaveBeenCalledWith('w');
    expect(info).toHaveBeenCalledWith('i');
    expect(debug).toHaveBeenCalledWith('d');
  });

  it('is silent when NODE_ENV is production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { devLog } = await import('../../src/lib/devLog');
    devLog.warn('should-not-appear');
    expect(warn).not.toHaveBeenCalled();
  });
});
