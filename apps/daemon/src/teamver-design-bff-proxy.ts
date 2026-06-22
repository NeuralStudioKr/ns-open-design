import type { Express, Request, Response as ExpressResponse } from 'express';

import {
  readTeamverIdentityFromRequest,
  teamverDesignApiBaseUrl,
} from './teamver-project-access.js';

const PROXY_TIMEOUT_MS = 60_000;

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]?.trim() || undefined;
  const trimmed = String(value ?? '').trim();
  return trimmed || undefined;
}

function buildUpstreamUrl(baseUrl: string, subPath: string, search: string): string | null {
  const normalized = subPath.replace(/^\/+/, '');
  if (!normalized || normalized.includes('..')) return null;
  const url = new URL(`${baseUrl}/api/v1/${normalized}`);
  if (search) url.search = search;
  return url.toString();
}

function buildUpstreamHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = {};

  const cookie = firstHeaderValue(req.headers.cookie);
  if (cookie) headers.Cookie = cookie;

  const contentType = firstHeaderValue(req.headers['content-type']);
  if (contentType) headers['Content-Type'] = contentType;

  const workspaceId = firstHeaderValue(req.headers['x-workspace-id']);
  if (workspaceId) headers['X-Workspace-Id'] = workspaceId;

  const identity = readTeamverIdentityFromRequest(req);
  if (identity) {
    headers['X-Teamver-User-Id'] = identity.userId;
    headers['X-Teamver-Workspace-Id'] = identity.workspaceId;
    headers['X-Workspace-Id'] = identity.workspaceId;
    if (identity.authorization) headers.Authorization = identity.authorization;
  }

  const accept = firstHeaderValue(req.headers.accept);
  if (accept) headers.Accept = accept;

  return headers;
}

function copyUpstreamResponseHeaders(res: ExpressResponse, upstream: globalThis.Response): void {
  upstream.headers.forEach((value: string, key: string) => {
    const lower = key.toLowerCase();
    if (lower === 'transfer-encoding' || lower === 'connection' || lower === 'keep-alive') {
      return;
    }
    res.setHeader(key, value);
  });
}

async function proxyTeamverBffRequest(
  req: Request,
  res: ExpressResponse,
  baseUrl: string,
): Promise<void> {
  const subPath = req.path.replace(/^\//, '');
  const search = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const upstreamUrl = buildUpstreamUrl(baseUrl, subPath, search);
  if (!upstreamUrl) {
    res.status(400).json({ detail: 'Invalid path' });
    return;
  }

  const headers = buildUpstreamHeaders(req);
  const init: RequestInit = {
    method: req.method,
    headers,
    signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
  };

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    if (req.body !== undefined && req.body !== null && typeof req.body === 'object') {
      init.body = JSON.stringify(req.body);
      headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
    }
  }

  try {
    const upstream = await fetch(upstreamUrl, init);
    copyUpstreamResponseHeaders(res, upstream);
    res.status(upstream.status);
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    const body = Buffer.from(await upstream.arrayBuffer());
    res.send(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(502).json({
      detail: 'teamver design-api proxy failed',
      message,
    });
  }
}

/**
 * Same-origin `/teamver-bff/*` fallback when nginx `teamver-design-od-bff.inc.conf`
 * is not applied yet — avoids Express 404 / SPA HTML for JSON API clients.
 */
export function registerTeamverDesignBffProxy(app: Express): void {
  const baseUrl = teamverDesignApiBaseUrl();
  if (!baseUrl) return;

  app.use('/teamver-bff', (req, res) => {
    void proxyTeamverBffRequest(req, res, baseUrl);
  });
}
