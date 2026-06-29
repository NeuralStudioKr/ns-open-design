import { deleteProjectFile } from '../providers/registry';
import type { ChatMessage, ProjectFile } from '../types';

/** BYOK image tool outputs — see `byok-tools.ts` filename pattern. */
export const BYOK_PNG_FILENAME_PATTERN = /^byok-.+\.png$/i;

const BYOK_FILE_URL_PATTERN = /\/files\/(byok-[^/?#\s]+\.png)/gi;

/**
 * Files produced during a failed BYOK turn that should be removed before retry
 * so stale partial images do not linger in scratch/S3.
 */
export function collectByokRetryGarbageFileNames(
  projectFiles: Pick<ProjectFile, 'name'>[],
  failedAssistant: ChatMessage,
): string[] {
  const beforeTurn = new Set(failedAssistant.preTurnFileNames ?? []);
  const names = new Set<string>();

  for (const file of projectFiles) {
    if (!BYOK_PNG_FILENAME_PATTERN.test(file.name)) continue;
    if (beforeTurn.has(file.name)) continue;
    names.add(file.name);
  }

  for (const produced of failedAssistant.producedFiles ?? []) {
    if (BYOK_PNG_FILENAME_PATTERN.test(produced.name)) {
      names.add(produced.name);
    }
  }

  const textBuckets: string[] = [failedAssistant.content];
  for (const event of failedAssistant.events ?? []) {
    if (event.kind === 'text' && typeof event.text === 'string') {
      textBuckets.push(event.text);
    }
  }
  for (const text of textBuckets) {
    if (!text) continue;
    for (const match of text.matchAll(BYOK_FILE_URL_PATTERN)) {
      const filename = match[1];
      if (filename && BYOK_PNG_FILENAME_PATTERN.test(filename)) {
        names.add(filename);
      }
    }
  }

  return [...names].sort();
}

export async function cleanupByokRetryArtifacts(
  projectId: string,
  projectFiles: Pick<ProjectFile, 'name'>[],
  failedAssistant: ChatMessage,
): Promise<string[]> {
  const names = collectByokRetryGarbageFileNames(projectFiles, failedAssistant);
  if (names.length === 0) return [];
  await Promise.all(names.map((name) => deleteProjectFile(projectId, name)));
  return names;
}
