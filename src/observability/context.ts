import { AsyncLocalStorage } from 'node:async_hooks';

import type { Locale } from '../interfaces';
import type { Logger } from './logger';
import { childLogger, logger } from './logger';

/**
 * O que o Discord diz de quem disparou o comando, para a trilha anti-cheat da API (o IP do usuário
 * o Discord nunca entrega). Vai assinado em todo pedido à API (`client.ts`), fora do log.
 */
export interface DiscordContext {
  /** Id da interação (slash, botão) ou da mensagem (prefixo). */
  eventId: string;
  trigger: 'interaction' | 'message';
  /** Idioma do cliente Discord do usuário; só interações têm. */
  locale?: string;
  /** Quando o membro entrou no servidor (ISO): alt recém-chegado é sinal. */
  memberJoinedAt?: string;
}

export interface LogContext {
  requestId: string;
  source: 'message' | 'slash' | 'component' | 'system';
  event?: string;
  command?: string;
  invokedCommand?: string;
  guildId?: string;
  channelId?: string;
  discordUserId?: string;
  /** Não é campo de log: o `contextualLogger` o deixa de fora. */
  discord?: DiscordContext;
  /**
   * Idioma de quem disparou o comando, assim que conhecido: vai como `Accept-Language` em todo
   * pedido à API, que devolve o conteúdo (perks, passivas, packs) já nele.
   */
  locale?: Locale;
}

const storage = new AsyncLocalStorage<LogContext>();

export function runWithLogContext<T>(context: LogContext, operation: () => T): T {
  return storage.run(context, operation);
}

export function currentLogContext(): LogContext | undefined {
  return storage.getStore();
}

export function updateLogContext(bindings: Partial<LogContext>): void {
  const context = storage.getStore();
  if (context) Object.assign(context, bindings);
}

export function contextualLogger(bindings: Record<string, unknown> = {}): Logger {
  const context = storage.getStore();
  if (!context && Object.keys(bindings).length === 0) return logger;
  const { discord: _discord, ...fields } = context ?? {};
  return childLogger({ ...fields, ...bindings });
}
