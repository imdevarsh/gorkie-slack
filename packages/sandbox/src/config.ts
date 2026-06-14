const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

// Tuneable sandbox defaults. The custom e2b template (built from build-template.ts)
// ships ripgrep/fd/node/python so pi's built-in grep/glob/bash work in-sandbox.
export const sandboxConfig = {
  template: 'gorkie-sandbox:3.0',
  workdir: '/home/user',
  // How long a sandbox stays alive between calls before e2b auto-pauses it.
  timeoutMs: 10 * MINUTE_MS,
  // Hard ceiling for a single in-sandbox command.
  executionTimeoutMs: 20 * MINUTE_MS,
  // Janitor (Phase 8): destroy sandboxes idle past this.
  autoDeleteAfterMs: 7 * DAY_MS,
  janitorIntervalMs: MINUTE_MS,
} as const;
