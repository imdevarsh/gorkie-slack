import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import pino, {
  transport as createTransport,
  type LoggerOptions,
  type Logger as PinoLogger,
  type TransportTargetOptions,
} from 'pino';

export type Logger = PinoLogger;
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface CreateLoggerOptions {
  isProduction?: boolean;
  logDirectory?: string;
  logLevel?: LogLevel;
}

async function createLogDirectory(logDirectory: string): Promise<boolean> {
  try {
    await mkdir(logDirectory, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

function createRunId(): string {
  return new Date()
    .toISOString()
    .replace('T', '_')
    .replace(/[:.]/g, '-')
    .slice(0, 19);
}

function createBaseOptions(logLevel: LogLevel): LoggerOptions {
  return {
    level: logLevel,
    timestamp: pino.stdTimeFunctions.isoTime,
    serializers: { err: pino.stdSerializers.err },
  };
}

export async function createLogger({
  isProduction = process.env.NODE_ENV === 'production',
  logDirectory = 'logs',
  logLevel = 'info',
}: CreateLoggerOptions = {}): Promise<Logger> {
  const options = createBaseOptions(logLevel);

  if (process.env.VERCEL === '1') {
    return pino(options);
  }

  if (!isProduction) {
    return pino(
      options,
      createTransport({
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'yyyy-mm-dd HH:MM:ss.l o',
          ignore: 'pid,hostname,ctxId',
          messageFormat: '{if ctxId}[{ctxId}] {end}{msg}',
        },
      })
    );
  }

  const targets: TransportTargetOptions[] = [
    {
      target: 'pino/file',
      options: { destination: 1 },
      level: logLevel,
    },
  ];

  if (await createLogDirectory(logDirectory)) {
    targets.unshift({
      target: 'pino/file',
      options: {
        destination: path.join(logDirectory, `${createRunId()}.log`),
      },
      level: logLevel,
    });
  }

  return pino(options, createTransport({ targets }));
}
