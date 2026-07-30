import path from 'node:path';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';

function revisionDirForFile(projectDir: string, fileName: string): string {
  const normalized = fileName.replace(/\\/g, '/').replace(/^\/+/, '');
  return path.join(projectDir, '.od', 'revisions', normalized);
}

function snapshotPath(projectDir: string, fileName: string, revisionId: string): string {
  return path.join(revisionDirForFile(projectDir, fileName), `${revisionId}.html`);
}

export async function writeRevisionSnapshot(
  projectDir: string,
  fileName: string,
  revisionId: string,
  content: string,
): Promise<void> {
  const target = snapshotPath(projectDir, fileName, revisionId);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, 'utf8');
}

export async function readRevisionSnapshot(
  projectDir: string,
  fileName: string,
  revisionId: string,
): Promise<string> {
  const target = snapshotPath(projectDir, fileName, revisionId);
  return readFile(target, 'utf8');
}

export async function deleteRevisionSnapshot(
  projectDir: string,
  fileName: string,
  revisionId: string,
): Promise<void> {
  const target = snapshotPath(projectDir, fileName, revisionId);
  await rm(target, { force: true });
}

export async function deleteRevisionSnapshots(
  projectDir: string,
  fileName: string,
  revisionIds: string[],
): Promise<void> {
  await Promise.all(revisionIds.map((revisionId) => deleteRevisionSnapshot(projectDir, fileName, revisionId)));
}
