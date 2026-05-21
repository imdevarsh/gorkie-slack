import { createLogger, type Logger } from "@repo/observability";

import { env } from "@/env";

const logger: Logger = await createLogger({
  logDirectory: env.LOG_DIRECTORY,
  logLevel: env.LOG_LEVEL,
});

export default logger;
