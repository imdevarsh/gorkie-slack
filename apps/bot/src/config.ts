export const appHome = {
  maxPromptDisplay: 200,
  maxTaskPrompt: 80,
};

export const assistantThread = {
  suggestedPrompts: {
    dm: [
      { title: 'Search the web', message: 'Search the web for ' },
      { title: 'Write and run code', message: 'Write and run code to ' },
      { title: 'Generate an image', message: 'Create an image of ' },
      { title: 'Set a reminder', message: 'Remind me to ' },
    ],
    channel: [
      {
        title: 'Summarize this channel',
        message: 'Please summarize recent activity in this channel.',
      },
      { title: 'Search Slack', message: 'Search for messages about ' },
      { title: 'Write and run code', message: 'Write and run code to ' },
      { title: 'Generate an image', message: 'Create an image of ' },
    ],
  },
};

export const sandbox = {
  template: 'gorkie-sandbox:3.0',
  model: {
    provider: 'hackclub',
    modelId: 'google/gemini-3-flash-preview',
  },
  timeoutMs: 10 * 60 * 1000,
  autoDeleteAfterMs: 7 * 24 * 60 * 60 * 1000,
  janitorIntervalMs: 60 * 1000,
  rpc: {
    commandTimeoutMs: 60_000,
    startupTimeoutMs: 2 * 60 * 1000,
  },
  toolOutput: {
    detailsMaxChars: 180,
    titleMaxChars: 60,
    outputMaxChars: 260,
  },
  runtime: {
    workdir: '/home/user',
    executionTimeoutMs: 30 * 60 * 1000,
  },
  attachments: {
    maxBytes: 1_000_000_000,
  },
};
