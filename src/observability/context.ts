import { AsyncLocalStorage } from 'node:async_hooks';

import type { Logger } from './logger';
import { childLogger, logger } from './logger';

export interface LogContext {
  requestId: string;
  source: 'message' | 'slash' | 'component' | 'system';
  event?: string;
  command?: string;
  invokedCommand?: string;
  guildId?: string;
  channelId?: string;
  discordUserId?: string;
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
  return childLogger({ ...(context ?? {}), ...bindings });
}
