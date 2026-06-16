import { tmpdir } from 'node:os';
import path from 'node:path';

export const PI_SESSIONS_DIR = '.pi-sessions';

export function hostWorkdir(sessionId: string): string {
  const hostSafeSessionId = sessionId.replace(/[/: ]/g, '-');
  return path.join(tmpdir(), 'ai-sdk-harness', 'pi', hostSafeSessionId);
}
