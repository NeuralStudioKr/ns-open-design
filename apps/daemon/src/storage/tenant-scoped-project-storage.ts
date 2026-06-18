import {
  S3ProjectStorage,
  StorageError,
  type ProjectFileMeta,
  type ProjectStorage,
} from './project-storage.js';

const SCOPED_LOCAL_PROJECT_ID = '_tenant';

/**
 * Tenant-scoped view over project storage (registry `s3_prefix` SSOT).
 * Maps `<projectId>/<relpath>` calls to `{objectPrefix}<relpath>` object keys.
 */
export class TenantScopedProjectStorage implements ProjectStorage {
  constructor(
    private readonly inner: ProjectStorage,
    public readonly objectPrefix: string,
  ) {
    if (!objectPrefix.trim()) {
      throw new StorageError('IO', 'TenantScopedProjectStorage requires objectPrefix');
    }
  }

  async readFile(_projectId: string, relpath: string): Promise<Buffer> {
    if (this.inner instanceof S3ProjectStorage) {
      const key = this.inner.objectKeyForPrefixAndRel(this.objectPrefix, relpath);
      return this.inner.readObjectAtKey(key);
    }
    return this.inner.readFile(SCOPED_LOCAL_PROJECT_ID, this.scopedRel(relpath));
  }

  async writeFile(_projectId: string, relpath: string, body: Buffer): Promise<ProjectFileMeta> {
    if (this.inner instanceof S3ProjectStorage) {
      const key = this.inner.objectKeyForPrefixAndRel(this.objectPrefix, relpath);
      await this.inner.writeObjectAtKey(key, body);
      return {
        path: relpath.replace(/^[\\/]+/, '').replace(/\\/g, '/'),
        size: body.byteLength,
        mtimeMs: Date.now(),
      };
    }
    return this.inner.writeFile(SCOPED_LOCAL_PROJECT_ID, this.scopedRel(relpath), body);
  }

  async listFiles(_projectId: string): Promise<ProjectFileMeta[]> {
    if (this.inner instanceof S3ProjectStorage) {
      return this.inner.listUnderObjectPrefix(this.objectPrefix);
    }
    const scopedPrefix = this.scopedRel('');
    const all = await this.inner.listFiles(SCOPED_LOCAL_PROJECT_ID);
    return all
      .filter((file) => file.path === scopedPrefix.slice(0, -1) || file.path.startsWith(scopedPrefix))
      .map((file) => ({
        ...file,
        path: file.path.slice(scopedPrefix.length),
      }))
      .filter((file) => file.path.length > 0);
  }

  async deleteFile(_projectId: string, relpath: string): Promise<void> {
    if (this.inner instanceof S3ProjectStorage) {
      const key = this.inner.objectKeyForPrefixAndRel(this.objectPrefix, relpath);
      await this.inner.deleteObjectAtKey(key);
      return;
    }
    await this.inner.deleteFile(SCOPED_LOCAL_PROJECT_ID, this.scopedRel(relpath));
  }

  async statFile(_projectId: string, relpath: string): Promise<ProjectFileMeta | null> {
    if (this.inner instanceof S3ProjectStorage) {
      const key = this.inner.objectKeyForPrefixAndRel(this.objectPrefix, relpath);
      const stat = await this.inner.statObjectAtKey(key);
      if (!stat) return null;
      return {
        ...stat,
        path: relpath.replace(/^[\\/]+/, '').replace(/\\/g, '/'),
      };
    }
    return this.inner.statFile(SCOPED_LOCAL_PROJECT_ID, this.scopedRel(relpath));
  }

  /** Remove every object under the tenant registry prefix (project delete / registry soft-delete). */
  async purgeTenantObjects(): Promise<{ deleted: number; failed: number }> {
    if (this.inner instanceof S3ProjectStorage) {
      return this.inner.deleteAllUnderObjectPrefix(this.objectPrefix);
    }
    return { deleted: 0, failed: 0 };
  }

  private scopedRel(relpath: string): string {
    const root = this.objectPrefix.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
    const rel = String(relpath || '').replace(/^[\\/]+/, '').replace(/\\/g, '/');
    return rel ? `${root}/${rel}` : `${root}/`;
  }
}
