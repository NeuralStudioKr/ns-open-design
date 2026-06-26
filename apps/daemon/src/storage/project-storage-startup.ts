export function allowsS3ScratchFallback(env: NodeJS.ProcessEnv): boolean {
  return env.OD_S3_ALLOW_SCRATCH_FALLBACK === '1';
}

/** Health probe reason when S3 layout is active but remote storage is not wired. */
export function s3StorageHealthNotReadyReason(scratchFallbackActive: boolean): string {
  return scratchFallbackActive ? 'scratch_fallback' : 'storage_not_initialized';
}

export function describeStorageStartupError(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

