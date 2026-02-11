import type { Sandbox } from '@vercel/sandbox';
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
  const previous = await sandbox.readFileToBuffer({ path }).catch(() => null);
  const history =
    safeParseJson(previous?.toString() ?? '[]', historySchema) ?? [];
  history.push(entry);
  await sandbox
    .writeFiles([
      {
        path,
        content: Buffer.from(JSON.stringify(history, null, 2)),
      },
    ])
    .catch((error: unknown) => {
      logger.warn({ error, path }, '[sandbox] [history] write_fail');
    });
}
