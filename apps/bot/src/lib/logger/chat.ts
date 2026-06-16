import type { Logger as PinoLogger } from '@repo/logging/logger';
import type { Logger as ChatLogger } from 'chat';

function metaFrom(args: unknown[]): Record<string, unknown> {
  const [first] = args;
  if (args.length === 1 && typeof first === 'object' && first !== null) {
    return first as Record<string, unknown>;
  }
  return args.length > 0 ? { args } : {};
}

export function toChatLogger(pino: PinoLogger): ChatLogger {
  return {
    child: (prefix: string) => toChatLogger(pino.child({ component: prefix })),
    debug: (message, ...args) => pino.debug(metaFrom(args), message),
    info: (message, ...args) => pino.info(metaFrom(args), message),
    warn: (message, ...args) => pino.warn(metaFrom(args), message),
    error: (message, ...args) => pino.error(metaFrom(args), message),
  };
}
