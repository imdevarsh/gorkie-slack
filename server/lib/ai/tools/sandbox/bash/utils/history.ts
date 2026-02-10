import type { Sandbox } from '@vercel/sandbox';
import logger from '~/lib/logger';
import {
  type HistoryEntry,
  historySchema,
} from '~/lib/validators/sandbox/history';

export async function addHistory(
  sandbox: Sandbox,
  turnPath: string,
  entry: HistoryEntry
): Promise<void> {
  const previous = await sandbox
    .readFileToBuffer({ path: turnPath })
    .catch(() => null);
  const raw = previous?.toString() ?? '[]';
  let history: HistoryEntry[] = [];
  try {
    history = historySchema.parse(JSON.parse(raw) as unknown);
  } catch {
    history = [];
  }
  history.push(entry);
  await sandbox
    .writeFiles([
      {
        path: turnPath,
        content: Buffer.from(JSON.stringify(history, null, 2)),
      },
    ])
    .catch((error: unknown) => {
      logger.warn({ error, turnPath }, 'Failed to write turn log');
    });
}
