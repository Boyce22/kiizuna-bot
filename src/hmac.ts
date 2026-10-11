import { createHmac, timingSafeEqual } from 'node:crypto';

const MAX_SKEW_SECONDS = 60;

export function signInternalRequest(
  secret: string,
  timestamp: string,
  method: string,
  path: string,
  body: string,
): string {
  return createHmac('sha256', secret)
    .update(`${timestamp}.${method.toUpperCase()}.${path}.${body}`)
    .digest('hex');
}

export function canonicalPath(urlPath: string): string {
  const q = urlPath.indexOf('?');
  return q === -1 ? urlPath : urlPath.slice(0, q);
}

export function verifyInternalSignature(opts: {
  timestamp: string;
  signature: string;
  method: string;
  path: string;
  body: string;
  secret: string;
  nowSeconds?: number;
}): boolean {
  const ts = Number(opts.timestamp);
  if (!Number.isFinite(ts)) return false;
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > MAX_SKEW_SECONDS) return false;
  const expected = signInternalRequest(opts.secret, opts.timestamp, opts.method, opts.path, opts.body);
  try {
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(opts.signature, 'hex');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
