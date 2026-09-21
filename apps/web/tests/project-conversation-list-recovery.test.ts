import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(process.cwd(), 'src/components/ProjectView.tsx'),
  'utf8',
);

describe('project conversation list recovery', () => {
  it('does not turn a load failure into an automatic retry loop', () => {
    expect(source).not.toMatch(
      /waitForTeamverEmbedBoot\(\)\.then\([\s\S]{0,500}conversationLoadError[\s\S]{0,180}setConversationLoadRetryNonce/,
    );
  });

  it('uses explicit auth recovery and classifies load failures as connection errors', () => {
    expect(source).toContain('retryProjectConversationConnection');
    expect(source).toContain('clearDesignAuthRefreshDecline();');
    expect(source).toContain('bypassNegativeCache: true');
    expect(source).toContain("? 'connection'");
    expect(source).toContain('onConnectionRetry={retryProjectConversationConnection}');
  });
});
