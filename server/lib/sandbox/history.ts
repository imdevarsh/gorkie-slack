import type { Sandbox } from '@daytonaio/sdk';
import logger from '~/lib/logger';
import {
  type HistoryEntry,
  historySchema,
} from '~/lib/validators/sandbox/history';
import { safeParseJson } from '~/utils/parse-json';

export async function addHistory(
  sandbox: Sandbox,
  path: string,
  entry: HistoryEntry
): Promise<void> {
  const previous = await sandbox.fs.downloadFile(path).catch(() => null);
  const history = safeParseJson(previous?.toString() ?? '[]', historySchema) ?? [];
  history.push(entry);

  await sandbox
    .fs.uploadFile(Buffer.from(JSON.stringify(history, null, 2)), path)
    .catch((error: unknown) => {
      logger.warn({ error, path }, '[sandbox] Failed to write turn log');
    });
}
