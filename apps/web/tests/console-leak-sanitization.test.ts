import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('browser console leak sanitization', () => {
  it('does not log slide/comment body fields or raw element ids from scoped deck-patch failures', () => {
    const source = readSrc('src/edit-mode/scoped-deck-patch.ts');
    expect(source).toContain("devLog.warn('[deck-patch] scoped narrow merge failed'");
    expect(source).toContain('currentTextLen:');
    expect(source).toContain('htmlHintLen:');
    expect(source).toContain('idCount: ids.length');
    expect(source).not.toMatch(
      /scoped narrow merge failed',\s*\{[\s\S]*?currentText:\s*attachment\.currentText/,
    );
    expect(source).not.toMatch(
      /scoped narrow merge failed',\s*\{[\s\S]*?htmlHint:\s*attachment\.htmlHint/,
    );
    expect(source).not.toMatch(
      /scoped narrow merge failed',\s*\{[\s\S]*?\bids,\s/,
    );
  });

  it('does not log working-directory paths or upload filename arrays', () => {
    const app = readSrc('src/App.tsx');
    expect(app).toContain('Failed to set working directory for new project');
    expect(app).toContain('hasWorkingDir:');
    expect(app).not.toMatch(
      /Failed to set working directory for new project',\s*userWorkingDir/,
    );
    expect(app).toContain('failedCount: uploadResult.failed.length');
    expect(app).not.toMatch(
      /Some Home attachments failed to upload',\s*uploadResult\.failed\b/,
    );
    expect(app).not.toMatch(
      /Some Home Drive attachments failed to import',\s*driveResult\.failed\b/,
    );

    const workspace = readSrc('src/components/FileWorkspace.tsx');
    expect(workspace).toContain('failedCount');
    expect(workspace).not.toMatch(/Project upload had failures',\s*result\.failed\b/);

    const composer = readSrc('src/components/ChatComposer.tsx');
    expect(composer).toContain('failedCount: result.failed.length');
    expect(composer).not.toMatch(/Some attachments failed to upload',\s*result\.failed\b/);
  });

  it('does not log fetchProjectFileText request URLs', () => {
    const source = readSrc('src/providers/registry.ts');
    expect(source).toContain("devLog.warn('[fetchProjectFileText] failed:'");
    expect(source).not.toMatch(
      /\[fetchProjectFileText\] failed:[\s\S]{0,200}url:\s*requestUrl/,
    );
  });

  it('routes ProjectView / App observation logs through production-silent devLog', () => {
    const projectView = readSrc('src/components/ProjectView.tsx');
    expect(projectView).toContain("from '../lib/devLog'");
    expect(projectView).toContain("devLog.warn('[deck-patch]");
    expect(projectView).toContain("devLog.warn('[element-patch]");
    expect(projectView).not.toMatch(/\bconsole\.warn\(/);
    expect(projectView).not.toMatch(/\bconsole\.info\(/);

    const app = readSrc('src/App.tsx');
    expect(app).toContain("from './lib/devLog'");
    expect(app).toContain("devLog.info('[teamver] home-nav:");
    expect(app).not.toMatch(/\bconsole\.warn\(/);
    expect(app).not.toMatch(/\bconsole\.info\(/);
  });

  it('routes polling / registry / export / chat-save observation logs through devLog', () => {
    for (const rel of [
      'src/providers/daemon.ts',
      'src/providers/project-events.ts',
      'src/teamver/projectRegistry.ts',
      'src/teamver/teamverEmbedSessionBoot.ts',
      'src/teamver/useTeamverEmbed.ts',
      'src/runtime/exports.ts',
      'src/state/projects.ts',
      'src/teamver/designBffClient.ts',
    ] as const) {
      const source = readSrc(rel);
      expect(source, rel).toContain('devLog');
      expect(source, rel).not.toMatch(/\bconsole\.warn\(/);
      expect(source, rel).not.toMatch(/\bconsole\.info\(/);
    }
  });

  it('keeps usage/billing drop markers always-on but without workspace/run/token fields', () => {
    const usage = readSrc('src/teamver/reportUsage.ts');
    const usageMarker = usage.slice(
      usage.indexOf('function emitClientUsageDropMarker'),
      usage.indexOf('export async function reportTeamverDesignUsage'),
    );
    expect(usageMarker).toContain('console.warn(');
    expect(usageMarker).toContain('usageClientErrorMetric');
    expect(usageMarker).not.toContain('workspaceId:');
    expect(usageMarker).not.toContain('runId:');
    expect(usageMarker).not.toContain('inputTokens:');
    expect(usageMarker).not.toContain('modelName:');

    const billing = readSrc('src/teamver/teamverByokBilling.ts');
    const billingMarker = billing.slice(
      billing.indexOf('function emitByokBillingDropMarker'),
      billing.indexOf('function normalizeByokBillingResponse'),
    );
    expect(billingMarker).toContain('console.warn(');
    expect(billingMarker).toContain('teamver_usage_5xx');
    expect(billingMarker).not.toContain('workspaceId:');
    expect(billingMarker).not.toContain('runId:');
    expect(billingMarker).not.toContain('modelName:');
  });
});
