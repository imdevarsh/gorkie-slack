import path from "node:path";
import { createLogger, type Logger } from "@repo/logging/log";

import { env } from "@/env";

const root =
  process.env.TURBO_ROOT ?? path.resolve(import.meta.dir, "../../..");

const logger: Logger = await createLogger({
  logDirectory: path.resolve(root, env.LOG_DIRECTORY),
  logLevel: env.LOG_LEVEL,
});

export default logger;
