import { performance } from 'node:perf_hooks';

import { canonicalPath, signInternalRequest } from './hmac';
import { contextualLogger, currentLogContext } from './observability/context';
import { newCorrelationId } from './observability/logger';
import { recordApiRequest } from './observability/telemetry';

const DEFAULT_INTERNAL_API_URL = 'http://127.0.0.1:3001';
const DEFAULT_INTERNAL_API_SECRET = 'dev-internal-api-secret-change-me';

function configuredValue(value: string | undefined, fallback: string): string {
  const normalized = value?.trim();
  return normalized ? normalized : fallback;
}

export class InternalApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(code);
    this.name = 'InternalApiError';
  }
}

export class InternalClient {
  constructor(
    private readonly baseUrl = configuredValue(process.env.INTERNAL_API_URL, DEFAULT_INTERNAL_API_URL).replace(/\/$/, ''),
    private readonly secret = configuredValue(process.env.INTERNAL_API_SECRET, DEFAULT_INTERNAL_API_SECRET),
  ) {}

  async post<T>(path: string, body: unknown = {}): Promise<T> {
    const pathname = canonicalPath(path.startsWith('/') ? path : `/${path}`);
    const raw = JSON.stringify(body ?? {});
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = signInternalRequest(this.secret, timestamp, 'POST', pathname, raw);
    const requestId = currentLogContext()?.requestId ?? newCorrelationId();
    const log = contextualLogger({ component: 'internal-api', method: 'POST', path: pathname });
    const startedAt = performance.now();
    try {
      const res = await fetch(`${this.baseUrl}${pathname}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': requestId,
          'X-Kizuna-Timestamp': timestamp,
          'X-Kizuna-Signature': signature,
        },
        body: raw,
      });
      const elapsedMs = performance.now() - startedAt;
      recordApiRequest(pathname, res.status, elapsedMs);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const code =
          typeof (data as { error?: unknown }).error === 'string'
            ? (data as { error: string }).error
            : 'internal';
        log.warn({ status: res.status, code, elapsedMs }, 'internal api request failed');
        throw new InternalApiError(res.status, code);
      }
      log.debug({ status: res.status, elapsedMs }, 'internal api request completed');
      return data as T;
    } catch (err) {
      if (err instanceof InternalApiError) throw err;
      const elapsedMs = performance.now() - startedAt;
      recordApiRequest(pathname, 0, elapsedMs);
      log.error({ err, elapsedMs }, 'internal api request transport error');
      throw err;
    }
  }
}

export const internalClient = new InternalClient();
