import { performance } from 'node:perf_hooks';

import type { ErrorCode } from './api-error-codes';
import { newNonce, signInternalRequest } from './hmac';
import { contextualLogger, currentLogContext } from './observability/context';
import { newCorrelationId } from './observability/logger';
import { recordApiRequest } from './observability/telemetry';

const DEFAULT_INTERNAL_API_URL = 'http://127.0.0.1:3001';
const DEFAULT_INTERNAL_API_SECRET = 'dev-internal-api-secret-change-me';
/** Requisição que passa disso falha em vez de segurar o comando (e a memória) indefinidamente. */
const REQUEST_TIMEOUT_MS = 15_000;
/**
 * API sobrecarregada (`OVERLOADED`) recusa antes de executar: repetir uma vez, com assinatura e
 * nonce novos, é seguro. A espera é sorteada até este teto, para o comando não segurar o usuário.
 */
const OVERLOADED_RETRY_MAX_MS = 3_000;

const GUILD_ENSURE_PATH = '/internal/v1/guilds/ensure';
const GUILD_SETUP_PATH = '/internal/v1/guilds/setup';
/**
 * Config da guild (prefixo, canais, modo) em cache curto: toda mensagem de toda guild passa pelo
 * prefixo, e sem cache cada mensagem de chat viraria uma requisição à API. O `setup` invalida na hora.
 */
const GUILD_CONFIG_TTL_MS = 30_000;
const GUILD_CONFIG_MAX_ENTRIES = 50_000;

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

  private readonly guildConfigs = new Map<string, { expiresAt: number; value: Promise<unknown> }>();

  async post<T>(path: string, body: unknown = {}): Promise<T> {
    const pathname = path.startsWith('/') ? path : `/${path}`;
    const guildId = guildIdOf(body);
    if (pathname === GUILD_ENSURE_PATH && guildId) return this.cachedGuildConfig<T>(guildId, body);
    try {
      return await this.sendRetryingOverload<T>(pathname, body);
    } finally {
      if (pathname === GUILD_SETUP_PATH && guildId) this.guildConfigs.delete(guildId);
    }
  }

  private cachedGuildConfig<T>(guildId: string, body: unknown): Promise<T> {
    const now = Date.now();
    const hit = this.guildConfigs.get(guildId);
    if (hit && hit.expiresAt > now) return hit.value as Promise<T>;
    if (this.guildConfigs.size >= GUILD_CONFIG_MAX_ENTRIES) {
      for (const [key, entry] of this.guildConfigs) if (entry.expiresAt <= now) this.guildConfigs.delete(key);
      if (this.guildConfigs.size >= GUILD_CONFIG_MAX_ENTRIES) this.guildConfigs.clear();
    }
    // A promessa entra no cache: mensagens simultâneas da mesma guild dividem uma requisição só.
    const value = this.sendRetryingOverload<T>(GUILD_ENSURE_PATH, body);
    const entry = { expiresAt: now + GUILD_CONFIG_TTL_MS, value };
    this.guildConfigs.set(guildId, entry);
    value.catch(() => {
      if (this.guildConfigs.get(guildId) === entry) this.guildConfigs.delete(guildId);
    });
    return value;
  }

  private async sendRetryingOverload<T>(pathname: string, body: unknown): Promise<T> {
    try {
      return await this.send<T>(pathname, body);
    } catch (err) {
      if (!(err instanceof InternalApiError) || err.code !== 'OVERLOADED') throw err;
      await new Promise((resolve) => setTimeout(resolve, OVERLOADED_RETRY_MAX_MS * (0.3 + 0.7 * Math.random())));
      return this.send<T>(pathname, body);
    }
  }

  private async send<T>(pathname: string, body: unknown): Promise<T> {
    const raw = JSON.stringify(body ?? {});
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = newNonce();
    const signature = signInternalRequest(this.secret, timestamp, nonce, 'POST', pathname, raw);
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
          'X-Kizuna-Nonce': nonce,
          'X-Kizuna-Signature': signature,
        },
        body: raw,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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

function guildIdOf(body: unknown): string | undefined {
  const guildId = (body as { guildId?: unknown } | null)?.guildId;
  return typeof guildId === 'string' ? guildId : undefined;
}

export const internalClient = new InternalClient();
