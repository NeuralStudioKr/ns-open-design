import { createHash, createHmac } from 'node:crypto';

import {
  encodeAwsSigV4UriComponent,
  encodeS3PathSegment,
  type SigV4Credentials,
} from './aws-sigv4.js';

export type S3PresignGetTarget = {
  bucket: string;
  region: string;
  endpoint?: string;
  expiresInSec: number;
};

export type BuildS3PresignedGetUrlInput = {
  key: string;
  target: S3PresignGetTarget;
  credentials: SigV4Credentials;
  now?: Date;
  responseContentDisposition?: string;
  responseContentType?: string;
};

function formatAmzDate(d: Date): string {
  const iso = d.toISOString().replace(/[-:]/g, '');
  return `${iso.slice(0, 15)}Z`;
}

function hmac(key: string | Buffer, value: string): Buffer {
  return createHmac('sha256', key).update(value).digest();
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function endpointBase(target: S3PresignGetTarget): string {
  const endpoint = (target.endpoint ?? '').trim();
  if (endpoint) return endpoint.replace(/\/+$/, '');
  return `https://${target.bucket}.s3.${target.region}.amazonaws.com`;
}

function canonicalPathForKey(
  target: S3PresignGetTarget,
  key: string,
): { host: string; path: string; base: string } {
  const base = endpointBase(target);
  const host = new URL(base).host;
  const encodedKey = key.split('/').filter(Boolean).map(encodeS3PathSegment).join('/');
  if ((target.endpoint ?? '').trim()) {
    return {
      base,
      host,
      path: `/${[target.bucket, encodedKey].filter(Boolean).join('/')}`,
    };
  }
  return {
    base,
    host,
    path: encodedKey ? `/${encodedKey}` : '/',
  };
}

/**
 * Build a SigV4 query-auth GET URL for a single S3 object key.
 * Shared by export-offload and project-file image presign.
 */
export function buildS3PresignedGetUrl(input: BuildS3PresignedGetUrlInput): string {
  const now = input.now ?? new Date();
  const amzDate = formatAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/${input.target.region}/s3/aws4_request`;
  const { base, host, path } = canonicalPathForKey(input.target, input.key);
  const params: Array<[string, string]> = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${input.credentials.accessKeyId}/${scope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(input.target.expiresInSec)],
    ['X-Amz-SignedHeaders', 'host'],
  ];
  if (input.responseContentDisposition) {
    params.push(['response-content-disposition', input.responseContentDisposition]);
  }
  if (input.responseContentType) {
    params.push(['response-content-type', input.responseContentType]);
  }
  if (input.credentials.sessionToken) {
    params.push(['X-Amz-Security-Token', input.credentials.sessionToken]);
  }
  params.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const canonicalQuery = params
    .map(([k, v]) => `${encodeAwsSigV4UriComponent(k)}=${encodeAwsSigV4UriComponent(v)}`)
    .join('&');
  const canonicalRequest = [
    'GET',
    path,
    canonicalQuery,
    `host:${host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join('\n');
  const kDate = hmac(`AWS4${input.credentials.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, input.target.region);
  const kService = hmac(kRegion, 's3');
  const kSigning = hmac(kService, 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  return `${base}${path}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}
