import type { Sandbox } from 'modal';
import logger from '~/lib/logger';
import {
  type HistoryEntry,
  historySchema,
} from '~/lib/validators/sandbox/history';
import { safeParseJson } from '~/utils/parse-json';
import { readSandboxFile, writeSandboxFiles } from './modal';

export async function addHistory(
  sandbox: Sandbox,
  path: string,
  entry: HistoryEntry
): Promise<void> {
  const previous = await readSandboxFile(sandbox, path).catch(() => null);
  const history =
    safeParseJson(previous?.toString() ?? '[]', historySchema) ?? [];

  history.push(entry);

  await writeSandboxFiles(sandbox, [
    {
      path,
      content: Buffer.from(JSON.stringify(history, null, 2), 'utf-8'),
    },
  ]).catch((error: unknown) => {
    logger.warn({ error, path }, '[sandbox] Failed to write turn log');
  });
}
