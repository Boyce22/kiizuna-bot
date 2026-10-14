import type { ErrorCode } from '../api-error-codes';
import type { TranslateFn } from '../interfaces';

/**
 * Mensagem de uma recusa da API pelo código: tenta a do comando (`ns.CODIGO`), depois a genérica
 * (`error.CODIGO`) e, sem nenhuma, `error.generic` — nunca mostra a chave crua ao jogador.
 */
export function refusalMessage(
  t: TranslateFn,
  namespace: string,
  code: ErrorCode,
  vars?: Record<string, string | number>,
): string {
  for (const key of [`${namespace}.${code}`, `error.${code}`]) {
    const text = t(key, vars);
    if (text !== key) return text;
  }
  return t('error.generic');
}
