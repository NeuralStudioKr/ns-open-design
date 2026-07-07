import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const TEAMVER_SRC_DIR = join(process.cwd(), 'src', 'teamver');

const FILES_WITH_BFF_REQUESTS = [
  'batchLatestPublishSummary.ts',
  'designBffClient.ts',
  'importDriveAssets.ts',
  'listProjectOutputs.ts',
  'projectRegistry.ts',
  'publishToDrive.ts',
  'reportUsage.ts',
  'teamverByokBilling.ts',
] as const;

describe('Teamver BFF request options', () => {
  it('keeps SDK auth recovery disabled for Design BFF calls', async () => {
    for (const file of FILES_WITH_BFF_REQUESTS) {
      const source = await readFile(join(TEAMVER_SRC_DIR, file), 'utf8');
      if (file === 'designBffClient.ts') {
        expect(source).toContain('export const TEAMVER_BFF_REQUEST_OPTIONS');
        expect(source).toContain('skipAuthRecovery: true');
        continue;
      }
      expect(source, file).not.toContain('skipAuthHeader: true');
      expect(source, file).toContain('TEAMVER_BFF_REQUEST_OPTIONS');
    }
  });
});
