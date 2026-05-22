import { createLogger, type Logger } from '@repo/logging/log';
import { env } from '../env';

const logger: Logger = await createLogger({
  logLevel: env.LOG_LEVEL,
  logDirectory: env.LOG_DIRECTORY,
});

export default logger;
