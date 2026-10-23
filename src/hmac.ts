import { createHmac, randomBytes } from 'node:crypto';

/** Nonce de uso único por requisição: a API recusa a mesma assinatura vista duas vezes. */
export function newNonce(): string {
  return randomBytes(16).toString('hex');
}

/**
 * Assina o contexto do Discord (`X-Kizuna-Context`) preso ao nonce do pedido: não dá para trocar o
 * contexto nem colá-lo noutro pedido. Separado da assinatura principal, então a API que ainda não
 * conhece o cabeçalho só o ignora.
 */
export function signInternalContext(secret: string, nonce: string, context: string): string {
  return createHmac('sha256', secret).update(`ctx.${nonce}.${context}`).digest('hex');
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
