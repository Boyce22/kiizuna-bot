import { randomUUID } from 'node:crypto';

import pino, { type Logger } from 'pino';

const isProd = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test' || process.env.NODE_TEST_CONTEXT !== undefined;
const level = isTest ? 'silent' : process.env.LOG_LEVEL?.trim() || (isProd ? 'info' : 'debug');

export const logger: Logger = pino({
  level,
  base: { service: 'kizuna-bot' },
  redact: {
    paths: [
      'token',
      'secret',
      'authorization',
      'headers.authorization',
      'headers.X-Kizuna-Signature',
      'headers.x-kizuna-signature',
    ],
    censor: '[REDACTED]',
  },
  ...(isProd
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname,service' },
        },
      }),
});

export function childLogger(bindings: Record<string, unknown>): Logger {
  return logger.child(bindings);
}

export function newCorrelationId(): string {
  return randomUUID().slice(0, 8);
}

export function captureError(err: unknown, context: Record<string, unknown> = {}): void {
  const log = Object.keys(context).length ? childLogger(context) : logger;
  log.error({ err }, err instanceof Error ? err.message : 'unknown error');
}

export type { Logger };
