import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import pino, {
  transport as createTransport,
  type Logger as PinoLogger,
  type TransportTargetOptions,
} from 'pino';

export type Logger = PinoLogger;
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface CreateLoggerOptions {
  fileLogging?: boolean;
  isProduction?: boolean;
  logDirectory?: string;
  logLevel?: LogLevel;
}

export async function createLogger({
  fileLogging,
  isProduction = process.env.NODE_ENV === 'production',
  logDirectory = 'logs',
  logLevel = 'info',
}: CreateLoggerOptions = {}): Promise<Logger> {
  const base = {
    level: logLevel,
    timestamp: pino.stdTimeFunctions.isoTime,
    serializers: { err: pino.stdSerializers.err },
  };

  if (process.env.VERCEL === '1') {
    return pino(base);
  }

  const prettyTarget: TransportTargetOptions = {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'yyyy-mm-dd HH:MM:ss.l o',
      ignore: 'pid,hostname,ctxId',
      messageFormat: '{if ctxId}[{ctxId}] {end}{msg}',
    },
  };

  const shouldFile = fileLogging ?? isProduction;

  if (!(isProduction || shouldFile)) {
    return pino(base, createTransport(prettyTarget));
  }

  if (!shouldFile) {
    return pino(base);
  }

  const targets: TransportTargetOptions[] = isProduction
    ? [{ target: 'pino/file', options: { destination: 1 }, level: logLevel }]
    : [prettyTarget];

  if (!isProduction) {
    try {
      await mkdir(logDirectory, { recursive: true });
      const runId = new Date()
        .toISOString()
        .replace('T', '_')
        .replace(/[:.]/g, '-')
        .slice(0, 19);
      targets.unshift({
        target: 'pino/file',
        options: { destination: path.join(logDirectory, `${runId}.log`) },
        level: logLevel,
      });
    } catch {
      // continue without file
    }
  }

  return pino(base, createTransport({ targets }));
}
