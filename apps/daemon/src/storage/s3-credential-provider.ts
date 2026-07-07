import type { SigV4Credentials } from './aws-sigv4.js';
import { fetchEc2InstanceRoleCredentials } from './aws-imds-credentials.js';

/** Refresh IMDS creds this long before AWS Expiration (instance profile TTL ~6h). */
const IMDS_REFRESH_MARGIN_MS = 5 * 60 * 1000;

export interface S3CredentialProvider {
  getCredentials(): Promise<SigV4Credentials>;
  /** Drop cached creds — next getCredentials() re-fetches IMDS. */
  invalidate(): void;
  /** True when credentials come from EC2 instance profile (not static env keys). */
  readonly usesImds: boolean;
}

export function createS3CredentialProvider(opts?: {
  env?: Record<string, string | undefined>;
  fetchFn?: typeof fetch;
}): S3CredentialProvider {
  const env = opts?.env ?? process.env;
  const accessKeyId = (env.OD_S3_ACCESS_KEY_ID ?? env.AWS_ACCESS_KEY_ID ?? '').trim();
  const secretAccessKey = (env.OD_S3_SECRET_ACCESS_KEY ?? env.AWS_SECRET_ACCESS_KEY ?? '').trim();
  const sessionToken = (env.OD_S3_SESSION_TOKEN ?? env.AWS_SESSION_TOKEN)?.trim();

  if (accessKeyId && secretAccessKey) {
    const staticCreds: SigV4Credentials = { accessKeyId, secretAccessKey };
    if (sessionToken) staticCreds.sessionToken = sessionToken;
    return {
      usesImds: false,
      invalidate() {},
      async getCredentials() {
        return staticCreds;
      },
    };
  }

  let cached: SigV4Credentials | null = null;
  let expiresAtMs: number | null = null;
  let inflight: Promise<SigV4Credentials> | null = null;

  const loadFromImds = async (): Promise<SigV4Credentials> => {
    const imds = await fetchEc2InstanceRoleCredentials({
      timeoutMs: 3_000,
      ...(opts?.fetchFn ? { fetchFn: opts.fetchFn } : {}),
    });
    if (!imds) {
      throw new Error('EC2 instance profile credentials unavailable');
    }
    cached = imds;
    expiresAtMs = imds.expiresAtMs ?? null;
    return imds;
  };

  const needsRefresh = (): boolean => {
    if (!cached) return true;
    if (expiresAtMs == null) return false;
    return Date.now() >= expiresAtMs - IMDS_REFRESH_MARGIN_MS;
  };

  return {
    usesImds: true,
    invalidate() {
      cached = null;
      expiresAtMs = null;
    },
    async getCredentials() {
      if (!needsRefresh() && cached) return cached;
      if (!inflight) {
        inflight = loadFromImds().finally(() => {
          inflight = null;
        });
      }
      return inflight;
    },
  };
}
