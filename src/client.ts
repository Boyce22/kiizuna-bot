import { performance } from 'node:perf_hooks';

import type { ErrorCode } from './api-error-codes';
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

/** Resposta de erro da API: `{ code, ...detalhes }` com o status HTTP. */
export class InternalApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(code);
    this.name = 'InternalApiError';
  }
}

/** Recusa de negócio (4xx) vista pelo comando: o código e os detalhes que a API mandou. */
export type ApiFailure<D extends object = object> = { ok: false; status: number; code: ErrorCode } & Partial<D>;

/** Resultado de `call`: sucesso com o corpo, ou a recusa. O `ok` existe só aqui no bot, não no fio. */
export type ApiResult<T, D extends object = object> = ({ ok: true } & T) | ApiFailure<D>;

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
        const { code, ...details } = data as { code?: unknown } & Record<string, unknown>;
        const known = typeof code === 'string' ? (code as ErrorCode) : 'INTERNAL';
        // 4xx é recusa de negócio (sem saldo, cooldown...): esperado, não é falha do serviço.
        if (res.status >= 500) log.warn({ status: res.status, code: known, elapsedMs }, 'internal api request failed');
        else log.debug({ status: res.status, code: known, elapsedMs }, 'internal api request refused');
        throw new InternalApiError(res.status, known, details);
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

  /**
   * Como `post`, mas a recusa de negócio (4xx) volta como resultado em vez de exceção, para o
   * comando responder pelo código. Falha do serviço (5xx, rede) continua lançando.
   */
  async call<T extends object = object, D extends object = object>(
    path: string,
    body: unknown = {},
  ): Promise<ApiResult<T, D>> {
    try {
      return { ok: true, ...(await this.post<T>(path, body)) };
    } catch (err) {
      if (err instanceof InternalApiError && err.status < 500)
        return { ...(err.details as Partial<D>), ok: false, status: err.status, code: err.code };
      throw err;
    }
  }
}

export const internalClient = new InternalClient();
