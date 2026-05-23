export const appHome = {
  maxPromptDisplay: 200,
  maxTaskPrompt: 80,
};

export const assistantThread = {
  suggestedPrompts: {
    dm: [
      {
        title: 'Search the web',
        message: 'What are the top AI news stories today?',
      },
      {
        title: 'Write and run code',
        message:
          'Write and run a Python script that plots a sine wave and sends me the image.',
      },
      {
        title: 'Generate an image',
        message: 'Generate an image of a futuristic city at night.',
      },
      {
        title: 'Browse a website',
        message:
          'Take a screenshot of https://example.com and describe what you see.',
      },
    ],
    channel: [
      {
        title: 'Summarize this channel',
        message: 'Summarize the recent activity in this channel.',
      },
      {
        title: 'Search Slack',
        message: 'Search Slack for recent messages about this project.',
      },
      {
        title: 'Write and run code',
        message:
          'Write and run a Python script that plots a sine wave and sends me the image.',
      },
      {
        title: 'Generate an image',
        message: 'Generate an image of a futuristic city at night.',
      },
    ],
  },
};

export const sandbox = {
  template: 'gorkie-sandbox:3.0',
  model: {
    provider: 'hackclub',
    modelId: 'google/gemini-3-flash-preview',
    api: 'openai-completions',
  },
  modelChain: [
    { provider: 'hackclub', modelId: 'google/gemini-3-flash-preview' },
    { provider: 'hackclub', modelId: 'openai/gpt-5-mini' },
    { provider: 'openrouter', modelId: 'google/gemini-3-flash-preview' },
    { provider: 'openrouter', modelId: 'openai/gpt-5-mini' },
    { provider: 'gemini', modelId: 'gemini-2.0-flash' },
  ],
  retry: {
    enabled: true,
    maxRetries: 4,
    baseDelayMs: 2000,
    maxDelayMs: 60_000,
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
    executionTimeoutMs: 20 * 60 * 1000,
  },
  attachments: {
    maxBytes: 1_000_000_000,
  },
};
