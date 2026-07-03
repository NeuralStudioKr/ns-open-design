import type { SigV4Credentials } from './aws-sigv4.js';

const IMDS_CREDENTIALS_PREFIX = '/latest/meta-data/iam/security-credentials/';
const IMDS_TOKEN_URL = 'http://169.254.169.254/latest/api/token';

type ImdsRoleCredentials = {
  AccessKeyId?: string;
  SecretAccessKey?: string;
  Token?: string;
  Code?: string;
  Expiration?: string;
};

export type Ec2InstanceRoleCredentials = SigV4Credentials & {
  /** Parsed from IMDS `Expiration` when present (ISO-8601 UTC). */
  expiresAtMs?: number;
};

async function fetchImdsToken(timeoutMs: number, fetchFn: typeof fetch): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn(IMDS_TOKEN_URL, {
      method: 'PUT',
      headers: { 'X-aws-ec2-metadata-token-ttl-seconds': '21600' },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const token = (await res.text()).trim();
    return token || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchImdsText(
  path: string,
  token: string | null,
  timeoutMs: number,
  fetchFn: typeof fetch,
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn(`http://169.254.169.254${path}`, {
      ...(token ? { headers: { 'X-aws-ec2-metadata-token': token } } : {}),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    return text || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolve EC2 instance-profile credentials from IMDS (v2 preferred).
 * Returns null when not on EC2 or when the metadata service is unavailable.
 */
function parseImdsExpirationMs(raw: string | undefined): number | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  const ms = Date.parse(trimmed);
  return Number.isFinite(ms) ? ms : undefined;
}

export async function fetchEc2InstanceRoleCredentials(opts?: {
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}): Promise<Ec2InstanceRoleCredentials | null> {
  const timeoutMs = opts?.timeoutMs ?? 1500;
  const httpFetch = opts?.fetchFn ?? fetch;
  const token = await fetchImdsToken(timeoutMs, httpFetch);
  const roleName = await fetchImdsText(IMDS_CREDENTIALS_PREFIX, token, timeoutMs, httpFetch);
  if (!roleName) return null;

  const raw = await fetchImdsText(
    `${IMDS_CREDENTIALS_PREFIX}${encodeURIComponent(roleName)}`,
    token,
    timeoutMs,
    httpFetch,
  );
  if (!raw) return null;

  let parsed: ImdsRoleCredentials;
  try {
    parsed = JSON.parse(raw) as ImdsRoleCredentials;
  } catch {
    return null;
  }
  if (parsed.Code && parsed.Code !== 'Success') return null;

  const accessKeyId = parsed.AccessKeyId?.trim();
  const secretAccessKey = parsed.SecretAccessKey?.trim();
  if (!accessKeyId || !secretAccessKey) return null;

  const credentials: Ec2InstanceRoleCredentials = { accessKeyId, secretAccessKey };
  const sessionToken = parsed.Token?.trim();
  if (sessionToken) credentials.sessionToken = sessionToken;
  const expiresAtMs = parseImdsExpirationMs(parsed.Expiration);
  if (expiresAtMs !== undefined) credentials.expiresAtMs = expiresAtMs;
  return credentials;
}
