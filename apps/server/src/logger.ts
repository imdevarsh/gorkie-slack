import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogger, type Logger } from '@repo/logging/log';

import { env } from './env';

const root =
  process.env.TURBO_ROOT ??
  path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');

const logger: Logger = await createLogger({
  logDirectory: path.resolve(root, env.LOG_DIRECTORY),
  logLevel: env.LOG_LEVEL,
});

export default logger;
