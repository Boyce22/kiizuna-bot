import { canonicalPath, signInternalRequest } from './hmac';

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
    private readonly baseUrl = (process.env.INTERNAL_API_URL ?? 'http://127.0.0.1:3001').replace(/\/$/, ''),
    private readonly secret = process.env.INTERNAL_API_SECRET ?? 'dev-internal-api-secret-change-me',
  ) {}

  async post<T>(path: string, body: unknown = {}): Promise<T> {
    const pathname = canonicalPath(path.startsWith('/') ? path : `/${path}`);
    const raw = JSON.stringify(body ?? {});
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = signInternalRequest(this.secret, timestamp, 'POST', pathname, raw);
    const res = await fetch(`${this.baseUrl}${pathname}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Kizuna-Timestamp': timestamp,
        'X-Kizuna-Signature': signature,
      },
      body: raw,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const code =
        typeof (data as { error?: unknown }).error === 'string'
          ? (data as { error: string }).error
          : 'internal';
      throw new InternalApiError(res.status, code);
    }
    return data as T;
  }
}

export const internalClient = new InternalClient();
