import type { Sandbox } from '@daytonaio/sdk';
import { tools } from '~/config';

export const SESSION_LOG_PATH = 'session.jsonl';
const TRUNCATED_OUTPUT_DIR = 'output/.tool-output';

export interface SessionLogEntry {
  ts: string;
  command: string;
  workdir: string;
  exitCode: number;
  preview: string;
}

export async function appendSessionLog(
  sandbox: Sandbox,
  entry: SessionLogEntry
): Promise<void> {
  const previous = await sandbox.fs.downloadFile(SESSION_LOG_PATH).catch(
    () => null
  );
  const line = `${JSON.stringify(entry)}\n`;
  const next = previous
    ? Buffer.concat([previous, Buffer.from(line, 'utf-8')])
    : Buffer.from(line, 'utf-8');
  await sandbox.fs.uploadFile(next, SESSION_LOG_PATH);
}

export async function truncateOutput(
  sandbox: Sandbox,
  raw: string
): Promise<{ text: string; truncated: boolean; outputPath?: string }> {
  const lines = raw.split('\n');
  const totalBytes = Buffer.byteLength(raw, 'utf-8');

  if (
    lines.length <= tools.bash.maxOutputLines &&
    totalBytes <= tools.bash.maxOutputBytes
  ) {
    return { text: raw, truncated: false };
  }

  const kept: string[] = [];
  let bytes = 0;
  let hitBytes = false;

  for (let i = 0; i < lines.length && i < tools.bash.maxOutputLines; i++) {
    const line = lines[i] ?? '';
    const size = Buffer.byteLength(line, 'utf-8') + (i > 0 ? 1 : 0);
    if (bytes + size > tools.bash.maxOutputBytes) {
      hitBytes = true;
      break;
    }
    kept.push(line);
    bytes += size;
  }

  const removed = hitBytes ? totalBytes - bytes : lines.length - kept.length;
  const unit = hitBytes ? 'bytes' : 'lines';
  const outputPath = `${TRUNCATED_OUTPUT_DIR}/${Date.now()}.log`;

  await sandbox.process.executeCommand(`mkdir -p ${TRUNCATED_OUTPUT_DIR}`);
  await sandbox.fs.uploadFile(Buffer.from(raw, 'utf-8'), outputPath);

  return {
    text:
      `${kept.join('\n')}\n\n...${removed} ${unit} truncated...\n\n` +
      `Full output saved to: ${outputPath}`,
    truncated: true,
    outputPath,
  };
}
