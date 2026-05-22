import { constants } from 'node:fs';
import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import pino, {
  transport as createTransport,
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

async function exists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath, constants.F_OK);
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

export async function createLogger({
  isProduction = process.env.NODE_ENV === 'production',
  logDirectory = 'logs',
  logLevel = 'info',
}: CreateLoggerOptions = {}): Promise<Logger> {
  const isVercel = process.env.VERCEL === '1';

  let canWriteToFile =
    isProduction && !isVercel && (await exists(logDirectory));
  if (!canWriteToFile && isProduction && !isVercel) {
    try {
      await mkdir(logDirectory, { recursive: true });
      canWriteToFile = true;
    } catch {
      canWriteToFile = false;
    }
  }

  const targets: TransportTargetOptions[] = canWriteToFile
    ? [
        {
          target: 'pino/file',
          options: {
            destination: path.join(logDirectory, `${createRunId()}.log`),
          },
          level: logLevel,
        },
      ]
    : [];

  if (isProduction || isVercel) {
    targets.push({
      target: 'pino/file',
      options: { destination: 1 },
      level: logLevel,
    });
  } else {
    targets.push({
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'yyyy-mm-dd HH:MM:ss.l o',
        ignore: 'pid,hostname,ctxId',
        messageFormat: '{if ctxId}[{ctxId}] {end}{msg}',
      },
      level: logLevel,
    });
  }

  return pino(
    {
      level: logLevel,
      timestamp: pino.stdTimeFunctions.isoTime,
      serializers: { err: pino.stdSerializers.err },
    },
    createTransport({ targets })
  );
}
