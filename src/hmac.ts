import { createHmac, randomBytes } from 'node:crypto';

/** Nonce de uso único por requisição: a API recusa a mesma assinatura vista duas vezes. */
export function newNonce(): string {
  return randomBytes(16).toString('hex');
}

/**
 * Assina `timestamp.nonce.MÉTODO.caminho.corpo` (mesmo formato da API). O caminho vai inteiro, com
 * query string, se houver.
 */
export function signInternalRequest(
  secret: string,
  timestamp: string,
  nonce: string,
  method: string,
  path: string,
  body: string,
): string {
  return createHmac('sha256', secret)
    .update(`${timestamp}.${nonce}.${method.toUpperCase()}.${path}.${body}`)
    .digest('hex');
}
