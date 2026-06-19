export function allowsS3ScratchFallback(env: NodeJS.ProcessEnv): boolean {
  return env.OD_S3_ALLOW_SCRATCH_FALLBACK === '1';
}

export function describeStorageStartupError(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

