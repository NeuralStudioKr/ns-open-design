import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { access, chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

type StartedServer = {
  url: string;
  server: Server;
  shutdown?: () => Promise<void> | void;
};

type RunStatus = {
  id: string;
  status: string;
  exitCode: number | null;
  error: string | null;
  errorCode: string | null;
  cancelRequested?: boolean;
};

describe('run cancel late error handling', () => {
  const originalEnv = {
    POSTHOG_KEY: process.env.POSTHOG_KEY,
    POSTHOG_HOST: process.env.POSTHOG_HOST,
    LANGFUSE_PUBLIC_KEY: process.env.LANGFUSE_PUBLIC_KEY,
    LANGFUSE_SECRET_KEY: process.env.LANGFUSE_SECRET_KEY,
    LANGFUSE_BASE_URL: process.env.LANGFUSE_BASE_URL,
    OPEN_DESIGN_TELEMETRY_RELAY_URL: process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL,
  };
  let started: StartedServer | null = null;
  let binDir: string | null = null;

  afterEach(async () => {
    await Promise.resolve(started?.shutdown?.());
    if (started?.server) {
      await new Promise<void>((resolve) => started?.server.close(() => resolve()));
    }
    started = null;
    if (binDir) await rm(binDir, { recursive: true, force: true });
    binDir = null;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('keeps a user-canceled Claude run canceled when a late error frame arrives', async () => {
    delete process.env.POSTHOG_KEY;
    delete process.env.POSTHOG_HOST;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_BASE_URL;
    delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;

    started = await startServer({ port: 0, returnServer: true }) as StartedServer;
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-cancel-error-bin-'));
    const readyFile = path.join(binDir, 'ready');
    const claudeBin = await writeCancelErrorClaudeBin(
      binDir,
      'claude-cancel-error',
      readyFile,
    );
    await putConfig(started.url, {
      agentId: 'claude',
      agentCliEnv: { claude: { CLAUDE_BIN: claudeBin } },
    });

    const runId = await createRun(started.url);
    await waitForFile(readyFile);

    const cancel = await fetch(`${started.url}/api/runs/${encodeURIComponent(runId)}/cancel`, {
      method: 'POST',
    });
    expect(cancel.status).toBe(200);
    await expect(cancel.json()).resolves.toMatchObject({
      ok: true,
      run: {
        id: runId,
        status: 'canceled',
        cancelRequested: true,
      },
    });

    const canceled = await waitForRun(started.url, runId);
    expect(canceled).toMatchObject({
      id: runId,
      status: 'canceled',
      cancelRequested: true,
      error: null,
      errorCode: null,
    });

    const events = await readRunSse(started.url, runId);
    expect(events).not.toContain('event: error');
    expect(events.match(/^event: end$/gmu)).toHaveLength(1);
    expect(events).toContain('"status":"canceled"');
  });

  it('keeps a Claude stream failure failed when cancellation follows the error', async () => {
    delete process.env.POSTHOG_KEY;
    delete process.env.POSTHOG_HOST;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_BASE_URL;
    delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;

    started = await startServer({ port: 0, returnServer: true }) as StartedServer;
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-error-cancel-bin-'));
    const readyFile = path.join(binDir, 'ready');
    const claudeBin = await writeCancelErrorClaudeBin(
      binDir,
      'claude-error-before-cancel',
      readyFile,
      'before-cancel',
    );
    await putConfig(started.url, {
      agentId: 'claude',
      agentCliEnv: { claude: { CLAUDE_BIN: claudeBin } },
    });

    const runId = await createRun(started.url);
    await waitForFile(readyFile);
    const errorEvents = await readRunSseUntil(started.url, runId, 'event: error');
    expect(errorEvents).toContain('provider failed before cancellation');

    const cancel = await fetch(`${started.url}/api/runs/${encodeURIComponent(runId)}/cancel`, {
      method: 'POST',
    });
    expect(cancel.status).toBe(200);
    await expect(cancel.json()).resolves.toMatchObject({
      ok: true,
      run: {
        id: runId,
        status: 'failed',
        cancelRequested: true,
      },
    });

    const failed = await waitForRun(started.url, runId);
    expect(failed).toMatchObject({
      id: runId,
      status: 'failed',
      cancelRequested: true,
    });

    const events = await readRunSse(started.url, runId);
    expect(events).toContain('event: error');
    expect(events.match(/^event: end$/gmu)).toHaveLength(1);
    expect(events).toContain('"status":"failed"');
  });
});

async function writeCancelErrorClaudeBin(
  dir: string,
  name: string,
  readyFile: string,
  errorTiming: 'before-cancel' | 'after-cancel' = 'after-cancel',
): Promise<string> {
  const bin = path.join(dir, name);
  await writeFile(bin, `#!/usr/bin/env node
const fs = require('node:fs');
function writeFrame(frame) {
  fs.writeSync(1, JSON.stringify(frame) + '\\n');
}
function writeErrorFrames(message) {
  writeFrame({
    type: 'assistant',
    parent_tool_use_id: null,
    error: message,
    message: {
      id: 'msg-cancel-error',
      content: [],
      stop_reason: null,
    },
  });
  writeFrame({
    type: 'result',
    subtype: 'error_during_execution',
    is_error: true,
    result: message,
    stop_reason: null,
  });
}
if (process.argv.includes('--version')) {
  console.log('claude 0.0.0-cancel-error-smoke');
  process.exit(0);
}
if (process.argv.includes('--help')) {
  console.log('Usage: claude -p [--include-partial-messages] [--add-dir DIR]');
  process.exit(0);
}
process.on('SIGTERM', () => {
  if (${JSON.stringify(errorTiming)} === 'after-cancel') {
    writeErrorFrames('Canceled by user');
  }
  setTimeout(() => process.exit(1), 20);
});
if (${JSON.stringify(errorTiming)} === 'before-cancel') {
  writeErrorFrames('provider failed before cancellation');
}
fs.writeFileSync(${JSON.stringify(readyFile)}, 'ready');
setInterval(() => {}, 1000);
`, 'utf8');
  await chmod(bin, 0o755);
  return bin;
}

async function putConfig(url: string, patch: Record<string, unknown>): Promise<void> {
  const response = await fetch(`${url}/api/app-config`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  expect(response.status).toBe(200);
}

async function createRun(url: string): Promise<string> {
  const projectId = `cancel_error_${randomUUID()}`;
  const projectResponse = await fetch(`${url}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: projectId,
      name: 'Cancel late error smoke',
      metadata: { kind: 'prototype' },
      skipDiscoveryBrief: true,
    }),
  });
  expect(projectResponse.status).toBe(200);
  const projectBody = await projectResponse.json() as { conversationId: string };
  const runResponse = await fetch(`${url}/api/runs`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-od-analytics-device-id': 'cancel-late-error-test',
      'x-od-analytics-session-id': 'cancel-late-error-session',
      'x-od-analytics-client-type': 'web',
    },
    body: JSON.stringify({
      projectId,
      conversationId: projectBody.conversationId,
      assistantMessageId: `assistant_cancel_${randomUUID()}`,
      clientRequestId: `client_cancel_${randomUUID()}`,
      agentId: 'claude',
      message: 'cancel a Claude run that emits a late error frame',
      currentPrompt: 'cancel a Claude run that emits a late error frame',
    }),
  });
  expect(runResponse.status).toBe(202);
  const body = await runResponse.json() as { runId: string };
  return body.runId;
}

async function waitForRun(url: string, runId: string): Promise<RunStatus> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10_000) {
    const response = await fetch(`${url}/api/runs/${encodeURIComponent(runId)}`);
    expect(response.status).toBe(200);
    const run = await response.json() as RunStatus;
    if (['failed', 'succeeded', 'canceled'].includes(run.status)) return run;
    await delay(100);
  }
  throw new Error(`run ${runId} did not finish`);
}

async function readRunSse(url: string, runId: string): Promise<string> {
  const response = await fetch(`${url}/api/runs/${encodeURIComponent(runId)}/events`);
  expect(response.status).toBe(200);
  return await response.text();
}

async function readRunSseUntil(url: string, runId: string, marker: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await fetch(`${url}/api/runs/${encodeURIComponent(runId)}/events`, {
      signal: controller.signal,
    });
    expect(response.status).toBe(200);
    reader = response.body?.getReader();
    if (!reader) throw new Error('run SSE response had no body');
    const decoder = new TextDecoder();
    let body = '';
    while (!body.includes(marker)) {
      const { done, value } = await reader.read();
      if (done) break;
      body += decoder.decode(value, { stream: true });
    }
    return body;
  } finally {
    clearTimeout(timeout);
    await reader?.cancel().catch(() => undefined);
  }
}

async function waitForFile(filePath: string): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10_000) {
    try {
      await access(filePath);
      return;
    } catch {
      await delay(25);
    }
  }
  throw new Error(`file not found: ${filePath}`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
