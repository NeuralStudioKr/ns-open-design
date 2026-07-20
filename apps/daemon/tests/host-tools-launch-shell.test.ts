import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    spawn: vi.fn(() => {
      const child = new EventEmitter() as EventEmitter & { unref: () => void };
      child.unref = () => {};
      setImmediate(() => child.emit('spawn'));
      return child;
    }),
  };
});

import { spawn } from 'node:child_process';
import { launchHostTool } from '../src/routes/host-tools.js';

const spawnMock = spawn as unknown as ReturnType<typeof vi.fn>;

describe('launchHostTool does not launch through a shell', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    vi.clearAllMocks();
  });

  it('never passes shell:true for a Windows .cmd editor', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });

    const result = await launchHostTool('C:\\tools\\code.cmd', ['C:\\Users\\me\\proj & calc.exe']);
    expect(result).toEqual({ ok: true });

    const options = spawnMock.mock.calls[0]?.[2] ?? {};
    expect(options.shell).not.toBe(true);
    expect(options.windowsVerbatimArguments).toBe(true);
  });

  it('passes metacharacter paths as literal argv on non-Windows', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

    const dir = '/home/me/proj & rm -rf ~';
    const result = await launchHostTool('/usr/bin/code', [dir]);
    expect(result).toEqual({ ok: true });

    const [, args, options] = spawnMock.mock.calls[0]!;
    expect(options.shell).toBeFalsy();
    expect(args).toContain(dir);
  });
});
