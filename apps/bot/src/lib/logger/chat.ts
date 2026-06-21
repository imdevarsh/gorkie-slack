import type { Logger as PinoLogger } from '@repo/logging/logger';
import type { Logger as ChatLogger } from 'chat';

function metaFrom(args: unknown[]): Record<string, unknown> {
  const [first] = args;
  if (args.length === 1 && typeof first === 'object' && first !== null) {
    return Object.fromEntries(Object.entries(first));
  }
  return args.length > 0 ? { args } : {};
}

export function toChatLogger(pino: PinoLogger): ChatLogger {
  return {
    child: (prefix: string) => toChatLogger(pino.child({ ctxId: prefix })),
    debug: (message, ...args) =>
      pino.debug(metaFrom(args), `[chat] ${message}`),
    error: (message, ...args) =>
      pino.error(metaFrom(args), `[chat] ${message}`),
    info: (message, ...args) => pino.info(metaFrom(args), `[chat] ${message}`),
    warn: (message, ...args) => pino.warn(metaFrom(args), `[chat] ${message}`),
  };
}
