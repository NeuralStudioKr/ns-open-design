import { gunzipSync, gzipSync } from 'node:zlib';

const MAGIC = Buffer.from('ODR1');
const KIND_FULL = 0;
const KIND_DIFF = 1;

export type RevisionSnapshotKind = 'full' | 'diff';

export interface RevisionSnapshotPatch {
  prefixLen: number;
  suffixLen: number;
  middle: string;
}

export function computeSuffixPrefixPatch(parent: string, child: string): RevisionSnapshotPatch {
  let prefixLen = 0;
  const minLen = Math.min(parent.length, child.length);
  while (prefixLen < minLen && parent[prefixLen] === child[prefixLen]) {
    prefixLen += 1;
  }

  let suffixLen = 0;
  while (
    suffixLen < minLen - prefixLen
    && parent[parent.length - 1 - suffixLen] === child[child.length - 1 - suffixLen]
  ) {
    suffixLen += 1;
  }

  return {
    prefixLen,
    suffixLen,
    middle: child.slice(prefixLen, child.length - suffixLen),
  };
}

export function applySuffixPrefixPatch(parent: string, patch: RevisionSnapshotPatch): string {
  return parent.slice(0, patch.prefixLen) + patch.middle + parent.slice(parent.length - patch.suffixLen);
}

function encodePayload(kind: RevisionSnapshotKind, content: string, patch?: RevisionSnapshotPatch): Buffer {
  if (kind === 'full') {
    const body = Buffer.from(content, 'utf8');
    return Buffer.concat([MAGIC, Buffer.from([KIND_FULL]), body]);
  }
  const patchBody = patch ?? { prefixLen: 0, suffixLen: 0, middle: content };
  const middle = Buffer.from(patchBody.middle, 'utf8');
  const header = Buffer.alloc(9);
  header.writeUInt8(KIND_DIFF, 0);
  header.writeUInt32BE(patchBody.prefixLen, 1);
  header.writeUInt32BE(patchBody.suffixLen, 5);
  return Buffer.concat([MAGIC, header, middle]);
}

export function decodePayload(buffer: Buffer): { kind: RevisionSnapshotKind; content?: string; patch?: RevisionSnapshotPatch } {
  if (buffer.length < MAGIC.length + 1 || !buffer.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error('Invalid revision snapshot payload');
  }
  const kindByte = buffer[MAGIC.length];
  if (kindByte === KIND_FULL) {
    return {
      kind: 'full',
      content: buffer.subarray(MAGIC.length + 1).toString('utf8'),
    };
  }
  if (kindByte !== KIND_DIFF || buffer.length < MAGIC.length + 9) {
    throw new Error('Invalid revision snapshot diff payload');
  }
  const prefixLen = buffer.readUInt32BE(MAGIC.length + 1);
  const suffixLen = buffer.readUInt32BE(MAGIC.length + 5);
  const middle = buffer.subarray(MAGIC.length + 9).toString('utf8');
  return {
    kind: 'diff',
    patch: { prefixLen, suffixLen, middle },
  };
}

export function gzipRevisionSnapshot(
  content: string,
  options?: { parentContent?: string | null; forceFull?: boolean },
): { kind: RevisionSnapshotKind; compressed: Buffer } {
  const parentContent = options?.parentContent;
  const forceFull = Boolean(options?.forceFull) || parentContent == null;
  if (forceFull) {
    return {
      kind: 'full',
      compressed: gzipSync(encodePayload('full', content)),
    };
  }

  const patch = computeSuffixPrefixPatch(parentContent, content);
  const diffPayload = encodePayload('diff', content, patch);
  const fullPayload = encodePayload('full', content);
  const diffCompressed = gzipSync(diffPayload);
  const fullCompressed = gzipSync(fullPayload);
  if (diffCompressed.length < fullCompressed.length) {
    return { kind: 'diff', compressed: diffCompressed };
  }
  return { kind: 'full', compressed: fullCompressed };
}

export function gunzipRevisionSnapshot(
  compressed: Buffer,
  resolveParent: () => string,
): string {
  const decoded = decodePayload(gunzipSync(compressed));
  if (decoded.kind === 'full') {
    return decoded.content ?? '';
  }
  if (!decoded.patch) {
    throw new Error('Revision diff payload is missing patch body');
  }
  return applySuffixPrefixPatch(resolveParent(), decoded.patch);
}

export function snapshotStorageFileName(revisionId: string): string {
  return `${revisionId}.snap.gz`;
}

export function legacySnapshotFileName(revisionId: string): string {
  return `${revisionId}.html`;
}

/** Force a full gzip snapshot every N sequences so reads do not walk long diff chains. */
export const REVISION_FULL_SNAPSHOT_INTERVAL = 5;

export function shouldForceFullSnapshot(sequence: number): boolean {
  return sequence <= 1 || sequence % REVISION_FULL_SNAPSHOT_INTERVAL === 1;
}
