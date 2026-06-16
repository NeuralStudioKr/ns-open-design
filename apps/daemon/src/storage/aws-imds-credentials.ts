import type { SigV4Credentials } from './aws-sigv4.js';

const IMDS_BASE = 'http://169.254.169.254/latest/meta-data/iam/security-credentials/';
const IMDS_TOKEN_URL = 'http://169.254.169.254/latest/api/token';

type ImdsRoleCredentials = {
  AccessKeyId?: string;
  SecretAccessKey?: string;
  Token?: string;
  Code?: string;
};

async function fetchImdsToken(timeoutMs: number): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(IMDS_TOKEN_URL, {
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

async function fetchImdsText(path: string, token: string | null, timeoutMs: number): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`http://169.254.169.254${path}`, {
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
export async function fetchEc2InstanceRoleCredentials(opts?: {
  timeoutMs?: number;
}): Promise<SigV4Credentials | null> {
  const timeoutMs = opts?.timeoutMs ?? 1500;
  const token = await fetchImdsToken(timeoutMs);
  const roleName = await fetchImdsText('/latest/meta-data/iam/security-credentials/', token, timeoutMs);
  if (!roleName) return null;

  const raw = await fetchImdsText(`${IMDS_BASE}${encodeURIComponent(roleName)}`, token, timeoutMs);
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

  const credentials: SigV4Credentials = { accessKeyId, secretAccessKey };
  const sessionToken = parsed.Token?.trim();
  if (sessionToken) credentials.sessionToken = sessionToken;
  return credentials;
}
